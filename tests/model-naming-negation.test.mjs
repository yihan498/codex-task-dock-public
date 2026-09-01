import {test,assert} from './test-kit.mjs';
import {validateModelName} from '../src/reader/model-naming.mjs';
test('MODEL_ENGLISH_AND_STAGE_NEGATION_NOT_EXECUTION',()=>{
 for(const text of ['Do not delete contract','Never delete contract',"Don’t delete contract",'只评估，不开发contract']){
  const action=text.includes('开发')?'开发':'delete';
  assert.equal(validateModelName({parts:[{kind:'object',text:'contract',evidence:'contract'},{kind:'action',text:action,evidence:action}]},text),null);
 }
 const source='只评估文档，不开发';
 assert.deepEqual(validateModelName({parts:[{kind:'object',text:'文档',evidence:'文档'},{kind:'action',text:'评估',evidence:'评估'}]},source),[{kind:'object',text:'文档'},{kind:'action',text:'评估'}]);
});
