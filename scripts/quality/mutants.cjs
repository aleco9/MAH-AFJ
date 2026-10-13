'use strict';
module.exports=[
 {id:'M01',scenario:'AC01',file:'src/store.cjs',from:'protectedDateChanges(before.body,input.body).length>0',to:'protectedDateChanges(before.body,input.body).length<0'},
 {id:'M02',scenario:'AC02',file:'src/store.cjs',from:"if(input.action==='change' && doc.state==='FINALIZADO')",to:"if(input.action==='change' && false)"},
 {id:'M03',scenario:'AC03',file:'src/store.cjs',from:'doc.head_hash===latest.hash',to:'true'},
 {id:'M04',scenario:'AC04',file:'src/schema.sql',from:"origin_value:=COALESCE(NULLIF(current_setting('mahafj.origin',true),''),'SQL');",to:"origin_value:='WORKER';"},
 {id:'M05',scenario:'AC05',file:'src/store.cjs',from:'if(error.auditLogged)return;',to:'return;'},
 {id:'M06',scenario:'AC06',file:'src/domain.cjs',from:'if(target && target.hash!==r.fileHash)',to:'if(false)'},
 {id:'M07',scenario:'AC07',file:'src/domain.cjs',from:'if(sha(event.canonical)!==event.hash || canonical(event.record)!==event.canonical)',to:'if(false)'},
 {id:'M08',scenario:'AC08',file:'src/store.cjs',from:"await c.query('INSERT INTO outbox(event_id,queue_cursor) VALUES($1,$2)',[id,cursor]);\n      await c.query('UPDATE documents SET head_hash=$2 WHERE id=$1',[doc.id,hash]);",to:"/* Mutante: outbox omitido */\n      await c.query('UPDATE documents SET head_hash=$2 WHERE id=$1',[doc.id,hash]);"}
];
