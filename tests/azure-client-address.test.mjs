import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {azureClientAddress,normalizeClientAddress,normalizeAzureClientHeader} from '../server/azure/client-address.mjs';
import {createServer} from '../server/http.mjs';
import {createRateLimiter} from '../server/limits.mjs';
import {MemoryStore} from '../server/storage/memory.mjs';
const req=(rawHeaders=[],ip='10.0.0.1')=>({rawHeaders,socket:{remoteAddress:ip}});
test('literal normalization preserves IPv4 and collapses IPv6 and mapped equivalents',()=>{
 for(const value of ['192.0.2.7','::ffff:192.0.2.7','0:0:0:0:0:FFFF:C000:0207'])assert.equal(normalizeClientAddress(value),'192.0.2.7');
 assert.equal(normalizeClientAddress('2001:0DB8:0000:0000:0000:0000:0000:0001'),'2001:db8::1');
 for(const value of ['',null,[], ' 192.0.2.7','192.0.2.7 ','192.0.2.7:80','[2001:db8::1]:80','[::1]','fe80::1%eth0','192.0.2.7,198.51.100.1','001.2.3.4','nope'])assert.equal(normalizeClientAddress(value),null);
});
test('Azure accepts exactly one CLIENT-IP; ignores all other forwarding claims',()=>{
 assert.equal(azureClientAddress(req(['ClIeNt-Ip','2001:db8::1'])),'2001:db8::1');
 for(const headers of [[],['X-Forwarded-For','192.0.2.1'],['X-Client-IP','192.0.2.1'],['Client-IP','192.0.2.1','client-ip','192.0.2.2'],['Client-IP','bad'],['Client-IP','192.0.2.1, 192.0.2.2']])assert.equal(azureClientAddress(req(headers)),'10.0.0.1');
 assert.equal(azureClientAddress(req([], '::ffff:192.0.2.9')),'192.0.2.9');
});
async function boundary(t,sourceIp,headers){
 const server=createServer({origin:'http://localhost',sourceIp,api:async(_request,context)=>Response.json(context)});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 return new Promise((resolve,reject)=>{http.get({host:'127.0.0.1',port:server.address().port,path:'/api/test',headers},res=>{let body='';res.on('data',b=>body+=b);res.on('end',()=>resolve(JSON.parse(body)));}).on('error',reject);});
}
test('default HTTP boundary ignores spoofed CLIENT-IP and XFF',async t=>{
 assert.equal((await boundary(t,undefined,{'Client-IP':'192.0.2.1','X-Forwarded-For':'192.0.2.2'})).sourceIp,'127.0.0.1');
});
test('explicit Azure HTTP boundary uses single header and rejects real duplicate fields',async t=>{
 assert.equal((await boundary(t,azureClientAddress,{'Client-IP':'::ffff:192.0.2.1'})).sourceIp,'192.0.2.1');
 assert.equal((await boundary(t,azureClientAddress,{'Client-IP':['192.0.2.1','192.0.2.2']})).sourceIp,'127.0.0.1');
});
test('distinct Azure clients have separate quotas while global budget remains shared',async()=>{
 const limit=createRateLimiter({store:new MemoryStore(),now:()=>0,createPerHour:1,createPerDay:3});
 const request=new Request('https://shift.example/api/rooms',{method:'POST'});
 const attempt=ip=>limit({request,path:'/api/rooms',context:{sourceIp:azureClientAddress(req(['Client-IP',ip]))}});
 await attempt('192.0.2.1');await attempt('192.0.2.2');await attempt('192.0.2.3');
 await assert.rejects(()=>attempt('192.0.2.4'),e=>e.status===429);
});
test('mapped IPv4 cannot bypass an existing per-address quota',async()=>{
 const limit=createRateLimiter({store:new MemoryStore(),now:()=>0,createPerHour:1});
 const request=new Request('https://shift.example/api/rooms',{method:'POST'});
 const attempt=ip=>limit({request,path:'/api/rooms',context:{sourceIp:azureClientAddress(req(['Client-IP',ip]))}});
 await attempt('192.0.2.1');await assert.rejects(()=>attempt('::ffff:c000:201'),e=>e.status===429);
});

test('Azure endpoint forms strip valid ports and canonicalize without guessing IPv6 boundaries',()=>{
 for(const value of ['192.0.2.7:1','192.0.2.7:65535','[::ffff:c000:207]:443','[::ffff:192.0.2.7]:63546'])assert.equal(normalizeAzureClientHeader(value),'192.0.2.7');
 assert.equal(normalizeAzureClientHeader('[2001:0db8::1]:443'),'2001:db8::1');
 assert.equal(normalizeAzureClientHeader('2001:db8::1:443'),'2001:db8::1:443');
 for(const value of ['192.0.2.7:0','192.0.2.7:65536','192.0.2.7:-1','192.0.2.7:+1','192.0.2.7:1.0','192.0.2.7:1e2','192.0.2.7:','192.0.2.7:000001','[::1]:0','[::1]:65536','[::1]:443 ',' [::1]:443','[::1]','[192.0.2.7]:443','[fe80::1%eth0]:443','192.0.2.7:80,192.0.2.8:90','2001:db8::1:65536'])assert.equal(normalizeAzureClientHeader(value),null,value);
});
test('Azure HTTP endpoint form strips port but duplicate endpoint headers fall back',async t=>{
 assert.equal((await boundary(t,azureClientAddress,{'Client-IP':'192.0.2.7:63546'})).sourceIp,'192.0.2.7');
 assert.equal((await boundary(t,azureClientAddress,{'Client-IP':['192.0.2.7:80','192.0.2.7:81']})).sourceIp,'127.0.0.1');
});
test('changing client endpoint ports cannot bypass the address quota',async()=>{
 const limit=createRateLimiter({store:new MemoryStore(),now:()=>0,createPerHour:1});
 const request=new Request('https://shift.example/api/rooms',{method:'POST'});
 const attempt=value=>limit({request,path:'/api/rooms',context:{sourceIp:azureClientAddress(req(['Client-IP',value]))}});
 await attempt('192.0.2.7:63546');
 await assert.rejects(()=>attempt('[::ffff:192.0.2.7]:443'),e=>e.status===429);
});
