import {startupStep} from './diagnostics.mjs';
const scope='https://ossrdbms-aad.database.windows.net/.default';
const tokenTimeoutMs=30000;
// Prewarm the SDK credential cache before PostgreSQL starts its connection timer.
// The same bounded callback refreshes via the SDK on subsequent connections.
export async function createManagedIdentityPool({Pool,credential,config,schedule=setTimeout,cancel=clearTimeout}){
 const password=()=>startupStep('token',async()=>{
  const controller=new AbortController();let timer;
  const deadline=new Promise((_,reject)=>{timer=schedule(()=>{
   const error=Object.assign(new Error('Database identity deadline exceeded.'),{code:'SHIFT_TOKEN_TIMEOUT'});
   reject(error);controller.abort();
  },tokenTimeoutMs);});
  try{
   const token=await Promise.race([Promise.resolve().then(()=>credential.getToken(scope,{abortSignal:controller.signal})),deadline]);
   if(!token?.token)throw Object.assign(new Error('Database identity unavailable.'),{code:'SHIFT_TOKEN_MISSING'});
   return token.token;
  }finally{cancel(timer);}
 });
 await password();
 return new Pool({host:config.host,port:5432,database:config.database,user:config.user,password,
  ssl:{rejectUnauthorized:true},max:5,connectionTimeoutMillis:30000,idleTimeoutMillis:30000,statement_timeout:10000});
}
