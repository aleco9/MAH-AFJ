'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const {project}=require('../scripts/quality/environment.cjs'),{files,inspect}=require('./grader.cjs'),{verifyExecuted}=require('../scripts/quality/contracts.cjs'),{hash}=require('../scripts/quality/contracts.cjs');
const control=path.resolve(process.argv[2]||''),task=JSON.parse(fs.readFileSync(control+'/task.json')),candidate=fs.realpathSync(task.candidate),trusted=files(project+'/evals');
if(JSON.stringify(trusted)!==JSON.stringify(task.evaluatorHash))throw Error('EVALUATOR_CHANGED');
const after=files(candidate);delete after['REQUEST.md'];const verdict=inspect(task.initial,after,task.allowedFiles);
if(process.argv.includes('--execute')&&!verdict.violations.length){
 const work=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'mah-eval-grade-')));try{
  fs.cpSync(candidate+'/src',work+'/src',{recursive:true});fs.mkdirSync(work+'/test');for(const name of ['acceptance.test.cjs','config.cjs'])fs.copyFileSync(project+'/test/'+name,work+'/test/'+name);fs.symlinkSync(project+'/node_modules',work+'/node_modules','dir');
  const env={...process.env,SDD_RUN_DIR:work,SDD_PROJECT_ROOT:project,SDD_TEST_ROOT:work,SDD_QA_SCHEMA:'qa_flow_eval_'+Date.now().toString(36)};
  let result=spawnSync(process.execPath,[project+'/scripts/quality/prepare.cjs'],{env,encoding:'utf8',timeout:30000});if(result.status===0)result=spawnSync(process.execPath,[project+'/scripts/quality/schema.cjs'],{env,encoding:'utf8',timeout:30000});
  const setupOK=result.status===0&&!result.error&&!result.signal;
  if(setupOK)result=spawnSync(process.execPath,['--require',project+'/scripts/quality/preload.cjs','--test','--test-name-pattern=^'+task.scenario+' ','--test-reporter='+project+'/scripts/quality/reporter.cjs',work+'/test/acceptance.test.cjs'],{env,encoding:'utf8',timeout:task.budgetSeconds*1000});
  verdict.stage=setupOK?'behavior':'setup';try{verdict.observedResults=(result.stdout||'').trim().split('\n').filter(Boolean).map(JSON.parse).map(({type,name,errorCode})=>({type,name,errorCode}));}catch{}
  if(!setupOK||result.error||result.signal)verdict.status='ERROR';else{try{const records=(result.stdout||'').trim().split('\n').filter(Boolean).map(JSON.parse);verifyExecuted([task.scenario],records);verdict.status=result.status===0?'PASS':'FAIL';}catch{let records=[];try{records=(result.stdout||'').trim().split('\n').filter(Boolean).map(JSON.parse);}catch{}verdict.status=result.status===1&&records.some(e=>e.name?.startsWith(task.scenario+' ')&&e.errorCode==='ERR_ASSERTION')?'FAIL':'ERROR';}}
  verdict.commandExit=result.status;verdict.signal=result.signal;verdict.error=result.error?.code??null;
 }finally{fs.rmSync(work,{recursive:true,force:true});}
}
verdict.agentRun=task.agentRun??'NO_EJECUTADO';verdict.configuration=task.configuration??null;verdict.case=task.id;verdict.candidateManifestHash=hash(JSON.stringify(after));fs.writeFileSync(control+'/verdict.json',JSON.stringify(verdict,null,2));console.log(JSON.stringify(verdict));if(['FAIL','ERROR'].includes(verdict.status))process.exitCode=1;
