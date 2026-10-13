'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');const {Store}=require('../src/store.cjs');const {application}=require('../src/server.cjs');const cfg=require('./config.cjs');
test('HTTP/SSE: dos organizaciones, recuperación, permisos, origen y exportación',async()=>{
 const store=new Store(cfg);await store.init();const app=application(store,{},cfg);let controller;
 try{
  const ports=await Promise.all([app.listen(0,'operador'),app.listen(0,'Org1'),app.listen(0,'Org2')]);
  async function login(i,user){const base='http://127.0.0.1:'+ports[i];const r=await fetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({user,password:cfg.password})});assert.equal(r.status,200);const info=await r.json(),cookie=r.headers.get('set-cookie').split(';')[0];return {base,cookie,info,async req(path,body){return fetch(base+path,{method:body?'POST':'GET',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json','X-CSRF-Token':info.csrf},body:body?JSON.stringify(body):undefined});}};}
  const op=await login(0,'juez'),one=await login(1,'org1'),two=await login(2,'org2');
  const start=(await store.pool.query('SELECT cursor FROM feed_head WHERE id=1')).rows[0].cursor;controller=new AbortController();
  const stream=await fetch(two.base+'/api/stream?after='+start,{headers:{Cookie:two.cookie},signal:controller.signal});const reader=stream.body.getReader();await reader.read();
  const input={action:'create',commandId:crypto.randomUUID(),docId:crypto.randomUUID(),body:{tipo:'SENTENCIA',fecha:'2026-10-10',contenido:'HTTP-DEMO'}};
  const res=await op.req('/api/command',input);assert.equal(res.status,200);const saved=await res.json();
  let observed='';const deadline=Date.now()+3000;while(!observed.includes(saved.eventId)&&Date.now()<deadline){const x=await Promise.race([reader.read(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('SSE_TIMEOUT')),3000))]);observed+=Buffer.from(x.value??[]).toString();}assert.ok(observed.includes(saved.eventId));controller.abort();
  for(const c of [one,two]){const feed=await (await c.req('/api/events?after='+start)).json();assert.ok(feed.some(e=>e.id===saved.eventId));const ack=await c.req('/api/ack',{eventId:saved.eventId,org:'OTHER'});assert.equal((await ack.json()).org,c.info.org);}
  assert.equal((await two.req('/api/command',input)).status,403);
  const bad=await fetch(op.base+'/api/command',{method:'POST',headers:{Cookie:op.cookie,Origin:'http://evil.example','Content-Type':'application/json'},body:JSON.stringify(input)});assert.equal(bad.status,403);
  const denied=(await store.pool.query("SELECT record FROM events WHERE record->>'action'='RECHAZO_SEGURIDAD' ORDER BY cursor")).rows.map(x=>x.record);assert.ok(denied.some(x=>x.context.actor==='org2'&&x.evidence.error==='SIN_PERMISO'));assert.ok(denied.some(x=>x.evidence.error==='ORIGEN_INVALIDO'));assert.ok(denied.every(x=>!JSON.stringify(x).includes(cfg.password)&&!JSON.stringify(x).includes(op.info.csrf)));
  const malformed=await fetch(op.base+'/api/command',{method:'POST',headers:{Cookie:op.cookie,Origin:op.base,'Content-Type':'application/json','X-CSRF-Token':op.info.csrf},body:'{'});assert.equal(malformed.status,422);const rejection=(await store.pool.query("SELECT record FROM events WHERE record->'evidence'->>'error'='JSON_INVALIDO' ORDER BY cursor DESC LIMIT 1")).rows[0].record;assert.equal(rejection.context.actor,'juez');
  const invalid=await op.req('/api/events?after=abc');assert.equal(invalid.status,422);
  const evidence=await (await two.req('/api/evidence-export?id='+saved.eventId)).json();assert.equal(evidence.local,'MATCH');assert.equal(evidence.remote,'PENDING');assert.equal(evidence.versions.length,1);
 }finally{controller?.abort();await app.close();await store.close();}
});
