import {test,assert} from './test-kit.mjs';
import {deriveTaskName} from '../src/reader/reader.mjs';
import {cases} from '../shell/runtime/tests/title-points-cases.mjs';
for(const [id,fn] of cases.filter(([id])=>id.startsWith('keywords-only-')))test(id,fn);
const source=texts=>({thread:{id:'t',turns:texts.map((text,i)=>({id:'u'+i,items:[{id:'m'+i,type:'userMessage',content:[{type:'text',text}]}]}))}});
test('auto-name-preserves-object-proper-name-prefix',()=>{for(const [request,object] of [['请翻译先秦史','先秦史'],['请整理关于项目.xlsx','关于项目.xlsx']])assert.equal(deriveTaskName(source([request]),'t').parts.find(p=>p.kind==='object')?.text,object);});
test('auto-name-8kb-truncated-message-cannot-revive-old-name',()=>{const n=deriveTaskName(source(['请为青岚科技整理付款台账。','背景说明。'.repeat(1700)+'换个项目，请翻译设备维护手册。']),'t');assert.equal(n.status,'unrecognized');assert.deepEqual(n.parts,[]);});
test('auto-name-questions-and-evaluations-are-not-concrete-objects',()=>{for(const text of ['实现到哪一步','申诉没有提交成功','检查那么严谨细致'])assert.equal(deriveTaskName(source([text]),'t').status,'unrecognized',text);});
