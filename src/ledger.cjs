'use strict';
const fs=require('node:fs/promises');const path=require('node:path');const crypto=require('node:crypto');
const grpc=require('@grpc/grpc-js');const {connect,signers,hash}=require('@hyperledger/fabric-gateway');
async function openLedger(root,n){
  const domain=`org${n}.sdd.example.com`,peer=`peer0.${domain}`,base=path.join(root,domain),msp=path.join(base,`users/User1@${domain}/msp`);
  const keys=await fs.readdir(path.join(msp,'keystore')),certs=await fs.readdir(path.join(msp,'signcerts'));
  if(keys.length!==1||certs.length!==1)throw new Error('IDENTIDAD_AMBIGUA');
  const [tls,cert,key]=await Promise.all([path.join(base,`peers/${peer}/tls/ca.crt`),path.join(msp,'signcerts',certs[0]),path.join(msp,'keystore',keys[0])].map(p=>fs.readFile(p)));
  const client=new grpc.Client(`localhost:${n===1?17051:19051}`,grpc.credentials.createSsl(tls),{'grpc.ssl_target_name_override':peer});
  const gateway=connect({client,identity:{mspId:`Org${n}MSP`,credentials:cert},signer:signers.newPrivateKeySigner(crypto.createPrivateKey(key)),hash:hash.sha256,
    evaluateOptions:()=>({deadline:Date.now()+10000}),endorseOptions:()=>({deadline:Date.now()+15000}),submitOptions:()=>({deadline:Date.now()+15000}),commitStatusOptions:()=>({deadline:Date.now()+20000})});
  const contract=gateway.getNetwork('sddjudicial').getContract('sdd-evidence');
  // Explicit target organization prevents presenting a fallback peer as own-domain verification.
  async function read(id){const r=await contract.newProposal('GetEvidence',{arguments:[id],endorsingOrganizations:[`Org${n}MSP`]}).evaluate();const s=Buffer.from(r).toString();return s?JSON.parse(s):null;}
  return {org:`Org${n}`,read,async register(e){return JSON.parse(Buffer.from(await contract.submitTransaction('RegisterEvidence',e.id,e.hash,'MAH-AFJ-CANON-1')).toString());},close(){gateway.close();client.close();}};
}
class Worker {
  constructor(store,ledger){this.store=store;this.ledger=ledger;this.running=false;}
  async once(){
    const c=await this.store.pool.connect();let row;const lease=crypto.randomUUID();
    try{await c.query('BEGIN');if(this.store.captureContext)await this.store.captureContext(c,'WORKER');row=(await c.query("SELECT o.event_id,e.hash FROM outbox o JOIN events e ON e.id=o.event_id WHERE o.state IN ('PENDING','RETRY','UNKNOWN','PROCESSING') AND ((o.state IN ('PENDING','RETRY','UNKNOWN') AND o.next_attempt<=now()) OR (o.state='PROCESSING' AND o.lease_until<now())) ORDER BY o.queue_cursor FOR UPDATE OF o SKIP LOCKED LIMIT 1")).rows[0];
      if(row)await c.query("UPDATE outbox SET state='PROCESSING',attempts=attempts+1,lease_until=now()+interval '90 seconds',lease_token=$2 WHERE event_id=$1",[row.event_id,lease]);await c.query('COMMIT');
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
    if(!row)return false;
    try{
      let anchor=await this.ledger.read(row.event_id);
      if(!anchor)anchor=await this.ledger.register({id:row.event_id,hash:row.hash});
      const remote=await this.ledger.read(row.event_id);
      if(!remote || remote.recordHash!==row.hash || remote.schema!=='MAH-AFJ-CANON-1')throw new Error('EVIDENCE_CONFLICT');
      await (this.store.systemQuery?.bind(this.store)??this.store.pool.query.bind(this.store.pool))("UPDATE outbox SET state='CONFIRMED',tx_id=$2,lease_until=NULL,error=NULL WHERE event_id=$1 AND lease_token=$3",[row.event_id,remote.txId,lease]);
    }catch(e){const conflict=/EVIDENCE_CONFLICT/.test(e.message);const wait=2+Math.random();await (this.store.systemQuery?.bind(this.store)??this.store.pool.query.bind(this.store.pool))("UPDATE outbox SET state=$2,error=$3,next_attempt=now()+make_interval(secs => LEAST(60,power(2,LEAST(attempts,5)))+$5::double precision),lease_until=NULL WHERE event_id=$1 AND lease_token=$4",[row.event_id,conflict?'QUARANTINED':'UNKNOWN',conflict?'EVIDENCE_CONFLICT':'FABRIC_NO_CONFIRMADO',lease,wait]);}
    this.store.bus.emit('anchor',row.event_id);return true;
  }
  start(concurrency=4){if(!Number.isInteger(concurrency)||concurrency<1||concurrency>16)throw new Error('CONCURRENCIA_INVALIDA');this.running=true;this.loop=Promise.all(Array.from({length:concurrency},async()=>{while(this.running){try{await this.once();}catch{this.lastError='WORKER_PERSISTENCE_ERROR';}await new Promise(r=>setTimeout(r,100));}}));}
  async stop(){this.running=false;await this.loop;}
}
module.exports={openLedger,Worker};
