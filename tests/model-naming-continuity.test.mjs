import {test,assert} from './test-kit.mjs';
import {createModelNaming,createNamingStore,selectNamingInput} from '../src/reader/model-naming.mjs';
const s=selectNamingInput({thread:{id:'a',turns:[{id:'u',items:[{type:'userMessage',id:'m',content:[{type:'text',text:'请整理年报'}]}]}]}},'a');
const cache=new Map([['a',{updatedAt:1,namingInput:s}]]),now=Date.now(),task={threadId:'a',updatedAt:1,desktopRuntime:{source:'desktop-ipc',threadId:'a',turnId:'u',state:'running',seenAt:now}},result={parts:[{kind:'object',text:'年报',evidence:'年报'}]};
test('MODEL_SAME_TURN_METADATA_UPDATE_DOES_NOT_ERASE_NAME',async()=>{
 const store=createNamingStore(':memory:');let calls=0;const n=createModelNaming({store,now:()=>now,generate:async()=>{calls++;return result;}});n.observe([task],cache);await n.drain();assert.equal(n.observe([{...task,updatedAt:2}],cache)[0].nameStatus,'ready');assert.equal(n.observe([{...task,updatedAt:2,desktopRuntime:{...task.desktopRuntime,turnId:'new'}}],cache)[0].nameStatus,'pending');assert.equal(calls,1);await n.close();store.close();
});
test('MODEL_ACTIVE_RESERVED_JOB_IS_NOT_ORPHAN',async()=>{
 const store=createNamingStore(':memory:');let finish;const n=createModelNaming({store,now:()=>now,generate:job=>{store.reserve(job.attemptKey,now);return new Promise(r=>finish=r);}});n.observe([task],cache);await new Promise(r=>setImmediate(r));assert.equal(n.observe([task],cache)[0].nameStatus,'pending');finish(result);await n.drain();await n.close();store.close();
});
