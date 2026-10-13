'use strict';
const {test,before,after}=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');
const {Store}=require('../src/store.cjs');const {Worker}=require('../src/ledger.cjs');const cfg=require('./config.cjs');
const actor={user:'juez-test',role:'OPERADOR'},approver={user:'aprobador-test',role:'APROBADOR'};
let store;const command=(action,docId,fields={})=>({action,docId,commandId:crypto.randomUUID(),...fields});const body={tipo:'SENTENCIA',fecha:'2026-10-10',contenido:'A'};
before(async()=>{store=new Store(cfg);await store.init();});after(async()=>{await store.close();});
test('commit conserva versiones, cadena, doble hash, contexto y A→B→A',async()=>{
  const id=crypto.randomUUID(),a=await store.command(actor,command('create',id,{body}));
  const b=await store.command(actor,command('change',id,{baseVersionId:a.versionId,body:{...body,contenido:'B'}}));
  const c=await store.command(actor,command('change',id,{baseVersionId:b.versionId,body}));
  const d=await store.detail(c.eventId);assert.equal(d.local,'MATCH');assert.equal(d.original.contenido,'A');assert.equal(d.before.contenido,'B');assert.equal(d.after.contenido,'A');assert.equal(d.versions.length,3);assert.equal(d.record.context.actor,actor.user);assert.equal(d.record.previousHash,(await store.detail(b.eventId)).hash);
  const rows=(await store.pool.query('SELECT count(*)::int n FROM events WHERE doc_id=$1',[id])).rows;assert.equal(rows[0].n,3);
});
test('idempotencia, conflicto de commandId y escrituras concurrentes',async()=>{
  const id=crypto.randomUUID(),input=command('create',id,{body});const first=await store.command(actor,input);assert.deepEqual(await store.command(actor,input),first);
  await assert.rejects(store.command(actor,{...input,body:{...body,contenido:'OTRO'}}),/ID_CON_CONTENIDO_DISTINTO/);
  const results=await Promise.all(['B','C'].map(contenido=>store.command(actor,command('change',id,{baseVersionId:first.versionId,body:{...body,contenido}}))));
  assert.equal(results.filter(r=>r.decision==='ALLOW').length,1);assert.equal(results.filter(r=>r.decision==='DENY').length,1);assert.equal((await store.document(id)).versions.length,2);
});
test('fallo entre versión y outbox revierte toda la transacción',async()=>{
  const id=crypto.randomUUID(),connect=store.pool.connect.bind(store.pool);store.pool.connect=async()=>{const c=await connect(),query=c.query.bind(c);c.query=async(sql,...args)=>{if(sql.startsWith('INSERT INTO outbox'))throw new Error('INJECTED_FAILURE');return query(sql,...args);};const release=c.release.bind(c);c.release=()=>{c.query=query;c.release=release;release();};return c;};
  try{await assert.rejects(store.command(actor,command('create',id,{body})),/INJECTED_FAILURE/);}finally{store.pool.connect=connect;}
  assert.equal((await store.pool.query('SELECT count(*)::int n FROM documents WHERE id=$1',[id])).rows[0].n,0);
});
test('sentencia finalizada: rechazo durable y rectificación autorizada conserva original',async()=>{
  const id=crypto.randomUUID(),a=await store.command(actor,command('create',id,{body}));await store.command(actor,command('finalize',id,{baseVersionId:a.versionId}));
  const denied=await store.command(actor,command('change',id,{baseVersionId:a.versionId,body:{...body,contenido:'ALTERADO'}}));assert.equal(denied.decision,'DENY');const rejectedDetail=await store.detail(denied.eventId);assert.equal(rejectedDetail.record.action,'RECHAZADO');assert.equal(rejectedDetail.proposal.contenido,'ALTERADO');assert.equal(rejectedDetail.after.contenido,'A');assert.equal(rejectedDetail.proposedDifferences[0].after,'ALTERADO');assert.equal((await store.document(id)).versions.length,1);
  const plan=await store.command(actor,command('plan',id,{baseVersionId:a.versionId,body:{...body,fecha:'2026-10-11',contenido:'RECTIFICADO'},reason:'Corrección sintética aprobable',rectification:true}));
  const self=await store.command({...actor,role:'APROBADOR'},command('approve',id,{baseVersionId:a.versionId,planId:plan.planId}));assert.equal(self.decision,'DENY');
  await store.command(approver,command('approve',id,{baseVersionId:a.versionId,planId:plan.planId}));const final=await store.command(actor,command('execute',id,{baseVersionId:a.versionId,planId:plan.planId}));
  const doc=await store.document(id);assert.equal(doc.versions[0].body.contenido,'A');assert.equal(doc.versions[1].rectifies_id,a.versionId);assert.equal((await store.detail(final.eventId)).local,'MATCH');
});
test('fecha relevante y base obsoleta: rechazo y propuesta autorizada ligada',async()=>{
  const id=crypto.randomUUID(),a=await store.command(actor,command('create',id,{body}));const denied=await store.command(actor,command('change',id,{baseVersionId:a.versionId,body:{...body,fecha:'2026-10-12'}}));assert.equal(denied.reason,'FECHA_REQUIERE_AUTORIZACION');
  const p=await store.command(actor,command('plan',id,{baseVersionId:a.versionId,body:{...body,fecha:'2026-10-12'},reason:'Fecha revisada'}));
  const changed=await store.command(actor,command('change',id,{baseVersionId:a.versionId,body:{...body,contenido:'B'}}));const obsolete=await store.command(approver,command('approve',id,{baseVersionId:changed.versionId,planId:p.planId}));assert.equal(obsolete.decision,'DENY');
});
test('acuse por organización y manipulación de bytes detectada',async()=>{
  const id=crypto.randomUUID(),a=await store.command(actor,command('create',id,{body}));await store.ack({user:'o1',org:'Org1'},a.eventId);await store.ack({user:'o1',org:'Org1'},a.eventId);await store.ack({user:'o2',org:'Org2'},a.eventId);
  assert.equal((await store.pool.query('SELECT count(*)::int n FROM acks WHERE event_id=$1',[a.eventId])).rows[0].n,2);
  await store.pool.query('UPDATE versions SET bytes=$2 WHERE id=$1',[a.versionId,Buffer.from('manipulación de laboratorio')]);assert.equal((await store.detail(a.eventId)).local,'MISMATCH');
  await store.systemQuery('UPDATE versions SET bytes=$2 WHERE id=$1',[a.versionId,require('../src/domain.cjs').content(body)]);
});
test('cursor durable no pierde commits y lease vencido recupera outbox (adaptador simulado)',async()=>{
  await store.drainCaptures(); // Incluye ataques del caso anterior antes de fijar la ventana del cursor.
  const initial=(await store.pool.query('SELECT cursor FROM feed_head WHERE id=1')).rows[0].cursor;
  const all=await Promise.all(Array.from({length:5},()=>store.command(actor,command('create',crypto.randomUUID(),{body}))));const feed=await store.events(initial);assert.equal(feed.length,5);assert.equal(new Set(feed.map(e=>e.id)).size,5);
  const map=new Map(),ledger={read:async id=>map.get(id)??null,register:async e=>{const a={recordHash:e.hash,schema:'MAH-AFJ-CANON-1',txId:'MOCK-'+e.id};map.set(e.id,a);return a;}};
  await store.systemQuery("UPDATE outbox SET state='PROCESSING',lease_until=now()-interval '1 second' WHERE event_id=$1",[all[0].eventId]);
  const worker=new Worker(store,ledger);for(let n=0;n<60;n++){if(!await worker.once())break;}
  const states=(await store.pool.query('SELECT state FROM outbox WHERE event_id=ANY($1::uuid[])',[all.map(e=>e.eventId)])).rows;assert.ok(states.every(s=>s.state==='CONFIRMED'));
});
test('timeout tras envío: consulta antes de reintento sin doble registro (adaptador simulado)',async()=>{
  const saved=await store.command(actor,command('create',crypto.randomUUID(),{body}));const map=new Map();let registrations=0;
  const ledger={read:async id=>map.get(id)??null,register:async e=>{registrations++;map.set(e.id,{recordHash:e.hash,schema:'MAH-AFJ-CANON-1',txId:'MOCK-RECOVERED'});throw new Error('TRANSPORT_TIMEOUT');}};
  const w=new Worker(store,ledger);await w.once();let row=(await store.pool.query('SELECT state FROM outbox WHERE event_id=$1',[saved.eventId])).rows[0];assert.equal(row.state,'UNKNOWN');
  await store.systemQuery('UPDATE outbox SET next_attempt=now() WHERE event_id=$1',[saved.eventId]);await w.once();row=(await store.pool.query('SELECT state FROM outbox WHERE event_id=$1',[saved.eventId])).rows[0];assert.equal(row.state,'CONFIRMED');assert.equal(registrations,1);
});
test('hash remoto conflictivo: cuarentena; no declarar confirmación (adaptador simulado)',async()=>{
  const saved=await store.command(actor,command('create',crypto.randomUUID(),{body}));const ledger={read:async()=>({recordHash:'f'.repeat(64),schema:'MAH-AFJ-CANON-1',txId:'MOCK-BAD'}),register:async()=>{throw new Error('no debe registrar');}};
  await new Worker(store,ledger).once();assert.equal((await store.pool.query('SELECT state FROM outbox WHERE event_id=$1',[saved.eventId])).rows[0].state,'QUARANTINED');
});
test('fencing: trabajador con lease antigua no sobrescribe confirmación posterior',async()=>{
  const saved=await store.command(actor,command('create',crypto.randomUUID(),{body}));const map=new Map();let started,release;
  const entered=new Promise(r=>started=r),blocked=new Promise(r=>release=r);
  const old={read:async id=>map.get(id)??null,register:async()=>{started();await blocked;throw new Error('TIMEOUT_OLD_WORKER');}};
  const fresh={read:async id=>map.get(id)??null,register:async e=>{const a={recordHash:e.hash,schema:'MAH-AFJ-CANON-1',txId:'MOCK-NEW-LEASE'};map.set(e.id,a);return a;}};
  const pending=new Worker(store,old).once();await entered;
  await store.systemQuery("UPDATE outbox SET lease_until=now()-interval '1 second' WHERE event_id=$1",[saved.eventId]);await new Worker(store,fresh).once();release();await pending;
  const row=(await store.pool.query('SELECT state,tx_id FROM outbox WHERE event_id=$1',[saved.eventId])).rows[0];assert.equal(row.state,'CONFIRMED');assert.equal(row.tx_id,'MOCK-NEW-LEASE');
});
