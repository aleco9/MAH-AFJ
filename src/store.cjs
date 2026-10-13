'use strict';
const {Pool}=require('pg');const fs=require('node:fs');const crypto=require('node:crypto');const {EventEmitter}=require('node:events');
const {performance}=require('node:perf_hooks');
const {sha,canonical,content,diffs,makeRecord,verifyEvent,protectedDateChanges,Rejection}=require('./domain.cjs');
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
class Store {
  constructor(config){this.pool=new Pool({connectionString:config.database,max:12});this.bus=new EventEmitter();}
  async init(){await this.pool.query(fs.readFileSync(__dirname+'/schema.sql','utf8'));clearInterval(this.captureTimer);this.captureTimer=setInterval(()=>this.drainCaptures().catch(()=>{this.captureError='CAPTURA_NO_DISPONIBLE';}),100);this.captureTimer.unref();await this.drainCaptures();}
  async close(){clearInterval(this.captureTimer);if(this.captureRun)await this.captureRun;await this.pool.end();}
  async captureContext(client,origin,actor='SERVICIO_LOCAL'){await client.query("SELECT set_config('mahafj.origin',$1,true),set_config('mahafj.actor',$2,true)",[origin,actor]);}
  async systemQuery(sql,args){const c=await this.pool.connect();try{await c.query('BEGIN');await this.captureContext(c,'WORKER');const result=await c.query(sql,args);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
  async securityEvent(c,{action,actor,evidence,reason}){
    const id=crypto.randomUUID();const cursor=(await c.query('UPDATE feed_head SET cursor=cursor+1 WHERE id=1 RETURNING cursor')).rows[0].cursor;
    const previous=(await c.query('SELECT hash FROM events WHERE doc_id IS NULL ORDER BY cursor DESC LIMIT 1')).rows[0]?.hash??null;
    const record=makeRecord({eventId:id,docId:null,action,actor,decision:action==='RECHAZO_SEGURIDAD'?'DENY':'DETECTED',reason,previous});record.evidence=evidence;record.context.policy='LAB-SECURITY-002';
    const bytes=canonical(record),hash=sha(bytes);await c.query('INSERT INTO events(id,cursor,doc_id,record,canonical,hash) VALUES($1,$2,NULL,$3,$4,$5)',[id,cursor,record,bytes,hash]);await c.query('INSERT INTO outbox(event_id,queue_cursor) VALUES($1,$2)',[id,cursor]);return {eventId:id,cursor,docId:null,anchorState:'PENDING'};
  }
  async recordRejection(actor,input,error){
    if(error.auditLogged)return;
    const evidence={attemptedAction:typeof input?.action==='string'?input.action.slice(0,100):null,targetDocument:uuid(input?.docId)?input.docId:null,commandId:uuid(input?.commandId)?input.commandId:null,error:error.code??'ENTRADA_INVALIDA'};
    const safe={user:typeof actor?.user==='string'?actor.user.slice(0,100):'NO_IDENTIFICADO',role:typeof actor?.role==='string'?actor.role.slice(0,100):'NO_AUTENTICADO',org:actor?.org??null,identitySource:actor?.identitySource??'SYNTHETIC_SERVICE_ASSERTION'};
    const c=await this.pool.connect();let result;try{await c.query('BEGIN');await this.captureContext(c,'SECURITY');result=await this.securityEvent(c,{action:'RECHAZO_SEGURIDAD',actor:safe,evidence,reason:evidence.error});await c.query('COMMIT');error.auditLogged=true;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}this.bus.emit('event',result);
  }
  drainCaptures(){
    if(this.captureRun)return this.captureRun;
    this.captureRun=this.consumeCaptures().catch(e=>{this.captureError='CAPTURA_NO_DISPONIBLE';throw e;}).finally(()=>{this.captureRun=null;});return this.captureRun;
  }
  async consumeCaptures(){
    const c=await this.pool.connect();const notices=[];
    try{await c.query('BEGIN');await this.captureContext(c,'CAPTURE');
      // Serialize consumers in this schema; do not SKIP LOCKED later captures out of order.
      const locked=(await c.query("SELECT pg_try_advisory_xact_lock(hashtextextended(current_schema()||':capture',0)) AS locked")).rows[0].locked;
      if(!locked){await c.query('COMMIT');return;}
      const rows=(await c.query("SELECT * FROM audit_changes WHERE origin='SQL' AND event_id IS NULL ORDER BY id LIMIT 100 FOR UPDATE")).rows;
      for(const row of rows){const evidence={captureId:String(row.id),table:row.table_name,operation:row.operation,old:row.old_row,new:row.new_row,transactionId:row.transaction_id,observedAt:row.observed_at.toISOString(),databaseUser:row.db_user,databaseSessionUser:row.db_session_user,claimedActor:row.claimed_actor};
        const result=await this.securityEvent(c,{action:'SQL_DETECTADO',actor:{user:'SQL:'+row.db_session_user,role:'CUENTA_TECNICA_DB',identitySource:'POSTGRES_SESSION_ACCOUNT'},evidence,reason:'CAMBIO_SQL_FUERA_DEL_FLUJO'});
        await c.query('UPDATE audit_changes SET event_id=$2 WHERE id=$1',[row.id,result.eventId]);notices.push(result);
      }await c.query('COMMIT');this.captureError=null;
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
    for(const n of notices)this.bus.emit('event',n);
  }
  async command(actor,input){
    const allowed=['create','change','plan','approve','execute','finalize'];
    try{
      if(!actor || !['OPERADOR','APROBADOR'].includes(actor.role))throw new Rejection('SIN_PERMISO',403);
      if(!input || !allowed.includes(input.action) || !uuid(input.commandId) || !uuid(input.docId))throw new Rejection('COMANDO_INVALIDO',422);
      if(input.action==='approve'?actor.role!=='APROBADOR':actor.role!=='OPERADOR')throw new Rejection('SIN_PERMISO',403);
      if(['create','change','plan'].includes(input.action))content(input.body);
    }catch(e){await this.recordRejection(actor,input,e);throw e;}
    let digest;try{digest=sha(canonical(input));}catch(e){await this.recordRejection(actor,input,e);throw e;}const c=await this.pool.connect();let result,released=false;
    try{
      await c.query('BEGIN');await this.captureContext(c,'APPLICATION',actor.user);
      // Serialize retries of the same actor/command without serializing unrelated commands.
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[actor.user+':'+input.commandId]);
      const retry=(await c.query('SELECT digest,result FROM commands WHERE actor=$1 AND id=$2',[actor.user,input.commandId])).rows[0];
      if(retry){if(retry.digest!==digest)throw new Rejection('ID_CON_CONTENIDO_DISTINTO');await c.query('COMMIT');return retry.result;}
      if(input.action==='create')await c.query('INSERT INTO documents(id) VALUES($1) ON CONFLICT DO NOTHING',[input.docId]);
      const doc=(await c.query('SELECT * FROM documents WHERE id=$1 FOR UPDATE',[input.docId])).rows[0];
      if(!doc)throw new Rejection('DOCUMENTO_NO_EXISTE',404);
      const before=doc.version_id?(await c.query('SELECT * FROM versions WHERE id=$1',[doc.version_id])).rows[0]:null;
      let after=before,plan=null,decision='ALLOW',reason='OPERACION_PERMITIDA',action=input.action.toUpperCase();
      const deny=why=>{decision='DENY';reason=why;action='RECHAZADO';};
      if(input.action==='create' && before)deny('DOCUMENTO_EXISTENTE');
      if(input.action!=='create' && input.baseVersionId!==doc.version_id)deny('BASE_OBSOLETA');
      if(input.action==='change' && doc.state==='FINALIZADO')deny('VERSION_FINAL_PRESERVADA');
      if(input.action==='change' && before && protectedDateChanges(before.body,input.body).length>0)deny('FECHA_REQUIERE_AUTORIZACION');
      if(input.action==='finalize' && doc.state==='FINALIZADO')deny('YA_FINALIZADO');
      if(['approve','execute'].includes(input.action)){
        if(!uuid(input.planId))throw new Rejection('SOLICITUD_INVALIDA',422);
        plan=(await c.query('SELECT * FROM plans WHERE id=$1 AND doc_id=$2 FOR UPDATE',[input.planId,input.docId])).rows[0];
        if(!plan)throw new Rejection('SOLICITUD_NO_EXISTE',404);
        if(plan.base_id!==doc.version_id)deny('BASE_OBSOLETA');
        if(input.action==='approve'&&(plan.requester===actor.user || plan.state!=='PLANIFICADO'))deny('APROBACION_INVALIDA');
        if(input.action==='execute'&&(plan.requester!==actor.user || plan.state!=='APROBADO' || sha(content(plan.body))!==plan.hash))deny('EJECUCION_INVALIDA');
        if(doc.state==='FINALIZADO'&&!plan.rectification)deny('RECTIFICACION_REQUERIDA');
      }
      if(input.action==='plan' && (!before || typeof input.reason!=='string' || !input.reason.trim() || input.reason.length>1000))throw new Rejection('MOTIVO_REQUERIDO',422);
      if(input.action==='plan' && doc.state==='FINALIZADO'&&!input.rectification)deny('RECTIFICACION_REQUERIDA');
      if(decision==='ALLOW'){
        if(['create','change','execute'].includes(input.action)){
          const body=input.action==='execute'?plan.body:input.body;const bytes=content(body);
          if(input.action==='change' && before.hash===sha(bytes)){result={unchanged:true,versionId:before.id};await c.query('INSERT INTO commands VALUES($1,$2,$3,$4)',[actor.user,input.commandId,digest,result]);await c.query('COMMIT');return result;}
          const number=before?before.number+1:1;after={id:crypto.randomUUID(),body,bytes,hash:sha(bytes)};
          await c.query('INSERT INTO versions VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[after.id,doc.id,number,bytes,body,after.hash,before?.id??null,plan?.rectification?before.id:null]);
          await c.query('UPDATE documents SET version_id=$2 WHERE id=$1',[doc.id,after.id]);
          if(plan)await c.query("UPDATE plans SET state='REALIZADO' WHERE id=$1",[plan.id]);
        }
        if(input.action==='plan'){
          plan={id:crypto.randomUUID()};await c.query('INSERT INTO plans VALUES($1,$2,$3,$4,$5,$6,NULL,$7,$8,$9)',[plan.id,doc.id,doc.version_id,input.body,sha(content(input.body)),actor.user,input.reason,'PLANIFICADO',!!input.rectification]);action='PLANIFICADO';
        }
        if(input.action==='approve'){await c.query("UPDATE plans SET state='APROBADO',approver=$2 WHERE id=$1",[plan.id,actor.user]);action='APROBADO';}
        if(input.action==='execute')action='REALIZADO';
        if(input.action==='finalize'){await c.query("UPDATE documents SET state='FINALIZADO' WHERE id=$1",[doc.id]);action='FINALIZADO';}
      }
      const proposal=['approve','execute'].includes(input.action)?plan?.body:input.body;
      const id=crypto.randomUUID();const r=makeRecord({eventId:id,docId:doc.id,action,before,after,actor,decision,reason:input.reason??reason,previous:doc.head_hash,proposal});
      r.context.ruleReason=reason;r.context.datePolicyVersion=2;r.planId=plan?.id??null;
      r.proposalStored=!!proposal;
      const bytes=canonical(r),hash=sha(bytes);
      const cursor=(await c.query('UPDATE feed_head SET cursor=cursor+1 WHERE id=1 RETURNING cursor')).rows[0].cursor;
      await c.query('INSERT INTO events(id,cursor,doc_id,record,canonical,hash,proposal) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,cursor,doc.id,r,bytes,hash,proposal??null]);
      await c.query('INSERT INTO outbox(event_id,queue_cursor) VALUES($1,$2)',[id,cursor]);
      await c.query('UPDATE documents SET head_hash=$2 WHERE id=$1',[doc.id,hash]);
      result={eventId:id,cursor,docId:doc.id,versionId:after?.id??null,planId:plan?.id??null,decision,reason,anchorState:'PENDING'};
      await c.query('INSERT INTO commands VALUES($1,$2,$3,$4)',[actor.user,input.commandId,digest,result]);
      await c.query('COMMIT');this.bus.emit('event',{...result,commitMonotonic:performance.now()});return result;
    }catch(e){await c.query('ROLLBACK');c.release();released=true;if(e instanceof Rejection)await this.recordRejection(actor,input,e);throw e;}finally{if(!released)c.release();}
  }
  async events(after=0){return (await this.pool.query('SELECT e.id,e.cursor,e.doc_id,e.record,o.state AS anchor_state FROM events e JOIN outbox o ON o.event_id=e.id WHERE cursor>$1 ORDER BY cursor LIMIT 100',[after])).rows;}
  async document(id){if(!uuid(id))throw new Rejection('ID_INVALIDO',422);const docs=(await this.pool.query('SELECT * FROM documents WHERE id=$1',[id])).rows;if(!docs.length)throw new Rejection('NO_EXISTE',404);return {...docs[0],versions:(await this.pool.query('SELECT id,number,body,hash,previous_id,rectifies_id FROM versions WHERE doc_id=$1 ORDER BY number',[id])).rows,plans:(await this.pool.query('SELECT id,base_id,state,body,reason,requester,approver,rectification FROM plans WHERE doc_id=$1',[id])).rows};}
  async detail(id){
    if(!uuid(id))throw new Rejection('ID_INVALIDO',422);
    const c=await this.pool.connect();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const event=(await c.query('SELECT e.*,o.state AS anchor_state,o.tx_id FROM events e JOIN outbox o ON o.event_id=e.id WHERE e.id=$1',[id])).rows[0];if(!event)throw new Rejection('NO_EXISTE',404);
    const versions=(await c.query('SELECT * FROM versions WHERE doc_id=$1 ORDER BY number',[event.doc_id])).rows;
    const before=versions.find(v=>v.id===event.record.beforeVersion),after=versions.find(v=>v.id===event.record.afterVersion);
    let local=verifyEvent(event,versions);
    if(event.proposal && sha(content(event.proposal))!==event.record.proposalHash)local='MISMATCH';
    if(event.record.proposalStored && !event.proposal)local='MISMATCH';
    const previous=(await c.query('SELECT hash FROM events WHERE doc_id IS NOT DISTINCT FROM $1 AND cursor<$2 ORDER BY cursor DESC LIMIT 1',[event.doc_id,event.cursor])).rows[0]?.hash??null;
    if(previous!==event.record.previousHash)local='MISMATCH';
    let documentIntegrity='NOT_APPLICABLE';
    if(event.doc_id){
      const doc=(await c.query('SELECT * FROM documents WHERE id=$1',[event.doc_id])).rows[0];
      const latest=(await c.query('SELECT * FROM events WHERE doc_id=$1 ORDER BY cursor DESC LIMIT 1',[event.doc_id])).rows[0];
      const current=versions.find(v=>v.id===doc?.version_id);
      documentIntegrity=doc&&latest&&current&&current.doc_id===event.doc_id&&doc.head_hash===latest.hash&&doc.version_id===(latest.record.afterVersion??latest.record.beforeVersion)&&verifyEvent(latest,versions)==='MATCH'?'MATCH':'MISMATCH';
      if(event.record.docId!==event.doc_id||documentIntegrity==='MISMATCH')local='MISMATCH';
    }
    const security=event.record.evidence;
    const securityBefore=security?.old??null,securityAfter=security?.new??null;
    const result={...event,local,documentIntegrity,original:security?securityBefore:versions[0]?.body??null,before:security?securityBefore:before?.body??null,after:security?securityAfter:after?.body??null,differences:diffs(security?securityBefore:before?.body??null,security?securityAfter:after?.body??null),proposedDifferences:event.proposal?diffs(before?.body??null,event.proposal):[],versions:versions.map(v=>({...v,bytes:v.bytes.toString('base64')}))};await c.query('COMMIT');return result;
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }
  async ack(actor,id){if(!actor.org)throw new Rejection('SIN_PERMISO',403);if(!uuid(id))throw new Rejection('ID_INVALIDO',422);await this.pool.query('INSERT INTO acks(org,event_id,actor) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[actor.org,id,actor.user]);return {org:actor.org,eventId:id};}
  async metrics(){return {capture:{status:this.captureError??'ACTIVE',pending:(await this.pool.query("SELECT count(*)::int n FROM audit_changes WHERE origin='SQL' AND event_id IS NULL")).rows[0].n,mechanism:'TRANSACTIONAL_TRIGGER_UPDATE_DELETE',identity:'POSTGRES_SESSION_ACCOUNT'},events:(await this.pool.query('SELECT count(*)::int n FROM events')).rows[0].n,outbox:(await this.pool.query('SELECT state,count(*)::int n FROM outbox GROUP BY state')).rows};}
}
module.exports={Store};
