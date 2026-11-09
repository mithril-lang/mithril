import test from 'node:test';
import assert from 'node:assert/strict';
import {messages,translator} from '../src/locale.js';
test('locale catalog has matching keys and interpolation fields',()=>{assert.deepEqual(Object.keys(messages.en).sort(),Object.keys(messages.ja).sort());for(const key of Object.keys(messages.en)){const fields=s=>[...s.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort();assert.deepEqual(fields(messages.en[key]),fields(messages.ja[key]),key);}assert.equal(translator()('overview'),'Community Atlas');assert.throws(()=>translator('unsupported'));});
