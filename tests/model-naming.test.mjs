import {test,assert} from './test-kit.mjs';
import * as api from '../src/reader/reader.mjs';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const input=(text,turn='u1')=>({thread:{id:'a',turns:[{id:turn,items:[{type:'userMessage',id:'m'+turn,content:[{type:'text',text}]}]}]}});
const ready={parts:[{kind:'company',text:'星河资本',evidence:'星河资本'},{kind:'object',text:'半年报',evidence:'半年报'},{kind:'action',text:'整理',evidence:'整理'}]};
const now=Date.parse('2026-08-31T10:00:00Z');
const task=(id='a',turn='u1')=>({threadId:id,updatedAt:1,desktopRuntime:{source:'desktop-ipc',threadId:id,turnId:turn,state:'running',seenAt:now}});
const source=()=>api.selectNamingInput(input('请整理星河资本半年报'),'a');
test('MODEL_INPUT_BOUNDED',()=>{
 assert.equal(typeof api.selectNamingInput,'function');
 const r=api.selectNamingInput(input('请整理星河资本半年报。'.repeat(300)),'a');
 assert.ok([...r.text].length<=2000);assert.ok(r.text.includes('半年报'));
 assert.equal(api.selectNamingInput(input('x'),'other'),null);
});
test('MODEL_INPUT_USER_ONLY_AND_CONTINUE_STABLE',()=>{
 assert.equal(typeof api.selectNamingInput,'function');
 const r=input('请整理星河资本半年报'),a=api.selectNamingInput(r,'a');
 r.thread.turns.push(...input('继续','u2').thread.turns);
 r.thread.turns[1].items.push({type:'agentMessage',id:'z',text:'另外公司'});
 const b=api.selectNamingInput(r,'a');assert.equal(a.fingerprint,b.fingerprint);assert.equal(b.turnId,'u2');
 for(const raw of ['<codex_delegation>秘密业务</codex_delegation>','# AGENTS.md instructions\n秘密业务','<environment_context>秘密业务</environment_context>','password: secret','```\n秘密代码\n```'])assert.equal(api.selectNamingInput(input(raw),'a').text,'');
});
test('MODEL_RESULT_EVIDENCE_AND_NO_FACT_INVENTION',()=>{
 assert.equal(typeof api.validateModelName,'function');
 assert.equal(api.validateModelName(ready,source().text).length,3);
 assert.equal(api.validateModelName({parts:[{kind:'object',text:'伪造',evidence:'未给'}]},source().text),null);
 assert.equal(api.validateModelName({parts:[{kind:'company',text:'另一个公司',evidence:'星河资本'},{kind:'object',text:'半年报',evidence:'半年报'}]},source().text),null);
 assert.equal(api.validateModelName({...ready,progress:99},source().text),null);
 assert.deepEqual(api.validateModelName({parts:[]},source().text),[]);
});
test('MODEL_RESULT_REJECTS_BROAD_LABEL_BUT_ACCEPTS_SOURCE_BOUND_SPECIFIC_LABEL',()=>{
 const text='_review_lab 项目的工作对象是 审核推理 学习机制，也涉及学习与能力强化；具体动作是改进角色与学习机制，不能只写成宽泛的开展。';
 assert.equal(api.validateModelName({parts:[
  {kind:'object',text:'学习与能力强化',evidence:'学习与能力强化'},
  {kind:'action',text:'开展',evidence:'开展'}
 ]},text),null);
 assert.deepEqual(api.validateModelName({parts:[
  {kind:'project',text:'_review_lab',evidence:'_review_lab'},
  {kind:'object',text:'审核推理学习机制',evidence:'审核推理 学习机制'},
  {kind:'action',text:'改进',evidence:'改进'}
 ]},text),[
  {kind:'project',text:'_review_lab'},
  {kind:'object',text:'审核推理学习机制'},
  {kind:'action',text:'改进'}
 ]);
});
test('MODEL_QUOTA_RESTART_CONCURRENT_AND_CLOCK',async()=>{
 assert.equal(typeof api.createNamingStore,'function');
 const dir=await mkdtemp(join(tmpdir(),'dock-naming-test-')),path=join(dir,'cache.sqlite');
 let a,b;try{
 a=api.createNamingStore(path);b=api.createNamingStore(path);
 for(let i=0;i<30;i++)assert.equal((i%2?a:b).reserve('j'+i,now),true);
 assert.equal(a.reserve('j0',now),false);assert.equal(b.reserve('j31',now),false);
 a.close();a=api.createNamingStore(path);assert.equal(a.reserve('j32',now),false);
 assert.equal(a.reserve('tomorrow',now+86400000),true);assert.equal(b.reserve('backwards',now),false);
 assert.equal(a.used(now+86400000),1);
 }finally{a?.close();b?.close();await rm(dir,{recursive:true,force:true});}
});
test('MODEL_CACHE_BACKGROUND_CHANGED_INPUT_AND_SCOPE',async()=>{
 assert.equal(typeof api.createModelNaming,'function');
 const store=api.createNamingStore(':memory:');let calls=0;
 const gen=async()=>{calls++;return ready;};
 const n=api.createModelNaming({store,generate:gen,now:()=>now});
 const cache=new Map([['a',{updatedAt:1,namingInput:source()}]]),t=[task()];
 assert.equal(n.observe(t,cache)[0].nameStatus,'pending');await n.drain();
 let view=n.observe(t,cache)[0];assert.equal(view.nameStatus,'ready');assert.equal(view.displayName.source,'model-user-content');
 for(let i=0;i<10;i++)n.observe(t,cache);await n.drain();assert.equal(calls,1);
 await n.close();const restarted=api.createModelNaming({store,generate:gen,now:()=>now});
 restarted.observe(t,cache);await restarted.drain();assert.equal(calls,1);
 const changed=api.selectNamingInput(input('请整理星河资本半年报，核对募集说明书','u2'),'a');cache.set('a',{updatedAt:2,namingInput:changed});
 restarted.observe([{...task('a','u2'),updatedAt:2}],cache);await restarted.drain();assert.equal(calls,2);
 restarted.observe([{...task(),desktopRuntime:{...task().desktopRuntime,state:'stopped',stoppedAt:now-86400000}}],cache);await restarted.drain();assert.equal(calls,2);
 await restarted.close();store.close();
});
test('MODEL_LATE_RESULT_AND_UNAVAILABLE_BINDING',async()=>{
 assert.equal(typeof api.createModelNaming,'function');let finish;
 const store=api.createNamingStore(':memory:'),n=api.createModelNaming({store,now:()=>now,generate:()=>new Promise(r=>finish=r)});
 const cache=new Map([['a',{updatedAt:1,namingInput:source()}]]);n.observe([task()],cache);
 await new Promise(r=>setImmediate(r));
 const newer={...task('a','u2'),updatedAt:2};assert.equal(n.observe([newer],cache)[0].nameStatus,'pending');
 finish(ready);await n.drain();assert.equal(n.observe([newer],cache)[0].displayName,undefined);
 await n.close();store.close();
});
test('MODEL_CACHE_NO_BODY_AND_FAILED_RETRY_BOUNDED',async()=>{
 assert.equal(typeof api.createModelNaming,'function');
 const dir=await mkdtemp(join(tmpdir(),'dock-cache-test-')),path=join(dir,'n.sqlite');const store=api.createNamingStore(path);let calls=0;
 const n=api.createModelNaming({store,now:()=>now,generate:async()=>{calls++;throw Error('DO_NOT_PERSIST_BODY');}});
 const cache=new Map([['a',{updatedAt:1,namingInput:source()}]]);
 for(let i=0;i<5;i++){n.observe([task()],cache);await n.drain();}assert.equal(calls,1);
 assert.equal(n.observe([task()],cache)[0].nameStatus,'unavailable');
 await n.close();store.close();const bytes=await readFile(path);assert.ok(!bytes.includes(Buffer.from('请整理')));assert.ok(!bytes.includes(Buffer.from('DO_NOT_PERSIST_BODY')));await rm(dir,{recursive:true,force:true});
});
