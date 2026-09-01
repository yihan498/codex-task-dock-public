import {test,assert} from './test-kit.mjs';
import {validateModelName} from '../src/reader/model-naming.mjs';
test('MODEL_GROUNDED_OBJECT_PARAPHRASE_NOT_TITLE_EXCERPT',()=>{
 const text='Your account is suspended. 我的x为什么被冻结了，如何解决';
 const value={parts:[{kind:'project',text:'x',evidence:'我的x'},{kind:'object',text:'账号冻结',evidence:'Your account is suspended. 我的x为什么被冻结了'},{kind:'action',text:'解决',evidence:'如何解决'}]};
 assert.deepEqual(validateModelName(value,text),value.parts.map(({kind,text})=>({kind,text})));
});
test('MODEL_PARAPHRASE_STILL_REQUIRES_SOURCE_AND_SAFE_ROLE',()=>{
 const source='请整理年报';
 for(const p of [{kind:'object',text:'供应商付款台账',evidence:'未提供的资料'},{kind:'company',text:'另一个公司',evidence:'年报'},{kind:'project',text:'另一个系统',evidence:'年报'}])assert.equal(validateModelName({parts:[p]},source),null);
 assert.equal(validateModelName({parts:[{kind:'object',text:'合同删除',evidence:'不要删除合同'}]},'不要删除合同'),null);
 assert.equal(validateModelName({parts:[{kind:'object',text:'任务进度',evidence:'任务进度'}]},'现在任务进度如何'),null);
});
