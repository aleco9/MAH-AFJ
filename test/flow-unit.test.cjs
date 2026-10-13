'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {verifyExecuted}=require('../scripts/quality/contracts.cjs');
const ok=id=>({type:'test:pass',name:id+' caso',skip:false,todo:false});
test('FLOW01 comentario o escenario omitido no acredita ejecución',()=>assert.throws(()=>verifyExecuted(['AC01'],[]),/SCENARIO_EXECUTION/));
test('FLOW02 igual conteo con otro ID no acredita ejecución',()=>assert.throws(()=>verifyExecuted(['AC01'],[ok('AC02')]),/SCENARIO_EXECUTION/));
test('FLOW03 duplicado, omitido, pendiente y fallido se rechazan',()=>{for(const rows of [[ok('AC01'),ok('AC01')],[{...ok('AC01'),skip:true}],[{...ok('AC01'),todo:true}],[{...ok('AC01'),type:'test:fail'}]])assert.throws(()=>verifyExecuted(['AC01'],rows),/SCENARIO_EXECUTION/);});
test('FLOW04 conjunto exacto exitoso conserva IDs y resultados',()=>assert.deepEqual(verifyExecuted(['AC01','AC02'],[ok('AC02'),ok('AC01')]).map(x=>x.id),['AC01','AC02']));
