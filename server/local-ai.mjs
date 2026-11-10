// Explicit local trial composition. Normal runtime and cloud handlers never import this module.
import {loadCase} from './case-loader.mjs';
import {MemoryStore} from './storage/memory.mjs';
import {DurableGame} from './persistent-game.mjs';
import {Sessions} from './sessions.mjs';
import {createRateLimiter} from './limits.mjs';
import {createApi} from './api.mjs';
import {readLocalAiConfig,createLocalAi} from './ai/local.mjs';
export async function createLocalAiRuntime({env,getSecret,fetchImpl,loadCaseImpl=loadCase}) {
 readLocalAiConfig(env);
 const data=await loadCaseImpl(env),store=new MemoryStore();
 const worker=createLocalAi({env,store,getSecret,fetchImpl});
 const game=new DurableGame({store,...data,ai:worker.admission});
 const api=createApi({game,sessions:new Sessions({store,secure:false}),allowedOrigin:worker.config.origin,rateLimit:createRateLimiter({store}),dialogueMode:'optional-openai'});
 return {api,worker,config:worker.config};
}
