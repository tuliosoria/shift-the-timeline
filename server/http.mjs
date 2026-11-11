import http from 'node:http';import {HEADERS} from './api.mjs';
import {publicAsset,readPublicAsset} from './public-assets.mjs';
export function createServer({api,origin,sourceIp=req=>req.socket.remoteAddress}){return http.createServer(async(req,res)=>{try{const path=new URL(req.url,origin).pathname;const asset=publicAsset(path);if(['GET','HEAD'].includes(req.method)&&asset){const bytes=await readPublicAsset(asset.file);sendAsset(req,res,asset,bytes);return;}let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>8192){res.writeHead(413,{...HEADERS,'Content-Type':'application/json'});res.end(JSON.stringify({error:'Request too large.'}));return;}chunks.push(chunk);}const request=new Request(new URL(req.url,origin),{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});const response=await api(request,{sourceIp:sourceIp(req)});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(503,{...HEADERS,'Content-Type':'application/json'});res.end(JSON.stringify({error:'Service temporarily unavailable.'}));}});}

const STATIC_MEDIA=/^\/assets\/(?:films|portraits|icons|fonts)\//;
// Single byte ranges keep native mobile video playback and seeking interoperable.
// Only an exact allowlisted asset reaches this function; no user-supplied file path.
function sendAsset(req,res,asset,bytes){
 // Shell, scripts and manifest stay no-store so polling never runs stale code; media is large and immutable per deploy.
 const headers={...HEADERS,'Content-Type':asset.type,'Content-Length':bytes.length,...(STATIC_MEDIA.test(asset.url)?{'Cache-Control':'public, max-age=86400'}:{})};
 if(asset.type==='video/mp4'){
  headers['Accept-Ranges']='bytes';
  if(req.method==='GET'&&req.headers.range){
   const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
   let start=0,end=bytes.length-1;
   if(match){
    if(match[1]){start=Number(match[1]);if(match[2])end=Math.min(Number(match[2]),end);}
    else if(match[2])start=Math.max(0,bytes.length-Number(match[2]));
   }
   if(!match||(!match[1]&&!match[2])||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=bytes.length){
    res.writeHead(416,{...headers,'Content-Length':0,'Content-Range':`bytes */${bytes.length}`});res.end();return;
   }
   const part=bytes.subarray(start,end+1);
   res.writeHead(206,{...headers,'Content-Length':part.length,'Content-Range':`bytes ${start}-${end}/${bytes.length}`});res.end(part);return;
  }
 }
 res.writeHead(200,headers);res.end(req.method==='HEAD'?undefined:bytes);
}
