import {test,assert} from './test-kit.mjs';
import {validateModelName} from '../src/reader/model-naming.mjs';

test('MODEL_NAME_AGENT_ROLE_REQUIRES_CONCRETE_DOMAIN_OBJECT',()=>{
 const source='我想新建一个sub agent，叫他sore，主要让他帮我进行软件工程的审核，作为软件工程领域专家审查产品基础功能。';
 assert.equal(validateModelName({parts:[
  {kind:'object',text:'sore子agent',evidence:'sub agent，叫他sore'},
  {kind:'action',text:'新建',evidence:'新建'}
 ]},source),null);
 assert.deepEqual(validateModelName({parts:[
  {kind:'project',text:'sore',evidence:'sore'},
  {kind:'object',text:'软件工程审查Agent',evidence:'软件工程的审核'},
  {kind:'action',text:'新建',evidence:'新建'}
 ]},source),[
  {kind:'project',text:'sore'},
  {kind:'object',text:'软件工程审查Agent'},
  {kind:'action',text:'新建'}
 ]);
});
