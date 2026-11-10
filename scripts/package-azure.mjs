// Staging package includes only the explicitly public demo; never reads private/ or .env files.
import {build} from 'esbuild';
import {includePath} from './package.mjs';
import {parseReleaseCommit} from './release-commit.mjs';
import {mkdir,mkdtemp,readFile,writeFile,rename} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {PUBLIC_ASSETS,readPublicAsset} from '../server/public-assets.mjs';
import {validateCase} from '../server/case-loader.mjs';
import {caseData,catalog} from '../examples/public-demo.mjs';
const releaseCommit=parseReleaseCommit(process.argv.slice(2));
const root=process.cwd(),stage=await mkdtemp(resolve(root,'.shift-build-azure-'));
validateCase({caseData,catalog});
const result=await build({absWorkingDir:root,entryPoints:['server/azure-index.mjs'],outfile:resolve(stage,'server/azure-index.mjs'),bundle:true,define:{__SHIFT_RELEASE_COMMIT__:JSON.stringify(releaseCommit)},platform:'node',target:'node22',format:'esm',metafile:true,sourcemap:false,external:['pg-native'],banner:{js:"import {createRequire as __shiftRequire} from 'node:module';const require=__shiftRequire(import.meta.url);"}});
for(const path of Object.keys(result.metafile.inputs))if(!includePath(path))throw new Error('Unexpected bundle input: '+path);
await writeFile(resolve(stage,'server/azure-bootstrap.mjs'),await readFile(resolve(root,'server/azure-bootstrap.mjs')));
for(const asset of PUBLIC_ASSETS){const path=resolve(stage,'public',asset.file);await mkdir(dirname(path),{recursive:true});await writeFile(path,await readPublicAsset(asset.file));}
await mkdir(resolve(stage,'private'));const bytes=Buffer.from(JSON.stringify({caseData,catalog}));
await writeFile(resolve(stage,'private/case.json'),bytes);
await writeFile(resolve(stage,'package.json'),JSON.stringify({type:'module',scripts:{start:'node server/azure-index.mjs'},engines:{node:'>=22'}})+'\n');
const packages=new Set();for(const path of Object.keys(result.metafile.inputs)){const parts=path.split('/'),i=parts.lastIndexOf('node_modules');if(i>=0)packages.add(parts.slice(0,i+1+(parts[i+1].startsWith('@')?2:1)).join('/'));}
let notices='Dependency notices for SHIFT Azure staging bundle.\n';for(const pkg of [...packages].sort()){const meta=JSON.parse(await readFile(resolve(root,pkg,'package.json'),'utf8'));notices+=`\n${meta.name} ${meta.version} (${meta.license??'see upstream'})\n`;let found=false;for(const file of ['LICENSE','LICENSE.txt','LICENSE.md','LICENSE-MIT','license','license.md','NOTICE','NOTICE.txt'])try{notices+=await readFile(resolve(root,pkg,file),'utf8')+'\n';found=true;}catch(e){if(e.code!=='ENOENT')throw e;}if(!found&&['pg-types','pgpass'].includes(meta.name)){const readme=await readFile(resolve(root,pkg,'README.md'),'utf8');const marker=readme.toLowerCase().indexOf('## license');if(marker>=0){notices+=readme.slice(marker);found=true;}}if(!found&&meta.name==='proxy-agent-negotiate'&&meta.license==='MIT'&&meta.repository?.url==='https://github.com/TooTallNate/proxy-agents.git'){notices+='Same upstream monorepo MIT license:\n'+await readFile(resolve(root,'node_modules/https-proxy-agent/LICENSE'),'utf8');found=true;}if(!found)throw new Error(`Missing license: ${pkg}`);}
await writeFile(resolve(stage,'THIRD_PARTY_LICENSES.txt'),notices);
const hash=createHash('sha256').update(bytes).digest('hex');await writeFile(resolve(stage,'case-manifest.json'),JSON.stringify({case:'public-demo',sha256:hash})+'\n');
const out=resolve(root,'build/azure');await mkdir(resolve(root,'build'),{recursive:true});try{await rename(out,resolve(root,`build/azure.previous-${randomUUID()}`));}catch(e){if(e.code!=='ENOENT')throw e;}await rename(stage,out);
console.log(`Azure public-demo staging package ready. Case SHA256: ${hash}`);
