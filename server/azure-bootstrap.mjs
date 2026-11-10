// Explicit, operator-restricted maintenance entrypoint. Never selected automatically
// by the production runtime. No game, case, database, identity or AI modules loaded.
import http from 'node:http';
import {pathToFileURL} from 'node:url';
export function createBootstrapServer(){
 return http.createServer((request,response)=>{
  const healthy=request.url==='/healthz'&&['GET','HEAD'].includes(request.method);
  response.writeHead(healthy?200:503,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",'Connection':'close'});
  response.end(request.method==='HEAD'?undefined:healthy?'maintenance':'Service temporarily unavailable.');
 });
}
export async function startBootstrap(env=process.env){
 if(env.SHIFT_BOOTSTRAP_MODE!=='operator-only'||env.NODE_ENV!=='production')throw new Error('Explicit operator-only bootstrap configuration required.');
 const port=Number(env.PORT??8080);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid port.');
 const server=createBootstrapServer();
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'0.0.0.0',()=>{server.removeListener('error',reject);resolve();});});
 return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const server=await startBootstrap();let closing=false;for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{if(closing)return;closing=true;server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),10000).unref();});}
 catch{console.error('SHIFT maintenance startup failed.');process.exitCode=1;}
}
