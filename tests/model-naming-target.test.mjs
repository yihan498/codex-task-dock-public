import {test,assert} from './test-kit.mjs';
import {validateModelName} from '../src/reader/model-naming.mjs';

test('MODEL_NAME_EXPLICIT_CREATED_AGENT_BEATS_REVIEWER_MENTION',()=>{
 const source='我想新建一个sub agent，叫他sore，主要进行软件工程审核。你把刚刚我和_review_lab的聊天整理下来，让这个设计更加完善可用。';
 assert.equal(validateModelName({parts:[
  {kind:'project',text:'_review_lab',evidence:'_review_lab'},
  {kind:'object',text:'sore软件工程审查设计',evidence:'软件工程审核'},
  {kind:'action',text:'整理',evidence:'整理'}
 ]},source),null);
 assert.deepEqual(validateModelName({parts:[
  {kind:'project',text:'sore',evidence:'sore'},
  {kind:'object',text:'软件工程审查Agent',evidence:'软件工程审核'},
  {kind:'action',text:'整理',evidence:'整理'}
 ]},source),[
  {kind:'project',text:'sore'},
  {kind:'object',text:'软件工程审查Agent'},
  {kind:'action',text:'整理'}
 ]);
});
