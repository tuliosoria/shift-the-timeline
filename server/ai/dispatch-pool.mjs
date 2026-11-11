// In-process hand-off for AI jobs: reconciliation marks an outbox sent as soon as its job
// starts here, like an SQS enqueue, so one slow provider call never holds up the next tick.
// The pool caps this process; markProviderStarted still enforces the global slot limit.
// A job that dies with the process is settled by its own deadline record.
export function createDispatchPool({limit,run}){
 if(!Number.isSafeInteger(limit)||limit<1)throw new Error('Invalid AI dispatch limit');
 const active=new Set();
 return {
  available:()=>active.size<limit,
  // Resolves when the job settles; never return it from a reconcile send, which would wait on it.
  start(body){
   if(active.size>=limit){const error=new Error('AI dispatch pool full');error.name='AiWorkDeadline';throw error;}
   const job=Promise.resolve().then(()=>run(body)).then(()=>{},()=>{}).finally(()=>{active.delete(job);});
   active.add(job);return job;
  },
  idle:()=>Promise.all([...active])
 };
}

// One reconciliation pass that hands due outboxes to the pool. Overlapping calls share the pass;
// the returned promise also waits for the jobs that pass started, but the next pass does not.
// idle() waits for the pass in flight (rejecting if it fails) and every started job.
export function createPooledTick({pool,reconcile,shouldContinue}){
 let running=null,pass=null;
 const tick=()=>{
  if(running)return running;
  const started=[];
  const current=reconcile({shouldContinue:()=>shouldContinue()&&pool.available(),send:body=>{started.push(pool.start(body));}});
  const result=current.then(async value=>{await Promise.all(started);return value;});
  running=result;pass=current;
  const clear=()=>{if(running===result){running=null;pass=null;}};current.then(clear,clear);
  return result;
 };
 tick.idle=()=>Promise.all([pass,pool.idle()]);
 return tick;
}
