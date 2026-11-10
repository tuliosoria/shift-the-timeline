import {randomBytes,createHash} from 'node:crypto';import {DomainError} from './game.mjs';
export class Sessions {
 constructor({store,now=Date.now,secure=true}){this.store=store;this.now=now;this.secure=secure;this.name=secure?'__Host-shift_session':'shift_session_dev';}
 cookie(value,maxAge=86400){return `${this.name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${this.secure?'; Secure':''}`;}
 extract(header=''){const values=header.split(';').map(s=>s.trim()).filter(s=>s.startsWith(`${this.name}=`));if(values.length!==1)return null;const raw=values[0].slice(this.name.length+1);return /^[a-f0-9]{64}$/.test(raw)?raw:null;}
 hash(raw){return createHash('sha256').update(raw).digest('hex');}
 async create(){const raw=randomBytes(32).toString('hex'),hash=this.hash(raw);const expiresAt=this.now()+86400000;await this.store.putSession(hash,{expiresAt});return {hash,expiresAt,cookie:this.cookie(raw)};}
 async resolve(header){const raw=this.extract(header);if(!raw)throw new DomainError('Session required.',401);const hash=this.hash(raw),record=await this.store.getSession(hash);if(!record||record.expiresAt<=this.now())throw new DomainError('Session expired or ended.',401);return {hash,expiresAt:record.expiresAt};}
 async renew(header){const raw=this.extract(header);if(!raw)throw new DomainError('Session required.',401);const hash=this.hash(raw),now=this.now();const record=await this.store.extendSession(hash,now,now+86460000);if(!record)throw new DomainError('Session expired or ended.',401);return {hash,expiresAt:record.expiresAt,cookie:this.cookie(raw,Math.ceil((record.expiresAt-now)/1000))};}
 async revoke(header){const raw=this.extract(header);if(raw)await this.store.revokeSession(this.hash(raw));return this.cookie('',0);}
}
