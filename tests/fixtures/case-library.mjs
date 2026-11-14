// Deliberately synthetic public data: no private story, name, answer or solution.
import {TRAIN_CASE} from './case.mjs';
export const caseLibrary={cases:Array.from({length:6},(_,i)=>{
 const c=structuredClone(TRAIN_CASE);c.id=`synthetic-${i}`;c.title=`Synthetic case ${i}`;c.version=`synthetic-v${i}`;c.culpritId=`suspect-${i}`;c.prediction=`Synthetic prediction for fixture ${i}.`;
 for(const s of c.suspects)for(const topic of Object.keys(s.responses))s.responses[topic]=`Synthetic case ${i}, ${s.id}, ${topic}.`;
 return c;
}),catalog:Array.from({length:6},(_,i)=>({id:`synthetic-${i}`,title:`Synthetic case ${i}`,available:true}))};
