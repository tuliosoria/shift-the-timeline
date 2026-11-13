import {readFile,lstat,realpath} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const entries=[
 ['/', 'index.html', 'text/html; charset=utf-8'],
 ['/app.js', 'app.js', 'text/javascript; charset=utf-8'],
 ['/ui-state.js', 'ui-state.js', 'text/javascript; charset=utf-8'],
 ['/question-topics.js', 'question-topics.js', 'text/javascript; charset=utf-8'],
 ...['api','views','focus','backdrop','chat','toast','case-presentation','audio'].map(id=>[`/${id}.js`,`${id}.js`,'text/javascript; charset=utf-8']),
 ['/manifest.webmanifest','manifest.webmanifest','application/manifest+json'],
 ...[192,512].map(size=>[`/assets/icons/icon-${size}.png`,`assets/icons/icon-${size}.png`,'image/png']),
 ...['train','pocket-watch','corridor'].flatMap(id=>[[`/assets/films/${id}.mp4`,`assets/films/${id}.mp4`,'video/mp4'],[`/assets/films/${id}.webp`,`assets/films/${id}.webp`,'image/webp']]),
 ...['investigation-noir','investigation'].map(id=>[`/assets/audio/${id}.mp3`,`assets/audio/${id}.mp3`,'audio/mpeg']),
 ...['click','send','receive'].map(id=>[`/assets/audio/${id}.wav`,`assets/audio/${id}.wav`,'audio/wav']),
 ['/assets/audio/Kenney-CC0.txt','assets/audio/Kenney-CC0.txt','text/plain; charset=utf-8'],
 ['/style.css', 'style.css', 'text/css; charset=utf-8'],
 ...['mara','ines','bento','celia','noa','rui','vera','davi','lia','tomas','helena','joel','olga','samira','elio'].map(id=>[`/assets/portraits/${id}.webp`,`assets/portraits/${id}.webp`,'image/webp']),
 ['/assets/fonts/Rye-Regular.ttf','assets/fonts/Rye-Regular.ttf','font/ttf'],
 ['/assets/fonts/OFL-Rye.txt','assets/fonts/OFL-Rye.txt','text/plain; charset=utf-8'],
];
export const PUBLIC_ASSETS=Object.freeze(entries.map(([url,file,type])=>Object.freeze({url,file,type})));
const byUrl=new Map(PUBLIC_ASSETS.map(a=>[a.url,a]));
export const publicAsset=url=>byUrl.get(url);
export async function readPublicAsset(file,root=fileURLToPath(new URL('../public/',import.meta.url))){
 const base=await realpath(root),path=resolve(base,file);
 if(!path.startsWith(base+sep))throw new Error('Asset outside public root');
 const stat=await lstat(path);
 if(!stat.isFile()||stat.isSymbolicLink()||await realpath(path)!==path)throw new Error('Symlink or invalid asset');
 return readFile(path);
}
