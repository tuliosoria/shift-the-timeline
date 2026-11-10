import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const t=JSON.parse(await readFile(new URL('../infra/template.json',import.meta.url),'utf8'));
const params=changes=>({...Object.fromEntries(Object.entries(t.Parameters).map(([k,v])=>[k,v.Default])),...changes});
function resolve(v,p){if(Array.isArray(v))return v.map(x=>resolve(x,p));if(!v||typeof v!=='object')return v;if(v.Ref)return p[v.Ref];if(v.Condition)return resolve(t.Conditions[v.Condition],p);if(v['Fn::Equals']){const [a,b]=resolve(v['Fn::Equals'],p);return a===b;}if(v['Fn::Not'])return !resolve(v['Fn::Not'][0],p);if(v['Fn::And'])return v['Fn::And'].every(x=>resolve(x,p));if(v['Fn::If']){const [c,a,b]=v['Fn::If'];return resolve(t.Conditions[c],p)?resolve(a,p):resolve(b,p);}return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,resolve(x,p)]));}
function switches(p){return ['ApiFunction','AiWorkerFunction','AiRelayFunction','AiReconcilerFunction'].map(n=>{const e=resolve(t.Resources[n].Properties.Environment.Variables,p);return Object.entries(e).find(([k])=>k.endsWith('_ENABLED'))[1];});}
test('one fail-closed activation switch controls producer runtimes and all delivery triggers',()=>{
 assert.equal(t.Parameters.EnableAi?.Default,'false');for(const enabled of ['false','true']){const p=params({EnableAi:enabled,ProvisionAiQueue:'true',ProvisionAiWorkers:'true',AiSecretArn:'arn:configured',AiPolicyJson:'{}'});assert.deepEqual(switches(p),Array(4).fill(enabled));for(const n of ['AiWorkerMapping','AiRelayMapping'])assert.equal(resolve(t.Resources[n].Properties.Enabled,p),enabled==='true');assert.equal(resolve(t.Resources.AiReconcileSchedule.Properties.State,p),enabled==='true'?'ENABLED':'DISABLED');}
});
test('AI activation rules reject missing queue workers secret or policy',()=>{
 const rule=t.Rules.AiActivationRequiresConfiguration;assert.ok(rule);const good=params({EnableAi:'true',ProvisionAiQueue:'true',ProvisionAiWorkers:'true',AiSecretArn:'arn:configured',AiPolicyJson:'{}'});assert.equal(resolve(rule.RuleCondition,good),true);assert.ok(rule.Assertions.every(a=>resolve(a.Assert,good)));
 for(const patch of [{ProvisionAiQueue:'false'},{ProvisionAiWorkers:'false'},{AiSecretArn:''},{AiPolicyJson:''}])assert.ok(rule.Assertions.some(a=>!resolve(a.Assert,{...good,...patch})));
 assert.equal(resolve(rule.RuleCondition,{...good,EnableAi:'false'}),false);
});
test('producer has policy but cannot access the GPT credential',()=>{const f=t.Resources.ApiFunction;assert.deepEqual(f.Properties.Environment.Variables.SHIFT_AI_POLICY,{Ref:'AiPolicyJson'});assert.ok(!JSON.stringify(f).includes('AiSecretArn'));});
test('operational alarms cover API throttling and AI dead letters without adding notification recipients',()=>{
 const alarms=Object.values(t.Resources).filter(x=>x.Type==='AWS::CloudWatch::Alarm');assert.ok(alarms.some(a=>a.Properties.MetricName==='Throttles'&&a.Properties.Namespace==='AWS/Lambda'));assert.ok(alarms.filter(a=>a.Properties.MetricName==='ApproximateNumberOfMessagesVisible').length>=2);for(const a of alarms)assert.equal(a.Properties.AlarmActions,undefined);
});
