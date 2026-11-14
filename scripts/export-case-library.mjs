// Export a trusted authoring module as data, keeping original object order/version labels.
// Output is private by default; no deployment, network or provider calls.
import {mkdir,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {validateCaseLibrary} from '../server/case-loader.mjs';
const [source,destination]=process.argv.slice(2);
if(!source||!destination||process.argv.length!==4)throw new Error('Usage: node scripts/export-case-library.mjs trusted-module.mjs private/output-directory');
try{
 const module=await import(pathToFileURL(resolve(source)));const raw=module.caseLibrary??{caseData:module.caseData??module.TRAIN_CASE,catalog:module.catalog??module.CASES};const data=validateCaseLibrary(raw);
 const bytes=Buffer.from(JSON.stringify(raw)),sha256=createHash('sha256').update(bytes).digest('hex'),dir=resolve(destination);await mkdir(dir,{recursive:true,mode:0o700});
 await writeFile(resolve(dir,'case-library.json'),bytes,{mode:0o600});
 const cases=data.registry?[...data.registry.current.values()]:[data.caseData];
 await writeFile(resolve(dir,'manifest.json'),JSON.stringify({format:'shift-case-library-v1',sha256,bytes:bytes.length,caseCount:cases.length,casePins:cases.map(c=>({id:c.id,version:c.version})),archivedRevisions:raw.archivedCases?.length??0,translationPins:(raw.translations??[]).map(t=>({caseId:t.caseId,caseVersion:t.caseVersion,locale:t.locale,sha256:createHash('sha256').update(JSON.stringify(t)).digest('hex')}))},null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({ok:true,bytes:bytes.length,caseCount:cases.length,sha256}));
}catch{console.error('Private export failed. Review the trusted source and output path locally; module errors are suppressed.');process.exitCode=1;}
