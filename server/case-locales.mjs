// Authored text only. These sidecars cannot change the canonical puzzle or its hash.
export const DEFAULT_LOCALE='en-GB';
export function normaliseLocale(value=DEFAULT_LOCALE){if(!['en-GB','pt-BR'].includes(value))throw new Error('Unsupported language.');return value;}
const fail=path=>{throw new Error(`${path}: invalid translation schema`);};
const obj=(v,p)=>{if(!v||typeof v!=='object'||Array.isArray(v))fail(p);};
const keys=(v,allowed,p)=>{obj(v,p);if(Object.keys(v).some(k=>!allowed.includes(k)))fail(p);};
const str=(v,p,max=5000)=>{if(typeof v!=='string'||!v.trim()||Buffer.byteLength(v)>max)fail(p);};
const exactList=(list,source,p)=>{if(!Array.isArray(list)||list.length!==source.length||new Set(list.map(x=>x?.id)).size!==source.length||list.some(x=>!source.some(s=>s.id===x?.id)))fail(p);};
const key=(c,locale)=>`${c.id}@${c.version}@${locale}`;
export function validateTranslations(raw=[],registry){
 if(!Array.isArray(raw)||raw.length>60)fail('translations');const result=new Map();
 for(const t of raw){
  keys(t,['locale','caseId','caseVersion','title','victim','place','method','prediction','catalog','suspects','deductions','solution'],'translation');
  if(t.locale!=='pt-BR')fail('translation.locale');
  const c=registry.revisions.get(`${t.caseId}@${t.caseVersion}`);if(!c)fail('translation.source');
  for(const field of ['title','victim','place','method','prediction'])str(t[field],`translation.${field}`);
  keys(t.catalog,['title','location','description'],'translation.catalog');str(t.catalog.title,'translation.catalog.title');
  for(const field of ['location','description'])if(t.catalog[field]!==undefined)str(t.catalog[field],`translation.catalog.${field}`);
  exactList(t.suspects,c.suspects,'translation.suspects');
  for(const s of t.suspects){keys(s,['id','role','profile','opening','brief','responses'],'translation.suspect');for(const field of ['role','profile','opening'])str(s[field],`translation.suspect.${field}`);str(s.brief,'translation.suspect.brief',2500);keys(s.responses,['alibi','motive','clue','relationship'],'translation.responses');for(const topic of ['alibi','motive','clue','relationship'])str(s.responses[topic],`translation.responses.${topic}`);}
  exactList(t.deductions,c.deductions,'translation.deductions');for(const d of t.deductions){keys(d,['id','text'],'translation.deduction');str(d.text,'translation.deduction.text');if(d.text.length>160)fail('translation.deduction.text');}
  keys(t.solution,['motive','plan','evidence','timeline'],'translation.solution');for(const f of ['motive','plan'])str(t.solution[f],`translation.solution.${f}`);
  if(!Array.isArray(t.solution.evidence)||t.solution.evidence.length!==c.solution.evidence.length)fail('translation.solution.evidence');for(const e of t.solution.evidence)str(e,'translation.solution.evidence');
  if(!Array.isArray(t.solution.timeline)||t.solution.timeline.length!==c.solution.timeline.length)fail('translation.solution.timeline');for(const [i,e] of t.solution.timeline.entries()){keys(e,['time','text'],'translation.solution.timeline');if(e.time!==c.solution.timeline[i].time)fail('translation.solution.timeline.time');str(e.text,'translation.solution.timeline.text');}
  let bytes;try{bytes=Buffer.byteLength(JSON.stringify(t));}catch{fail('translation');}if(bytes>150000)fail('translation');
  const id=key(c,t.locale);if(result.has(id))fail('translations');result.set(id,structuredClone(t));
 }
 return result;
}
export function localiseCase(c,translations,locale=DEFAULT_LOCALE){
 const language=normaliseLocale(locale),t=translations?.get(key(c,language));if(!t)return {...c,locale:DEFAULT_LOCALE};
 const suspects=new Map(t.suspects.map(s=>[s.id,s])),deductions=new Map(t.deductions.map(d=>[d.id,d.text]));
 return {...c,locale:language,...Object.fromEntries(['title','victim','place','method','prediction'].map(f=>[f,t[f]])),suspects:c.suspects.map(s=>({...s,...suspects.get(s.id)})),deductions:c.deductions.map(d=>({...d,text:deductions.get(d.id)})),solution:t.solution};
}
export function localiseCatalog(catalog,registry,translations,locale=DEFAULT_LOCALE){
 const language=normaliseLocale(locale);return catalog.map(entry=>{const c=registry?.current.get(entry.id),t=c&&translations?.get(key(c,language));return t?{...entry,...t.catalog}:entry;});
}
