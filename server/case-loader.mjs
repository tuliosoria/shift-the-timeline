import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
// Diagnostics name schema paths only: case values and unrecognised keys may be spoilers.
export class CaseValidationError extends Error {
  constructor(path, requirement) { super(`${path}: ${requirement}`); this.name='CaseValidationError'; }
}
const invalid=(path,requirement)=>{throw new CaseValidationError(path,requirement);};
const object=(value,path)=>{if(!value||typeof value!=='object'||Array.isArray(value))invalid(path,'expected an object');};
const string=(value,path)=>{if(typeof value!=='string'||!value.trim()||Buffer.byteLength(value)>5000)invalid(path,'expected a nonblank string of at most 5000 bytes');};
const id=(value,path)=>{if(typeof value!=='string'||!/^[a-z0-9-]{1,40}$/.test(value))invalid(path,'expected 1–40 lowercase letters, digits or hyphens');};
const array=(value,path)=>{if(!Array.isArray(value))invalid(path,'expected an array');};
export function validateCase({caseData,catalog}={}) {
  object(caseData,'caseData');
  id(caseData.id,'caseData.id');
  for(const key of ['title','victim','place','method','prediction'])string(caseData[key],`caseData.${key}`);
  if(caseData.version!==undefined)string(caseData.version,'caseData.version');
  array(caseData.suspects,'caseData.suspects');
  if(caseData.suspects.length!==15)invalid('caseData.suspects','expected exactly 15 suspects');
  const ids=new Set();
  for(let i=0;i<caseData.suspects.length;i++){
    const suspect=caseData.suspects[i],path=`caseData.suspects[${i}]`;
    object(suspect,path);id(suspect.id,`${path}.id`);
    if(ids.has(suspect.id))invalid(`${path}.id`,'expected a unique suspect ID');
    ids.add(suspect.id);
    for(const key of ['name','role','initials','color','profile','opening'])string(suspect[key],`${path}.${key}`);
    object(suspect.responses,`${path}.responses`);
    for(const key of ['alibi','clue','motive','relationship'])string(suspect.responses[key],`${path}.responses.${key}`);
  }
  id(caseData.culpritId,'caseData.culpritId');
  if(!ids.has(caseData.culpritId))invalid('caseData.culpritId','expected an existing suspect ID');
  object(caseData.solution,'caseData.solution');
  for(const key of ['motive','plan'])string(caseData.solution[key],`caseData.solution.${key}`);
  array(caseData.solution.evidence,'caseData.solution.evidence');
  for(let i=0;i<caseData.solution.evidence.length;i++)string(caseData.solution.evidence[i],`caseData.solution.evidence[${i}]`);
  array(caseData.solution.timeline,'caseData.solution.timeline');
  for(let i=0;i<caseData.solution.timeline.length;i++){
    const event=caseData.solution.timeline[i],path=`caseData.solution.timeline[${i}]`;
    object(event,path);for(const key of ['time','text'])string(event[key],`${path}.${key}`);
  }
  array(catalog,'catalog');
  const catalogIds=new Set(),publicKeys=new Set(['id','title','available','location','description']);
  for(let i=0;i<catalog.length;i++){
    const entry=catalog[i],path=`catalog[${i}]`;object(entry,path);
    if(Object.keys(entry).some(key=>!publicKeys.has(key)))invalid(path,'contains an unsupported public field');
    id(entry.id,`${path}.id`);string(entry.title,`${path}.title`);
    if(catalogIds.has(entry.id))invalid(`${path}.id`,'expected a unique catalog ID');
    catalogIds.add(entry.id);
    if(typeof entry.available!=='boolean')invalid(`${path}.available`,'expected a boolean');
    for(const key of ['location','description'])if(entry[key]!==undefined)string(entry[key],`${path}.${key}`);
  }
  if(!catalog.some(entry=>entry.id===caseData.id&&entry.available))invalid('catalog','expected an available entry for caseData.id');
  let serialized;
  try { serialized=JSON.stringify(caseData); } catch { invalid('caseData','expected JSON-serializable content'); }
  if(Buffer.byteLength(serialized)>150_000)invalid('caseData','content exceeds 150000 bytes');
  return {caseData:{...caseData,version:`${caseData.version??'v1'}:${createHash('sha256').update(serialized).digest('hex')}`},catalog};
}
export async function loadCase(env=process.env){if(!env.SHIFT_CASE_FILE)throw new Error('SHIFT_CASE_FILE is required; no public demo is loaded automatically');const data=await import(pathToFileURL(resolve(env.SHIFT_CASE_FILE)));return validateCase({caseData:data.TRAIN_CASE??data.caseData,catalog:data.CASES??data.catalog});}
