'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {EventEmitter}=require('node:events');const {application}=require('../src/server.cjs');
// Service double: HTTP routing/security tests require no DB or Fabric.
test('HTTP isolated security, sessions, routes and verification states',async t=>{
 let local='MATCH',remote={recordHash:'h'},failure=false;
 const store={bus:new EventEmitter(),detail:async()=>{if(failure)throw new Error('private detail');return {id:'e',hash:'h',local};},events:async()=>[],document:async id=>({id}),metrics:async()=>({events:0}),pool:{query:async()=>({rows:[]})},command:async(actor)=>({actor:actor.user}),ack:async actor=>({org:actor.org})};
 const app=application(store,{Org2:{read:async()=>{if(remote instanceof Error)throw remote;return remote;}}},{password:'synthetic-unit-only'});
 const p=await app.listen(0,'operador'),q=await app.listen(0,'Org2'),base='http://127.0.0.1:'+p,org='http://127.0.0.1:'+q;let cookie,csrf,oc,ot;
 async function req(root,path,{body,raw,headers={},method}={}){return fetch(root+path,{method:method??(body!==undefined||raw!==undefined?'POST':'GET'),headers:{Origin:root,'Content-Type':'application/json',...headers},body:raw??(body!==undefined?JSON.stringify(body):undefined)});}
 const auth=()=>({Cookie:cookie,'X-CSRF-Token':csrf});const oa=()=>({Cookie:oc,'X-CSRF-Token':ot});
 try{
 await t.test('unauthenticated protected route',async()=>assert.equal((await req(base,'/api/me')).status,401));
 await t.test('site available and security headers',async()=>{const r=await req(base,'/api/site');assert.equal((await r.json()).authenticated,false);assert.equal(r.headers.get('x-frame-options'),'DENY');assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(r.headers.get('cache-control'),'no-store');});
 for(const user of ['unknown','org2','__proto__'])await t.test('login denied '+user,async()=>assert.equal((await req(base,'/api/login',{body:{user,password:'synthetic-unit-only'}})).status,401));
 await t.test('wrong password',async()=>assert.equal((await req(base,'/api/login',{body:{user:'juez',password:'wrong'}})).status,401));
 await t.test('origin restriction',async()=>assert.equal((await req(base,'/api/login',{body:{},headers:{Origin:'http://evil.example'}})).status,403));
 for(const raw of ['{','[]','null','{"a":1,"a":2}'])await t.test('invalid JSON '+raw,async()=>assert.equal((await req(base,'/api/login',{raw})).status,422));
 await t.test('login cookie and session',async()=>{const r=await req(base,'/api/login',{body:{user:'juez',password:'synthetic-unit-only'}});assert.equal(r.status,200);cookie=r.headers.get('set-cookie').split(';')[0];assert.match(r.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);csrf=(await r.json()).csrf;assert.equal((await (await req(base,'/api/me',{headers:auth()})).json()).user,'juez');});
 await t.test('CSRF denies command',async()=>assert.equal((await req(base,'/api/command',{body:{},headers:{Cookie:cookie}})).status,403));
 await t.test('authenticated actor comes from session',async()=>assert.equal((await (await req(base,'/api/command',{body:{user:'fake'},headers:auth()})).json()).actor,'juez'));
 for(const cursor of ['-1','abc','9007199254740992'])await t.test('invalid cursor '+cursor,async()=>assert.equal((await req(base,'/api/events?after='+cursor,{headers:auth()})).status,422));
 await t.test('unknown route',async()=>assert.equal((await req(base,'/api/unknown',{headers:auth()})).status,404));
 await t.test('documents and metrics',async()=>{assert.deepEqual(await (await req(base,'/api/documents',{headers:auth()})).json(),[]);assert.equal((await (await req(base,'/api/metrics',{headers:auth()})).json()).events,0);});
 await t.test('Org2 isolated session',async()=>{const r=await req(org,'/api/login',{body:{user:'org2',password:'synthetic-unit-only'}});assert.equal(r.status,200);oc=r.headers.get('set-cookie').split(';')[0];ot=(await r.json()).csrf;assert.equal((await req(org,'/api/me',{headers:auth()})).status,401);});
 for(const [name,value,want] of [['match',{recordHash:'h'},'MATCH'],['conflict',{recordHash:'other'},'MISMATCH'],['absent',null,'ABSENT'],['error',new Error('private remote'),'ERROR']])await t.test('verification '+name,async()=>{remote=value;const r=await (await req(org,'/api/event?id=e',{headers:oa()})).json();assert.equal(r.remote,want);assert.equal(r.verificationOrg,'Org2');});
 await t.test('local mismatch dominates remote match',async()=>{local='MISMATCH';remote={recordHash:'h'};assert.equal((await (await req(org,'/api/event?id=e',{headers:oa()})).json()).remote,'MISMATCH');});
 await t.test('internal error sanitized',async()=>{failure=true;const r=await req(base,'/api/event?id=e',{headers:auth()});assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'OPERACION_NO_DISPONIBLE'});});
 await t.test('logout invalidates session',async()=>{assert.equal((await req(base,'/api/logout',{body:{},headers:auth()})).status,200);assert.equal((await req(base,'/api/me',{headers:auth()})).status,401);});
 }finally{await app.close();}
});
