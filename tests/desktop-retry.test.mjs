import {test,assert} from './test-kit.mjs';
import {createDesktopObserver,frame} from '../src/reader/desktop-runtime.mjs';
import {EventEmitter} from 'node:events';
test('desktop-missing-active-owner-retried-without-cached-running-guess',async()=>{
 let queries=0;
 class Socket extends EventEmitter {writable=true;destroy(){this.writable=false;this.emit('close');}write(bytes){const m=JSON.parse(bytes.subarray(4)),reply=x=>queueMicrotask(()=>this.emit('data',frame(x)));
  if(m.method==='initialize')reply({type:'response',requestId:m.requestId,resultType:'success',result:{clientId:'reader'}});
  if(m.method==='thread-owner-discovery'){queries++;reply(queries===2?{type:'response',requestId:m.requestId,resultType:'error',error:'no-client-found'}:{type:'response',requestId:m.requestId,resultType:'success',handledByClientId:'owner'});}
  if(m.method==='thread-stream-following-changed'&&m.params.following)reply({type:'broadcast',method:'thread-stream-state-changed',version:11,sourceClientId:'owner',params:{hostId:'local',conversationId:'t',change:{type:'snapshot',revision:queries,conversationState:{id:'t',hostId:'local',threadRuntimeStatus:{type:'active'},turns:[{turnId:'u',turnStartedAtMs:Date.now()-100,status:'inProgress',items:[]}]}}}});
 }}
 const d=createDesktopObserver({timeoutMs:30,connect:()=>{const s=new Socket();queueMicrotask(()=>s.emit('connect'));return s;}});
 try{await d.collect(['t']);const r=await d.collect(['t']);assert.equal(r.states.t?.state,'running','transient missing owner not re-observed');assert.equal(queries,3,'must retry, not replay old state');}finally{d.close();}
});
