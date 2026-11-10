import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseResponse,RELEASE_COMMIT} from '../server/azure/release.mjs';
test('release endpoint reveals only immutable validated build SHA and never caches',async()=>{const sha='a'.repeat(40),request=new Request('https://shift.example/api/release');const response=releaseResponse(request,sha);assert.equal(response.status,200);assert.deepEqual(await response.json(),{commit:sha});assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await releaseResponse(new Request(request,{method:'HEAD'}),sha).text()),'');});
test('unpackaged or malformed release is unavailable; mutation unsupported',()=>{const request=new Request('https://shift.example/api/release');assert.equal(RELEASE_COMMIT,null);for(const sha of [null,'main','secret','a'.repeat(41)])assert.equal(releaseResponse(request,sha).status,404);assert.equal(releaseResponse(new Request(request,{method:'POST'}),'a'.repeat(40)).status,405);});

import {parseReleaseCommit} from '../scripts/release-commit.mjs';
test('packager release input accepts only explicit exact SHA argument',()=>{
 const sha='a'.repeat(40);assert.equal(parseReleaseCommit([]),null);assert.equal(parseReleaseCommit(['--release-commit',sha]),sha);
 for(const args of [['--release-commit'],['--release-commit','main'],['--release-commit','A'.repeat(40)],['--other',sha],['--release-commit',sha,'extra'],['--release-commit',sha+'\n']])assert.throws(()=>parseReleaseCommit(args),/Expected/);
});
