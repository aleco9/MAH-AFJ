'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {verifyProtected}=require('../scripts/quality/contracts.cjs');
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
test('QUALITY-G01 detecta una aserción alterada sin cambiar la línea base',()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'quality-guard-'));try{fs.writeFileSync(path.join(root,'acceptance.cjs'),'assert.equal(result,"DENY")');const manifest={files:{'acceptance.cjs':hash('assert.equal(result,"DENY")')}};assert.deepEqual(verifyProtected(root,manifest),[]);fs.writeFileSync(path.join(root,'acceptance.cjs'),'assert.equal(result,"ALLOW")');assert.deepEqual(verifyProtected(root,manifest),['acceptance.cjs']);}finally{fs.rmSync(root,{recursive:true});}});
test('QUALITY-G02 rechaza rutas que escapan del proyecto',()=>{assert.throws(()=>verifyProtected(process.cwd(),{files:{'../secreto':hash('x')}}),/CONTRACT_PATH_INVALID/);});
test('QUALITY-G03 archivo de criterio eliminado queda reportado',()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'quality-missing-'));try{assert.deepEqual(verifyProtected(root,{files:{'missing.cjs':hash('x')}}),['missing.cjs']);}finally{fs.rmSync(root,{recursive:true});}});

const {mutationKilled}=require('../scripts/quality/contracts.cjs');
const killedTap="not ok 1 - AC01 fecha\n  code: 'ERR_ASSERTION'\n# fail 1\n";
test('QUALITY-G04 solo cuenta mutación con la aserción específica fallida',()=>assert.equal(mutationKilled({exitCode:1},killedTap,'AC01'),true));
test('QUALITY-G05 rechaza timeout, fallo de conexión y fallo de hook',()=>{assert.equal(mutationKilled({exitCode:1,error:'ETIMEDOUT'},killedTap,'AC01'),false);assert.equal(mutationKilled({exitCode:1},killedTap.replace('ERR_ASSERTION','ECONNREFUSED'),'AC01'),false);assert.equal(mutationKilled({exitCode:1},killedTap+'hookFailed','AC01'),false);});
test('QUALITY-G06 un test distinto que falla no detecta el mutante objetivo',()=>assert.equal(mutationKilled({exitCode:1},killedTap,'AC02'),false));

const {redact}=require('../scripts/quality/contracts.cjs');
test('QUALITY-G07 registros ocultan credenciales y URL sin borrar el código de error',()=>{const text=redact('ERR_ASSERTION password=private-fixture postgresql://user:private-fixture@127.0.0.1:55433/qa',['private-fixture']);assert.ok(!text.includes('private-fixture'));assert.ok(!text.includes('postgresql://'));assert.ok(text.includes('ERR_ASSERTION'));});
