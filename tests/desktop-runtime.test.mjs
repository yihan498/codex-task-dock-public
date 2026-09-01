import {test,assert} from './test-kit.mjs';
let api;try{api=await import('../src/reader/desktop-runtime.mjs');}catch{}
const now=Date.parse('2026-08-31T08:00:00Z');
const make=(status='inProgress',runtime='active',start=now-10000)=>({id:'thread-1',hostId:'local',threadRuntimeStatus:{type:runtime},turnHistory:{kind:'canonical',history:{islands:[{newerBoundary:{status:'exhausted'},entries:[{value:'latest'}]}],entitiesByKey:{latest:{turnId:'turn-2',status,turnStartedAtMs:start,durationMs:status==='inProgress'?null:1000,items:[{type:'todo-list',plan:[{step:'核对附件',status:'completed'},{step:'验证结果',status:'inProgress'}]}]}}}}});
test('desktop-actual-owner-snapshot-projects-running-and-real-plan',()=>{
 assert.ok(api?.projectDesktopState,'desktop actual runtime missing');
 const r=api.projectDesktopState(make(),'thread-1',now);
 assert.equal(r.state,'running');assert.equal(r.turnId,'turn-2');assert.equal(r.plan[1].status,'in_progress');assert.equal(r.source,'desktop-ipc');assert.equal(r.stoppedAt,undefined);
});
test('desktop-stop-time-not-updatedAt-and-no-old-turn-completion',()=>{
 assert.ok(api);const s=make('completed','idle',now-20000);s.updatedAt=now;
 const r=api.projectDesktopState(s,'thread-1',now);assert.equal(r.state,'stopped');assert.equal(r.stoppedAt,undefined,'desktop received start plus server duration is not stop timestamp');
 s.turnHistory.history.entitiesByKey.old={turnId:'turn-1',status:'completed',turnStartedAtMs:now-30000,durationMs:29000,items:[]};
 s.threadRuntimeStatus.type='active';s.turnHistory.history.entitiesByKey.latest.status='inProgress';assert.equal(api.projectDesktopState(s,'thread-1',now).state,'running');
});
test('desktop-missing-conflicting-foreign-and-future-fail-closed',()=>{
 assert.ok(api);assert.equal(api.projectDesktopState(make(),'other',now),null);
 const s=make('completed','active');assert.equal(api.projectDesktopState(s,'thread-1',now).state,'unknown');
 s.hostId='remote';assert.equal(api.projectDesktopState(s,'thread-1',now),null);
 const f=make('completed','idle',now+10000);assert.equal(api.projectDesktopState(f,'thread-1',now).stoppedAt,undefined);
});
test('desktop-projector-drops-content-and-does-not-borrow-old-plan',()=>{
 assert.ok(api);const s=make();s.secret='PRIVATE';s.turnHistory.history.entitiesByKey.latest.items=[{type:'assistantMessage',text:'PRIVATE'}];
 const r=api.projectDesktopState(s,'thread-1',now);assert.equal(r.plan.length,0);assert.ok(!JSON.stringify(r).includes('PRIVATE'));
});
test('desktop-framing-fragmented-and-oversize-fail-closed',()=>{
 assert.ok(api?.FrameReader);const got=[];const reader=new api.FrameReader(m=>got.push(m),100);
 const bytes=api.frame({type:'test'});reader.push(bytes.subarray(0,2));reader.push(bytes.subarray(2));assert.equal(got[0].type,'test');
 const header=Buffer.alloc(4);header.writeUInt32LE(101);assert.throws(()=>reader.push(header));
});
test('desktop-stop-event-requires-matching-turn-and-explicit-terminal',()=>{
 assert.ok(api?.stopEventTime);
 const lines=[{timestamp:'2026-08-31T08:00:00Z',type:'event_msg',payload:{type:'task_complete',turn_id:'turn-2'}},{timestamp:'2026-08-31T08:01:00Z',type:'event_msg',payload:{type:'task_complete',turn_id:'old'}}].map(JSON.stringify).join('\n');
 assert.equal(api.stopEventTime(lines,'turn-2',now),now);assert.equal(api.stopEventTime(lines,'new',now),undefined);
 assert.equal(api.stopEventTime(lines,'old',now),undefined,'future event accepted');
});
test('desktop-canonical-order-not-clock-or-orphan-and-missing-tail-unknown',()=>{
 assert.ok(api);const s=make();s.turnHistory.history.entitiesByKey.orphan={...s.turnHistory.history.entitiesByKey.latest,turnId:'orphan',turnStartedAtMs:now,status:'completed'};
 assert.equal(api.projectDesktopState(s,'thread-1',now).turnId,'turn-2');
 s.turnHistory.history.islands[0].newerBoundary.status='unloaded';assert.equal(api.projectDesktopState(s,'thread-1',now).state,'unknown');
});
test('desktop-observer-cancels-subscription-and-only-sends-read-operations',async()=>{
 assert.ok(api?.createDesktopObserver);
 const {EventEmitter}=await import('node:events');const sent=[];
 class Socket extends EventEmitter {writable=true;destroy(){this.writable=false;this.emit('close');}write(bytes){const m=JSON.parse(bytes.subarray(4));sent.push(m);const reply=x=>queueMicrotask(()=>this.emit('data',api.frame(x)));
  if(m.method==='initialize')reply({type:'response',requestId:m.requestId,resultType:'success',result:{clientId:'reader'}});
  if(m.method==='thread-owner-discovery')reply({type:'response',requestId:m.requestId,resultType:'success',handledByClientId:'owner'});
  if(m.method==='thread-stream-following-changed'&&m.params.following)reply({type:'broadcast',method:'thread-stream-state-changed',version:11,sourceClientId:'owner',targetClientIds:['reader'],params:{hostId:'local',conversationId:'thread-1',change:{type:'snapshot',revision:1,conversationState:make()}}});
 }}
 const socket=new Socket(),d=api.createDesktopObserver({connect:()=>{queueMicrotask(()=>socket.emit('connect'));return socket;},timeoutMs:50});
 try{const r=await d.collect(['thread-1']);assert.equal(r.states['thread-1'].state,'running');assert.ok(sent.some(m=>m.method==='thread-stream-following-changed'&&!m.params.following),'subscription retained');assert.ok(sent.every(m=>['initialize','thread-owner-discovery','thread-stream-following-changed'].includes(m.method)));assert.equal(socket.writable,false,'poll must close socket so late frames cannot cross poll');}finally{d.close();}
});
test('desktop-connection-establishment-is-bounded',async()=>{
 assert.ok(api);const {EventEmitter}=await import('node:events');const socket=new EventEmitter();socket.writable=false;socket.destroy=()=>{};
 const d=api.createDesktopObserver({connect:()=>socket,timeoutMs:15});try{const r=await Promise.race([d.collect(['thread-1']),new Promise(resolve=>setTimeout(()=>resolve('hung'),100))]);assert.notEqual(r,'hung');assert.equal(r.status,'unavailable');}finally{d.close();}
});
test('desktop-terminal-history-retains-only-unmodified-stopped-task',()=>{
 assert.ok(api?.mergeDesktopHistory);const cache=new Map();const stopped={source:'desktop-ipc',threadId:'t',turnId:'old',state:'stopped',seenAt:now,stoppedAt:now-1000,plan:[]};
 const threads=[{threadId:'t',updatedAt:(now-5000)/1000}];
 api.mergeDesktopHistory(cache,threads,{t:stopped});assert.equal(api.mergeDesktopHistory(cache,threads,{}).t.state,'stopped');
 assert.equal(api.mergeDesktopHistory(cache,[{threadId:'t',updatedAt:(now-2000)/1000}],{}).t,undefined,'changed version before seenAt revives stopped state');
 assert.equal(api.mergeDesktopHistory(cache,[{threadId:'t',updatedAt:(now+1000)/1000}],{}).t,undefined);
 api.mergeDesktopHistory(cache,threads,{t:stopped});assert.equal(api.mergeDesktopHistory(cache,threads,{t:{...stopped,turnId:'new',state:'running'}}).t.turnId,'new');
});
test('desktop-running-history-bridges-one-transient-owner-gap-without-going-stale',()=>{
 assert.ok(api?.mergeDesktopHistory);const cache=new Map();const running={source:'desktop-ipc',threadId:'t',turnId:'live',state:'running',seenAt:now,plan:[{step:'继续真实任务',status:'in_progress'}]};
 const threads=[{threadId:'t',updatedAt:(now-5000)/1000}];
 api.mergeDesktopHistory(cache,threads,{t:running},now);
 const bridged=api.mergeDesktopHistory(cache,threads,{},now+5000).t;
 assert.equal(bridged?.state,'running','one transient owner gap removes a confirmed running task');assert.equal(bridged?.turnId,'live');assert.equal(bridged?.seenAt,now,'bridging must not renew source freshness');
 assert.equal(api.mergeDesktopHistory(cache,threads,{},now+21000).t,undefined,'running state retained beyond the freshness boundary');
 api.mergeDesktopHistory(cache,threads,{t:running},now);assert.equal(api.mergeDesktopHistory(cache,[{threadId:'t',updatedAt:(now+1000)/1000}],{},now+5000).t,undefined,'changed thread version revived old running state');
});
test('desktop-running-priority-survives-bounded-owner-misses-and-clears-on-stop',()=>{
 assert.ok(api?.updateRunningPriority,'bounded running priority helper missing');const last=new Set(['t']),misses=new Map(),requested=new Set(['t']);
 for(let i=0;i<4;i++){api.updateRunningPriority(last,misses,requested,{});assert.ok(last.has('t'),'confirmed running task lost retry priority too early');}
 api.updateRunningPriority(last,misses,requested,{});assert.ok(!last.has('t'),'missing owner retained priority without a bound');
 last.add('t');api.updateRunningPriority(last,misses,requested,{t:{state:'stopped'}});assert.ok(!last.has('t'),'observed stop kept running priority');
 api.updateRunningPriority(last,misses,requested,{t:{state:'running'}});assert.ok(last.has('t'));assert.equal(misses.has('t'),false,'successful running observation did not reset miss count');
});
test('desktop-terminal-rejects-invalid-calendar-and-missing-timezone',()=>{
 assert.ok(api);for(const timestamp of ['2026-02-30T01:00:00Z','2026-08-31T08:00:00','2026-08-31T25:00:00Z'])assert.equal(api.stopEventTime(JSON.stringify({timestamp,type:'event_msg',payload:{type:'task_complete',turn_id:'turn-2'}}),'turn-2',now),undefined);
});
test('desktop-linear-framing-large-fragmented-payload',()=>{
 assert.ok(api);const source={kind:'snapshot',data:'x'.repeat(18*1024*1024)},bytes=api.frame(source);let got=0;
 const reader=new api.FrameReader(m=>{assert.equal(m.data.length,source.data.length);got++;},20*1024*1024);const start=performance.now();
 for(let i=0;i<bytes.length;i+=16384)reader.push(bytes.subarray(i,i+16384));assert.equal(got,1);assert.ok(performance.now()-start<2500,'quadratic frame buffering');
});
test('desktop-stop-file-must-bind-internal-session-id',async()=>{
 assert.ok(api?.readStopTime);const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');const root=await fs.mkdtemp(path.join(os.tmpdir(),'dock-stop-test-'));
 try{const file=path.join(root,'rollout-thread-1.jsonl'),end={timestamp:'2026-08-31T08:00:00Z',type:'event_msg',payload:{type:'task_complete',turn_id:'turn-2'}};
  await fs.writeFile(file,[{type:'session_meta',payload:{id:'other'}},end].map(JSON.stringify).join('\n'));assert.equal(await api.readStopTime(file,'thread-1','turn-2',{root}),undefined);
  await fs.writeFile(file,[{type:'session_meta',payload:{id:'thread-1'}},end].map(JSON.stringify).join('\n'));assert.equal(await api.readStopTime(file,'thread-1','turn-2',{root}),now);
  await fs.writeFile(file,[{type:'session_meta',payload:{id:'thread-1',base_instructions:'x'.repeat(30000)}},end].map(JSON.stringify).join('\n'));assert.equal(await api.readStopTime(file,'thread-1','turn-2',{root}),now,'valid bounded metadata header over 16KB ignored');
 }finally{await fs.rm(root,{recursive:true});}
});
