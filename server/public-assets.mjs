import {readFile,lstat,realpath} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const entries=[
 ['/', 'index.html', 'text/html; charset=utf-8'],
 ['/app.js', 'app.js', 'text/javascript; charset=utf-8'],
 ['/ui-state.js', 'ui-state.js', 'text/javascript; charset=utf-8'],
 ['/question-topics.js', 'question-topics.js', 'text/javascript; charset=utf-8'],
 ['/style.css', 'style.css', 'text/css; charset=utf-8'],
 ...['mara','ines','bento','celia','noa','rui','vera','davi','lia','tomas','helena','joel','olga','samira','elio'].map(id=>[`/assets/portraits/${id}.webp`,`assets/portraits/${id}.webp`,'image/webp']),
 ...['analyse','interrogate','deduce'].map(id=>[`/assets/steps/${id}.webp`,`assets/steps/${id}.webp`,'image/webp']),
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
