import {test} from 'node:test';
import assert from 'node:assert/strict';
import {currencyLabel,resolveCurrency} from './currency.js';
test('estate currency controls labels and never guesses from the estate name',()=>{
 assert.equal(currencyLabel('MYR'),'RM');assert.equal(currencyLabel('NGN'),'NGN');
 assert.equal(currencyLabel(null),'Currency not set');
 assert.equal(resolveCurrency('MYR',[]),'MYR');
 assert.equal(resolveCurrency(null,['NGN','NGN']),'NGN');
 assert.equal(resolveCurrency(null,[]),null);
});
test('mixed or mismatched financial currencies cannot be relabelled or combined',()=>{
 assert.throws(()=>resolveCurrency('MYR',['NGN']),/differs/);
 assert.throws(()=>resolveCurrency(null,['MYR','NGN']),/differs/);
 assert.throws(()=>resolveCurrency('BAD',[]),/Unsupported/);
});
