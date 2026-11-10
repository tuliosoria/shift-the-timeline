import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand,PutCommand,UpdateCommand,DeleteCommand,TransactGetCommand,TransactWriteCommand,QueryCommand} from '@aws-sdk/lib-dynamodb';
import {aiPut} from './ai-codec.mjs';
import {ConflictError} from './memory.mjs';
const key=(pk,sk)=>({pk,sk});
export function encodeRoom(room){
 const {players,...rest}=room;const pk=`ROOM#${room.code}`,ttl=Math.ceil(room.expiresAt/1000);
 const meta={pk,sk:'META',version:room.version,ttl,room:{...rest,playerIds:players.map(p=>p.id)}};
 const parts=players.map(p=>({pk,sk:`PLAYER#${p.id}`,ttl,player:{...p,requests:[...p.requests]}}));
 const items=[meta,...parts];if(items.some(i=>Buffer.byteLength(JSON.stringify(i))>128_000))throw new Error('Room partition exceeds bounded storage size');return items;
}
export function decodeRoom(items){const meta=items.find(i=>i?.sk==='META');if(!meta)return null;const {playerIds,...room}=meta.room;const players=playerIds.map(id=>{const p=items.find(i=>i?.sk===`PLAYER#${id}`)?.player;if(!p)throw new Error('Incomplete room snapshot');return {...p,requests:new Map(p.requests)};});return {...room,players};}
export class DynamoStore {
 constructor({tableName,client}){if(!tableName)throw new Error('SHIFT_TABLE is required');this.tableName=tableName;this.client=client??DynamoDBDocumentClient.from(new DynamoDBClient({}),{marshallOptions:{removeUndefinedValues:true}});}
 async getItem(pk,sk){return (await this.client.send(new GetCommand({TableName:this.tableName,Key:key(pk,sk),ConsistentRead:true}))).Item??null;}
 async getRoom(code){const pk=`ROOM#${code}`;for(let i=0;i<4;i++){const first=await this.getItem(pk,'META');if(!first)return null;const keys=[key(pk,'META'),...first.room.playerIds.map(id=>key(pk,`PLAYER#${id}`))];const result=await this.client.send(new TransactGetCommand({TransactItems:keys.map(Key=>({Get:{TableName:this.tableName,Key}}))}));const items=result.Responses.map(r=>r.Item);if(items[0]?.version!==first.version)continue;return decodeRoom(items);}throw new ConflictError();}
 async getReceipt(id){const item=await this.getItem(`RECEIPT#${id}`,'META');return item?.receipt??null;}
 async commitRoom({expectedVersion,room,receipt,aiWrites=[]}){
  const items=encodeRoom(room);const TransactItems=items.map((Item,i)=>({Put:{TableName:this.tableName,Item,...(i===0?expectedVersion===null?{ConditionExpression:'attribute_not_exists(pk)'}:{ConditionExpression:'#version = :expected',ExpressionAttributeNames:{'#version':'version'},ExpressionAttributeValues:{':expected':expectedVersion}}:{})}}));
  TransactItems.push({Put:{TableName:this.tableName,Item:{pk:`RECEIPT#${receipt.key}`,sk:'META',ttl:Math.ceil(receipt.expiresAt/1000),receipt},ConditionExpression:'attribute_not_exists(pk)'}});
  TransactItems.push(...aiWrites.map(w=>aiPut(this.tableName,w)));
  try{await this.client.send(new TransactWriteCommand({TransactItems}));}catch(e){if(e.name==='TransactionCanceledException'&&e.CancellationReasons?.some(r=>r.Code==='ConditionalCheckFailed'))throw new ConflictError();throw e;}
 }
 async listAiDue(now,limit=25,cursor){if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new Error('Invalid reconciliation limit');const r=await this.client.send(new QueryCommand({TableName:this.tableName,IndexName:'AiDueIndex',KeyConditionExpression:'aiDuePk = :pk AND aiDueSk <= :now',ExpressionAttributeValues:{':pk':'AI#DUE',':now':`${String(now).padStart(16,'0')}#~`},Limit:limit,...(cursor?{ExclusiveStartKey:cursor}:{})}));return {keys:(r.Items??[]).map(x=>x.pk),cursor:r.LastEvaluatedKey??null};}
 async getAi(id){return (await this.getItem(id,'AI'))?.data??null;}
 async commitAi({writes,checks=[],room,roomCode,expectedRoomVersion}){
  const condition={ConditionExpression:'#version = :expected',ExpressionAttributeNames:{'#version':'version'},ExpressionAttributeValues:{':expected':expectedRoomVersion}};
  const TransactItems=room?encodeRoom(room).map((Item,i)=>({Put:{TableName:this.tableName,Item,...(i===0?condition:{})}})):roomCode?[{ConditionCheck:{TableName:this.tableName,Key:key(`ROOM#${roomCode}`,'META'),...condition}}]:[];
  TransactItems.push(...checks.map(c=>({ConditionCheck:{TableName:this.tableName,Key:key(c.key,'AI'),ConditionExpression:'#version = :expected',ExpressionAttributeNames:{'#version':'version'},ExpressionAttributeValues:{':expected':c.expectedVersion}}})),...writes.map(w=>aiPut(this.tableName,w)));
  try{await this.client.send(new TransactWriteCommand({TransactItems}));}catch(e){if(e.name==='TransactionCanceledException'&&e.CancellationReasons?.some(r=>r.Code==='ConditionalCheckFailed'))throw new ConflictError();throw e;}
 }
 async consumeCounter(id,max,expiresAt){try{await this.client.send(new UpdateCommand({TableName:this.tableName,Key:key(`LIMIT#${id}`,'META'),UpdateExpression:'SET ttl = :ttl ADD #count :one',ConditionExpression:'attribute_not_exists(#count) OR #count < :max',ExpressionAttributeNames:{'#count':'count'},ExpressionAttributeValues:{':ttl':Math.ceil(expiresAt/1000),':one':1,':max':max}}));return true;}catch(e){if(e.name==='ConditionalCheckFailedException')return false;throw e;}}
 async getSession(hash){const item=await this.getItem(`SESSION#${hash}`,'META');return item?.session??null;}
 async putSession(hash,session){await this.client.send(new PutCommand({TableName:this.tableName,Item:{pk:`SESSION#${hash}`,sk:'META',ttl:Math.ceil(session.expiresAt/1000),session}}));}
 async extendSession(hash,now,expiresAt){try{const r=await this.client.send(new UpdateCommand({TableName:this.tableName,Key:key(`SESSION#${hash}`,'META'),UpdateExpression:'SET #session.#expires = :expires, ttl = :ttl',ConditionExpression:'attribute_exists(pk) AND #session.#expires > :now AND #session.#expires <= :expires',ExpressionAttributeNames:{'#session':'session','#expires':'expiresAt'},ExpressionAttributeValues:{':expires':expiresAt,':ttl':Math.ceil(expiresAt/1000),':now':now},ReturnValues:'ALL_NEW'}));return r.Attributes.session;}catch(e){if(e.name!=='ConditionalCheckFailedException')throw e;const current=await this.getSession(hash);return current&&current.expiresAt>now&&current.expiresAt>=expiresAt?current:null;}}
 async revokeSession(hash){await this.client.send(new DeleteCommand({TableName:this.tableName,Key:key(`SESSION#${hash}`,'META')}));}
}
