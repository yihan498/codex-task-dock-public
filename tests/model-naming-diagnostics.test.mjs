import {test,assert} from './test-kit.mjs';
import {selectNamingInput,createModelNaming,createNamingStore} from '../src/reader/model-naming.mjs';
const source=text=>selectNamingInput({thread:{id:'a',turns:[{id:'u',items:[{type:'userMessage',id:'m',content:[{type:'text',text}]}]}]}},'a');
test('MODEL_INVOCATION_PREFIX_IS_NOT_PROJECT',()=>{
 assert.equal(source('\\_loki 请完善Codex任务面板').text,'请完善Codex任务面板');
 assert.equal(source('_another 请评估任务面板').text,'请评估任务面板');
 assert.equal(source('创建 _review_lab 项目并整理原则').text,'创建 _review_lab 项目并整理原则');
});
test('MODEL_FAILURE_CLASSIFICATION_PERSISTED_WITHOUT_ERROR_BODY',async()=>{
 for(const [generate,reason] of [[async()=>({parts:[{kind:'object',text:'年报',evidence:'不存在'}]}),'output_rejected'],[async()=>{throw Error('naming_upstream_unavailable');},'upstream_unavailable'],[async()=>{throw Error('SECRET_ERROR_BODY');},'model_unavailable']]){
  const store=createNamingStore(':memory:'),now=Date.now(),n=createModelNaming({store,generate,now:()=>now}),task={threadId:'a',updatedAt:1,desktopRuntime:{source:'desktop-ipc',threadId:'a',turnId:'u',state:'running',seenAt:now}},cache=new Map([['a',{updatedAt:1,namingInput:source('请整理年报')}] ]);
  n.observe([task],cache);await n.drain();const v=n.observe([task],cache)[0];assert.equal(v.nameStatus,'unavailable');assert.equal(v.nameFailure,reason);assert.ok(!JSON.stringify(v).includes('SECRET_ERROR_BODY'));await n.close();store.close();
 }
});
