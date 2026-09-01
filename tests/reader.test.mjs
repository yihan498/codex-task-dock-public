import {assert,test} from './test-kit.mjs';
import {PassThrough} from 'node:stream';
import {EventEmitter} from 'node:events';
import {projectUserFields,createReadOnlyClient,collectSnapshot} from '../src/reader/reader.mjs';
const user=(id,text)=>({type:'userMessage',id,content:[{type:'text',text}]});
test('auto-name-background-read-cannot-block-state-snapshot',async()=>{
 let release;const slow=new Promise(resolve=>release=resolve),background={},cache=new Map();let lists=0,fieldReads=0;
 const listClient={request:async(method)=>{assert.equal(method,'thread/list');lists++;return {data:[{id:'t1',name:null,updatedAt:1}]};}};
 const fieldClient={request:async(method)=>{assert.equal(method,'thread/read');fieldReads++;await slow;return {thread:{id:'t1',turns:[{id:'u',items:[user('m','请翻译设备维护手册。')]}]}};}};
 const options={cache,background,fieldClient};
 const timeout=Symbol('timeout');const first=await Promise.race([collectSnapshot(listClient,options),new Promise(resolve=>setTimeout(()=>resolve(timeout),100))]);
 assert.notEqual(first,timeout,'slow name source blocked status/list snapshot');assert.equal(first.snapshot.threads.length,1);assert.equal(typeof background.promise?.then,'function');
 await collectSnapshot(listClient,options);assert.equal(lists,2);assert.equal(fieldReads,1,'overlapping name-source jobs');release();await background.promise;
 const next=await collectSnapshot(listClient,options);assert.equal(next.snapshot.threads.length,1);assert.equal(cache.get('t1').name.parts[0].text,'设备维护手册');await background.promise;
});
test('auto-name-background-failure-keeps-list-and-retries',async()=>{
 const background={},cache=new Map();const c={request:async()=>({data:[{id:'t1',name:'原名',updatedAt:1}]})};
 const f={request:async()=>{throw Error('private')}};const r=await collectSnapshot(c,{cache,background,fieldClient:f});await background.promise;assert.equal(r.connection,'live');assert.equal(cache.get('t1').readStatus,'unavailable');assert.ok(!JSON.stringify(r).includes('private'));
});
test('reader-retains-same-version-fields-while-awaiting-budget',async()=>{
 const originalNow=Date.now;let clock=1000000;Date.now=()=>clock;
 try {
  const cache=new Map();let version=1;
  const client={request:async(method,p)=>method==='thread/list'
   ?{data:Array.from({length:120},(_,i)=>({id:'task'+i,name:'Task',updatedAt:version})),nextCursor:null}
   :{thread:{id:p.threadId,turns:[{id:'turn',items:[user('message','公司：测试公司')]}]}}};
  for(let round=0;round<120;round++){
   const result=await collectSnapshot(client,{cache,maxFieldReads:8});clock+=5000;
   if(round>=15)assert.equal(result.snapshot.threads.filter(t=>t.business?.company).length,120,'unchanged known fields disappear while waiting');
  }
  version=2;
  const changed=await collectSnapshot(client,{cache,maxFieldReads:0});
  assert.equal(changed.snapshot.threads.filter(t=>t.business).length,0,'changed version must not claim old facts');
 } finally {Date.now=originalNow;}
});
test('reader-budget-is-fair-over-expiry-and-continuous-failures',async()=>{
 const originalNow=Date.now;
 try {
  for(const failures of [false,true]){
   let clock=1000000;Date.now=()=>clock;
   const attempted=new Set(),cache=new Map();
   const client={request:async(method,p)=>{
    if(method==='thread/list')return {data:Array.from({length:213},(_,i)=>({id:'task'+i,name:'Task',updatedAt:1})),nextCursor:null};
    attempted.add(p.threadId);
    if(failures&&Number(p.threadId.slice(4))<16)throw new Error('unavailable');
    return {thread:{id:p.threadId,turns:[]}};
   }};
   for(let round=0;round<40;round++){await collectSnapshot(client,{cache,maxFieldReads:8});clock+=5000;}
   assert.equal(attempted.size,213,'all tasks must get a turn despite expiry or failing early tasks');
  }
 } finally {Date.now=originalNow;}
});
const thread=(items)=>({thread:{id:'t1',turns:[{id:'turn1',startedAt:1788140000,items}]}});
test('reader-real-user-shape-binds-identifiers',()=>{
 const b=projectUserFields(thread([user('m1','公司：测试公司\n处理对象：核对表')]),'t1');
 assert.equal(b.company?.value,'测试公司');
 assert.deepEqual(b.subject?.source,{sourceThreadId:'t1',sourceTurnId:'turn1',sourceMessageId:'m1'});
});
test('reader-rejects-mismatch-assistant-and-delegation',()=>{
 assert.deepEqual(projectUserFields(thread([user('m1','公司：测试')]),'other'),{});
 assert.deepEqual(projectUserFields(thread([{type:'agentMessage',id:'a',text:'公司：猜测'}]),'t1'),{});
 assert.deepEqual(projectUserFields(thread([user('m1','<codex_delegation>\n公司：他人\n</codex_delegation>')]),'t1'),{});
});
test('reader-does-not-use-turn-time-as-message-time',()=>{
 assert.deepEqual(projectUserFields(thread([user('m1','截止时间：明天 18:00')]),'t1'),{});
 assert.equal(projectUserFields(thread([user('m1','截止时间：2026-08-31 18:00')]),'t1').deadline?.value,'2026-08-31T18:00:00+08:00');
});
test('reader-last-explicit-message-replaces-not-mixes-business',()=>{
 const b=projectUserFields(thread([user('m1','公司：旧公司\n截止时间：2026-08-31 18:00'),user('m2','公司：新公司')]),'t1');
 assert.equal(b.company?.value,'新公司');assert.equal(b.deadline,undefined);
 assert.deepEqual(projectUserFields(thread([user('m1','公司：旧公司'),user('m2','公司：A\n公司：B')]),'t1'),{});
});
const fakeChild=(respond)=>{
 const child=new EventEmitter();child.stdout=new PassThrough();child.stdin=new PassThrough();child.kill=()=>{child.emit('exit',0);};
 child.stdin.on('data',b=>{for(const line of b.toString().trim().split('\n')){const request=JSON.parse(line);respond(request,child);}});
 return child;
};
test('reader-transport-read-only-allowlist',async()=>{
 let calls=0;const c=createReadOnlyClient({executable:'test',spawn:()=>{calls++;return fakeChild(()=>{});},timeoutMs:30});
 await assert.rejects(()=>c.request('turn/start',{}),/method_forbidden/);assert.equal(calls,0);c.close();
});
test('reader-transport-handshake-and-correlation',async()=>{
 const methods=[];
 const c=createReadOnlyClient({executable:'test',spawn:()=>fakeChild((r,p)=>{methods.push(r.method);if(r.id!==undefined)p.stdout.write(JSON.stringify({id:r.id,result:r.method==='thread/read'?{thread:{id:'t1'}}:{}})+'\n');}),timeoutMs:50});
 assert.deepEqual(await c.request('thread/read',{threadId:'t1'}),{thread:{id:'t1'}});
 assert.deepEqual(methods,['initialize','initialized','thread/read']);c.close();
});
test('reader-transport-errors-redact-server-body',async()=>{
 const c=createReadOnlyClient({executable:'test',spawn:()=>fakeChild((r,p)=>{if(r.id!==undefined)p.stdout.write(JSON.stringify({id:r.id,...(r.method==='initialize'?{result:{}}:{error:{code:-32603,message:'SECRET'}})})+'\n');})});
 await assert.rejects(()=>c.request('thread/read',{threadId:'t1'}),e=>e.message==='rpc_-32603');c.close();
});
test('reader-transport-bounds-and-timeout',async()=>{
 const c=createReadOnlyClient({executable:'test',spawn:()=>fakeChild(()=>{}),timeoutMs:20});
 await assert.rejects(()=>c.request('thread/list',{}),/timeout/);c.close();
 const d=createReadOnlyClient({executable:'test',maxBytes:64,spawn:()=>fakeChild((r,p)=>p.stdout.write('x'.repeat(65))),timeoutMs:30});
 await assert.rejects(()=>d.request('thread/list',{}),/too_large/);d.close();
});
test('reader-snapshot-pages-without-preview-or-invented-state',async()=>{
 const requests=[];
 const client={request:async(method,p)=>{requests.push([method,p]);if(method==='thread/list')return {data:[{id:p.cursor?'t2':'t1',name:p.cursor?null:'真实标题',preview:'PRIVATE',updatedAt:1,status:{type:'notLoaded'}}],nextCursor:p.cursor?null:'page2'};return {thread:{id:p.threadId,turns:[]}};}};
 const result=await collectSnapshot(client,{maxFieldReads:0});
 assert.equal(result.snapshot?.threads.length,2);assert.equal(result.snapshot.threads[1].title,'未命名任务');
 assert.equal(result.snapshot.threads[0].runtimeState,'notLoaded');
 assert.equal(JSON.stringify(result).includes('PRIVATE'),false);
 assert.equal(result.capabilities?.livePlan,false);assert.equal(requests.every(([m])=>m==='thread/list'),true);
});
test('reader-page-loop-fails-not-partial-success',async()=>{
 const client={request:async()=>({data:[{id:'t1',name:'名称'}],nextCursor:'loop'})};
 await assert.rejects(()=>collectSnapshot(client,{maxFieldReads:0}),/pagination/);
});
test('reader-read-failure-does-not-poison-list-or-invent-fields',async()=>{
 const client={request:async(method,p)=>{if(method==='thread/list')return {data:[{id:'t1',name:'任务',updatedAt:1788140000}],nextCursor:null};throw new Error('private server failure');}};
 const r=await collectSnapshot(client,{maxFieldReads:1});assert.equal(r.snapshot?.threads.length,1);
 assert.equal(r.snapshot.threads[0].business,undefined);assert.equal(r.snapshot.threads[0].businessRead,'unavailable');
 assert.equal(JSON.stringify(r).includes('private'),false);
});
test('reader-initialization-failure-cleans-every-owned-child',async()=>{
 const children=[];
 const c=createReadOnlyClient({executable:'test',spawn:()=>{
  const p=fakeChild((r,p)=>{if(r.id!==undefined)p.stdout.write(JSON.stringify({id:r.id,error:{code:-32603}})+'\n');});
  p.wasKilled=false;const kill=p.kill;p.kill=()=>{p.wasKilled=true;kill();};children.push(p);return p;
 }});
 await assert.rejects(()=>c.request('thread/list',{}));await assert.rejects(()=>c.request('thread/list',{}));c.close();
 assert.equal(children.length,2);assert.equal(children.every(c=>c.wasKilled),true);
});
test('reader-incremental-fields-preserve-context-and-clear-conflicts',()=>{
 const initial=user('m1','公司：测试公司\n截止时间：2026-08-31 18:00');
 const b=projectUserFields(thread([initial,user('m2','处理对象：更新清单')]),'t1');
 assert.equal(b.company?.value,'测试公司');assert.ok(b.deadline);assert.equal(b.subject?.value,'更新清单');
 const c=projectUserFields(thread([initial,user('m2','截止时间：下周左右')]),'t1');
 assert.equal(c.company?.value,'测试公司');assert.equal(c.deadline,undefined);
 const d=projectUserFields(thread([initial,user('m2','公司：新公司\n处理对象：新清单')]),'t1');
 assert.equal(d.company?.value,'新公司');assert.equal(d.deadline,undefined);
});
test('reader-fragmented-large-response-does-not-block-service',async()=>{
 const size=16*1024*1024;
 const child=fakeChild((r,p)=>{
  if(r.method==='initialize'){p.stdout.write(JSON.stringify({id:r.id,result:{}})+'\n');return;}
  if(r.id===undefined)return;
  const bytes=Buffer.from(JSON.stringify({id:r.id,result:{value:'x'.repeat(size)}})+'\n');
  for(let i=0;i<bytes.length;i+=8192)p.stdout.write(bytes.subarray(i,i+8192));
 });
 const c=createReadOnlyClient({executable:'test',spawn:()=>child,timeoutMs:30000});
 const start=performance.now();
 try{const result=await c.request('thread/read',{});assert.equal(result.value.length,size);
  assert.ok(performance.now()-start<2000,'fragmented response blocks collector for over two seconds');}
 finally{c.close();}
});
