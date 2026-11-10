import test from 'node:test';
import assert from 'node:assert/strict';
import {readPublicAsset, publicAsset} from '../server/public-assets.mjs';
import {createServer} from '../server/http.mjs';

test('only the three intended bounded films and posters are published',async()=>{
 let total=0;
 for(const id of ['train','pocket-watch','corridor']){
  const path=`/assets/films/${id}.mp4`,asset=publicAsset(path);
  assert.ok(asset,`${id} has an explicit public route`);
  assert.equal(asset.type,'video/mp4');
  const bytes=await readPublicAsset(asset.file);total+=bytes.length;
  assert.equal(bytes.subarray(4,8).toString(),'ftyp');
  assert.ok(bytes.length<2*1024*1024,'Each film stays below 2 MiB');
  const poster=publicAsset(`/assets/films/${id}.webp`);
  assert.equal(poster.type,'image/webp');
  assert.ok((await readPublicAsset(poster.file)).length<100*1024);
 }
 assert.ok(total<4*1024*1024,'All films stay below 4 MiB');
 assert.equal(publicAsset('/assets/films/original.mp4'),undefined);
});

test('mobile video requests support bounded, open and suffix byte ranges and HEAD',async t=>{
 const server=createServer({origin:'http://127.0.0.1',api:async()=>new Response(null,{status:404})});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const url=`http://127.0.0.1:${server.address().port}/assets/films/train.mp4`;
 const full=await fetch(url);assert.equal(full.status,200);
 const bytes=Buffer.from(await full.arrayBuffer());
 assert.equal(full.headers.get('content-type'),'video/mp4');
 assert.equal(full.headers.get('accept-ranges'),'bytes');
 for(const [range,start,end]of [['bytes=0-1',0,1],['bytes=20-39',20,39],['bytes=-8',bytes.length-8,bytes.length-1],[`bytes=${bytes.length-4}-`,bytes.length-4,bytes.length-1],['bytes=0-999999999',0,bytes.length-1]]){
  const r=await fetch(url,{headers:{Range:range}});
  assert.equal(r.status,206,range);
  assert.equal(r.headers.get('content-range'),`bytes ${start}-${end}/${bytes.length}`);
  assert.equal(Number(r.headers.get('content-length')),end-start+1);
  assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes.subarray(start,end+1));
 }
 for(const range of [`bytes=${bytes.length}-`,'bytes=20-10','bytes=-0','bytes=abc','bytes=0-1,3-4']){
  const r=await fetch(url,{headers:{Range:range}});assert.equal(r.status,416,range);
  assert.equal(r.headers.get('content-range'),`bytes */${bytes.length}`);assert.equal((await r.arrayBuffer()).byteLength,0);
 }
 const head=await fetch(url,{method:'HEAD',headers:{Range:'bytes=0-1'}});
 assert.equal(head.status,200);assert.equal(Number(head.headers.get('content-length')),bytes.length);assert.equal((await head.arrayBuffer()).byteLength,0);
 assert.equal((await fetch(url.replace('train.mp4','private.mp4'))).status,404);
});
