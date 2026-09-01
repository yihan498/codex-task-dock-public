import {test,assert} from './test-kit.mjs';
import {collectSnapshot} from '../src/reader/reader.mjs';
test('MODEL_READER_IN_MEMORY_SOURCE_NOT_SNAPSHOT',async()=>{
 const cache=new Map(),client={request:async method=>method==='thread/list'?{data:[{id:'a',name:'旧标题',updatedAt:1,status:{type:'notLoaded'}}]}:{thread:{id:'a',turns:[{id:'u',items:[{type:'userMessage',id:'m',content:[{type:'text',text:'请整理星河资本半年报'}]}]}]}}};
 const r=await collectSnapshot(client,{cache,captureNamingInput:true});
 assert.equal(cache.get('a').namingInput?.text,'请整理星河资本半年报');assert.ok(!JSON.stringify(r).includes('请整理'));
 const off=new Map();await collectSnapshot(client,{cache:off});assert.equal(off.get('a').namingInput,undefined);
});
test('MODEL_READER_PAGES_TURNS_WHEN_FULL_THREAD_EXCEEDS_BOUND',async()=>{
 const cache=new Map(),calls=[];
 const listClient={request:async method=>{assert.equal(method,'thread/list');return {data:[{id:'a',name:null,updatedAt:2,status:{type:'notLoaded'}}]};}};
 const fieldClient={request:async(method,params)=>{
  calls.push([method,params]);
  if(method==='thread/read')throw Error('reader_response_too_large');
  assert.equal(method,'thread/turns/list');
  if(!params.cursor)return {data:[{id:'u2',items:[{type:'userMessage',id:'m2',content:[{type:'text',text:'现在整理募集说明书和半年报。'}]}]}],nextCursor:'older'};
  return {data:[{id:'u1',items:[{type:'userMessage',id:'m1',content:[{type:'text',text:'这是星河资本募集项目。'}]}]}],nextCursor:null};
 }};
 const result=await collectSnapshot(listClient,{cache,fieldClient,captureNamingInput:true,maxFieldReads:1});
 const source=cache.get('a').namingInput;
 assert.equal(cache.get('a').readStatus,undefined);
 assert.ok(source.text.includes('星河资本募集'));
 assert.ok(source.text.includes('募集说明书和半年报'));
 assert.equal(calls.filter(([method])=>method==='thread/turns/list').length,2);
 assert.ok(calls.filter(([method])=>method==='thread/turns/list').every(([,params])=>params.limit<=20&&params.itemsView==='full'));
 assert.ok(!JSON.stringify(result).includes('募集说明书'));
});
