import {test,assert} from './test-kit.mjs';
import {createNamingStore,createModelNaming,selectNamingInput} from '../src/reader/reader.mjs';
test('MODEL_INFLIGHT_NOT_REQUEUED',async()=>{
 const store=createNamingStore(':memory:');let calls=0,finish;const now=Date.now();
 const t={threadId:'a',updatedAt:1,desktopRuntime:{source:'desktop-ipc',threadId:'a',turnId:'u',state:'running',seenAt:now}};
 const s=selectNamingInput({thread:{id:'a',turns:[{id:'u',items:[{type:'userMessage',id:'m',content:[{type:'text',text:'请整理半年报'}]}]}]}},'a');
 const cache=new Map([['a',{updatedAt:1,namingInput:s}]]),n=createModelNaming({store,now:()=>now,generate:()=>{calls++;return calls===1?new Promise(r=>finish=r):Promise.resolve({parts:[]});}});
 n.observe([t],cache);for(let i=0;i<4;i++)n.observe([t],cache);finish({parts:[]});await n.drain();assert.equal(calls,1);await n.close();store.close();
});
