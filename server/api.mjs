import {DomainError} from './game.mjs';
export const HEADERS={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"};
const reply=(status,body,extra={})=>new Response(status===204?null:JSON.stringify(body),{status,headers:{...HEADERS,'Content-Type':'application/json; charset=utf-8',...extra}});
async function bodyOf(request){if(!request.headers.get('content-type')?.startsWith('application/json'))throw new DomainError('Use application/json.',415);if(Number(request.headers.get('content-length'))>8192)throw new DomainError('Request too large.',413);let size=0;const chunks=[];const reader=request.body?.getReader();if(reader)while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();throw new DomainError('Request too large.',413);}chunks.push(Buffer.from(value));}let body;try{body=JSON.parse(Buffer.concat(chunks).toString());}catch{throw new DomainError('Invalid JSON.');}if(!body||typeof body!=='object'||Array.isArray(body))throw new DomainError('Expected a JSON object.');return body;}
export function createApi({game,sessions,allowedOrigin,rateLimit}){
 if(!allowedOrigin||new URL(allowedOrigin).origin!==allowedOrigin||typeof rateLimit!=='function')throw new Error('Exact origin and rate limiter required');
 return async function api(request,context={}){try{
  const url=new URL(request.url),path=url.pathname,cookie=request.headers.get('cookie')??'';
  if(!['GET','POST'].includes(request.method))return reply(405,{error:'Method not allowed.'});
  if(request.method==='POST'&&(request.headers.get('origin')!==allowedOrigin||request.headers.get('sec-fetch-site')==='cross-site'))return reply(403,{error:'Origin not allowed.'});
  await rateLimit({request,path,context});
  const body=request.method==='POST'?await bodyOf(request):null;
  if(path==='/api/health'&&request.method==='GET')return reply(200,{ok:true});
  if(path==='/api/cases'&&request.method==='GET')return reply(200,{cases:game.cases(url.searchParams.get('locale')??undefined),dialogueMode:game.ai?'ai':'canonical',persistence:'durable',roomLifetimeHours:6,roomAbsoluteHours:24});
  if(path==='/api/session'&&request.method==='POST'){try{const s=await sessions.renew(cookie);return reply(200,{ok:true,expiresAt:s.expiresAt},{'Set-Cookie':s.cookie});}catch(e){if(!(e instanceof DomainError))throw e;const s=await sessions.create();return reply(201,{ok:true,expiresAt:s.expiresAt},{'Set-Cookie':s.cookie});}}
  if(path==='/api/session/logout'&&request.method==='POST')return reply(200,{ok:true},{'Set-Cookie':await sessions.revoke(cookie)});
  if(path==='/api/rooms'&&request.method==='POST'){const s=await sessions.renew(cookie);return reply(201,await game.create(s.hash,body.name,body.caseId,body.requestId??body.id,body.locale),{'Set-Cookie':s.cookie});}
  const match=path.match(/^\/api\/rooms\/([A-HJ-NP-Z2-9]{8})(?:\/(join|actions|commands|state))?$/i);
  if(match){const s=await sessions.resolve(cookie);const [,code,op]=match;if(op==='join'&&request.method==='POST'){const renewed=await sessions.renew(cookie);return reply(200,await game.join(code,renewed.hash,body.name,body.requestId??body.id,body.locale),{'Set-Cookie':renewed.cookie});}if((!op||op==='state')&&request.method==='GET'){const state=await game.view(code,s.hash);const since=url.searchParams.get('since');if(since!==null&&/^\d+$/.test(since)&&Number(since)===state.version)return reply(204);return reply(200,state);}if(['actions','commands'].includes(op)&&request.method==='POST')return reply(200,await game.act(code,s.hash,{...body,id:body.requestId??body.id}));return reply(405,{error:'Method not allowed.'});}
  return reply(404,{error:'Not found.'});
 }catch(e){if(e instanceof DomainError)return reply(e.status,{error:e.message},e.status===429?{'Retry-After':'60'}:{});console.error(JSON.stringify({event:'request_failed',type:e.name}));return reply(503,{error:'Service temporarily unavailable. Please try again.'});}};
}
