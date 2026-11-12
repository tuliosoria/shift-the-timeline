import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createServer} from '../server/http.mjs';
import {readPublicAsset} from '../server/public-assets.mjs';
function request(method, range) { return new Promise(resolve => {
 const server=createServer({origin:'http://shift.test',api:async()=>new Response('',{status:404})});
 const req=Readable.from([]);Object.assign(req,{url:'/assets/audio/investigation.mp3',method,headers:range?{range}:{},socket:{remoteAddress:'127.0.0.1'}});
 const res={headers:{},writeHead(status,headers){this.status=status;this.headers=headers;},end(body){resolve({...this,body:Buffer.from(body??'')});}};
 server.emit('request',req,res);
});}
test('music supports byte ranges for mobile playback and playlist seeking', async()=>{
 const source=await readPublicAsset('assets/audio/investigation.mp3');
 const part=await request('GET','bytes=100-199');
 assert.equal(part.status,206);assert.equal(part.headers['Accept-Ranges'],'bytes');
 assert.equal(part.headers['Content-Range'],`bytes 100-199/${source.length}`);assert.deepEqual(part.body,source.subarray(100,200));
 const suffix=await request('GET','bytes=-20');assert.deepEqual(suffix.body,source.subarray(-20));
 const invalid=await request('GET','bytes=999999999-');assert.equal(invalid.status,416);assert.equal(invalid.body.length,0);
 const head=await request('HEAD');assert.equal(head.status,200);assert.equal(head.body.length,0);assert.equal(head.headers['Content-Length'],source.length);
});
