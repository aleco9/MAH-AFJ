'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),{EventEmitter}=require('node:events'),{Pool}=require('pg');
const cfg=require('./config.cjs'),{Worker}=require('../src/ledger.cjs');
test('cola activa ignora 10000 confirmados, reintentos futuros y leases vigentes; orden durable y recuperación',async()=>{
 const pool=new Pool({connectionString:cfg.database}),c=await pool.connect();
 try{await c.query('BEGIN');const schema='queue_'+crypto.randomBytes(6).toString('hex');await c.query('CREATE SCHEMA '+schema);await c.query('SET LOCAL search_path TO '+schema);await c.query(fs.readFileSync(__dirname+'/../src/schema.sql','utf8'));
 await c.query("INSERT INTO events(id,cursor,record,canonical,hash) SELECT gen_random_uuid(),n,'{}','{}',repeat('a',64) FROM generate_series(1,10005) n");
 await c.query("INSERT INTO outbox(event_id,queue_cursor,state) SELECT id,cursor,CASE WHEN cursor<=10000 THEN 'CONFIRMED' ELSE 'PENDING' END FROM events");
 await c.query("UPDATE outbox SET state='RETRY',next_attempt=now()+interval '1 hour' WHERE queue_cursor=10001");
 await c.query("UPDATE outbox SET state='PROCESSING',lease_until=now()+interval '1 hour' WHERE queue_cursor=10002");
 await c.query("UPDATE outbox SET state='PROCESSING',lease_until=now()-interval '1 second' WHERE queue_cursor=10003");await c.query('ANALYZE outbox');await c.query('ANALYZE events');
 const seen=[];const store={pool:{connect:async()=>({query:(...a)=>c.query(...a),release(){}}),query:(...a)=>c.query(...a)},bus:new EventEmitter()};
 // once() uses BEGIN/COMMIT: nested transaction would commit schema; intercept its transaction control.
 store.pool.connect=async()=>({query:(sql,...a)=>['BEGIN','COMMIT','ROLLBACK'].includes(sql)?Promise.resolve({rows:[]}):c.query(sql,...a),release(){}});
 const anchors=new Map(),ledger={read:async id=>anchors.get(id),register:async e=>{seen.push(e.id);const a={recordHash:e.hash,schema:'MAH-AFJ-CANON-1',txId:e.id};anchors.set(e.id,a);return a;}};
 const w=new Worker(store,ledger);assert.equal(await w.once(),true);assert.equal(await w.once(),true);assert.equal(await w.once(),true);assert.equal(await w.once(),false);
 const cursors=(await c.query('SELECT cursor FROM events WHERE id=ANY($1::uuid[]) ORDER BY cursor',[seen])).rows.map(r=>Number(r.cursor));assert.deepEqual(cursors,[10003,10004,10005]);
 const states=(await c.query('SELECT queue_cursor,state FROM outbox WHERE queue_cursor>10000 ORDER BY queue_cursor')).rows;assert.deepEqual(states.map(r=>r.state),['RETRY','PROCESSING','CONFIRMED','CONFIRMED','CONFIRMED']);
 // Migration also populates legacy cursors without changing event order or states.
 await c.query('ALTER TABLE outbox ALTER COLUMN queue_cursor DROP NOT NULL');await c.query('UPDATE outbox SET queue_cursor=NULL');await c.query(fs.readFileSync(__dirname+'/../src/schema.sql','utf8'));assert.equal((await c.query('SELECT count(*)::int n FROM outbox o JOIN events e ON o.event_id=e.id WHERE o.queue_cursor IS DISTINCT FROM e.cursor')).rows[0].n,0);
 }finally{await c.query('ROLLBACK');c.release();await pool.end();}
});
