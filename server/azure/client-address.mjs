import {isIP} from 'node:net';

// Only Azure App Service's direct front-end contract overwrites CLIENT-IP.
// This is deliberately not a general-purpose trusted-proxy/XFF resolver.
export function normalizeClientAddress(value) {
 if(typeof value!=='string'||value.length>45||value.includes('%'))return null;
 const version=isIP(value);
 if(version===4)return value;
 if(version!==6)return null;
 const canonical=new URL(`http://[${value}]/`).hostname.slice(1,-1);
 const mapped=/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(canonical);
 if(mapped){const high=parseInt(mapped[1],16),low=parseInt(mapped[2],16);return [high>>>8,high&255,low>>>8,low&255].join('.');}
 return canonical;
}

// Endpoint forms are compatibility parsing, not a new source of trust.
export function normalizeAzureClientHeader(value) {
 const literal=normalizeClientAddress(value);
 if(literal!==null)return literal;
 if(typeof value!=='string'||value.length>53)return null;
 const ipv4=/^([0-9.]+):([0-9]{1,5})$/.exec(value);
 const ipv6=/^\[([0-9a-fA-F:.]+)\]:([0-9]{1,5})$/.exec(value);
 const match=ipv4??ipv6;
 if(!match||isIP(match[1])!==(ipv4?4:6))return null;
 const port=Number(match[2]);
 if(port<1||port>65535)return null;
 return normalizeClientAddress(match[1]);
}

export function azureClientAddress(request) {
 const fallback=normalizeClientAddress(request.socket?.remoteAddress)??request.socket?.remoteAddress;
 // rawHeaders preserves duplicate fields that Node's normalized headers join.
 const values=[];
 for(let i=0;i<(request.rawHeaders?.length??0);i+=2){
  if(request.rawHeaders[i].toLowerCase()==='client-ip')values.push(request.rawHeaders[i+1]);
 }
 return values.length===1?(normalizeAzureClientHeader(values[0])??fallback):fallback;
}
