import {Pool} from 'pg';
import {ManagedIdentityCredential} from '@azure/identity';
import {PostgresStore} from './storage/postgres.mjs';
import {readAzureConfig} from './azure/config.mjs';
import {createAzureRuntime} from './azure/runtime.mjs';
import {createServer} from './http.mjs';
import {startupStep,reportStartupFailure} from './azure/diagnostics.mjs';

let pool,server,runtime;
try {
 const config=await startupStep('config',()=>readAzureConfig(process.env));
 const credential=await startupStep('identity',()=>new ManagedIdentityCredential());
 pool=new Pool({host:config.host,port:5432,database:config.database,user:config.user,
  password:()=>startupStep('token',async()=>{const token=await credential.getToken('https://ossrdbms-aad.database.windows.net/.default');if(!token?.token)throw Object.assign(new Error('Database identity unavailable.'),{code:'SHIFT_TOKEN_MISSING'});return token.token;}),
  ssl:{rejectUnauthorized:true},max:5,connectionTimeoutMillis:10000,idleTimeoutMillis:30000,statement_timeout:10000});
 pool.on('error',()=>console.error('Database connection unavailable.'));
 runtime=await startupStep('runtime',()=>createAzureRuntime({store:new PostgresStore({pool})}));
 await startupStep('server',async()=>{
 server=createServer({api:runtime.api,origin:config.origin});
 const port=Number(process.env.PORT??8080);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid port.');
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'0.0.0.0',()=>{server.removeListener('error',reject);resolve();});});
 });
 runtime.start();console.log('SHIFT Azure runtime ready.');
 let shuttingDown=false;
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{
  if(shuttingDown)return;shuttingDown=true;
  setTimeout(()=>process.exit(1),15000).unref();
  // Drain both active HTTP transactions and the worker before closing DB connections.
  const drained=new Promise(resolve=>server.close(resolve));
  void Promise.allSettled([drained,runtime.stop()]).finally(()=>pool.end()).finally(()=>process.exit(0));
 });
} catch(error) {
 reportStartupFailure(error);
 server?.close();await runtime?.stop().catch(()=>{});await pool?.end().catch(()=>{});process.exitCode=1;
}
