// Development/test adapter. Production refuses to use this adapter.
export class ConflictError extends Error {constructor(){super('Conditional transaction conflict');this.name='ConflictError';}}
export class MemoryStore {
 constructor(){this.rooms=new Map();this.receipts=new Map();this.sessions=new Map();this.values=new Map();this.ai=new Map();}
 async getRoom(code){return structuredClone(this.rooms.get(code)??null);}
 async getReceipt(key){return structuredClone(this.receipts.get(key)??null);}
 async commitRoom({expectedVersion,room,receipt,aiWrites=[]}){
  const existing=this.rooms.get(room.code);
  if((existing?.version??null)!==expectedVersion||this.receipts.has(receipt.key))throw new ConflictError();
  this.checkAi(aiWrites);
  this.rooms.set(room.code,structuredClone(room));this.receipts.set(receipt.key,structuredClone(receipt));this.applyAi(aiWrites);
 }
 async listAiDue(now,limit=25,cursor){if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new Error('Invalid reconciliation limit');const entries=[...this.ai.entries()].filter(([,v])=>Number.isSafeInteger(v.dueAt)&&v.dueAt<=now).map(([key,v])=>({key,sort:`${String(v.dueAt).padStart(16,'0')}#${key}`})).sort((a,b)=>a.sort.localeCompare(b.sort));const remaining=entries.filter(e=>!cursor||e.sort>cursor.after),page=remaining.slice(0,limit);return {keys:page.map(e=>e.key),items:page.map(e=>({key:e.key,cursor:{after:e.sort}})),cursor:remaining.length>limit?{after:page.at(-1).sort}:null};}
 async getAi(key){return structuredClone(this.ai.get(key)??null);}
 checkAi(writes){for(const w of writes)if((this.ai.get(w.key)?.version??null)!==w.expectedVersion)throw new ConflictError();}
 applyAi(writes){for(const w of writes)this.ai.set(w.key,structuredClone(w.value));}
 async commitAi({writes,checks=[],room,roomCode,expectedRoomVersion}){if(roomCode&&(this.rooms.get(roomCode)?.version??null)!==expectedRoomVersion)throw new ConflictError();this.checkAi([...writes,...checks]);if(room)this.rooms.set(room.code,structuredClone(room));this.applyAi(writes);}
 async consumeCounter(key,max,expiresAt){const count=this.values.get(key)?.count??0;if(count>=max)return false;this.values.set(key,{count:count+1,expiresAt});return true;}
 async getSession(hash){return structuredClone(this.sessions.get(hash)??null);}
 async putSession(hash,value){this.sessions.set(hash,structuredClone(value));}
 async extendSession(hash,now,expiresAt){const current=this.sessions.get(hash);if(!current||current.expiresAt<=now)return null;const next={...current,expiresAt:Math.max(current.expiresAt,expiresAt)};this.sessions.set(hash,next);return structuredClone(next);}
 async revokeSession(hash){this.sessions.delete(hash);}
}
