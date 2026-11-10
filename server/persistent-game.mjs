import {createHash} from 'node:crypto';
import {GameService,DomainError} from './game.mjs';
import {ConflictError} from './storage/memory.mjs';
const HOUR=3_600_000;
const hash=x=>createHash('sha256').update(x).digest('hex');
function identifier(id){if(typeof id!=='string'||!/[\w-]{16,100}/.test(id)||!/^[\w-]+$/.test(id)||id.length>100)throw new DomainError('Invalid identifier.');}
export class DurableGame {
 constructor({store,caseData,catalog,now=Date.now,ai=null}){this.store=store;this.caseData=caseData;this.catalog=catalog;this.now=now;this.ai=ai;}
 cases(){return this.catalog;}
 engine(room){const g=new GameService({caseData:this.caseData,catalog:this.catalog,now:this.now});if(room)g.rooms.set(room.code,room);return g;}
 async load(code){if(typeof code!=='string'||!/^[A-HJ-NP-Z2-9]{8}$/.test(code.toUpperCase()))throw new DomainError('Invalid room code.',404);const room=await this.store.getRoom(code.toUpperCase());if(!room||room.expiresAt<=this.now()||room.createdAt+24*HOUR<=this.now())throw new DomainError('Room not found or expired.',404);if(room.caseVersion!==this.caseData.version)throw new DomainError('Case version unavailable.',503);return room;}
 async view(code,session){const room=await this.load(code);return this.engine(room).view(room.code,session);}
 async prior(key,fingerprint,session){const receipt=await this.store.getReceipt(key);if(!receipt)return null;if(receipt.fingerprint!==fingerprint)throw new DomainError('Request identifier reused with different data.',409);return {code:receipt.code,playerId:receipt.playerId,state:await this.view(receipt.code,session)};}
 async mutate({kind,code,session,id,payload,run}){
  identifier(id);if(typeof session!=='string'||!session)throw new DomainError('Session required.',401);
  const key=hash(JSON.stringify([session,kind,code??'',id])),fingerprint=hash(JSON.stringify(payload));
  for(let attempt=0;attempt<8;attempt++){
   const prior=await this.prior(key,fingerprint,session);if(prior)return prior;
   const before=code?await this.load(code):null;const g=this.engine(before?structuredClone(before):null);
   let result;try{result=run(g,before);}catch(error){const concurrent=await this.prior(key,fingerprint,session);if(concurrent)return concurrent;throw error;}const room=g.rooms.get(result.code??code?.toUpperCase());
   room.caseVersion=this.caseData.version;room.schemaVersion=1;room.expiresAt=Math.min(room.createdAt+24*HOUR,this.now()+6*HOUR);
   // Entries are receipt-scoped in durable storage, never persisted bearer tokens.
   const p=room.players.find(p=>p.token===session);if(!p)throw new Error('Missing participant after command');
   for(const player of room.players)if(Buffer.byteLength(JSON.stringify({...player,requests:[...player.requests]}))>120_000)throw new DomainError('Game data limit reached.',413);
   const receipt={key,fingerprint,code:room.code,playerId:p.id,expiresAt:room.createdAt+24*HOUR};
   const aiWrites=this.ai&&kind==='act'&&payload.type==='ask'?await this.ai.prepareQuestion({room,player:p,receiptKey:key,caseData:this.caseData}):[];
   try{await this.store.commitRoom({expectedVersion:before?.version??null,room,receipt,aiWrites});return {code:room.code,playerId:p.id,state:g.view(room.code,session)};}catch(e){if(!(e instanceof ConflictError)&&e.name!=='ConflictError')throw e;}
  }
  throw new DomainError('Too many simultaneous actions. Please try again.',409);
 }
 async create(session,name,caseId,id){return this.mutate({kind:'create',session,id,payload:{name,caseId},run:g=>{const created=g.create(name,caseId,id);g.rooms.get(created.code).players[0].token=session;return created;}});}
 async join(code,session,name,id){code=code.toUpperCase();return this.mutate({kind:'join',code,session,id,payload:{name},run:(g,before)=>{if(before.players.some(p=>p.token===session))throw new DomainError('This browser has already joined this room.',409);const joined=g.join(code,name,id);g.rooms.get(code).players.find(p=>p.id===joined.playerId).token=session;return joined;}});}
 async act(code,session,action){const result=await this.mutate({kind:'act',code:code.toUpperCase(),session,id:action?.id,payload:action,run:(g,before)=>{if(action.expectedVersion!==undefined&&action.expectedVersion!==before.version)throw new DomainError('The room has changed. Refresh before trying again.',409);g.act(before.code,session,action);return {code:before.code};}});return result.state;}
}
