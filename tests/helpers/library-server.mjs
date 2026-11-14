import {createServer} from '../../server/http.mjs';
import {createApi} from '../../server/api.mjs';
import {DurableGame} from '../../server/persistent-game.mjs';
import {Sessions} from '../../server/sessions.mjs';
import {MemoryStore} from '../../server/storage/memory.mjs';
export async function startLibraryServer(data){
 const store=new MemoryStore(),game=new DurableGame({store,...data});let api;
 const server=createServer({api:(...args)=>api(...args),origin:'http://127.0.0.1'});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 api=createApi({game,sessions:new Sessions({store,secure:false}),allowedOrigin:origin,rateLimit:async()=>{}});
 return {origin,game,store,close:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();})};
}
export function httpClient(origin){let cookie;return async(path,body)=>{
 const response=await fetch(origin+path,{method:body?'POST':'GET',headers:{...(cookie?{cookie}:{}),...(body?{origin,'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 if(response.headers.has('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
 return {status:response.status,body:response.status===204?null:await response.json()};
};}
