import {createHash} from 'node:crypto';import {DomainError} from './game.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
export function createRateLimiter({store,now=Date.now,createPerDay=100,createPerHour=3}){
 return async({request,path,context})=>{const ip=hash(context.sourceIp??'unknown');const limits=[['all',60_000,6000], [`ip:${ip}`,60_000,240]];if(request.method==='POST'&&path==='/api/rooms')limits.push(['create:global',86400000,createPerDay],[`create:${ip}`,3600000,createPerHour]);if(request.method==='POST'&&path.endsWith('/join'))limits.push([`join:${ip}`,60_000,10]);for(const [name,windowMs,max] of limits){const bucket=Math.floor(now()/windowMs);if(!await store.consumeCounter(`${name}:${bucket}`,max,(bucket+2)*windowMs))throw new DomainError('Temporary limit reached. Please try again later.',429);}};
}
