// Validate private data with the exact code revision being released. Diagnostics are fixed.
import{readFile,stat}from'node:fs/promises';import{createHash}from'node:crypto';import{pathToFileURL}from'node:url';import{resolve}from'node:path';import{validateCaseLibrary}from'../server/case-loader.mjs';
const fail=()=>{throw new Error('Private case release invalid.');};
export function verifyCaseRelease(bytes,pointer){
 try{
  const fields=['format','sha256','bytes','caseCount','translationCount'];
  if(!pointer||Object.keys(pointer).length!==fields.length||Object.keys(pointer).some(k=>!fields.includes(k))||pointer.format!=='shift-private-case-release-v1'||!/^[a-f0-9]{64}$/.test(pointer.sha256)||!Number.isInteger(pointer.bytes)||pointer.bytes<1||pointer.bytes>2_000_000||!Number.isInteger(pointer.caseCount)||pointer.caseCount<1||pointer.caseCount>20||!Number.isInteger(pointer.translationCount)||pointer.translationCount<pointer.caseCount||pointer.translationCount>60)fail();
  if(!Buffer.isBuffer(bytes)||bytes.length!==pointer.bytes||createHash('sha256').update(bytes).digest('hex')!==pointer.sha256)fail();
  const data=validateCaseLibrary(JSON.parse(bytes.toString('utf8')));
  if(!data.registry||data.registry.current.size!==pointer.caseCount||data.translations.size!==pointer.translationCount)fail();
  for(const c of data.registry.current.values())if(!data.translations.has(`${c.id}@${c.version}@pt-BR`))fail();
  return{sha256:pointer.sha256,bytes:bytes.length,caseCount:data.registry.current.size,translationCount:data.translations.size};
 }catch{fail();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{const [file,manifest]=process.argv.slice(2);if(process.argv.length!==4||!(await stat(file)).isFile()||(await stat(file)).size>2_000_000||(await stat(manifest)).size>4096)fail();const result=verifyCaseRelease(await readFile(file),JSON.parse(await readFile(manifest,'utf8')));console.log(JSON.stringify(result));}catch{console.error('Private case release invalid.');process.exitCode=1;}
}
