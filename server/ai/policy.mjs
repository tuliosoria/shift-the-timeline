import {PROPOSED_LIMITS,reserveCost} from './budget.mjs';
// Deployment configuration only. Never accepts policy or prices from a player.
export function parseAiPolicy(json){
 let p;try{p=JSON.parse(json);}catch{throw new Error('Invalid AI policy configuration');}
 const keys=['model','inputRate','outputRate',...Object.keys(PROPOSED_LIMITS)];
 if(!p||Array.isArray(p)||Object.keys(p).length!==keys.length||keys.some(k=>!Object.hasOwn(p,k))||typeof p.model!=='string'||!/^[A-Za-z0-9._:-]{1,100}$/.test(p.model))throw new Error('Invalid complete AI policy');
 if(p.inputTokens!==2500||p.outputTokens!==350)throw new Error('Invalid AI policy token envelope');
 for(const k of ['roomMicroUsd','dayMicroUsd','monthMicroUsd','maxConcurrent'])if(!Number.isSafeInteger(p[k])||p[k]<1||p[k]>PROPOSED_LIMITS[k])throw new Error('Invalid AI policy limit');
 try{reserveCost(p);}catch{throw new Error('Invalid AI policy prices');}
 return Object.freeze(p);
}
