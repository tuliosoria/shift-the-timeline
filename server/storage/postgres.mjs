import {ConflictError} from './memory.mjs';
import {aiPut} from './ai-codec.mjs';

const CONFLICTS=new Set(['23505','40001','40P01']);
const keyValue=key=>{if(typeof key!=='string'||!key||key.length>512)throw new Error('Invalid storage key');return key;};
const integer=value=>{if(!Number.isSafeInteger(value)||value<0)throw new Error('Invalid storage timestamp');return value;};
const expected=value=>{if(value!==null&&(!Number.isSafeInteger(value)||value<1))throw new Error('Invalid expected version');return value;};
const json=value=>JSON.stringify(value);
export function encodePostgresRoom(room){
 if(!room||!Array.isArray(room.players)||room.players.length>4)throw new Error('Invalid room');
 const data={...room,players:room.players.map(p=>({...p,requests:[...p.requests]}))};
 if(data.players.some(p=>Buffer.byteLength(json(p))>128000)||Buffer.byteLength(json(data))>600000)throw new Error('Room exceeds bounded storage size');
 return data;
}
export function decodePostgresRoom(data){return data?{...data,players:data.players.map(p=>({...p,requests:new Map(p.requests)}))}:null;}

// pool is an injected node-postgres Pool. Runtime provisioning, credentials and schema
// migration are deliberately outside this adapter. SQL identifiers are never user input.
export class PostgresStore {
 constructor({pool,signal}={}){if(!pool?.connect||!pool?.query)throw new Error('PostgreSQL pool required');this.pool=pool;this.signal=signal;}
 withAbortSignal(signal){return new PostgresStore({pool:this.pool,signal});}
 guard(){this.signal?.throwIfAborted();}
 async query(client,text,values=[]){this.guard();const result=await client.query(text,values);this.guard();return result;}
 async transaction(run){
  this.guard();const client=await this.pool.connect();let began=false,discard=false;
  try{began=true;await this.query(client,'BEGIN ISOLATION LEVEL SERIALIZABLE');await this.query(client,"SET LOCAL statement_timeout = '10s'");await this.query(client,"SET LOCAL lock_timeout = '5s'");const value=await run(client);this.guard();await client.query('COMMIT');began=false;return value;}
  catch(error){if(began)try{await client.query('ROLLBACK');}catch{discard=true;}if(CONFLICTS.has(error.code))throw new ConflictError();throw error;}
  finally{client.release(discard);}
 }
 async checkReady(){
  const result=await this.query(this.pool,'SELECT version FROM shift_schema_version WHERE singleton=true');
  if(result.rows.length!==1||result.rows[0].version!==1)throw new Error('Unsupported SHIFT PostgreSQL schema version');
  // Resolve all columns with a read-only query; missing/incompatible migrations fail startup.
  await this.query(this.pool,'SELECT kind,key,version,data,expires_at,due_at FROM shift_records LIMIT 0');
  return true;
 }
 async cleanupExpired(now,limit=500){
  integer(now);if(!Number.isSafeInteger(limit)||limit<1||limit>1000)throw new Error('Invalid cleanup limit');
  // A single statement locks only the selected expired rows. SKIP LOCKED lets multiple
  // maintenance workers coexist, and avoids deleting a session concurrently renewed.
  const r=await this.query(this.pool,`WITH expired AS (SELECT kind,key FROM shift_records WHERE expires_at <= $1 ORDER BY expires_at,kind,key LIMIT $2 FOR UPDATE SKIP LOCKED) DELETE FROM shift_records AS records USING expired WHERE records.kind=expired.kind AND records.key=expired.key`,[now,limit]);
  return r.rowCount;
 }
 async record(kind,key){const r=await this.query(this.pool,'SELECT data FROM shift_records WHERE kind=$1 AND key=$2',[kind,keyValue(key)]);return r.rows[0]?.data??null;}
 async getRoom(code){return decodePostgresRoom(await this.record('room',code));}
 async getReceipt(key){return this.record('receipt',key);}
 async getAi(key){return this.record('ai',key);}
 async getSession(hash){return this.record('session',hash);}
 async checkVersion(client,kind,key,version){
  expected(version);const r=await this.query(client,'SELECT version FROM shift_records WHERE kind=$1 AND key=$2 FOR UPDATE',[kind,keyValue(key)]);
  const actual=r.rows.length?Number(r.rows[0].version):null;if(actual!==version)throw new ConflictError();
 }
 async putVersioned(client,kind,key,version,data,expiresAt,dueAt=null){
  expected(version);integer(expiresAt);if(dueAt!==null)integer(dueAt);
  if(!Number.isSafeInteger(data.version)||data.version<1)throw new Error('Invalid stored version');
  const values=[kind,keyValue(key),data.version,json(data),expiresAt,dueAt];
  const result=version===null
   ?await this.query(client,'INSERT INTO shift_records(kind,key,version,data,expires_at,due_at) VALUES($1,$2,$3,$4::jsonb,$5,$6) ON CONFLICT(kind,key) DO NOTHING RETURNING key',values)
   :await this.query(client,'UPDATE shift_records SET version=$3,data=$4::jsonb,expires_at=$5,due_at=$6 WHERE kind=$1 AND key=$2 AND version=$7 RETURNING key',[...values,version]);
  if(result.rowCount!==1)throw new ConflictError();
 }
 validateAi(writes,checks=[]){
  const keys=new Set();for(const w of writes){expected(w.expectedVersion);aiPut('validation',w);if(keys.has(w.key))throw new Error('Duplicate AI transaction key');keys.add(w.key);}
  for(const c of checks){keyValue(c.key);expected(c.expectedVersion);if(!/^AI(?:JOB|OUTBOX|BUDGET|SLOTS|CURSOR)#/.test(c.key)||keys.has(c.key))throw new Error('Invalid AI check');keys.add(c.key);}
 }
 async writeAi(client,writes){for(const w of [...writes].sort((a,b)=>a.key.localeCompare(b.key)))await this.putVersioned(client,'ai',w.key,w.expectedVersion,w.value,w.value.expiresAt,w.value.dueAt??null);}
 async commitRoom({expectedVersion,room,receipt,aiWrites=[]}){
  expected(expectedVersion);const data=encodePostgresRoom(room);this.validateAi(aiWrites);keyValue(receipt.key);integer(receipt.expiresAt);
  return this.transaction(async client=>{
   await this.putVersioned(client,'room',room.code,expectedVersion,data,room.expiresAt);
   await this.query(client,'INSERT INTO shift_records(kind,key,data,expires_at) VALUES(\'receipt\',$1,$2::jsonb,$3)',[receipt.key,json(receipt),receipt.expiresAt]);
   await this.writeAi(client,aiWrites);
  });
 }
 async commitAi({writes,checks=[],room,roomCode,expectedRoomVersion}){
  this.validateAi(writes,checks);if(room&&room.code!==roomCode)throw new Error('Room transaction identity mismatch');const data=room?encodePostgresRoom(room):null;
  return this.transaction(async client=>{
   if(roomCode){await this.checkVersion(client,'room',roomCode,expectedRoomVersion);if(data)await this.putVersioned(client,'room',roomCode,expectedRoomVersion,data,room.expiresAt);}
   for(const c of [...checks].sort((a,b)=>a.key.localeCompare(b.key)))await this.checkVersion(client,'ai',c.key,c.expectedVersion);
   await this.writeAi(client,writes);
  });
 }
 async listAiDue(now,limit=25,cursor){
  integer(now);if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new Error('Invalid reconciliation limit');
  if(cursor&&(!Number.isSafeInteger(cursor.dueAt)||cursor.dueAt<0||typeof cursor.key!=='string'||!cursor.key||cursor.key.length>512))throw new Error('Invalid reconciliation cursor');
  const result=await this.query(this.pool,`SELECT key,due_at FROM shift_records WHERE kind='ai' AND due_at <= $1 AND ($2::bigint IS NULL OR due_at > $2 OR (due_at=$2 AND key COLLATE "C" > $3)) ORDER BY due_at,key COLLATE "C" LIMIT $4`,[now,cursor?.dueAt??null,cursor?.key??null,limit+1]);
  const items=result.rows.slice(0,limit).map(r=>({key:r.key,cursor:{dueAt:Number(r.due_at),key:r.key}}));return {keys:items.map(i=>i.key),items,cursor:result.rows.length>limit?items.at(-1).cursor:null};
 }
 async consumeCounter(id,max,expiresAt){
  keyValue(id);integer(expiresAt);if(!Number.isSafeInteger(max)||max<1)throw new Error('Invalid counter limit');
  const r=await this.query(this.pool,`INSERT INTO shift_records(kind,key,data,expires_at) VALUES('counter',$1,'{"count":1}'::jsonb,$2) ON CONFLICT(kind,key) DO UPDATE SET data=jsonb_build_object('count',(shift_records.data->>'count')::bigint+1),expires_at=EXCLUDED.expires_at WHERE (shift_records.data->>'count')::bigint < $3 RETURNING key`,[id,expiresAt,max]);return r.rowCount===1;
 }
 async putSession(hash,session){keyValue(hash);integer(session.expiresAt);await this.query(this.pool,"INSERT INTO shift_records(kind,key,data,expires_at) VALUES('session',$1,$2::jsonb,$3)",[hash,json(session),session.expiresAt]);}
 async extendSession(hash,now,expiresAt){
  integer(now);integer(expiresAt);keyValue(hash);
  const r=await this.query(this.pool,`UPDATE shift_records SET expires_at=GREATEST(expires_at,$3),data=jsonb_set(data,'{expiresAt}',to_jsonb(GREATEST(expires_at,$3))) WHERE kind='session' AND key=$1 AND expires_at>$2 RETURNING data`,[hash,now,expiresAt]);return r.rows[0]?.data??null;
 }
 async revokeSession(hash){await this.query(this.pool,"DELETE FROM shift_records WHERE kind='session' AND key=$1",[keyValue(hash)]);}
}
