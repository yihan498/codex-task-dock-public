import {test,assert} from './test-kit.mjs';
import {validateModelName} from '../src/reader/model-naming.mjs';
test('MODEL_TRANSLATION_WITHOUT_LITERAL_ANCHOR',()=>{
 const parts=[{kind:'object',text:'账号冻结',evidence:'Your account is suspended'}];
 assert.deepEqual(validateModelName({parts},'Your account is suspended'),[{kind:'object',text:'账号冻结'}]);
});
test('MODEL_PARAPHRASE_QUOTE_CANNOT_HIDE_SOURCE_NEGATION',()=>{
 for(const [source,evidence] of [['不要删除合同','合同'],['Do not delete contract','contract'],['请评估文档，不开发系统','系统']]){
  assert.equal(validateModelName({parts:[{kind:'object',text:evidence==='系统'?'系统开发':'合同删除',evidence}]},source),null);
 }
});
// Semantic negative is intentionally retained as an evaluation case. No lexical
// validator can prove a Chinese paraphrase follows from an English/source quote.
export const semanticCounterexample={source:'请整理年报',unacceptableObject:'供应商付款台账'};
