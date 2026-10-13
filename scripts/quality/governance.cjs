'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {hash,safeFile,verifyProtected}=require('./contracts.cjs');
function trustDirectory(root){return path.resolve(process.env.QA_TRUST_DIR||path.resolve(root,'../../quality_reports/controls/mah-afj-sdd'));}
function verifyAuthority(root,dir,pin){
 const real=fs.realpathSync(dir),base=fs.realpathSync(root);if(real===base||real.startsWith(base+path.sep))throw Error('TRUST_MUST_BE_EXTERNAL');
 const bytes=fs.readFileSync(path.join(real,'approved.json'));
 if(pin&&(!/^[a-f0-9]{64}$/.test(pin)||hash(bytes)!==pin))throw Error('TRUST_PIN_MISMATCH');
 if(process.env.CI==='true'&&!pin)throw Error('CI_TRUST_PIN_REQUIRED');
 const approved=JSON.parse(bytes),baseline=fs.readFileSync(path.join(root,'specs/criteria-baseline.json'));
 if(hash(baseline)!==approved.baselineHash)throw Error('BASELINE_NOT_REVIEWED');
 const changed=verifyProtected(root,approved);if(changed.length)throw Error('TRUSTED_CRITERIA_CHANGED:'+changed.join(','));
 return {referenceHash:hash(bytes),baselineHash:approved.baselineHash,reviewType:approved.reviewType,limits:'Referencia fuera del prototipo; misma cuenta OS puede modificarla. CI exige pin administrado externamente.'};
}
function verifyMatrix(root){
 const catalog=JSON.parse(fs.readFileSync(safeFile(root,'specs/authority-catalog.json'))),matrix=JSON.parse(fs.readFileSync(safeFile(root,'specs/traceability.json'))),spec=JSON.parse(fs.readFileSync(safeFile(root,'specs/scenarios.json')));
 const groups={needs:'ers',requirements:'ers',stories:'backlog',qa:'qa',tests:'ers',useCases:'ers'};
 const scenarios=new Map(spec.scenarios.map(c=>[c.id,c])),seen=new Set();
 for(const row of matrix.rows){const c=scenarios.get(row.scenario);if(!c||seen.has(row.scenario)||c.module!==row.module||c.test!==row.testFile)throw Error('TRACE_LINK_INVALID');seen.add(row.scenario);for(const [field,source] of Object.entries(groups)){if(!row[field]?.length||row[field].some(id=>!catalog.sources[source].ids.includes(id)))throw Error('TRACE_REFERENCE_INVALID:'+field);}if(!row.designSections?.length||row.designSections.some(id=>!catalog.sources.sdd.sections.includes(id)))throw Error('TRACE_DESIGN_INVALID');}
 if(seen.size!==scenarios.size)throw Error('TRACE_SCENARIO_MISSING');
 const required=catalog.sources.ers.ids.filter(id=>/^S-V\d+$/.test(id)),obligations=new Set();for(const o of matrix.obligations){if(obligations.has(o.requirement)||!required.includes(o.requirement)||!o.reason?.trim()||!['PARTIAL','PENDING'].includes(o.status)||o.scenarios.some(id=>!scenarios.has(id)))throw Error('TRACE_OBLIGATION_INVALID');obligations.add(o.requirement);}if(obligations.size!==required.length)throw Error('TRACE_OBLIGATION_MISSING');
 const sources=Object.fromEntries(Object.entries(catalog.sources).map(([id,s])=>{const f=path.resolve(root,'../..',s.path);if(!fs.existsSync(f))return[id,'EXTERNAL_NOT_AVAILABLE'];if(hash(fs.readFileSync(f))!==s.sha256)throw Error('AUTHORITY_SOURCE_CHANGED:'+id);return[id,'HASH_MATCH'];}));
 return {scenarios:seen.size,requirements:obligations.size,sourceVerification:sources,catalogHash:hash(fs.readFileSync(safeFile(root,'specs/authority-catalog.json')))};
}
function decideNF(c,version){
 if(!['NO_EVALUADO','PASS','FAIL'].includes(c.status))throw Error('NF_STATUS_INVALID');
 if(c.status==='NO_EVALUADO')return 'NO_EVALUADO';
 if(!c.versionEvidence||!c.measurements)throw Error('NF_EVIDENCE_REQUIRED');
 if(c.versionEvidence!==version)return 'NO_EVALUADO';
 if(!c.threshold)return 'NO_EVALUADO';
 const t=c.threshold,m=c.measurements;
 if(t.p95Ms!==undefined){if(!Number.isFinite(m.p95Ms)||!Number.isFinite(m.p99Ms))throw Error('NF_METRIC_MISSING');return m.p95Ms<=t.p95Ms&&m.p99Ms<=t.p99Ms?'PASS':'FAIL';}
 if(t.missing!==undefined){if(!Number.isFinite(m.missing)||!Number.isFinite(m.logicalDuplicates))throw Error('NF_METRIC_MISSING');return m.missing===0&&m.logicalDuplicates===0?'PASS':'FAIL';}
 if(t.acts!==undefined){if(!Number.isFinite(m.acts)||!Number.isFinite(m.durationSeconds)||!m.backlogSeries||!m.resources)throw Error('NF_METRIC_MISSING');return m.acts>=t.acts&&m.durationSeconds>=t.durationSeconds?'PASS':'FAIL';}
 return 'NO_EVALUADO';
}
function nonfunctional(root,version){const data=JSON.parse(fs.readFileSync(safeFile(root,'specs/nonfunctional.json')));return data.criteria.map(c=>({...c,runVersion:version,effectiveStatus:decideNF(c,version)}));}

function provenance(root){const git=args=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});return r.status===0?r.stdout.trim():null;};return {head:git(['rev-parse','HEAD']),branch:git(['branch','--show-current']),workingTree:git(['status','--porcelain']),node:process.version,platform:process.platform,architecture:process.arch,dependencyLock:hash(fs.readFileSync(root+'/package-lock.json')),delivery:'SOURCE_MANIFEST; no equivale a commit limpio',toolingContext:JSON.parse(fs.readFileSync(root+'/specs/tooling-context.json')),agentConfiguration:'Identidad/modelo del agente no verificados automáticamente por el runner del producto'};}
module.exports={trustDirectory,verifyAuthority,verifyMatrix,nonfunctional,decideNF,provenance};
