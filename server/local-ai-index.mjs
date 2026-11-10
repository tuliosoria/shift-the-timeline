import {createServer} from './http.mjs';
import {createLocalAiRuntime} from './local-ai.mjs';
import {readLocalAiConfig} from './ai/local.mjs';
import {createLocalSecretReader} from './ai/local-secret.mjs';
readLocalAiConfig(process.env);
const runtime=await createLocalAiRuntime({env:process.env,getSecret:createLocalSecretReader(process.env.SHIFT_LOCAL_AI_KEY_FILE)});
const server=createServer({api:runtime.api,origin:runtime.config.origin});
server.listen(runtime.config.port,runtime.config.host,()=>{
 runtime.worker.start();
 console.log('SHIFT local AI trial listening on loopback. Player opt-in required. Limits reset on restart.');
});
let closing=false;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{
 if(closing)return;closing=true;
 const stopped=runtime.worker.stop();server.close(()=>{void stopped.finally(()=>process.exit(0));});
});
server.on('error',()=>{void runtime.worker.stop();});
