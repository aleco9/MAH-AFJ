'use strict';
const fs=require('node:fs'),path=require('node:path'),{project}=require('./environment.cjs'),{hash}=require('./contracts.cjs');
const flag=process.argv.indexOf('--reason'),reason=flag<0?'':process.argv[flag+1];if(!reason?.trim()){console.error('BASELINE_REQUIRES_REVIEW_REASON');process.exitCode=1;}else{
 const file=project+'/specs/criteria-baseline.json',previous=fs.existsSync(file)?fs.readFileSync(file):null,files={};
 for(const folder of ['test','specs','scripts/quality','evals','.github']){function visit(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,entry.name);if(entry.isDirectory())visit(f);else if(entry.isFile()&&f!==file)files[path.relative(project,f)]=hash(fs.readFileSync(f));}}if(fs.existsSync(project+'/'+folder))visit(project+'/'+folder);}
 for(const name of ['package.json','package-lock.json','scripts/ci.sh'])files[name]=hash(fs.readFileSync(project+'/'+name));
 const record={version:1,reviewReason:reason,recordedAt:new Date().toISOString(),previousBaselineHash:previous?hash(previous):null,files};
 const changes=previous?Object.keys({...JSON.parse(previous).files,...files}).filter(f=>JSON.parse(previous).files[f]!==files[f]):Object.keys(files);
 const review=path.resolve(project,'../../quality_reports/decisions/baseline-review-'+Date.now()+'.json');fs.writeFileSync(review,JSON.stringify({reason,previousBaselineHash:record.previousBaselineHash,changedFiles:changes,fileChanges:changes.map(name=>({name,before:previous?JSON.parse(previous).files[name]??null:null,after:files[name]??null})),newBaselineHash:hash(JSON.stringify(record,null,2)+'\n'),reviewType:'Asistida; no aprobación institucional'},null,2));fs.writeFileSync(file,JSON.stringify(record,null,2)+'\n');console.log('Línea base registrada con motivo y diff de archivos.');
}
