// Development/test adapter. Production refuses to use this adapter.
export class ConflictError extends Error {constructor(){super('Conditional transaction conflict');this.name='ConflictError';}}
export class MemoryStore {
 constructor(){this.rooms=new Map();this.receipts=new Map();this.sessions=new Map();this.values=new Map();}
 async getRoom(code){return structuredClone(this.rooms.get(code)??null);}
 async getReceipt(key){return structuredClone(this.receipts.get(key)??null);}
 async commitRoom({expectedVersion,room,receipt}){
  const existing=this.rooms.get(room.code);
  if((existing?.version??null)!==expectedVersion||this.receipts.has(receipt.key))throw new ConflictError();
  this.rooms.set(room.code,structuredClone(room));this.receipts.set(receipt.key,structuredClone(receipt));
 }
 async consumeCounter(key,max,expiresAt){const count=this.values.get(key)?.count??0;if(count>=max)return false;this.values.set(key,{count:count+1,expiresAt});return true;}
 async getSession(hash){return structuredClone(this.sessions.get(hash)??null);}
 async putSession(hash,value){this.sessions.set(hash,structuredClone(value));}
 async extendSession(hash,now,expiresAt){const current=this.sessions.get(hash);if(!current||current.expiresAt<=now)return null;const next={...current,expiresAt:Math.max(current.expiresAt,expiresAt)};this.sessions.set(hash,next);return structuredClone(next);}
 async revokeSession(hash){this.sessions.delete(hash);}
}
