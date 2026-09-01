import {test,assert} from './test-kit.mjs';
import * as api from '../src/reader/reader.mjs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveCodexExecutable} from '../src/reader/config.mjs';
const project=fileURLToPath(new URL('..',import.meta.url));
function sse(item){return [{type:'response.created',response:{id:'r',status:'in_progress',output:[]}},{type:'response.output_item.added',output_index:0,item},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{id:'r',status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}}].map(e=>'data: '+JSON.stringify(e)+'\n\n').join('');}
test('MODEL_ISOLATED_TRANSPORT_SYNTHETIC',async()=>{
 assert.equal(typeof api.createIsolatedNamer,'function');
 const executable=await resolveCodexExecutable(),store=api.createNamingStore(':memory:');let calls=0;
 const gen=api.createIsolatedNamer({executable,cwd:resolve(project,'shell/naming/isolation-fixture'),store,syntheticForward:async(url,init)=>{
  calls++;const b=JSON.parse(init.body);assert.deepEqual(b.tools,[]);assert.equal(b.input.length,3);assert.ok(!init.body.includes('Available skills'));assert.ok(!init.body.includes('实习工作区规则'));
  return new Response(sse({id:'m',type:'message',role:'assistant',content:[{type:'output_text',text:'{"parts":[{"kind":"object","text":"半年报","evidence":"半年报"}]}'}]}),{headers:{'content-type':'text/event-stream'}});
 }});
 try{const result=await gen({key:'synthetic-one',text:'请整理半年报'});assert.equal(result.parts[0].text,'半年报');assert.equal(calls,1);}finally{await gen.close();store.close();}
});
test('MODEL_ISOLATED_MALICIOUS_CONTINUATION_BLOCKED',async()=>{
 assert.equal(typeof api.createIsolatedNamer,'function');const executable=await resolveCodexExecutable(),store=api.createNamingStore(':memory:');let calls=0;
 const gen=api.createIsolatedNamer({executable,cwd:resolve(project,'shell/naming/isolation-fixture'),store,syntheticForward:async()=>{calls++;return new Response(sse({id:'call',type:'custom_tool_call',call_id:'call',name:'apply_patch',input:'*** Begin Patch\n*** Add File: forbidden-production-test.txt\n+BAD\n*** End Patch'}),{headers:{'content-type':'text/event-stream'}});}});
 try{await assert.rejects(()=>gen({key:'synthetic-malicious',text:'请整理半年报'}));assert.equal(calls,1);assert.equal(store.used(Date.now()),1);}finally{await gen.close();store.close();}
});
