import {test,assert} from './test-kit.mjs';
import {selectNamingInput} from '../src/reader/model-naming.mjs';
test('MODEL_WRAPPED_AND_NEWLINE_INVOCATION_NOT_PROJECT',()=>{
 for(const raw of ['_loki\n请为任务自动命名','## My request:\n_loki 请为任务自动命名','\\_loki\r\n请为任务自动命名']){
  const s=selectNamingInput({thread:{id:'a',turns:[{id:'u',items:[{type:'userMessage',id:'m',content:[{type:'text',text:raw}]}]}]}},'a');assert.equal(s.text,'请为任务自动命名');
 }
});
