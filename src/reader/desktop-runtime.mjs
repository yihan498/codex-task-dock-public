// Read-only adapter for the installed desktop IPC v11. No task control handlers.
import net from 'node:net';
import {randomUUID} from 'node:crypto';
import {open,realpath} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,relative,isAbsolute,basename} from 'node:path';
const validId=s=>typeof s==='string'&&/^[\w-]{1,100}$/.test(s);
const time=n=>Number.isSafeInteger(n)&&n>0&&n<8640000000000000;
export function projectDesktopState(s,id,now=Date.now()){
 if(s?.id!==id||s.hostId!=='local'||!validId(id))return null;
 const history=s.turnHistory?.kind==='canonical'?s.turnHistory.history:null;
 const island=Array.isArray(history?.islands)?history.islands.at(-1):null;
 const tail=history?(island?.newerBoundary?.status==='exhausted'?history.entitiesByKey?.[island.entries?.at(-1)?.value]:null):s.turns?.at(-1);
 const t=validId(tail?.turnId)&&time(tail.turnStartedAtMs)?tail:null;
 const runtime=s.threadRuntimeStatus?.type;
 let state='unknown',stoppedAt;
 if(t&&t.turnStartedAtMs<=now){
  if(runtime==='active'&&t.status==='inProgress')state='running';
  if(runtime==='idle'&&['completed','interrupted','failed','cancelled'].includes(t.status)){
   state='stopped';
  }
 }
 const lastPlan=Array.isArray(t?.items)?t.items.filter(i=>i?.type==='todo-list').at(-1)?.plan:null;
 let plan=Array.isArray(lastPlan)?lastPlan.map(p=>({step:p?.step,status:p?.status==='inProgress'?'in_progress':p?.status})):[];
 if(plan.length>12||plan.some(p=>typeof p.step!=='string'||!p.step.trim()||[...p.step].length>160||!['completed','pending','in_progress'].includes(p.status))||plan.filter(p=>p.status==='in_progress').length>1)plan=[];
 return {source:'desktop-ipc',threadId:id,...(t?{turnId:t.turnId}:{}),state,seenAt:now,plan,planSource:'desktop-current-plan',...(state==='stopped'?{reason:t.status}:{})};
}
export function stopEventTime(lines,turnId,now=Date.now()){
 let result;
 for(const line of lines.split('\n')){let e;try{e=JSON.parse(line);}catch{continue;}
  if(e.type!=='event_msg'||e.payload?.turn_id!==turnId||!['task_complete','turn_aborted'].includes(e.payload.type))continue;
  if(typeof e.timestamp!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(e.timestamp))continue;
  const at=Date.parse(e.timestamp);if(time(at)&&at<=now&&new Date(at).toISOString().slice(0,19)===e.timestamp.slice(0,19))result=at;
 }return result;
}
export function mergeDesktopHistory(cache,threads,states,now=Date.now()){
 const result={...states},ids=new Set(threads.map(t=>t.threadId));
 for(const t of threads){
  const r=states[t.threadId],old=cache.get(t.threadId);
  if(r){if(r.state==='running'||r.state==='stopped'&&r.stoppedAt)cache.set(t.threadId,{runtime:r,updatedAt:t.updatedAt});else cache.delete(t.threadId);}
  else if(old&&Number.isFinite(t.updatedAt)&&t.updatedAt===old.updatedAt&&(
   old.runtime.state==='stopped'||old.runtime.state==='running'&&Number.isSafeInteger(old.runtime.seenAt)&&now>=old.runtime.seenAt&&now-old.runtime.seenAt<=20000
  ))result[t.threadId]=old.runtime;
  else cache.delete(t.threadId);
 }
 for(const id of cache.keys())if(!ids.has(id))cache.delete(id);
 return result;
}
export function updateRunningPriority(lastRunning,misses,requested,states,maxMisses=4,maxRetained=1){
 const previous=[...lastRunning];lastRunning.clear();let retained=0;
 for(const [id,r] of Object.entries(states))if(r.state==='running'){lastRunning.add(id);misses.delete(id);}
 for(const id of previous){
  if(!requested.has(id)||states[id]){if(!requested.has(id)||states[id]?.state!=='running')misses.delete(id);continue;}
  const count=(misses.get(id)||0)+1;
  if(count<=maxMisses&&retained<maxRetained){misses.set(id,count);lastRunning.add(id);retained++;}else misses.delete(id);
 }
 for(const id of misses.keys())if(!requested.has(id))misses.delete(id);
}
export async function readStopTime(path,id,turnId,{root=join(homedir(),'.codex','sessions')}={}){
 let file;
 try{
  if(typeof path!=='string'||!basename(path).includes(id))return;
  const base=await realpath(root),target=await realpath(path),part=relative(base,target);
  if(!part||part.startsWith('..')||isAbsolute(part))return;
  file=await open(target,'r');const stat=await file.stat(),header=Buffer.alloc(Math.min(stat.size,256*1024));await file.read(header,0,header.length,0);
  let meta;try{meta=JSON.parse(header.toString('utf8').split('\n')[0]);}catch{return;}
  if(meta?.type!=='session_meta'||meta.payload?.id!==id)return;
  const size=Math.min(stat.size,2*1024*1024),bytes=Buffer.alloc(size);
  await file.read(bytes,0,size,stat.size-size);let text=bytes.toString('utf8');if(stat.size>size)text=text.slice(text.indexOf('\n')+1);
  return stopEventTime(text,turnId);
 }catch{return;}finally{await file?.close().catch(()=>{});}
}
export function frame(message){const bytes=Buffer.from(JSON.stringify(message)),head=Buffer.alloc(4);head.writeUInt32LE(bytes.length);return Buffer.concat([head,bytes]);}
export class FrameReader{
 constructor(onMessage,maxBytes=16*1024*1024){this.onMessage=onMessage;this.maxBytes=maxBytes;this.head=Buffer.alloc(4);this.headBytes=0;this.parts=[];this.remaining=0;this.length=0;}
 push(bytes){let pos=0;while(pos<bytes.length){
  if(this.headBytes<4){const n=Math.min(4-this.headBytes,bytes.length-pos);bytes.copy(this.head,this.headBytes,pos,pos+n);this.headBytes+=n;pos+=n;if(this.headBytes<4)return;
   this.length=this.head.readUInt32LE();if(this.length===0||this.length>this.maxBytes)throw Error('ipc_frame_too_large');this.remaining=this.length;
  }
  const n=Math.min(this.remaining,bytes.length-pos);if(n){this.parts.push(bytes.subarray(pos,pos+n));this.remaining-=n;pos+=n;}
  if(this.remaining===0){const payload=Buffer.concat(this.parts,this.length);this.parts=[];this.headBytes=0;this.onMessage(JSON.parse(payload));}
 }}
}
export function createDesktopObserver({connect=()=>net.connect('\\\\.\\pipe\\codex-ipc'),timeoutMs=3000,pollTimeoutMs=10000,onDiagnostic=()=>{}}={}){
 let socket=null,initializing=null,clientId='initializing-client',closed=false;
 const pending=new Map(),snapshots=new Map();
 const lastRunning=new Set();
 const runningMisses=new Map();
 const snapshotAttempts=new Map(),discoveryAttempts=new Map();let attempt=0;
 const send=m=>{if(!socket?.writable)throw Error('desktop_unavailable');socket.write(frame(m));};
 function fail(){const old=socket;socket=null;old?.destroy();initializing=null;clientId='initializing-client';for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('desktop_disconnected'));}pending.clear();for(const p of snapshots.values()){clearTimeout(p.timer);p.resolve(null);}snapshots.clear();}
 function request(method,params,version=1){return new Promise((resolve,reject)=>{const requestId=randomUUID(),timer=setTimeout(()=>{pending.delete(requestId);reject(Error('desktop_timeout'));},timeoutMs);pending.set(requestId,{resolve,reject,timer});try{send({type:'request',requestId,sourceClientId:clientId,version,method,params});}catch(e){clearTimeout(timer);pending.delete(requestId);reject(e);}});}
 async function ready(){
  if(closed)throw Error('desktop_closed');if(initializing)return initializing;
  initializing=new Promise((resolve,reject)=>{
   const owned=socket=connect();
   const timer=setTimeout(()=>{fail();reject(Error('desktop_connect_timeout'));},timeoutMs);
   const reader=new FrameReader(m=>{
    if(m.type==='client-discovery-request'){send({type:'client-discovery-response',requestId:m.requestId,response:{canHandle:false}});return;}
    if(m.type==='response'){const p=pending.get(m.requestId);if(p){clearTimeout(p.timer);pending.delete(m.requestId);p.resolve(m);}return;}
    if(m.type!=='broadcast'||m.method!=='thread-stream-state-changed'||m.version!==11||m.params?.hostId!=='local'||m.params?.change?.type!=='snapshot')return;
    const id=m.params.conversationId,p=snapshots.get(id);
    onDiagnostic({stage:'snapshot',id,expected:p?.owner,actual:m.sourceClientId,pending:!!p});
    if(!p||p.owner!==m.sourceClientId||m.targetClientIds&&!m.targetClientIds.includes(clientId))return;
    if(!Number.isSafeInteger(m.params.change.revision)||m.params.change.revision<0)return;
    clearTimeout(p.timer);snapshots.delete(id);
    const raw=m.params.change.conversationState,result=projectDesktopState(raw,id);
    if(result?.state==='stopped'){
     let timer;Promise.race([readStopTime(raw?.rolloutPath,id,result.turnId),new Promise(resolve=>{timer=setTimeout(resolve,500);})]).then(at=>p.resolve({...result,...(at?{stoppedAt:at,stopSource:'codex-terminal-event'}:{})}),()=>p.resolve(result)).finally(()=>clearTimeout(timer));
    }else p.resolve(result);
   },64*1024*1024);
   owned.on('data',b=>{if(socket!==owned)return;try{reader.push(b);}catch(e){onDiagnostic(e.message);fail();}});
   owned.on('error',()=>{clearTimeout(timer);if(socket===owned)fail();reject(Error('desktop_unavailable'));});
   owned.on('close',()=>{if(socket===owned)fail();});
   owned.on('connect',async()=>{try{const r=await request('initialize',{clientType:'task-dock-readonly'},0);if(!validId(r.result?.clientId))throw Error('desktop_init_invalid');clientId=r.result.clientId;clearTimeout(timer);resolve();}catch(e){clearTimeout(timer);fail();reject(e);}});
  });return initializing;
 }
 async function ownerOf(id){
  const r=await request('thread-owner-discovery',{hostId:'local',conversationId:id});
  onDiagnostic({stage:'owner',id,owner:r.handledByClientId,result:r.resultType,error:r.error});
  return r.resultType==='success'&&validId(r.handledByClientId)?r:null;
 }
 async function read(id,knownOwner){
  const r=knownOwner||await ownerOf(id);if(!r)return null;
  try{return await new Promise(resolve=>{const timer=setTimeout(()=>{snapshots.delete(id);resolve(null);},timeoutMs);snapshots.set(id,{resolve,timer,owner:r.handledByClientId});
   try{send({type:'broadcast',method:'thread-stream-following-changed',version:1,sourceClientId:clientId,targetClientIds:[r.handledByClientId],params:{hostId:'local',conversationId:id,following:true}});}catch{clearTimeout(timer);snapshots.delete(id);resolve(null);}
  });}finally{try{send({type:'broadcast',method:'thread-stream-following-changed',version:1,sourceClientId:clientId,targetClientIds:[r.handledByClientId],params:{hostId:'local',conversationId:id,following:false}});}catch{}}
 }
 return {
  async collect(ids){
   try{await ready();}catch{return {status:'unavailable',states:{}};}
   const budget=Math.max(10,Math.min(10000,pollTimeoutMs)),states={},queue=[...new Set(ids.filter(validId))],requested=new Set(queue),deadline=Date.now()+budget,owners=[];
   const discoveryDeadline=Date.now()+Math.min(2000,budget/4);
   let budgetStoppedConnected=false,unfinished=false;
   queue.sort((a,b)=>Number(lastRunning.has(b))-Number(lastRunning.has(a))||(discoveryAttempts.get(a)||0)-(discoveryAttempts.get(b)||0));
   const limit=setTimeout(()=>{budgetStoppedConnected=!!socket?.writable;unfinished=true;fail();},budget);
   await Promise.all(Array.from({length:Math.min(8,queue.length)},async()=>{while(queue.length&&socket?.writable&&Date.now()<discoveryDeadline){const id=queue.shift();discoveryAttempts.set(id,++attempt);try{const owner=await ownerOf(id);if(owner)owners.push({id,owner});}catch{unfinished=true;}}}));
   unfinished ||= queue.length>0;
   owners.sort((a,b)=>Number(lastRunning.has(b.id))-Number(lastRunning.has(a.id))||(snapshotAttempts.get(a.id)||0)-(snapshotAttempts.get(b.id)||0));
   await Promise.all(Array.from({length:Math.min(2,owners.length)},async()=>{while(owners.length&&socket?.writable&&Date.now()<deadline){const {id,owner}=owners.shift();snapshotAttempts.set(id,++attempt);try{const s=await read(id,owner);if(s)states[id]=s;else unfinished=true;}catch{unfinished=true;}}}));
   unfinished ||= owners.length>0;
   // A transient desktop ownership handoff is retried, not replaced by yesterday's state.
   for(const id of lastRunning){if(!requested.has(id)){lastRunning.delete(id);continue;}if(!states[id]&&socket?.writable&&Date.now()+timeoutMs<deadline){try{const s=await read(id);if(s)states[id]=s;}catch{}}}
   // Priority is earned afresh each poll: failed old owners must not starve new windows.
   updateRunningPriority(lastRunning,runningMisses,requested,states);
   for(const attempts of [snapshotAttempts,discoveryAttempts])for(const id of attempts.keys())if(!requested.has(id))attempts.delete(id);
   clearTimeout(limit);const status=socket?.writable||budgetStoppedConnected&&Object.keys(states).length>0?'available':'unavailable';fail();return {status,partial:status==='available'&&unfinished,states};
  },
  close(){closed=true;fail();}
 };
}
