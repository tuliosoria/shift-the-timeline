// Application envelope for the complete stored Item, not a provider prompt limit.
export const MAX_AI_ITEM_BYTES = 64 * 1024;

export function aiPut(tableName,{key,expectedVersion,value}) {
 if(!/^AI(?:JOB|OUTBOX|BUDGET|SLOTS|CURSOR)#/.test(key)||!Number.isSafeInteger(value.version)||value.version!==(expectedVersion??0)+1||!Number.isSafeInteger(value.expiresAt))throw new Error('Invalid AI record');
 const Item={pk:key,sk:'AI',version:value.version,ttl:Math.ceil(value.expiresAt/1000),data:value};
 if(Number.isSafeInteger(value.dueAt)){Item.aiDuePk='AI#DUE';Item.aiDueSk=`${String(value.dueAt).padStart(16,'0')}#${key}`;}
 if(Buffer.byteLength(JSON.stringify(Item))>MAX_AI_ITEM_BYTES)throw new Error('AI record too large');
 return {Put:{TableName:tableName,Item,...(expectedVersion===null?{ConditionExpression:'attribute_not_exists(pk)'}:{ConditionExpression:'#version = :expected',ExpressionAttributeNames:{'#version':'version'},ExpressionAttributeValues:{':expected':expectedVersion}})}};
}
