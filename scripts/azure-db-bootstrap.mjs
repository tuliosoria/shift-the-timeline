// Explicit operator utility, never imported by the hosted application. Requires an
// already approved localhost SSH forward to the private PostgreSQL endpoint.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const exec=promisify(execFile),uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function parseBootstrapArgs(args){
 const values={};for(let i=0;i<args.length;i+=2){const key=args[i];if(!['--subscription','--tenant','--host','--admin','--identity-object-id','--port'].includes(key)||!args[i+1]||Object.hasOwn(values,key))throw new Error('Invalid bootstrap arguments.');values[key]=args[i+1];}
 const {['--subscription']:subscription,['--tenant']:tenant,['--host']:host,['--admin']:admin,['--identity-object-id']:objectId}=values;
 const port=Number(values['--port']??15432);
 if(!uuid.test(subscription??'')||!uuid.test(tenant??'')||!uuid.test(objectId??'')||!/^[a-z0-9-]+\.postgres\.database\.azure\.com$/.test(host??'')||typeof admin!=='string'||!admin||admin.length>200||/[\r\n\0]/.test(admin)||!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid bootstrap arguments.');
 return {subscription,tenant,host,admin,objectId,port};
}
export async function getAdminToken(config,run=exec){
 // Both commands explicitly target the approved subscription. Never forward stderr,
 // stdout or thrown CLI errors to logs: authentication output may contain secrets.
 try{
  const account=await run('az',['account','show','--subscription',config.subscription,'--query','tenantId','--output','tsv'],{maxBuffer:65536,timeout:30000});
  if(account.stdout.trim().toLowerCase()!==config.tenant.toLowerCase())throw new Error('Tenant mismatch');
  const result=await run('az',['account','get-access-token','--subscription',config.subscription,'--resource','https://ossrdbms-aad.database.windows.net','--query','accessToken','--output','tsv'],{maxBuffer:65536,timeout:60000});
  const token=result.stdout.trim();if(!token||/[\r\n]/.test(token))throw new Error('Token missing');return token;
 }catch{throw new Error('Administrator token unavailable for the approved subscription and tenant.');}
}
export function tunneledConnection(config,token,database){return {host:'127.0.0.1',port:config.port,user:config.admin,database,password:token,ssl:{servername:config.host,rejectUnauthorized:true},connectionTimeoutMillis:10000,statement_timeout:30000};}
const fields=row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k.toLowerCase(),v]));
export async function bootstrapDatabase(config,{Client,getToken=getAdminToken,loadSchema=()=>readFile(new URL('../server/storage/postgres.sql',import.meta.url),'utf8')}={}){
 if(!Client)throw new Error('PostgreSQL client required.');
 let token=await getToken(config),admin,db;
 try{
  admin=new Client(tunneledConnection(config,token,'postgres'));await admin.connect();
  const principals=await admin.query('SELECT to_jsonb(p) AS principal FROM pg_catalog.pgaadauth_list_principals(false) AS p WHERE rolename=$1',['shift_app']);
  if(principals.rows.length){
   const p=fields(principals.rows[0].principal);
   if(principals.rows.length!==1||p.objectid?.toLowerCase()!==config.objectId.toLowerCase()||p.tenantid?.toLowerCase()!==config.tenant.toLowerCase()||p.principaltype!=='service'||Number(p.isadmin)!==0)throw new Error('Existing application principal does not match approved identity.');
  }else{
   const existing=await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',['shift_app']);if(existing.rows.length)throw new Error('Existing application role has no verified Entra binding.');
   await admin.query("SELECT * FROM pg_catalog.pgaadauth_create_principal_with_oid($1,$2,'service',false,false)",['shift_app',config.objectId]);
  }
  const roles=await admin.query('SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=$1',['shift_app']);
  if(roles.rows.length!==1||Object.values(roles.rows[0]).some(Boolean))throw new Error('Application principal has excessive privileges.');
  db=new Client(tunneledConnection(config,token,'shift'));await db.connect();
  await db.query('SET search_path TO public, pg_catalog');
  await db.query(await loadSchema());
  // Dedicated SHIFT database only. PUBLIC must not let the app create shadow objects.
  await db.query('BEGIN');
  try{
   const version=await db.query('SELECT version FROM public.shift_schema_version WHERE singleton=true');if(version.rows.length!==1||version.rows[0].version!==1)throw new Error('Unexpected schema version.');
   await db.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
   await db.query('GRANT CONNECT ON DATABASE shift TO shift_app');
   await db.query('GRANT USAGE ON SCHEMA public TO shift_app');
   await db.query('GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_records TO shift_app');
   await db.query('GRANT SELECT ON public.shift_schema_version TO shift_app');
   const permissions=await db.query("SELECT has_schema_privilege('shift_app','public','CREATE') AS can_create, has_table_privilege('shift_app','public.shift_schema_version','INSERT,UPDATE,DELETE') AS can_change_version");
   if(permissions.rows.length!==1||permissions.rows[0].can_create||permissions.rows[0].can_change_version)throw new Error('Application principal is not least privilege.');
   await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}
  return {schemaVersion:1,principal:'shift_app',database:'shift'};
 }finally{token=undefined;if(db)await db.end().catch(()=>{});if(admin)await admin.end().catch(()=>{});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const config=parseBootstrapArgs(process.argv.slice(2));const {Client}=await import('pg');await bootstrapDatabase(config,{Client});console.log('SHIFT schema and application grants verified. Verify managed-identity login separately before enabling the normal runtime.');}
 catch{console.error('SHIFT database bootstrap failed. No credentials are logged. Inspect role/schema state before retrying; a principal or schema may already exist.');process.exitCode=1;}
}
