'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {Store}=require('../src/store.cjs');
const id='00000000-0000-4000-8000-000000000001';
function isolated(){const store=Object.create(Store.prototype);store.recordRejection=async(actor,input,error)=>{assert.ok(error.code);};store.pool={connect:async()=>assert.fail('invalid input accessed database'),query:async()=>assert.fail('invalid input accessed database')};return store;}
for(const role of [null,'FISCALIZADOR','UNKNOWN'])test('Store denies role '+role,async()=>assert.rejects(isolated().command(role?{role}:null,{action:'create'}),{code:'SIN_PERMISO',status:403}));
for(const [name,input] of [['null',null],['unknown-action',{action:'delete',commandId:id,docId:id}],['bad-command',{action:'create',commandId:'bad',docId:id}],['bad-doc',{action:'create',commandId:id,docId:'bad'}]])test('Store rejects '+name,async()=>assert.rejects(isolated().command({role:'OPERADOR'},input),{code:'COMANDO_INVALIDO',status:422}));
for(const [role,action] of [['OPERADOR','approve'],['APROBADOR','create'],['APROBADOR','change'],['APROBADOR','execute'],['APROBADOR','finalize'],['APROBADOR','plan']])test('Store action role '+role+'/'+action,async()=>assert.rejects(isolated().command({role},{action,docId:id,commandId:id}),{code:'SIN_PERMISO'}));
test('Store rejects invalid content before SQL',async()=>assert.rejects(isolated().command({role:'OPERADOR'},{action:'create',docId:id,commandId:id,body:[]}),{code:'CONTENIDO_JSON_REQUERIDO'}));
for(const method of ['document','detail'])test('Store '+method+' invalid id',async()=>assert.rejects(isolated()[method]('bad'),{code:'ID_INVALIDO'}));
test('Store ack requires organization and valid id',async()=>{await assert.rejects(isolated().ack({},id),{code:'SIN_PERMISO'});await assert.rejects(isolated().ack({org:'Org1'},'bad'),{code:'ID_INVALIDO'});});
