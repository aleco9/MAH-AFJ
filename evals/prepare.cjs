'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{project}=require('../scripts/quality/environment.cjs'),{files}=require('./grader.cjs');
const id=process.argv[2],cases=require('./cases.json').cases,c=cases.find(c=>c.id===id);if(!c)throw Error('EVAL_CASE_UNKNOWN');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mah-agent-eval-')),candidate=dir+'/candidate';fs.mkdirSync(candidate);
for(const folder of ['src','web','test','specs'])fs.cpSync(project+'/'+folder,candidate+'/'+folder,{recursive:true});
const m=require('../scripts/quality/mutants.cjs').find(m=>m.id===c.seedMutation),file=candidate+'/'+m.file,old=fs.readFileSync(file,'utf8');if(old.split(m.from).length!==2)throw Error('EVAL_SEED_INVALID');fs.writeFileSync(file,old.replace(m.from,m.to));
const initial=files(candidate),control=dir+'/control';fs.mkdirSync(control,{mode:0o700});fs.writeFileSync(control+'/task.json',JSON.stringify({...c,initial,candidate,model:'NO_EJECUTADO',evaluatorHash:files(project+'/evals')},null,2));
fs.writeFileSync(candidate+'/REQUEST.md',c.prompt+'\n');console.log(JSON.stringify({candidate,control,limits:'Misma cuenta OS; aislar con permisos/sandbox del agente externo antes de ejecutar. No se invoca modelo.'}));
