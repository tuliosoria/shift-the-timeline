import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,lstat,mkdtemp,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {createServer} from '../server/http.mjs';
import {clientHarness,clientState} from './helpers/client-harness.mjs';
const assets=await import('../server/public-assets.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
test('exact public asset manifest covers scripts illustrations and font without exposing arbitrary files',()=>{
 assert.ok(Array.isArray(assets.PUBLIC_ASSETS),'Explicit asset manifest exists');
 assert.equal(assets.PUBLIC_ASSETS.length,25);assert.equal(new Set(assets.PUBLIC_ASSETS.map(a=>a.url)).size,25);
 for(const path of ['/ui-state.js','/question-topics.js','/assets/portraits/bento.webp','/assets/steps/deduce.webp','/assets/fonts/Rye-Regular.ttf','/assets/fonts/OFL-Rye.txt'])assert.ok(assets.PUBLIC_ASSETS.some(a=>a.url===path),path);
 for(const path of ['/private/train-case.mjs','/assets/portraits/unknown.webp','/assets/../private/file','/assets/fonts/secret.key','/server/game.mjs'])assert.equal(assets.publicAsset(path),undefined,path);
});
test('shipped illustrations are bounded WebP images and the licensed font remains self-contained',async()=>{
 assert.ok(Array.isArray(assets.PUBLIC_ASSETS));let total=0;
 for(const a of assets.PUBLIC_ASSETS.filter(a=>a.type==='image/webp')){const data=await assets.readPublicAsset(a.file);assert.equal(data.subarray(0,4).toString(),'RIFF');assert.equal(data.subarray(8,12).toString(),'WEBP');assert.ok(data.length<=150*1024,a.file);total+=data.length;}
 assert.ok(total<=2.5*1024*1024);assert.equal(assets.PUBLIC_ASSETS.filter(a=>a.type==='image/webp').length,18);
 const licence=await assets.readPublicAsset('assets/fonts/OFL-Rye.txt');assert.match(licence.toString(),/SIL OPEN FONT LICENSE/);assert.match(licence.toString(),/Sorkin/);
 assert.ok((await assets.readPublicAsset('assets/fonts/Rye-Regular.ttf')).length<200000);
});
test('asset reader refuses symlinks and paths outside its root',async t=>{
 assert.equal(typeof assets.readPublicAsset,'function');const root=await mkdtemp(join(tmpdir(),'shift-assets-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await writeFile(join(root,'outside.txt'),'NOT PUBLIC');await symlink(join(root,'outside.txt'),join(root,'linked.txt'));
 await assert.rejects(assets.readPublicAsset('linked.txt',root));await assert.rejects(assets.readPublicAsset('../outside.txt',root));
});
function serve(path){return new Promise(resolve=>{const server=createServer({origin:'http://shift.test',api:async()=>new Response('{"error":"Not found"}',{status:404,headers:{'Content-Type':'application/json'}})});const req=Readable.from([]);Object.assign(req,{url:path,method:'GET',headers:{},socket:{remoteAddress:'127.0.0.1'}});const response={headers:{},status:null,writeHead(status,headers){this.status=status;this.headers=headers;},end(body){resolve({status:this.status,headers:this.headers,body:Buffer.from(body)});}};server.emit('request',req,response);});}
test('HTTP serves the real scoped module and artwork with correct MIME and rejects non-allowlisted paths',async()=>{
 for(const [path,type]of [['/question-topics.js','text/javascript'],['/ui-state.js','text/javascript'],['/assets/portraits/bento.webp','image/webp'],['/assets/fonts/Rye-Regular.ttf','font/ttf']]){const r=await serve(path);assert.equal(r.status,200,path);assert.ok(r.headers['Content-Type'].startsWith(type),path);assert.ok(r.body.length>0);}
 assert.equal((await serve('/assets/portraits/not-real.webp')).status,404);assert.equal((await serve('/private/train-case.mjs')).status,404);
});
test('unknown synthetic suspect IDs keep an initials fallback without fetching an arbitrary path',()=>{
 const s=clientState();s.suspects[0].id='../../private/secret';s.suspects[0].name='Synthetic Agent';s.suspects[0].initials='SA';const h=clientHarness(s);h.client.render();const html=h.element('main').innerHTML;
 assert.match(html,/portrait-fallback[^>]*>SA/);assert.ok(!html.includes('src="/assets/portraits/../../'));
});
