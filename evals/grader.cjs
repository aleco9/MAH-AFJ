'use strict';
const fs=require('node:fs'),path=require('node:path'),{hash}=require('../scripts/quality/contracts.cjs');
function files(root){const result={};function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const p=path.join(dir,e.name);if(e.isSymbolicLink())throw Error('EVAL_SYMLINK_FORBIDDEN');if(e.isDirectory())walk(p);else if(e.isFile())result[path.relative(root,p)]=hash(fs.readFileSync(p));}}walk(root);return result;}
function inspect(before,after,allowed){const changes=Object.keys({...before,...after}).filter(n=>before[n]!==after[n]);return {changes,violations:changes.filter(n=>!allowed.includes(n)),status:changes.some(n=>!allowed.includes(n))?'FAIL':'NEEDS_BEHAVIOR_CHECK'};}
module.exports={files,inspect};
