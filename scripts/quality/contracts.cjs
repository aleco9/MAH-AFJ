'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function safeFile(root,name){
 if(typeof name!=='string'||path.isAbsolute(name)||name.split(/[\\/]/).includes('..'))throw Error('CONTRACT_PATH_INVALID');
 const base=fs.realpathSync(root),file=path.resolve(base,name);if(!file.startsWith(base+path.sep))throw Error('CONTRACT_PATH_INVALID');
 if(fs.existsSync(file)&&!fs.realpathSync(file).startsWith(base+path.sep))throw Error('CONTRACT_PATH_INVALID');return file;
}
function verifyProtected(root,manifest){
 if(!manifest?.files||typeof manifest.files!=='object'||Array.isArray(manifest.files))throw Error('BASELINE_INVALID');
 return Object.entries(manifest.files).filter(([name,digest])=>{if(!/^[a-f0-9]{64}$/.test(digest))throw Error('BASELINE_INVALID');const file=safeFile(root,name);return !fs.existsSync(file)||hash(fs.readFileSync(file))!==digest;}).map(([name])=>name);
}
function verifyTrace(root,manifest){
 const ids=new Set();for(const module of manifest.modules){safeFile(root,module.file);if(!fs.existsSync(safeFile(root,module.file)))throw Error('SPEC_MISSING');if(ids.has(module.id))throw Error('DUPLICATE_MODULE');ids.add(module.id);}
 const cases=new Set();for(const c of manifest.scenarios){if(!ids.has(c.module)||cases.has(c.id))throw Error('SCENARIO_INVALID');cases.add(c.id);if(!fs.existsSync(safeFile(root,c.test)))throw Error('SCENARIO_TEST_MISSING');if(![c.given,c.when,c.then].every(x=>typeof x==='string'&&x.trim()))throw Error('SCENARIO_INCOMPLETE');}
 return {modules:ids.size,scenarios:cases.size};
}
function verifyExecuted(expected,events){
 if(!Array.isArray(expected)||!expected.length||new Set(expected).size!==expected.length)throw Error('SCENARIO_EXECUTION_EXPECTED_INVALID');
 const rows=events.filter(e=>/^AC[0-9]+\s/.test(e.name??''));
 if(rows.length!==expected.length)throw Error('SCENARIO_EXECUTION_COUNT');
 return [...expected].sort().map(id=>{const found=rows.filter(e=>e.name.split(/\s/)[0]===id);if(found.length!==1||found[0].type!=='test:pass'||found[0].skip||found[0].todo)throw Error('SCENARIO_EXECUTION_INVALID:'+id);return {id,status:'PASS',name:found[0].name,file:found[0].file??null};});
}
function mutationKilled(result,tap,scenario){return result.exitCode===1&&!result.error&&!result.signal&&new RegExp('^not ok \\d+ - '+scenario+' ','m').test(tap)&&/^# fail 1$/m.test(tap)&&/code: ['"]ERR_ASSERTION['"]/.test(tap)&&!/(hookFailed|QUALITY_SCHEMA_SETUP_FAILED|MODULE_NOT_FOUND)/.test(tap);}
function redact(text,secrets=[]){for(const secret of secrets.filter(v=>typeof v==='string'&&v.length>3))text=text.split(secret).join('[REDACTED]');return text.replace(/postgres(?:ql)?:\/\/[^\s'"]+/g,'[DATABASE_URL_REDACTED]');}
module.exports={hash,safeFile,verifyProtected,verifyTrace,verifyExecuted,mutationKilled,redact};
