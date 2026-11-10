import test from 'node:test';
import assert from 'node:assert/strict';
import {clientHarness,clientState} from './helpers/client-harness.mjs';
test('scene entries follow the investigation without loading video in rendered game screens',()=>{
 const h=clientHarness(clientState());h.client.clearState();h.client.render();
 assert.match(h.element('main').innerHTML,/data-film-open="train"/);
 h.client.setState(clientState({phase:'lobby'}));h.client.render();
 assert.match(h.element('main').innerHTML,/data-film-open="corridor"/);
 h.client.setState(clientState());h.client.render();
 assert.match(h.element('main').innerHTML,/data-film-open="pocket-watch"/);
 h.client.navigate('interrogate');assert.match(h.element('main').innerHTML,/data-film-open="corridor"/);
 assert.doesNotMatch(h.element('main').innerHTML,/<video|\.mp4/);
 assert.match(h.element('main').innerHTML,/Atmosphere only/);
});
