import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
export function validateCase({caseData,catalog}) {
  if(!caseData||!Array.isArray(catalog))throw new Error('Case and catalog required');
  if(!/^[a-z0-9-]{1,40}$/.test(caseData.id)||!Array.isArray(caseData.suspects)||caseData.suspects.length!==15)throw new Error('Case must have an ID and 15 suspects');
  const ids=new Set(caseData.suspects.map(s=>s.id));
  if(ids.size!==15||!ids.has(caseData.culpritId))throw new Error('Invalid culprit or duplicate suspect');
  for(const s of caseData.suspects){for(const k of ['id','name','role','initials','color','profile','opening'])if(typeof s[k]!=='string'||!s[k]||Buffer.byteLength(s[k])>5000)throw new Error(`Invalid suspect ${k}`);for(const k of ['alibi','clue','motive','relationship'])if(typeof s.responses?.[k]!=='string'||!s.responses[k]||Buffer.byteLength(s.responses[k])>5000)throw new Error(`Invalid response ${k}`);}
  if(!caseData.solution||typeof caseData.solution.plan!=='string'||!catalog.some(c=>c.id===caseData.id&&c.available))throw new Error('Invalid solution/catalog');
  for(const c of catalog)for(const k of ['culpritId','solution','suspects'])if(k in c)throw new Error('Private field in catalog');
  if(Buffer.byteLength(JSON.stringify(caseData))>150_000)throw new Error('Case content too large');
  return {caseData:{...caseData,version:`${caseData.version??'v1'}:${createHash('sha256').update(JSON.stringify(caseData)).digest('hex')}`},catalog};
}
export async function loadCase(env=process.env){if(!env.SHIFT_CASE_FILE)throw new Error('SHIFT_CASE_FILE is required; no public demo is loaded automatically');const data=await import(pathToFileURL(resolve(env.SHIFT_CASE_FILE)));return validateCase({caseData:data.TRAIN_CASE??data.caseData,catalog:data.CASES??data.catalog});}
