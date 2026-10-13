'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {canonical,parseJSON,diffs,sha}=require('../src/domain.cjs');
test('canonicalización determinista, orden de arrays y valores inválidos',()=>{
  assert.equal(canonical({z:1,a:[true,null,'á']}),canonical({a:[true,null,'á'],z:1}));assert.notEqual(canonical([1,2]),canonical([2,1]));
  for(const v of [NaN,Infinity,undefined,1.5,9007199254740992])assert.throws(()=>canonical(v));
  assert.throws(()=>parseJSON('{"a":1,"\\u0061":2}'));assert.throws(()=>parseJSON('{"x":{"a":1,"a":2}}'));assert.deepEqual(parseJSON('[{"a":1},{"a":2}]'),[{a:1},{a:2}]);
});
test('diferencias de fechas y cambios reversibles con valor original distinguible',()=>{
  const a={fecha:'2026-10-10',contenido:'A'},b={fecha:'2026-10-11',contenido:'A'};
  assert.deepEqual(diffs(a,b),[{path:'$.fecha',before:'2026-10-10',after:'2026-10-11',beforePresent:true,afterPresent:true}]);assert.notEqual(sha(canonical(a)),sha(canonical(b)));
});
