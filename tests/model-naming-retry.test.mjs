import {test,assert} from './test-kit.mjs';
import * as api from '../src/reader/reader.mjs';
test('MODEL_OUTPUT_COMPLETE_JSON_OR_FENCE_ONLY',()=>{
 assert.equal(typeof api.parseModelOutput,'function');assert.deepEqual(api.parseModelOutput('```json\n{"parts":[]}\n```'),{parts:[]});assert.deepEqual(api.parseModelOutput('{"parts":[]}'),{parts:[]});assert.throws(()=>api.parseModelOutput('{"parts":[]} extra'));assert.throws(()=>api.parseModelOutput(''));
});
test('MODEL_FAILURE_AUTOMATIC_RETRY_ONCE_PERSISTED',async()=>{
 let now=Date.now(),calls=0;const store=api.createNamingStore(':memory:');
 const t={threadId:'a',updatedAt:1,desktopRuntime:{source:'desktop-ipc',threadId:'a',turnId:'u',state:'stopped',stoppedAt:now,seenAt:now}};
 const s=api.selectNamingInput({thread:{id:'a',turns:[{id:'u',items:[{type:'userMessage',id:'m',content:[{type:'text',text:'请整理半年报'}]}]}]}},'a'),cache=new Map([['a',{updatedAt:1,namingInput:s}]]),keys=[];
 const generate=async job=>{calls++;keys.push(job.attemptKey);throw Error('network');};
 let n=api.createModelNaming({store,generate,now:()=>now});n.observe([t],cache);await n.drain();now+=30000;n.observe([t],cache);await n.drain();assert.equal(calls,1);await n.close();
 n=api.createModelNaming({store,generate,now:()=>now});now+=31000;n.observe([t],cache);await n.drain();assert.equal(calls,2);assert.notEqual(keys[0],keys[1]);now+=120000;n.observe([t],cache);await n.drain();assert.equal(calls,2);await n.close();store.close();
});
test('MODEL_STRICT_OUTPUT_FORMAT_FIXED_AT_GATE',()=>{
 // Reuse the public fixed format contract, not caller-supplied schemas.
 assert.equal(typeof api.namingOutputSchema,'object');assert.equal(api.namingOutputSchema.additionalProperties,false);assert.deepEqual(api.namingOutputSchema.required,['parts']);
});
