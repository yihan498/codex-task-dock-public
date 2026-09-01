import {test,assert} from './test-kit.mjs';
import {createHash} from 'node:crypto';
import {createModelNaming,createNamingStore,selectNamingInput,namingRecipe} from '../src/reader/model-naming.mjs';
test('MODEL_UNSENT_SECOND_ATTEMPT_REMAINS_AVAILABLE',async()=>{
 const now=Date.now(),s=selectNamingInput({thread:{id:'a',turns:[{id:'u',items:[{type:'userMessage',id:'m',content:[{type:'text',text:'请整理年报'}]}]}]}},'a'),key=createHash('sha256').update(namingRecipe+'\na\n'+s.fingerprint).digest('hex'),store=createNamingStore(':memory:');
 store.reserve(key+':attempt:1',now);store.put(key,'unavailable',[],now,2,now-1,'model_unavailable');let calls=0;
 const n=createModelNaming({store,now:()=>now,generate:async job=>{calls++;assert.equal(job.attempt,2);assert.equal(store.reserve(job.attemptKey,now),true);return {parts:[{kind:'object',text:'年报',evidence:'年报'}]};}}),task={threadId:'a',updatedAt:1,desktopRuntime:{source:'desktop-ipc',threadId:'a',turnId:'u',state:'running',seenAt:now}},cache=new Map([['a',{updatedAt:1,namingInput:s}]]);
 n.observe([task],cache);await n.drain();assert.equal(n.observe([task],cache)[0].nameStatus,'ready');assert.equal(calls,1);assert.equal(store.used(now),2);await n.close();store.close();
});
