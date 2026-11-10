import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseResponse,RELEASE_COMMIT} from '../server/azure/release.mjs';
test('release endpoint reveals only immutable validated build SHA and never caches',async()=>{const sha='a'.repeat(40),request=new Request('https://shift.example/api/release');const response=releaseResponse(request,sha);assert.equal(response.status,200);assert.deepEqual(await response.json(),{commit:sha});assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await releaseResponse(new Request(request,{method:'HEAD'}),sha).text()),'');});
test('unpackaged or malformed release is unavailable; mutation unsupported',()=>{const request=new Request('https://shift.example/api/release');assert.equal(RELEASE_COMMIT,null);for(const sha of [null,'main','secret','a'.repeat(41)])assert.equal(releaseResponse(request,sha).status,404);assert.equal(releaseResponse(new Request(request,{method:'POST'}),'a'.repeat(40)).status,405);});
