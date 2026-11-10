// Explicitly offline: the evaluator always injects a fake transport and synthetic credential.
import {evaluateInterviews} from '../tests/helpers/interview-evaluation.mjs';
globalThis.fetch=async()=>{throw new Error('Ambient network denied by offline evaluation');};
try { console.log(JSON.stringify(await evaluateInterviews(),null,2)); }
catch { console.error('Offline interview contract evaluation failed. Run tests/interview-evaluation.test.mjs for diagnostics.');process.exitCode=1; }
