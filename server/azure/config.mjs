// Azure hosting is an explicit entry point; merely supplying a credential never enables AI.
import {PROPOSED_LIMITS,validateSpendPolicy} from '../ai/budget.mjs';
export function readAzureConfig(env={}) {
 const fail=()=>{throw new Error('Invalid Azure deployment configuration.');};
 if(env.SHIFT_RUNTIME!=='azure'||env.NODE_ENV!=='production')fail();
 let origin;try{origin=new URL(env.SHIFT_ORIGIN);}catch{fail();}
 if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)fail();
 const host=env.SHIFT_PG_HOST,user=env.SHIFT_PG_USER,database=env.SHIFT_PG_DATABASE;
 if(!/^[a-z0-9-]+\.postgres\.database\.azure\.com$/.test(host??'')||!user||user.length>100||!/^[a-zA-Z0-9_-]+$/.test(database??''))fail();
 if(!env.SHIFT_CASE_FILE?.startsWith('/')||!/^[a-f0-9]{64}$/.test(env.SHIFT_CASE_SHA256??''))fail();
 if(['SHIFT_TABLE','SHIFT_CASE_BUCKET','SHIFT_ORIGIN_SECRET_ARN','AWS_LAMBDA_FUNCTION_NAME'].some(k=>env[k]))fail();
 if(!['false','true'].includes(env.SHIFT_ALLOW_NEW_ROOMS??'false')||!['false','true'].includes(env.SHIFT_AI_ENABLED??'false'))fail();
 let policy=null;
 if(env.SHIFT_AI_ENABLED==='true') {
  if(env.SHIFT_AI_OPERATOR_CONSENT!=='true'||!env.OPENAI_API_KEY||env.OPENAI_API_KEY.startsWith('@Microsoft.KeyVault('))fail();
  // A policy that no longer matches this build's envelope gets its own startup reason; never its values.
  const invalidPolicy=()=>{throw Object.assign(new Error('Invalid Azure deployment configuration.'),{code:'SHIFT_AI_POLICY_INVALID'});};
  try{policy=JSON.parse(env.SHIFT_AI_POLICY);}catch{invalidPolicy();}
  const keys=['model','inputRate','outputRate',...Object.keys(PROPOSED_LIMITS),...(policy?.uncapped===true?['uncapped']:[])];
  if(!policy||typeof policy!=='object'||Array.isArray(policy)||Object.keys(policy).length!==keys.length||keys.some(k=>!Object.hasOwn(policy,k))||!/^[a-zA-Z0-9._-]{1,100}$/.test(policy.model??''))invalidPolicy();
  try{validateSpendPolicy(policy);}catch{invalidPolicy();}
  policy=Object.freeze(policy);
 }
 return Object.freeze({origin:origin.origin,host,user,database,caseFile:env.SHIFT_CASE_FILE,caseHash:env.SHIFT_CASE_SHA256,allowNewRooms:env.SHIFT_ALLOW_NEW_ROOMS==='true',policy});
}
