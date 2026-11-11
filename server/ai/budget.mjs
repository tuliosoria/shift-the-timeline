import {CONFIG} from '../game.mjs';
// Rates are USD per million tokens. Result is integer microUSD, rounded up.
export function reserveCost({inputTokens,outputTokens,inputRate,outputRate}){for(const n of [inputTokens,outputTokens])if(!Number.isSafeInteger(n)||n<0)throw new Error('Invalid token count');for(const rate of [inputRate,outputRate])if(!Number.isFinite(rate)||rate<0)throw new Error('Approved price is required');const cost=Math.ceil(inputTokens*inputRate+outputTokens*outputRate);if(!Number.isSafeInteger(cost)||cost<=0)throw new Error('Invalid cost envelope');return cost;}
export const PROPOSED_LIMITS=Object.freeze({inputTokens:6000,outputTokens:1024,roomMicroUsd:250000,dayMicroUsd:10000000,monthMicroUsd:50000000,maxConcurrent:8});
// Uncapped is an explicit financial policy, not a very large numeric ceiling.
// Concurrency, per-request tokens and exact accounting remain safety invariants.
export function validateSpendPolicy(policy){
 if(!policy||typeof policy!=='object'||Array.isArray(policy))throw new Error('Invalid AI policy');
 if(Object.hasOwn(policy,'uncapped')&&policy.uncapped!==true)throw new Error('Invalid uncapped AI policy');
 for(const key of ['roomMicroUsd','dayMicroUsd','monthMicroUsd']){
  if(policy.uncapped===true){if(policy[key]!==null)throw new Error('Uncapped AI policy requires null spend limits');}
  else if(!Number.isSafeInteger(policy[key])||policy[key]<1||policy[key]>PROPOSED_LIMITS[key])throw new Error('Invalid proposed AI limit');
 }
 if(!Number.isSafeInteger(policy.maxConcurrent)||policy.maxConcurrent<1||policy.maxConcurrent>PROPOSED_LIMITS.maxConcurrent)throw new Error('Invalid AI concurrency');
 if(policy.inputTokens!==PROPOSED_LIMITS.inputTokens||policy.outputTokens!==PROPOSED_LIMITS.outputTokens)throw new Error('Unsupported token envelope');
 const reserve=reserveCost(policy);
 if(policy.uncapped!==true&&reserve*CONFIG.maxPlayers*CONFIG.rounds*CONFIG.maxQuestions>policy.roomMicroUsd)throw new Error('AI reserve does not fit a full room');
 return policy;
}
