// Default: explicitly offline; the evaluator always injects a fake transport and synthetic credential.
// --live: paid real-model run (see scripts/live-evaluation.mjs and docs/LOCAL_AI.md).
if(process.argv.includes('--live')){
 try{
  const {runLiveEvaluation}=await import('./live-evaluation.mjs'),{caseData}=await import('../examples/public-demo.mjs');
  const {summary,file}=await runLiveEvaluation({env:process.env,caseData});
  console.log(JSON.stringify(summary,null,2));console.log(`Raw results (git-ignored): ${file}`);
 }catch(e){console.error(/^Refused|^Missing|^Rates/.test(e?.message)?e.message:'Live evaluation failed.');process.exitCode=1;}
}else{
 const {evaluateInterviews}=await import('../tests/helpers/interview-evaluation.mjs');
 globalThis.fetch=async()=>{throw new Error('Ambient network denied by offline evaluation');};
 try { console.log(JSON.stringify(await evaluateInterviews(),null,2)); }
 catch { console.error('Offline interview contract evaluation failed. Run tests/interview-evaluation.test.mjs for diagnostics.');process.exitCode=1; }
}
