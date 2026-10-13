'use strict';
const fs=require('node:fs'),path=require('node:path'),{project}=require('./environment.cjs'),{trustDirectory}=require('./governance.cjs'),{hash,verifyProtected}=require('./contracts.cjs');
const flag=process.argv.indexOf('--reason'),reason=flag<0?'':process.argv[flag+1];
if(process.env.CI==='true'||!reason?.trim()){console.error('REFERENCE_REVIEW_REASON_REQUIRED_LOCAL_ONLY');process.exit(1);}
const file=project+'/specs/criteria-baseline.json',bytes=fs.readFileSync(file),baseline=JSON.parse(bytes);if(verifyProtected(project,baseline).length)throw Error('BASELINE_STALE');
const dir=trustDirectory(project);if(dir===project||dir.startsWith(project+path.sep))throw Error('TRUST_MUST_BE_EXTERNAL');fs.mkdirSync(dir,{recursive:true,mode:0o700});
const target=path.join(dir,'approved.json'),previous=fs.existsSync(target)?fs.readFileSync(target):null;
const record={version:1,baselineHash:hash(bytes),files:baseline.files,reason,recordedAt:new Date().toISOString(),previousReferenceHash:previous?hash(previous):null,reviewType:'Revision tecnica asistida dentro de autorizacion del usuario; no firma/aprobacion independiente'};
const out=JSON.stringify(record,null,2)+'\n';const review=path.resolve(project,'../../quality_reports/decisions/reference-review-'+Date.now()+'.json');fs.writeFileSync(review,JSON.stringify({...record,referenceHash:hash(out)},null,2));fs.writeFileSync(target,out,{mode:0o600});console.log('Referencia externa revisada:',hash(out));
