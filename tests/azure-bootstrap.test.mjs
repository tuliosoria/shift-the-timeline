import test from 'node:test';
import assert from 'node:assert/strict';
import {createBootstrapServer,startBootstrap} from '../server/azure-bootstrap.mjs';
import {parseBootstrapArgs,getAdminToken,tunneledConnection,bootstrapDatabase} from '../scripts/azure-db-bootstrap.mjs';
const config={subscription:'00000000-0000-0000-0000-000000000001',tenant:'00000000-0000-0000-0000-000000000002',objectId:'00000000-0000-0000-0000-000000000003',host:'shift.postgres.database.azure.com',admin:'operator@example.com',port:15432};
test('maintenance server serves only health and no game routes or private assets',async()=>{
 const server=createBootstrapServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 try{for(const [path,method,status] of [['/healthz','GET',200],['/healthz','HEAD',200],['/healthz','POST',503],['/','GET',503],['/api/cases','GET',503],['/api/rooms','POST',503],['/private/case.json','GET',503]]){const r=await fetch(base+path,{method});assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'no-store');assert.ok(!(await r.text()).includes('caseData'));}}finally{await new Promise(resolve=>server.close(resolve));}
 await assert.rejects(()=>startBootstrap({NODE_ENV:'production'}),/Explicit/);await assert.rejects(()=>startBootstrap({NODE_ENV:'production',SHIFT_BOOTSTRAP_MODE:'operator-only',PORT:'bad'}),/port/);
});
test('bootstrap args bind explicit subscription tenant and private host without secrets',()=>{
 const args=['--subscription',config.subscription,'--tenant',config.tenant,'--identity-object-id',config.objectId,'--host',config.host,'--admin',config.admin];assert.deepEqual(parseBootstrapArgs(args),config);
 for(const extra of [['--password','secret'],['--host','attacker.example'],['--port','0']])assert.throws(()=>parseBootstrapArgs([...args,...extra]),/Invalid/);
 const conn=tunneledConnection(config,'synthetic-token','shift');assert.equal(conn.host,'127.0.0.1');assert.equal(conn.ssl.servername,config.host);assert.equal(conn.ssl.rejectUnauthorized,true);
});
test('token acquisition is scoped, memory-only and sanitizes CLI failures',async()=>{
 const calls=[];const token=await getAdminToken(config,async(command,args)=>{calls.push({command,args});return {stdout:args.includes('show')?`${config.tenant}\n`:'synthetic-token\n'};});assert.equal(token,'synthetic-token');assert.equal(calls.length,2);for(const call of calls){assert.equal(call.command,'az');assert.ok(call.args.includes(config.subscription));assert.ok(!call.args.includes('synthetic-token'));}assert.ok(calls[1].args.includes('https://ossrdbms-aad.database.windows.net'));
 await assert.rejects(()=>getAdminToken(config,async()=>{throw new Error('secret token in CLI stderr');}),error=>!error.message.includes('secret token'));
 let calls2=0;await assert.rejects(()=>getAdminToken(config,async()=>{calls2++;return {stdout:'wrong-tenant'};}));assert.equal(calls2,1);
});
function clientHarness({existing=false,mismatch=false,excess=false,grantFailure=false}={}){
 const clients=[];class Client{
  constructor(connection){this.connection=connection;this.queries=[];clients.push(this);}
  async connect(){this.connected=true;}
  async end(){this.ended=true;}
  async query(sql,args){this.queries.push({sql,args});
   if(sql.includes('pgaadauth_list_principals')){assert.match(sql,/WHERE rolname=\$1$/);assert.deepEqual(args,['shift_app']);return {rows:existing?[{principal:{rolname:'shift_app',objectid:mismatch?'wrong':config.objectId,tenantid:config.tenant,principaltype:'service',ismfa:0,isadmin:0}}]:[]};}
   if(sql.startsWith('SELECT 1 FROM pg_roles'))return {rows:[]};
   if(sql.includes('rolsuper'))return {rows:[{rolsuper:excess,rolcreatedb:false,rolcreaterole:false,rolreplication:false,rolbypassrls:false}]};
   if(sql.startsWith('SELECT version'))return {rows:[{version:1}]};
   if(sql.includes('has_schema_privilege'))return {rows:[{can_create:false,can_change_version:false}]};
   if(grantFailure&&sql.startsWith('GRANT'))throw new Error('synthetic grant failure');
   return {rows:[]};
  }
 }
 return {Client,clients};
}
test('bootstrap creates non-admin identity then schema and narrow grants through TLS tunnel',async()=>{
 const h=clientHarness();assert.deepEqual(await bootstrapDatabase(config,{Client:h.Client,getToken:async()=>'synthetic',loadSchema:async()=>'-- fake migration'}),{schemaVersion:1,principal:'shift_app',database:'shift'});
 assert.equal(h.clients.length,2);assert.ok(h.clients.every(c=>c.ended&&c.connection.ssl.rejectUnauthorized&&c.connection.host==='127.0.0.1'));
 const creation=h.clients[0].queries.find(q=>q.sql.includes('pgaadauth_create_principal'));assert.deepEqual(creation.args,['shift_app',config.objectId]);assert.match(creation.sql,/'service',false,false/);
 const sql=h.clients[1].queries.map(q=>q.sql).join('\n');assert.match(sql,/REVOKE CREATE ON SCHEMA public FROM PUBLIC/);assert.match(sql,/GRANT SELECT ON public.shift_schema_version/);assert.ok(!/GRANT ALL|CREATEROLE|CREATEDB/.test(sql));assert.equal(h.clients[1].queries.at(-1).sql,'COMMIT');
});
test('bootstrap retries only verified matching identities and never adopts mismatched role',async()=>{
 const h=clientHarness({existing:true});await bootstrapDatabase(config,{Client:h.Client,getToken:async()=>'synthetic',loadSchema:async()=>''});assert.ok(!h.clients[0].queries.some(q=>q.sql.includes('pgaadauth_create_principal')));
 const bad=clientHarness({existing:true,mismatch:true});await assert.rejects(()=>bootstrapDatabase(config,{Client:bad.Client,getToken:async()=>'synthetic'}),/does not match/);assert.equal(bad.clients.length,1);assert.equal(bad.clients[0].ended,true);
 const elevated=clientHarness({excess:true});await assert.rejects(()=>bootstrapDatabase(config,{Client:elevated.Client,getToken:async()=>'synthetic'}),/excessive/);
});
test('grant failures roll back and close both connections',async()=>{const h=clientHarness({grantFailure:true});await assert.rejects(()=>bootstrapDatabase(config,{Client:h.Client,getToken:async()=>'synthetic',loadSchema:async()=>''}));assert.equal(h.clients[1].queries.at(-1).sql,'ROLLBACK');assert.ok(h.clients.every(c=>c.ended));});
