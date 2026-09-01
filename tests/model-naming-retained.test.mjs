import {test,assert} from './test-kit.mjs';
import {createModelNaming,createNamingStore,selectNamingInput,namingRecipe} from '../src/reader/model-naming.mjs';
import {createHash} from 'node:crypto';

const now=Date.parse('2026-09-01T01:20:00Z');
const input=(messages)=>({thread:{id:'dock',turns:messages.map((text,index)=>({id:'u'+(index+1),items:[{type:'userMessage',id:'m'+(index+1),content:[{type:'text',text}]}]}))}});
const task=turnId=>({threadId:'dock',updatedAt:1,desktopRuntime:{source:'desktop-ipc',threadId:'dock',turnId,state:'running',seenAt:now}});
const reliable=[{kind:'project',text:'Codex Task Dock'},{kind:'object',text:'当前任务和今日任务自动命名'},{kind:'action',text:'继续修改'}];

function seedReady(store,source){
 const key=createHash('sha256').update(namingRecipe+'\ndock\n'+source.fingerprint).digest('hex');
 store.put(key,'ready',reliable,now,1,0,null);
}

test('MODEL_FAILED_NEW_TURN_RETAINS_LATEST_RELIABLE_NAME_WITH_SOURCE_TURN',async()=>{
 const store=createNamingStore(':memory:');
 const oldSource=selectNamingInput(input(['请继续修改 Codex Task Dock，完善当前任务和今日任务自动命名。']),'dock');
 seedReady(store,oldSource);
 const changed=selectNamingInput(input([
  '请继续修改 Codex Task Dock，完善当前任务和今日任务自动命名。',
  '旧版已经退出，请完成托盘原生验收。'
 ]),'dock');
 const cache=new Map([['dock',{updatedAt:2,namingInput:changed}]]);
 const n=createModelNaming({store,now:()=>now,generate:async()=>{throw Error('naming_upstream_unavailable');}});
 n.observe([task('u2')],cache);await n.drain();
 const view=n.observe([task('u2')],cache)[0];
 assert.deepEqual(view.displayName?.parts,reliable);
 assert.equal(view.displayName?.source,'model-user-content-retained');
 assert.equal(view.displayName?.turnId,'u2');
 assert.equal(view.displayName?.sourceTurnId,'u1');
 assert.equal(view.nameStatus,'unavailable');
 await n.close();store.close();
});

test('MODEL_UNRECOGNIZED_NEW_TURN_RETAINS_LATEST_RELIABLE_NAME',async()=>{
 const store=createNamingStore(':memory:');
 const oldSource=selectNamingInput(input(['请继续修改 Codex Task Dock，完善当前任务和今日任务自动命名。']),'dock');seedReady(store,oldSource);
 const changed=selectNamingInput(input(['请继续修改 Codex Task Dock，完善当前任务和今日任务自动命名。','# Files mentioned by the user:\n\n## screenshot.png\n\n## My request:\n','我已退出旧版。']),'dock');
 const cache=new Map([['dock',{updatedAt:2,namingInput:changed}]]),n=createModelNaming({store,now:()=>now,generate:async()=>({parts:[]})});
 n.observe([task('u3')],cache);await n.drain();const view=n.observe([task('u3')],cache)[0];
 assert.deepEqual(view.displayName?.parts,reliable);assert.equal(view.displayName?.source,'model-user-content-retained');assert.equal(view.nameStatus,'unrecognized');
 await n.close();store.close();
});

test('MODEL_EXPLICIT_SCOPE_CHANGE_NEVER_RETAINS_OLD_PROJECT_NAME',async()=>{
 const store=createNamingStore(':memory:');
 const oldSource=selectNamingInput(input(['请整理星河资本半年报。']),'dock');seedReady(store,oldSource);
 const changed=selectNamingInput(input(['请整理星河资本半年报。','现在换个项目，请创建雅思写作练习计划。']),'dock');
 const cache=new Map([['dock',{updatedAt:2,namingInput:changed}]]);
 const n=createModelNaming({store,now:()=>now,generate:async()=>{throw Error('naming_upstream_unavailable');}});
 n.observe([task('u2')],cache);await n.drain();const view=n.observe([task('u2')],cache)[0];
 assert.equal(view.displayName,undefined);
 await n.close();store.close();
});
