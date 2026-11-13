import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Readable} from 'node:stream';
import {createServer} from '../server/http.mjs';
const assets=await import('../server/public-assets.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
const urls=()=>assets.PUBLIC_ASSETS.map(a=>a.url);
test('exact public asset manifest covers the client modules, PWA files, artwork and font without exposing arbitrary files',()=>{
 assert.ok(Array.isArray(assets.PUBLIC_ASSETS),'Explicit asset manifest exists');
 assert.equal(assets.PUBLIC_ASSETS.length,45);assert.equal(new Set(urls()).size,45);
 for(const path of ['/','/app.js','/api.js','/views.js','/backdrop.js','/chat.js','/toast.js','/ui-state.js','/focus.js','/question-topics.js','/style.css','/manifest.webmanifest','/assets/icons/icon-192.png','/assets/icons/icon-512.png','/assets/portraits/bento.webp','/assets/fonts/Rye-Regular.ttf','/assets/fonts/OFL-Rye.txt'])assert.ok(urls().includes(path),path);
 for(const path of ['/case-films.js','/assets/steps/deduce.webp','/assets/steps/analyse.webp','/assets/steps/interrogate.webp','/private/train-case.mjs','/assets/portraits/unknown.webp','/assets/../private/file','/assets/fonts/secret.key','/server/game.mjs'])assert.equal(assets.publicAsset(path),undefined,path);
 assert.equal(assets.publicAsset('/manifest.webmanifest').type,'application/manifest+json');
 assert.equal(assets.publicAsset('/assets/icons/icon-512.png').type,'image/png');
});
test('the PWA manifest names the app, runs standalone in navy and lists both icons',async()=>{
 const manifest=JSON.parse(await assets.readPublicAsset('manifest.webmanifest'));
 assert.equal(manifest.name,'SHIFT: The Timeline');assert.equal(manifest.short_name,'SHIFT');assert.equal(manifest.display,'standalone');
 assert.equal(manifest.background_color,'#0d1722');assert.equal(manifest.theme_color,'#0d1722');
 assert.deepEqual(manifest.icons.map(i=>[i.src,i.sizes,i.type]),[['/assets/icons/icon-192.png','192x192','image/png'],['/assets/icons/icon-512.png','512x512','image/png']]);
 for(const [file,size]of [['assets/icons/icon-192.png',192],['assets/icons/icon-512.png',512]]){const png=await assets.readPublicAsset(file);assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);}
 const html=(await assets.readPublicAsset('index.html')).toString();
 for(const tag of ['rel="manifest" href="/manifest.webmanifest"','name="apple-mobile-web-app-capable" content="yes"','rel="apple-touch-icon"','name="theme-color" content="#0d1722"'])assert.ok(html.includes(tag),tag);
 assert.ok(!/serviceWorker/.test(html+(await assets.readPublicAsset('app.js'))),'No service worker: polling must never be served stale');
});
test('shipped illustrations are bounded WebP images and the licensed font remains self-contained',async()=>{
 let total=0;
 for(const a of assets.PUBLIC_ASSETS.filter(a=>a.type==='image/webp')){const data=await assets.readPublicAsset(a.file);assert.equal(data.subarray(0,4).toString(),'RIFF');assert.equal(data.subarray(8,12).toString(),'WEBP');assert.ok(data.length<=150*1024,a.file);total+=data.length;}
 assert.ok(total<=2.5*1024*1024);assert.equal(assets.PUBLIC_ASSETS.filter(a=>a.type==='image/webp').length,18);
 const licence=await assets.readPublicAsset('assets/fonts/OFL-Rye.txt');assert.match(licence.toString(),/SIL OPEN FONT LICENSE/);assert.match(licence.toString(),/Sorkin/);
 assert.ok((await assets.readPublicAsset('assets/fonts/Rye-Regular.ttf')).length<200000);
});
test('only the three background films and their posters are published, silent and within the byte budget',async t=>{
 let total=0;
 for(const id of ['train','pocket-watch','corridor']){
  const film=assets.publicAsset(`/assets/films/${id}.mp4`);assert.ok(film,`${id} has an explicit public route`);assert.equal(film.type,'video/mp4');
  const bytes=await assets.readPublicAsset(film.file);total+=bytes.length;assert.equal(bytes.subarray(4,8).toString(),'ftyp');
  const poster=assets.publicAsset(`/assets/films/${id}.webp`);assert.equal(poster.type,'image/webp');assert.ok((await assets.readPublicAsset(poster.file)).length<100*1024);
 }
 assert.ok(total<=2.3*1024*1024,`Films total ${total} bytes; silent re-encodes stay within 2.3 MiB`);
 assert.equal(assets.publicAsset('/assets/films/original.mp4'),undefined);
 if(spawnSync('ffprobe',['-version']).error){t.diagnostic('ffprobe missing: audio check enforced by the byte budget only');return;}
 for(const id of ['train','pocket-watch','corridor']){
  const path=fileURLToPath(new URL(`../public/assets/films/${id}.mp4`,import.meta.url));
  const probe=spawnSync('ffprobe',['-v','error','-show_entries','stream=codec_type','-of','csv=p=0',path],{encoding:'utf8'});
  assert.equal(probe.status,0);assert.deepEqual(probe.stdout.trim().split('\n'),['video'],`${id} has a video stream and no audio`);
 }
});
test('asset reader refuses symlinks and paths outside its root',async t=>{
 const root=await mkdtemp(join(tmpdir(),'shift-assets-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await writeFile(join(root,'outside.txt'),'NOT PUBLIC');await symlink(join(root,'outside.txt'),join(root,'linked.txt'));
 await assert.rejects(assets.readPublicAsset('linked.txt',root));await assert.rejects(assets.readPublicAsset('../outside.txt',root));
});
function serve(path){return new Promise(resolve=>{const server=createServer({origin:'http://shift.test',api:async()=>new Response('{"error":"Not found"}',{status:404,headers:{'Content-Type':'application/json'}})});const req=Readable.from([]);Object.assign(req,{url:path,method:'GET',headers:{},socket:{remoteAddress:'127.0.0.1'}});const response={headers:{},status:null,writeHead(status,headers){this.status=status;this.headers=headers;},end(body){resolve({status:this.status,headers:this.headers,body:Buffer.from(body)});}};server.emit('request',req,response);});}
test('HTTP serves the real modules, manifest and artwork with correct MIME and rejects non-allowlisted paths',async()=>{
 for(const [path,type]of [['/views.js','text/javascript'],['/api.js','text/javascript'],['/backdrop.js','text/javascript'],['/ui-state.js','text/javascript'],['/focus.js','text/javascript'],['/manifest.webmanifest','application/manifest+json'],['/assets/icons/icon-192.png','image/png'],['/assets/portraits/bento.webp','image/webp'],['/assets/fonts/Rye-Regular.ttf','font/ttf']]){const r=await serve(path);assert.equal(r.status,200,path);assert.ok(r.headers['Content-Type'].startsWith(type),path);assert.ok(r.body.length>0);}
 for(const path of ['/assets/portraits/not-real.webp','/private/train-case.mjs','/case-films.js','/assets/steps/deduce.webp'])assert.equal((await serve(path)).status,404,path);
});

test('audio routes ship bounded MP3 music, WAV effects and the CC0 licence',async()=>{
 let total=0;
 for(const id of ['investigation-noir','investigation']){const a=assets.publicAsset(`/assets/audio/${id}.mp3`);assert.equal(a?.type,'audio/mpeg');const bytes=await assets.readPublicAsset(a.file);assert.ok(bytes.length>100000);total+=bytes.length;}
 assert.ok(total<6*1024*1024);
 for(const id of ['click','send','receive']){const a=assets.publicAsset(`/assets/audio/${id}.wav`);assert.equal(a?.type,'audio/wav');const bytes=await assets.readPublicAsset(a.file);assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,12).toString(),'WAVE');assert.ok(bytes.length<100000);}
 assert.match((await assets.readPublicAsset('assets/audio/Kenney-CC0.txt')).toString(),/Creative Commons Zero/);
 assert.equal(assets.publicAsset('/assets/audio/original.mp3'),undefined);
});
