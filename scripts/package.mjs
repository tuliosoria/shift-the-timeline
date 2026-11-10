import {readdir,copyFile,mkdir,mkdtemp,rename,rm,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';import {pathToFileURL} from 'node:url';import {createHash,randomUUID} from 'node:crypto';import {build} from 'esbuild';
export function includePath(path){const parts=path.split('/');if(parts.some(p=>p.startsWith('.')||['private','tests','coverage','docs'].includes(p))||/\.(map|pem|key|log)$/.test(path)||path==='server/cases.mjs')return false;if(path.startsWith('public/'))return ['public/index.html','public/app.js','public/style.css'].includes(path);return path.startsWith('server/')&&path.endsWith('.mjs')||path.startsWith('node_modules/')||['package.json','package-lock.json'].includes(path);}
export async function packageApp(root=process.cwd()){
 root=resolve(root);const output=resolve(root,'dist'),stage=await mkdtemp(resolve(root,'.shift-build-'));
 try{
  const result=await build({absWorkingDir:root,entryPoints:['server/lambda.mjs'],outfile:resolve(stage,'api/server/lambda.mjs'),bundle:true,platform:'node',target:'node22',format:'esm',metafile:true,sourcemap:false,legalComments:'inline',banner:{js:"import {createRequire as __shiftCreateRequire} from 'node:module';const require=__shiftCreateRequire(import.meta.url);"}});
  for(const input of Object.keys(result.metafile.inputs))if(!includePath(input))throw new Error(`Non-allowlisted bundle input: ${input}`);
  await writeFile(resolve(stage,'api/package.json'),'{"type":"module","engines":{"node":">=22"}}\n');
  const packages=new Set();for(const input of Object.keys(result.metafile.inputs)){const parts=input.split('/');const i=parts.lastIndexOf('node_modules');if(i>=0)packages.add(parts.slice(0,i+1+(parts[i+1]?.startsWith('@')?2:1)).join('/'));}
  let notices='Third-party dependency notices for this bundled artifact.\n';for(const pkg of [...packages].sort()){const metadata=JSON.parse(await readFile(resolve(root,pkg,'package.json'),'utf8'));notices+=`\n## ${metadata.name} ${metadata.version??''} (${metadata.license??'see notices'})\n`;let found=false;for(const name of ['LICENSE','LICENSE.txt','LICENSE.md','NOTICE','NOTICE.txt']){try{notices+=`\n${await readFile(resolve(root,pkg,name),'utf8')}\n`;found=true;}catch(e){if(e.code!=='ENOENT')throw e;}}if(!found&&['@aws-sdk/credential-provider-http','@aws-sdk/credential-provider-login','@aws-sdk/nested-clients'].includes(metadata.name)&&metadata.license==='Apache-2.0'&&metadata.repository?.url==='https://github.com/aws/aws-sdk-js-v3.git'){notices+='\nApache-2.0 license text from the same upstream SDK package collection:\n'+await readFile(resolve(root,'node_modules/@aws-sdk/core/LICENSE'),'utf8');found=true;}if(!found)throw new Error(`Dependency license notice missing: ${pkg}`);}
  await writeFile(resolve(stage,'api/THIRD_PARTY_LICENSES.txt'),notices);
  const expected=['api/server/lambda.mjs','api/package.json','api/THIRD_PARTY_LICENSES.txt'];
  for(const name of ['index.html','app.js','style.css']){await mkdir(resolve(stage,'web'),{recursive:true});await copyFile(resolve(root,'public',name),resolve(stage,'web',name));expected.push('web/'+name);}
  const actual=[];async function walk(dir){for(const file of await readdir(dir,{withFileTypes:true})){const path=resolve(dir,file.name);if(file.isSymbolicLink())throw new Error('Symlink in output');if(file.isDirectory())await walk(path);else actual.push(relative(stage,path));}}await walk(stage);
  if(JSON.stringify(actual.sort())!==JSON.stringify(expected.sort()))throw new Error('Package file list differs from allowlist');
  const manifest=[];for(const path of expected){const bytes=await readFile(resolve(stage,path));manifest.push({path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
  await writeFile(resolve(stage,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  // Preserve prior output outside the deployment directory, including unexpected files.
  try{await rename(output,resolve(root,`dist.previous-${randomUUID()}`));}catch(e){if(e.code!=='ENOENT')throw e;}
  await rename(stage,output);return manifest;
 }catch(e){await rm(stage,{recursive:true,force:true});throw e;}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){const manifest=await packageApp();console.log(`Packaged ${manifest.length} verified immutable files; private cases and credentials excluded.`);}
