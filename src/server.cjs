'use strict';
const http=require('node:http');const fs=require('node:fs');const crypto=require('node:crypto');
const {Store}=require('./store.cjs');const {openLedger,Worker}=require('./ledger.cjs');const {Rejection,parseJSON}=require('./domain.cjs');
const users={juez:{role:'OPERADOR'},secretario:{role:'OPERADOR'},auxiliar:{role:'OPERADOR'},aprobador:{role:'APROBADOR'},org1:{role:'FISCALIZADOR',org:'Org1'},org2:{role:'FISCALIZADOR',org:'Org2'}};
function application(store,ledgers,cfg){
  const sessions=new Map(),servers=[],attempts=new Map();let stopping=false;
  async function listen(port,site){
    const cookieName='sdd_'+site;
    const server=http.createServer(async(req,res)=>{
      const origin=`http://127.0.0.1:${server.address().port}`;
      const url=new URL(req.url,origin);
      const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
      res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Cache-Control','no-store');
      res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'");
      let auditActor=null,auditInput={action:req.method+' '+url.pathname};
      try{
        if(req.headers.host!==new URL(origin).host)throw new Rejection('HOST_INVALIDO',403);
        if(req.method==='GET'&&url.pathname==='/favicon.ico'){res.writeHead(204);return res.end();}
        if(req.method==='GET' && ['/','/app.js','/style.css'].includes(url.pathname)){
          const name={'/':'index.html','/app.js':'app.js','/style.css':'style.css'}[url.pathname];res.setHeader('Content-Type',{'/':'text/html; charset=utf-8','/app.js':'text/javascript; charset=utf-8','/style.css':'text/css; charset=utf-8'}[url.pathname]);return res.end(fs.readFileSync(__dirname+'/../web/'+name));
        }
        if(req.method==='GET'&&url.pathname==='/api/site'){const sid=(req.headers.cookie??'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);const existing=sessions.get(sid);return send(200,{site,synthetic:true,authenticated:!!existing&&existing.expires>Date.now()});}
        const earlySid=(req.headers.cookie??'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
        const earlyActor=sessions.get(earlySid);if(earlyActor?.site===site&&earlyActor.expires>Date.now())auditActor=earlyActor;
        let body={};
        if(req.method==='POST'){
          if(req.headers.origin!==origin)throw new Rejection('ORIGEN_INVALIDO',403);
          let size=0,chunks=[];for await(const part of req){size+=part.length;if(size>1100000)throw new Rejection('TAMANO_EXCEDIDO',413);chunks.push(part);}
          try{body=parseJSON(Buffer.concat(chunks).toString()||'{}');}catch(e){if(e instanceof Rejection)throw e;throw new Rejection('JSON_INVALIDO',422);}
          if(!body || typeof body!=='object'||Array.isArray(body))throw new Rejection('JSON_INVALIDO',422);
        }
        if(url.pathname==='/api/command')auditInput=body;
        if(url.pathname==='/api/login'&&req.method==='POST'){
          const bucket=req.socket.remoteAddress+site,now=Date.now();const previous=attempts.get(bucket);const a=previous&&now-previous.start<60000?previous:{start:now,n:0};a.n++;attempts.set(bucket,a);if(a.n>20)throw new Rejection('DEMASIADOS_INTENTOS',429);
          const u=Object.hasOwn(users,body.user)?users[body.user]:null;
          const expected=crypto.scryptSync(cfg.password,'sdd-laboratorio',32),received=crypto.scryptSync(String(body.password??'').slice(0,1000),'sdd-laboratorio',32);
          if(!u || !crypto.timingSafeEqual(expected,received) || (site==='operador'?!!u.org:u.org!==site))throw new Rejection('ACCESO_DENEGADO',401);
          const id=crypto.randomBytes(32).toString('hex'),actor={user:body.user,...u,site,identitySource:'SYNTHETIC_AUTHENTICATED_SESSION',csrf:crypto.randomBytes(24).toString('hex'),expires:now+8*3600000};sessions.set(id,actor);
          res.setHeader('Set-Cookie',`${cookieName}=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800`);return send(200,{user:actor.user,role:actor.role,org:actor.org??null,csrf:actor.csrf});
        }
        const sid=(req.headers.cookie??'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
        const actor=sessions.get(sid);if(!actor||actor.site!==site||actor.expires<Date.now())throw new Rejection('SESION_REQUERIDA',401);
        if(req.method==='POST'&&req.headers['x-csrf-token']!==actor.csrf)throw new Rejection('CSRF_INVALIDO',403);
        if(url.pathname==='/api/me'&&req.method==='GET')return send(200,{user:actor.user,role:actor.role,org:actor.org??null,csrf:actor.csrf});
        if(url.pathname==='/api/logout'&&req.method==='POST'){sessions.delete(sid);res.setHeader('Set-Cookie',`${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);return send(200,{ok:true});}
        if(url.pathname==='/api/command'&&req.method==='POST')return send(200,await store.command(actor,body));
        if(url.pathname==='/api/ack'&&req.method==='POST')return send(200,await store.ack(actor,body.eventId));
        if(url.pathname==='/api/events'&&req.method==='GET'){
          const after=url.searchParams.get('after')??'0';if(!/^\d+$/.test(after)||!Number.isSafeInteger(Number(after)))throw new Rejection('CURSOR_INVALIDO',422);return send(200,await store.events(after));
        }
        if(url.pathname==='/api/documents'&&req.method==='GET')return send(200,(await store.pool.query('SELECT d.*, v.body, v.number AS version_number FROM documents d LEFT JOIN versions v ON v.id=d.version_id ORDER BY d.id LIMIT 100')).rows);
        if(url.pathname==='/api/document'&&req.method==='GET')return send(200,await store.document(url.searchParams.get('id')));
        if(['/api/event','/api/evidence-export'].includes(url.pathname)&&req.method==='GET'){
          const detail=await store.detail(url.searchParams.get('id'));let remote='PENDING';let reference=null;
          if(actor.org&&ledgers[actor.org])try{reference=await ledgers[actor.org].read(detail.id);remote=reference?(reference.recordHash===detail.hash&&detail.local==='MATCH'?'MATCH':'MISMATCH'):'ABSENT';}catch{remote='ERROR';}
          if(detail.local==='MISMATCH')remote='MISMATCH';
          return send(200,{...detail,remote,reference,verificationOrg:actor.org??null,coverage:'API sintética y captura transaccional SQL UPDATE/DELETE; sin CDC/WAL ni resistencia a superusuario',identity:'Cuenta de laboratorio; no identidad judicial'});
        }
        if(url.pathname==='/api/metrics'&&req.method==='GET')return send(200,await store.metrics());
        if(url.pathname==='/api/stream'&&req.method==='GET'){
          let cursor=Number(url.searchParams.get('after')??req.headers['last-event-id']??0);
          if(!Number.isSafeInteger(cursor)||cursor<0)throw new Rejection('CURSOR_INVALIDO',422);
          res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive'});res.write(': conectado\n\n');let busy=false,closed=false;
          const pump=async()=>{if(busy||closed)return;busy=true;try{
            if(!sessions.has(sid)||actor.expires<Date.now()){res.end();return;}
            for(const e of await store.events(cursor)){if(res.writableLength>65536){res.end();return;}res.write(`id: ${e.cursor}\ndata: ${JSON.stringify({id:e.id,cursor:e.cursor,action:e.record.action,anchorState:e.anchor_state})}\n\n`);cursor=Number(e.cursor);}
          }catch{res.end();}finally{busy=false;}};
          const anchor=id=>{if(!closed && res.writableLength<65536)res.write(`event: anchor\ndata: ${JSON.stringify({id})}\n\n`);};
          store.bus.on('event',pump);store.bus.on('anchor',anchor);const timer=setInterval(pump,500);const heartbeat=setInterval(()=>{if(!closed)res.write(': latido\n\n');},15000);pump();
          req.on('close',()=>{closed=true;clearInterval(timer);clearInterval(heartbeat);store.bus.off('event',pump);store.bus.off('anchor',anchor);});return;
        }
        return send(404,{error:'RUTA_NO_EXISTE'});
      }catch(e){if(e instanceof Rejection&&req.method==='POST'&&store.recordRejection&&!e.auditLogged){try{await store.recordRejection(auditActor,auditInput,e);}catch{e=new Rejection('AUDITORIA_NO_DISPONIBLE',503);}}if(!res.headersSent)send(e instanceof Rejection?e.status:503,{error:e instanceof Rejection?e.code:'OPERACION_NO_DISPONIBLE'});else res.end();}
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});servers.push(server);return server.address().port;
  }
  return {listen,async close(){stopping=true;await Promise.all(servers.map(s=>new Promise(r=>{s.close(r);s.closeAllConnections();})));},sessions};
}
async function main(){
  const cfg=require('./config.cjs').load(),store=new Store(cfg);await store.init();const ledgers={};
  for(let n=1;n<=2;n++)try{ledgers['Org'+n]=await openLedger(cfg.fabricRoot,n);}catch{console.log(`Org${n}: Fabric no disponible; anclajes permanecen pendientes.`);}
  const app=application(store,ledgers,cfg);for(const [p,s] of [[4200,'operador'],[4201,'Org1'],[4202,'Org2']]){await app.listen(p,s);console.log(`Interfaz ${s}: http://127.0.0.1:${p}/`);}
  let worker;if(ledgers.Org1){worker=new Worker(store,ledgers.Org1);worker.start(cfg.workerConcurrency??4);}
  const stop=async()=>{await app.close();if(worker)await worker.stop();for(const l of Object.values(ledgers))l.close();await store.close();process.exit(0);};process.once('SIGTERM',stop);process.once('SIGINT',stop);
}
if(require.main===module)main().catch(()=>{console.error('Inicio incompleto: revisar entorno local sin imprimir credenciales.');process.exitCode=1;});
module.exports={application};
