'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');const {PROTECTED_DATES,protectedDateChanges}=require('../src/domain.cjs');
function body(path,value){const b={tipo:'DECRETO',contenido:'A'},parts=path.split('.');let v=b;for(const p of parts.slice(0,-1))v=v[p]={};v[parts.at(-1)]=value;return b;}
for(const path of PROTECTED_DATES){for(const [name,a,b] of [['atrasar','2026-10-11','2026-10-01'],['adelantar','2026-10-11','2026-11-01'],['nulo','2026-10-11',null],['tipo','2026-10-11',12]])test('ERR fecha protegida '+path+' '+name,()=>assert.ok(protectedDateChanges(body(path,a),body(path,b)).includes(path)));
 test('ERR eliminación '+path,()=>assert.ok(protectedDateChanges(body(path,'2026-10-11'),{}).includes(path)));test('ERR incorporación '+path,()=>assert.ok(protectedDateChanges({},body(path,'2026-10-11')).includes(path)));}
test('FELIZ fechas iguales y cambio de contenido mantienen política estable',()=>assert.deepEqual(protectedDateChanges({fecha:'2026-10-11',contenido:'A'},{fecha:'2026-10-11',contenido:'B'}),[]));
