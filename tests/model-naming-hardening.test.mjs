import {test,assert} from './test-kit.mjs';
import {selectNamingInput,validateModelName,createModelNaming,createNamingStore,createIsolatedNamer} from '../src/reader/reader.mjs';
const message=(id,text)=>({id,items:[{type:'userMessage',id:'m'+id,content:[{type:'text',text}]}]});
test('MODEL_LATEST_UNREADABLE_IS_BARRIER',()=>{
 for(const text of ['x'.repeat(70000),'<codex_delegation>另一项工作</codex_delegation>']){
 const n=selectNamingInput({thread:{id:'a',turns:[message('old','请整理甲公司年报'),message('new',text)]}},'a');assert.equal(n.text,'');assert.equal(n.turnId,'new');}
});
test('MODEL_UNSUPPORTED_KEYWORDS_AND_NEGATION_REJECTED',()=>{
 assert.equal(validateModelName({parts:[{kind:'object',text:'供应商付款台账',evidence:'供应商付款台账'}]},'请整理年报'),null);
 assert.equal(validateModelName({parts:[{kind:'object',text:'合同',evidence:'合同'},{kind:'action',text:'删除',evidence:'删除'}]},'不要删除合同'),null);
});
test('MODEL_QUEUE_RECHECKS_FRESHNESS_BEFORE_DISPATCH',async()=>{
 let now=Date.now(),finish;const store=createNamingStore(':memory:'),calls=[];
 const tasks=['a','b'].map(id=>({threadId:id,updatedAt:1,desktopRuntime:{source:'desktop-ipc',threadId:id,turnId:'u',state:'running',seenAt:now}}));
 const cache=new Map(tasks.map(t=>[t.threadId,{updatedAt:1,namingInput:selectNamingInput({thread:{id:t.threadId,turns:[message('u','请整理年报')]}},t.threadId)}]));
 const n=createModelNaming({store,now:()=>now,generate:job=>{calls.push(job.threadId);return job.threadId==='a'?new Promise(r=>finish=r):Promise.resolve({parts:[]});}});
 n.observe(tasks,cache);now+=25000;finish({parts:[]});await n.drain();assert.deepEqual(calls,['a']);await n.close();store.close();
});
test('MODEL_CLOSE_DURING_PREFLIGHT_CANNOT_LAUNCH',async()=>{
 let finish,calls=0;const store=createNamingStore(':memory:');
 const n=createIsolatedNamer({store,executable:'SHOULD_NOT_SPAWN',cwd:'.',preflight:()=>new Promise(r=>finish=r),syntheticForward:async()=>{calls++;}});
 const work=n({text:'请整理年报',key:'closing'}).then(()=>false,()=>true);await new Promise(r=>setImmediate(r));const closing=n.close();
 assert.equal(typeof finish,'function');finish();await closing;assert.equal(await work,true);assert.equal(calls,0);store.close();
});
