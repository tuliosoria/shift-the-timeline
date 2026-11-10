import {Pool} from 'pg';
import {ManagedIdentityCredential} from '@azure/identity';
import {PostgresStore} from './storage/postgres.mjs';
import {readAzureConfig} from './azure/config.mjs';
import {createAzureRuntime} from './azure/runtime.mjs';
import {createServer} from './http.mjs';
import {azureClientAddress} from './azure/client-address.mjs';
import {startupStep,reportStartupFailure} from './azure/diagnostics.mjs';
import {createManagedIdentityPool} from './azure/database.mjs';

let pool,server,runtime;
try {
 const config=await startupStep('config',()=>readAzureConfig(process.env));
 const credential=await startupStep('identity',()=>new ManagedIdentityCredential());
 pool=await startupStep('database',()=>createManagedIdentityPool({Pool,credential,config}));
 pool.on('error',()=>console.error('Database connection unavailable.'));
 runtime=await startupStep('runtime',()=>createAzureRuntime({store:new PostgresStore({pool})}));
 await startupStep('server',async()=>{
 server=createServer({api:runtime.api,origin:config.origin,sourceIp:azureClientAddress});
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
