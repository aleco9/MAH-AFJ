'use strict';
const crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
class Rejection extends Error { constructor(code,status=409){super(code);this.code=code;this.status=status;} }
function canonical(v){
  if(v===null || typeof v==='string' || typeof v==='boolean')return JSON.stringify(v);
  if(typeof v==='number' && Number.isSafeInteger(v))return JSON.stringify(v);
  if(Array.isArray(v)){if(Object.keys(v).length!==v.length)throw new Rejection('CANON_ARRAY_INVALID',422);return '['+v.map(canonical).join(',')+']';}
  if(v && Object.getPrototypeOf(v)===Object.prototype)return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
  throw new Rejection('CANON_VALUE_INVALID',422);
}
function parseJSON(text){
  const value=JSON.parse(text),tokens=text.match(/"(?:\\.|[^"\\])*"|[{}\[\],:]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g)??[],stack=[];
  for(let i=0;i<tokens.length;i++){
    const t=tokens[i];if(t==='{')stack.push(new Set());else if(t==='[')stack.push(null);else if(t==='}'||t===']')stack.pop();
    else if(t.startsWith('"')&&tokens[i+1]===':'){const key=JSON.parse(t),keys=stack.at(-1);if(keys.has(key))throw new Rejection('CLAVE_JSON_DUPLICADA',422);keys.add(key);}
  }
  return value;
}
function diffs(a,b,path='$'){
  if(canonical(a)===canonical(b))return [];
  if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){
    return [...new Set([...Object.keys(a),...Object.keys(b)])].sort().flatMap(k=>
      !(k in a)||!(k in b)?[{path:path+'.'+k,before:k in a?a[k]:null,after:k in b?b[k]:null,beforePresent:k in a,afterPresent:k in b}]:diffs(a[k],b[k],path+'.'+k));
  }
  return [{path,before:a,after:b,beforePresent:true,afterPresent:true}];
}
const PROTECTED_DATES=Object.freeze(['fecha','fechaVencimiento','fechaNotificacion','fechaPresentacion','detalle.fechaVencimiento','detalle.fechaNotificacion','detalle.fechaPresentacion']);
function protectedDateChanges(before,after){
  const at=(body,path)=>path.split('.').reduce((v,k)=>v&&typeof v==='object'&&Object.hasOwn(v,k)?v[k]:undefined,body);
  return PROTECTED_DATES.filter(path=>{const a=at(before,path),b=at(after,path);return a===undefined||b===undefined?a!==b:canonical(a)!==canonical(b);});
}
function content(input){
  if(!input || typeof input!=='object' || Array.isArray(input))throw new Rejection('CONTENIDO_JSON_REQUERIDO',422);
  const bytes=Buffer.from(canonical(input));if(bytes.length>1024*1024)throw new Rejection('TAMANO_EXCEDIDO',413);return bytes;
}
function makeRecord({eventId,docId,action,before,after,actor,decision,reason,previous,proposal}){
  return {schema:'MAH-AFJ-CANON-1',eventId,docId,action,beforeVersion:before?.id??null,afterVersion:after?.id??null,
    fileHash:after?.hash??before?.hash??null,proposalHash:proposal?sha(content(proposal)):null,
    context:{actor:actor.user,role:actor.role,organization:actor.org??null,identitySource:actor.identitySource??'SYNTHETIC_SERVICE_ASSERTION',
      policy:'LAB-001',policyVersion:1,decision,reason,actType:after?.body?.tipo??before?.body?.tipo??'NO_DECLARADO'},
    recordedAt:new Date().toISOString(),previousHash:previous??null,nonce:crypto.randomBytes(16).toString('hex')};
}
function verifyEvent(event,versions){
  if(sha(event.canonical)!==event.hash || canonical(event.record)!==event.canonical)return 'MISMATCH';
  const r=event.record;
  for(const id of [r.beforeVersion,r.afterVersion].filter(Boolean)){
    const v=versions.find(v=>v.id===id);if(!v || sha(v.bytes)!==v.hash || sha(content(v.body))!==v.hash)return 'MISMATCH';
  }
  const target=versions.find(v=>v.id===(r.afterVersion??r.beforeVersion));
  if(target && target.hash!==r.fileHash)return 'MISMATCH';return 'MATCH';
}
module.exports={sha,canonical,parseJSON,diffs,PROTECTED_DATES,protectedDateChanges,content,makeRecord,verifyEvent,Rejection};
