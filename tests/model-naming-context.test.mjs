import {test,assert} from './test-kit.mjs';
import {selectNamingInput} from '../src/reader/reader.mjs';
const turn=(id,text)=>({id,items:[{type:'userMessage',id:'m'+id,content:[{type:'text',text}]}]});
test('MODEL_REDACTS_CONTACTS_NOT_BUSINESS_CONTEXT',()=>{
 const r=selectNamingInput({thread:{id:'a',turns:[turn('u1','我的推特账户被冻结，需要申诉'),turn('u2','回复 support@example.invalid 的邮件，继续跟进推特账户申诉 https://help.example.invalid/case/123'),turn('u3','提交申诉')]}},'a');
 assert.ok(r.text.includes('推特账户被冻结'));assert.ok(r.text.includes('继续跟进推特账户申诉'));assert.ok(!r.text.includes('@'));assert.ok(!r.text.includes('https://'));assert.ok(!r.text.includes('case/123'));
});
test('MODEL_SCAFFOLD_SKIPPED_BUT_REAL_UNREADABLE_BARRIER_REMAINS',()=>{
 const r=selectNamingInput({thread:{id:'a',turns:[turn('u1','请整理青岚科技半年报'),turn('u2','# AGENTS.md instructions\n平台规则'),turn('u3','继续')]}},'a');assert.ok(r.text.includes('青岚科技半年报'));assert.ok(!r.text.includes('平台规则'));
 const bad=selectNamingInput({thread:{id:'a',turns:[turn('u1','请整理青岚科技半年报'),turn('u2','x'.repeat(70000)),turn('u3','继续')]}},'a');assert.equal(bad.text,'');
});
test('MODEL_CONTEXT_KEEPS_EARLY_PROJECT_AND_LATEST_CONCRETE_WORK_WITHIN_BOUND',()=>{
 const r=selectNamingInput({thread:{id:'a',turns:[
  turn('u1','这是星河资本募集项目。'),
  turn('u2','过程背景。'.repeat(1000)),
  turn('u3','现在整理募集说明书和半年报。')
 ]}},'a');
 assert.ok([...r.text].length<=2000);
 assert.ok(r.text.includes('星河资本募集'));
 assert.ok(r.text.includes('募集说明书和半年报'));
});
