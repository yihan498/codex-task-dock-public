import {test,assert} from './test-kit.mjs';
import {createHash} from 'node:crypto';
import {createModelNaming,createNamingStore,selectNamingInput,namingRecipe} from '../src/reader/model-naming.mjs';
const source=selectNamingInput({thread:{id:'a',turns:[{id:'u',items:[{type:'userMessage',id:'m',content:[{type:'text',text:'请整理年报'}]}]}]}},'a');
const task=now=>({threadId:'a',updatedAt:1,desktopRuntime:{source:'desktop-ipc',threadId:'a',turnId:'u',state:'running',seenAt:now}});
const cache=new Map([['a',{updatedAt:1,namingInput:source}]]),result={parts:[{kind:'object',text:'年报',evidence:'年报'}]};
test('MODEL_CLOSE_PERSISTS_STARTED_ATTEMPT_RESULT',async()=>{
 const now=Date.now(),store=createNamingStore(':memory:');let reject,key;
 const generate=job=>{key=job.key;store.reserve(job.attemptKey,now);return new Promise((_,r)=>reject=r);};generate.close=async()=>reject(Error('naming_unavailable'));
 const n=createModelNaming({store,generate,now:()=>now});n.observe([task(now)],cache);await new Promise(r=>setImmediate(r));await n.close();assert.equal(store.get(key)?.status,'unavailable');assert.equal(store.get(key)?.attempts,1);store.close();
});
test('MODEL_ORPHAN_RESERVED_JOB_RECOVERS_ONCE_WITHOUT_REFUND',async()=>{
 let now=Date.now(),calls=0;const store=createNamingStore(':memory:'),key=createHash('sha256').update(namingRecipe+'\na\n'+source.fingerprint).digest('hex');
 assert.equal(store.reserve(key+':attempt:1',now),true);
 const n=createModelNaming({store,now:()=>now,generate:async job=>{calls++;assert.equal(job.attempt,2);assert.equal(store.reserve(job.attemptKey,now),true);return result;}});
 assert.equal(n.observe([task(now)],cache)[0].nameStatus,'unavailable');await n.drain();assert.equal(calls,0);now+=60001;n.observe([task(now)],cache);await n.drain();assert.equal(n.observe([task(now)],cache)[0].nameStatus,'ready');assert.equal(calls,1);assert.equal(store.used(now),2);await n.close();store.close();
});
