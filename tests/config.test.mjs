import test from 'node:test';
import assert from 'node:assert/strict';
import { readServerOptions } from '../server/config.mjs';
test('preview host and port flags override environment with safe defaults',()=>{
 assert.deepEqual(readServerOptions([],{}),{host:'127.0.0.1',port:3000});
 assert.deepEqual(readServerOptions(['--host','127.0.0.1','--port','4173','--strictPort'],{PORT:'3001'}),{host:'127.0.0.1',port:4173});
 assert.throws(()=>readServerOptions([],{PORT:'nope'}),/port/i);
});
