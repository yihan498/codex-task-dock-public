import {spawn as nativeSpawn} from 'node:child_process';
import {extractBoundBusinessFields} from '../core.ts';
import {deriveTaskName} from './auto-name.mjs';
import {selectNamingInput} from './model-naming.mjs';
export {deriveTaskName,applyAutomaticNames} from './auto-name.mjs';
export {selectNamingInput,validateModelName,createNamingStore,createModelNaming} from './model-naming.mjs';
export {inspectNamingRequest,startNamingGate,namingOutputSchema} from './naming-gate.mjs';
export {createIsolatedNamer,parseModelOutput} from './isolated-namer.mjs';
export {namingProxy,createFixedOpenAIForwarder,adaptNamingResponse} from './naming-network.mjs';

const id=value=>typeof value==='string' && value.length>0 && !/\s/.test(value);
// Reviewed content summaries are display data, never original titles or business facts.
export function applyDisplayNames(threads,catalog){
 const entries=catalog?.version===1&&Array.isArray(catalog.entries)&&catalog.entries.length<=128?catalog.entries:[];
 return threads.map(t=>{
  const matches=entries.filter(e=>e?.threadId===t.threadId&&e.turnId===t.desktopRuntime?.turnId);
  if(matches.length!==1)return t;const e=matches[0],refs=e.source?.references;
  if(!id(e.threadId)||!id(e.turnId)||e.source?.kind!=='reviewed-user-content'||!Array.isArray(refs)||refs.length<1||refs.length>8||!refs.every(r=>id(r?.turnId)&&id(r?.messageId))||!refs.some(r=>r.turnId===e.turnId))return t;
  const parts=e.parts;if(!Array.isArray(parts)||parts.length<2||parts.length>4||!parts.every(p=>['company','project','object','action'].includes(p?.kind)&&typeof p.text==='string'&&p.text.trim()&&[...p.text].length<=48)||parts.reduce((n,p)=>n+[...p.text].length,0)>80||!parts.some(p=>['company','project'].includes(p.kind))||!parts.some(p=>p.kind==='object'))return t;
  return {...t,displayName:{source:'reviewed-user-content',threadId:t.threadId,turnId:e.turnId,parts:parts.map(p=>({kind:p.kind,text:p.text}))}};
 });
}
const labels=new Map([['公司','company'],['项目','project'],['工作内容','workContent'],['处理对象','subject'],['截止时间','deadline'],['分区','partition']]);
function explicitKeys(text){
 const keys=new Set();let fence=null;
 for(const raw of text.split(/\r?\n/)){
  const line=raw.trim(),marker=/^(`{3,}|~{3,})/.exec(line)?.[1];
  if(marker){if(!fence)fence=marker;else if(marker[0]===fence[0]&&marker.length>=fence.length&&line===marker)fence=null;continue;}
  if(fence||line.startsWith('>'))continue;
  const match=/^([^：:]+)[：:]/.exec(line),key=labels.get(match?.[1]?.trim());if(key)keys.add(key);
 }
 return keys;
}
export function projectUserFields(response, threadId) {
 const thread=response?.thread;
 if(!id(threadId)||thread?.id!==threadId||!Array.isArray(thread.turns))return {};
 let result={};
 for(const turn of thread.turns){
  if(!id(turn?.id)||!Array.isArray(turn.items))continue;
  for(const item of turn.items){
   if(item?.type!=='userMessage'||!id(item.id)||!Array.isArray(item.content))continue;
   const text=item.content.filter(b=>b?.type==='text'&&typeof b.text==='string').map(b=>b.text).join('\n');
   if(text.length>65536||text.includes('<codex_delegation>'))continue;
   const keys=explicitKeys(text);if(!keys.size)continue;
   const binding={kind:'userMessage',sourceThreadId:threadId,sourceTurnId:turn.id,sourceMessageId:item.id};
   // No message-level timestamp is supplied by this item contract. Never use turn.startedAt.
   const fields=extractBoundBusinessFields({...binding,text},binding);
   // Keep incremental facts, but never mix old business facts into a changed/ambiguous context.
   if(['company','project'].some(key=>keys.has(key)&&
      (!fields[key]||(result[key]&&fields[key].value!==result[key].value))))result={};
   for(const key of keys){delete result[key];if(fields[key])result[key]=fields[key];}
  }
 }
 return result;
}

export function createReadOnlyClient(options={}) {
 const allowed=new Set(['thread/list','thread/read','thread/turns/list']);
 const spawn=options.spawn||nativeSpawn,limit=options.maxBytes||32*1024*1024;
 let child=null,parts=[],bufferBytes=0,nextId=0,init=null,closed=false;
 const pending=new Map();
 function abort(code){
  const old=child;child=null;init=null;parts=[];bufferBytes=0;
  for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error(code));}
  pending.clear();old?.kill();
 }
 function raw(method,params){
  return new Promise((resolve,reject)=>{
   const requestId=++nextId;
   const timer=setTimeout(()=>abort('reader_timeout'),options.timeoutMs||10000);
   pending.set(requestId,{resolve,reject,timer});
   try{child.stdin.write(JSON.stringify({id:requestId,method,params})+'\n');}catch{abort('reader_write_failed');}
  });
 }
 async function initialize(){
  if(closed)throw new Error('reader_closed');
  if(init)return init;
  child=spawn(options.executable,['app-server','--stdio'],{stdio:['pipe','pipe','ignore'],windowsHide:true});
  const owned=child;
  child.on('error',()=>{if(child===owned)abort('reader_process_unavailable');});
  child.on('exit',()=>{if(child===owned)abort('reader_process_exited');});
  child.stdin.on('error',()=>{if(child===owned)abort('reader_write_failed');});
  child.stdout.on('data',chunk=>{
   if(child!==owned)return;
   const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
   let start=0;
   while(start<bytes.length){
    const end=bytes.indexOf(10,start),piece=bytes.subarray(start,end<0?bytes.length:end);
    bufferBytes+=piece.length;
    if(bufferBytes>limit){abort('reader_response_too_large');return;}
    parts.push(piece);
    if(end<0)break;
    const line=Buffer.concat(parts,bufferBytes).toString('utf8');parts=[];bufferBytes=0;start=end+1;
    if(!line.trim())continue;
    let message;
    try{message=JSON.parse(line);}catch{abort('reader_invalid_json');return;}
    const p=pending.get(message.id);if(!p)continue;
    pending.delete(message.id);clearTimeout(p.timer);
    if(message.error)p.reject(new Error('rpc_'+(Number.isInteger(message.error.code)?message.error.code:'error')));
    else p.resolve(message.result);
   }
  });
  init=raw('initialize',{clientInfo:{name:'codex-task-dock-reader',version:'0.6.0'},capabilities:{experimentalApi:true}})
   .then(()=>{if(child!==owned)throw new Error('reader_process_exited');child.stdin.write(JSON.stringify({method:'initialized',params:{}})+'\n');})
   .catch(e=>{if(child===owned)abort('reader_init_failed');init=null;throw e;});
  return init;
 }
 return {
  async request(method,params){if(!allowed.has(method))throw new Error('method_forbidden');await initialize();return raw(method,params);},
  close(){closed=true;abort('reader_closed');}
 };
}

export async function collectSnapshot(client,options={}) {
 const threads=[],cursors=new Set(),ids=new Set();
 let cursor;
 for(let page=0;;page++){
  if(page>=20)throw new Error('pagination_limit');
  const result=await client.request('thread/list',{cursor,limit:100,sortKey:'updated_at',sortDirection:'desc',useStateDbOnly:true});
  if(!Array.isArray(result?.data))throw new Error('reader_list_invalid');
  for(const t of result.data){
   if(!id(t?.id))throw new Error('reader_thread_invalid');
   if(ids.has(t.id))continue;ids.add(t.id);
   const named=typeof t.name==='string'&&t.name.trim().length>0;
   threads.push({threadId:t.id,title:named?t.name:'未命名任务',titleSource:named?'name':'missing',
    runtimeState:typeof t.status?.type==='string'?t.status.type:'unknown',
    ...(typeof t.updatedAt==='number'?{updatedAt:t.updatedAt}:{})});
  }
  cursor=result.nextCursor;
  if(cursor==null)break;
  if(typeof cursor!=='string'||cursors.has(cursor))throw new Error('pagination_cycle');cursors.add(cursor);
 }
 const cache=options.cache||new Map(),now=Date.now();
 // Oldest attempts first, including failures: expired front entries cannot starve unseen tasks.
 const ordered=[...threads].sort((a,b)=>(cache.get(a.threadId)?.fetchedAt??-Infinity)-(cache.get(b.threadId)?.fetchedAt??-Infinity));
 const priority=new Set(options.priorityIds||[]);
 // Reserve half the budget for current/recent work; the rest retains history fairness.
 const urgent=ordered.filter(t=>priority.has(t.threadId)).slice(0,Math.max(1,Math.floor((options.maxFieldReads??8)/2)));
 const scheduled=[...urgent,...ordered.filter(t=>!urgent.includes(t))].map(t=>options.background?{...t}:t);
 async function readBoundedThread(fieldClient,threadId){
  try{return await fieldClient.request('thread/read',{threadId,includeTurns:true});}
  catch(error){if(error?.message!=='reader_response_too_large')throw error;}
  const pages=[],cursors=new Set();let cursor;
  for(let page=0;page<8;page++){
   const result=await fieldClient.request('thread/turns/list',{threadId,cursor,limit:10,sortDirection:'desc',itemsView:'full'});
   if(!Array.isArray(result?.data)||result.data.length>10)throw Error('reader_turn_page_invalid');
   const userTurns=result.data.map(turn=>{
    if(!id(turn?.id)||!Array.isArray(turn.items))throw Error('reader_turn_page_invalid');
    return {id:turn.id,items:turn.items.filter(item=>item?.type==='userMessage'&&id(item.id)&&Array.isArray(item.content)).map(item=>({type:'userMessage',id:item.id,content:item.content.filter(block=>block?.type==='text'&&typeof block.text==='string').map(block=>({type:'text',text:block.text}))}))};
   });
   pages.push(userTurns);
   cursor=result.nextCursor;
   if(cursor==null)return {thread:{id:threadId,turns:pages.reverse().flatMap(page=>page.reverse())}};
   if(typeof cursor!=='string'||cursors.has(cursor))throw Error('reader_turn_pagination_cycle');
   cursors.add(cursor);
  }
  throw Error('reader_turn_pagination_limit');
 }
 async function readFields(){
 let reads=0;
 for(const t of scheduled){
  if(options.background?.closed)break;
  const saved=cache.get(t.threadId);
  const expectedTurn=options.expectedTurns?.[t.threadId];
  const newTurn=expectedTurn&&expectedTurn!==saved?.name?.turnId;
  if(saved&&saved.updatedAt===t.updatedAt&&!newTurn&&now-saved.fetchedAt<(priority.has(t.threadId)?15000:60000)){
   if(Object.keys(saved.business).length)t.business=saved.business;t.businessRead=saved.readStatus||'read';continue;
  }
  if(reads>=(options.maxFieldReads??8)){
   if(saved&&saved.updatedAt===t.updatedAt&&Object.keys(saved.business).length)t.business=saved.business;
   t.businessRead='pending';continue;
  }
  reads++;
  try{
   const result=await readBoundedThread(options.fieldClient||client,t.threadId);
   if(result?.thread?.id!==t.threadId||!Array.isArray(result.thread.turns))throw new Error('reader_binding_invalid');
   const business=projectUserFields(result,t.threadId);
   const name=deriveTaskName(result,t.threadId,saved?.name);
   cache.set(t.threadId,{business,name,...(options.captureNamingInput?{namingInput:selectNamingInput(result,t.threadId)}:{}),updatedAt:t.updatedAt,fetchedAt:now});
   if(Object.keys(business).length)t.business=business;t.businessRead='read';
  }catch{cache.set(t.threadId,{business:{},updatedAt:t.updatedAt,fetchedAt:now,readStatus:'unavailable'});t.businessRead='unavailable';}
 }
 }
 if(options.background){
  if(!options.background.promise&&!options.background.closed){
   const pending=readFields().finally(()=>{if(options.background.promise===pending)options.background.promise=null;});
   options.background.promise=pending;
  }
  for(const t of threads){const saved=cache.get(t.threadId);if(saved?.updatedAt===t.updatedAt){if(Object.keys(saved.business).length)t.business=saved.business;t.businessRead=saved.readStatus||'read';}else t.businessRead='pending';}
 }else await readFields();
 for(const key of cache.keys())if(!ids.has(key))cache.delete(key);
 let reporting;
 if(options.reportProvider){
  let result;try{result=await options.reportProvider();}catch{result={status:'unavailable',reports:{}};}
  reporting={status:result?.status==='available'?'available':'unavailable'};
  if(reporting.status==='available')for(const t of threads){if(result.reports?.[t.threadId])t.agentReport=result.reports[t.threadId];}
 }
 return {connection:'live',stale:false,lastSuccessAt:new Date().toISOString(),snapshot:{threads},...(reporting?{reporting}:{}),
  capabilities:{livePlan:false,business:'explicit-user-labels',relativeDates:false}};
}
