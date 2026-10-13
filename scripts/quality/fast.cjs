'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process'),{project}=require('./environment.cjs'),{verifyMatrix}=require('./governance.cjs');
if(Number(process.versions.node.split('.')[0])<24)throw Error('QUALITY_REQUIRES_NODE_24');
verifyMatrix(project);const {verifyProtected}=require('./contracts.cjs');if(verifyProtected(project,JSON.parse(fs.readFileSync(project+'/specs/criteria-baseline.json'))).length)throw Error('FAST_CRITERIA_CHANGED');
for(const dir of ['scripts/quality','test'])for(const name of fs.readdirSync(project+'/'+dir).filter(n=>n.endsWith('.cjs'))){const r=spawnSync(process.execPath,['--check',project+'/'+dir+'/'+name],{stdio:'inherit'});if(r.status!==0)process.exit(1);}
const tests=['quality-unit.test.cjs','flow-unit.test.cjs','governance-unit.test.cjs','agent-evals-unit.test.cjs'];
const r=spawnSync(process.execPath,['--test','--test-reporter=tap',...tests.map(n=>project+'/test/'+n)],{cwd:project,stdio:'inherit',timeout:60000});process.exitCode=r.status===0&&!r.error?0:1;
