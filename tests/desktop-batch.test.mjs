import {test,assert} from './test-kit.mjs';
import {createDesktopObserver,frame} from '../src/reader/desktop-runtime.mjs';
import {EventEmitter} from 'node:events';
test('desktop-failed-prior-running-cannot-starve-new-window',async()=>{
 let seed=true,newRequested=0;
 class Socket extends EventEmitter{writable=true;destroy(){this.writable=false;this.emit('close');}write(bytes){const m=JSON.parse(bytes.subarray(4)),reply=x=>queueMicrotask(()=>this.emit('data',frame(x)));
  if(m.method==='initialize')reply({type:'response',requestId:m.requestId,resultType:'success',result:{clientId:'reader'}});
  if(m.method==='thread-owner-discovery')reply({type:'response',requestId:m.requestId,resultType:'success',handledByClientId:'owner'});
  if(m.method==='thread-stream-following-changed'&&m.params.following){const id=m.params.conversationId;if(id==='new')newRequested++;if(seed||id==='new')reply({type:'broadcast',method:'thread-stream-state-changed',version:11,sourceClientId:'owner',params:{hostId:'local',conversationId:id,change:{type:'snapshot',revision:1,conversationState:{id,hostId:'local',threadRuntimeStatus:{type:'active'},turns:[{turnId:'u',turnStartedAtMs:Date.now()-100,status:'inProgress',items:[]}]}}}});}
 }}
 const d=createDesktopObserver({timeoutMs:30,pollTimeoutMs:100,connect:()=>{const s=new Socket();queueMicrotask(()=>s.emit('connect'));return s;}});
 try{const ids=Array.from({length:8},(_,i)=>'old-'+i);assert.equal(Object.keys((await d.collect(ids)).states).length,8);seed=false;let found=false;for(let i=0;i<3;i++){const r=await d.collect([...ids,'new']);found ||= r.states.new?.state==='running';}assert.ok(found&&newRequested>0,'failed prior-running group starved new window');}finally{d.close();}
});
test('desktop-batch-limits-heavy-snapshot-subscriptions-to-two',async()=>{
 let active=0,max=0;
 class Socket extends EventEmitter{writable=true;destroy(){this.writable=false;this.emit('close');}write(bytes){const m=JSON.parse(bytes.subarray(4)),reply=x=>queueMicrotask(()=>this.emit('data',frame(x)));
  if(m.method==='initialize')reply({type:'response',requestId:m.requestId,resultType:'success',result:{clientId:'reader'}});
  if(m.method==='thread-owner-discovery')reply({type:'response',requestId:m.requestId,resultType:'success',handledByClientId:'owner'});
  if(m.method==='thread-stream-following-changed'){
   if(!m.params.following){active--;return;}active++;max=Math.max(max,active);const id=m.params.conversationId;
   reply({type:'broadcast',method:'thread-stream-state-changed',version:11,sourceClientId:'owner',params:{hostId:'local',conversationId:id,change:{type:'snapshot',revision:1,conversationState:{id,hostId:'local',threadRuntimeStatus:{type:'active'},turns:[{turnId:'u',turnStartedAtMs:Date.now()-100,status:'inProgress',items:[]}]}}}});
  }
 }}
 const d=createDesktopObserver({timeoutMs:100,connect:()=>{const s=new Socket();queueMicrotask(()=>s.emit('connect'));return s;}});
 try{const r=await d.collect(['a','b','c','d']);assert.equal(Object.keys(r.states).length,4);assert.ok(max<=2,'heavy subscriptions exceeded bound: '+max);assert.equal(active,0);}finally{d.close();}
});
test('desktop-own-budget-keeps-this-poll-proven-state-not-false-disconnect',async()=>{
 class Socket extends EventEmitter{writable=true;destroy(){this.writable=false;this.emit('close');}write(bytes){const m=JSON.parse(bytes.subarray(4)),reply=x=>queueMicrotask(()=>this.emit('data',frame(x)));
  if(m.method==='initialize')reply({type:'response',requestId:m.requestId,resultType:'success',result:{clientId:'reader'}});
  if(m.method==='thread-owner-discovery')reply({type:'response',requestId:m.requestId,resultType:'success',handledByClientId:'owner'});
  if(m.method==='thread-stream-following-changed'&&m.params.following&&m.params.conversationId==='current')reply({type:'broadcast',method:'thread-stream-state-changed',version:11,sourceClientId:'owner',params:{hostId:'local',conversationId:'current',change:{type:'snapshot',revision:1,conversationState:{id:'current',hostId:'local',threadRuntimeStatus:{type:'active'},turns:[{turnId:'u',turnStartedAtMs:Date.now()-100,status:'inProgress',items:[]}]}}}});
 }}
 const d=createDesktopObserver({timeoutMs:100,pollTimeoutMs:20,connect:()=>{const s=new Socket();queueMicrotask(()=>s.emit('connect'));return s;}});
 try{const r=await d.collect(['current','slow-history']);assert.equal(r.states.current.state,'running');assert.equal(r.status,'available');assert.equal(r.partial,true,'own budget not distinguished from disconnect');assert.equal(r.states['slow-history'],undefined);}finally{d.close();}
});
test('desktop-budget-rotates-untried-owner-ahead-of-slow-history',async()=>{
 class Socket extends EventEmitter{writable=true;destroy(){this.writable=false;this.emit('close');}write(bytes){const m=JSON.parse(bytes.subarray(4)),reply=x=>queueMicrotask(()=>this.emit('data',frame(x)));
  if(m.method==='initialize')reply({type:'response',requestId:m.requestId,resultType:'success',result:{clientId:'reader'}});
  if(m.method==='thread-owner-discovery')reply({type:'response',requestId:m.requestId,resultType:'success',handledByClientId:'owner'});
  if(m.method==='thread-stream-following-changed'&&m.params.following&&m.params.conversationId==='new-running')reply({type:'broadcast',method:'thread-stream-state-changed',version:11,sourceClientId:'owner',params:{hostId:'local',conversationId:'new-running',change:{type:'snapshot',revision:1,conversationState:{id:'new-running',hostId:'local',threadRuntimeStatus:{type:'active'},turns:[{turnId:'u',turnStartedAtMs:Date.now()-100,status:'inProgress',items:[]}]}}}});
 }}
 const d=createDesktopObserver({timeoutMs:200,pollTimeoutMs:40,connect:()=>{const s=new Socket();queueMicrotask(()=>s.emit('connect'));return s;}});
 try{const ids=['slow-a','slow-b','new-running'];const first=await d.collect(ids);assert.equal(first.states['new-running'],undefined);const second=await d.collect(ids);assert.equal(second.states['new-running']?.state,'running','untried new window starved behind slow history');}finally{d.close();}
});
