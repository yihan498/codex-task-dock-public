import {test,assert} from './test-kit.mjs';
import * as api from '../src/reader/reader.mjs';
import {createHash} from 'node:crypto';
const sha=s=>createHash('sha256').update(s).digest('hex');
const fixture=()=>({model:'gpt-5.4-mini',instructions:'NAME_ONLY',input:[{type:'message',role:'developer',content:[{type:'input_text',text:'NAMES'},{type:'input_text',text:'PERMISSIONS'}]},{type:'message',role:'user',content:[{type:'input_text',text:'GLOBAL'}]},{type:'message',role:'user',content:[{type:'input_text',text:'USER_DATA'}]}],tools:[],tool_choice:'auto',parallel_tool_calls:true,reasoning:{effort:'medium'},store:false,stream:true,include:['reasoning.encrypted_content'],text:{verbosity:'medium'}});
const policy=()=>({instructions:'NAME_ONLY',developer:'NAMES',permissions:'PERMISSIONS',globalHash:sha('GLOBAL'),prompt:'USER_DATA'});
test('MODEL_GATE_SSE_WITHOUT_MIME_AND_BAD_PREFIX',async()=>{
 const store=api.createNamingStore(':memory:');
 for(const good of [true,false]){const bytes=new TextEncoder().encode(good?'data: {"type":"response.completed"}\n\n':'<html>not model data</html>');
 const gate=await api.startNamingGate({store,jobKey:'mime-'+good,policy:policy(),forward:async()=>new Response(new ReadableStream({start(c){c.enqueue(bytes.slice(0,2));c.enqueue(bytes.slice(2));c.close();}}))});
 try{const r=await fetch(gate.url+'/responses',{method:'POST',headers:{authorization:'Bearer synthetic'},body:JSON.stringify(fixture())});assert.equal(r.ok,good);const text=await r.text();if(good){assert.equal(r.headers.get('content-type'),'text/event-stream');assert.equal(text,new TextDecoder().decode(bytes));}else assert.ok(!text.includes('<html>'));}finally{await gate.close();}}
 store.close();
});
test('MODEL_GATE_RESPONSE_DIAGNOSTIC_NO_CONTENT',async()=>{
 const store=api.createNamingStore(':memory:'),events=[];const gate=await api.startNamingGate({store,jobKey:'diagnostic',policy:policy(),onDiagnostic:e=>events.push(e),forward:async()=>new Response('PRIVATE_BODY',{headers:{'content-type':'application/json'}})});
 try{const r=await fetch(gate.url+'/responses',{method:'POST',headers:{authorization:'Bearer synthetic'},body:JSON.stringify(fixture())});await r.text();assert.equal(events[0]?.contentType,'application/json');assert.ok(!JSON.stringify(events).includes('PRIVATE'));}finally{await gate.close();store.close();}
});
test('MODEL_GATE_CLOSED_ENVELOPE',()=>{
 assert.equal(typeof api.inspectNamingRequest,'function');
 const body=fixture(),safe=api.inspectNamingRequest(body,policy());assert.equal(safe.tools.length,0);assert.equal(safe.input.length,3);
 for(const field of ['previous_response_id','conversation','metadata','attachments'])assert.throws(()=>api.inspectNamingRequest({...body,[field]:'EXTRA'},policy()));
 for(const mutate of [x=>x.tools.push({name:'apply_patch'}),x=>x.input.push(x.input[2]),x=>x.input[2].content.push({type:'input_image',image_url:'x'}),x=>x.instructions+='EXTRA',x=>x.input[1].content[0].text+='EXTRA',x=>x.input[0].content[1].text+='EXTRA',x=>x.model='other']){const b=fixture();mutate(b);assert.throws(()=>api.inspectNamingRequest(b,policy()));}
});
test('MODEL_GATE_ONE_SEND_CONCURRENT_RETRY_AND_SECRET_HEADERS',async()=>{
 assert.equal(typeof api.startNamingGate,'function');const store=api.createNamingStore(':memory:');let calls=0;
 const gate=await api.startNamingGate({store,jobKey:'trusted-job',policy:policy(),now:()=>Date.parse('2026-08-31T12:00:00Z'),forward:async(url,init)=>{
  calls++;assert.equal(url,'https://chatgpt.com/backend-api/codex/responses');assert.equal(init.redirect,'error');assert.equal(init.headers.cookie,undefined);assert.equal(init.headers.authorization,'Bearer synthetic');assert.equal(store.used(Date.parse('2026-08-31T12:00:00Z')),1);return new Response('data: synthetic\n\n',{headers:{'content-type':'text/event-stream'}});
 }});
 const opts=()=>({method:'POST',headers:{authorization:'Bearer synthetic',cookie:'DO_NOT_FORWARD','content-type':'application/json'},body:JSON.stringify(fixture())});
 try{const responses=await Promise.all([fetch(gate.url+'/responses',opts()),fetch(gate.url+'/responses',opts())]);await Promise.all(responses.map(x=>x.text()));assert.equal(calls,1);assert.equal(responses.filter(x=>x.ok).length,1);
 assert.equal((await fetch(gate.url+'/responses',opts())).ok,false);assert.equal(calls,1);
 assert.equal((await fetch(gate.url.replace(/\/[a-f0-9]+$/,'/wrong')+'/responses',opts())).ok,false);
 }finally{await gate.close();store.close();}
});
test('MODEL_GATE_LIMIT_AND_UNKNOWN_FAILURE_NO_REFUND',async()=>{
 assert.equal(typeof api.startNamingGate,'function');const store=api.createNamingStore(':memory:');let calls=0;const now=Date.parse('2026-08-31T12:00:00Z');
 for(let i=0;i<29;i++)store.reserve('pre'+i,now);
 for(const jobKey of ['last','extra']){const gate=await api.startNamingGate({store,jobKey,policy:policy(),now:()=>now,forward:async()=>{calls++;throw Error('Bearer SECRET USER_BODY');}});
 try{const r=await fetch(gate.url+'/responses',{method:'POST',headers:{authorization:'Bearer synthetic'},body:JSON.stringify(fixture())});assert.ok(!r.ok);assert.ok(!(await r.text()).includes('SECRET'));}finally{await gate.close();}}
 assert.equal(calls,1);assert.equal(store.used(now),30);store.close();
});
test('MODEL_GATE_BAD_INPUT_ZERO_SEND',async()=>{
 assert.equal(typeof api.startNamingGate,'function');const store=api.createNamingStore(':memory:');let calls=0;
 const gate=await api.startNamingGate({store,jobKey:'bad',policy:policy(),forward:async()=>{calls++;return new Response('x');}});
 try{for(const body of [{...fixture(),tools:[{name:'shell'}]},fixture()]){const r=await fetch(gate.url+'/responses',{method:'POST',body:JSON.stringify(body)});assert.ok(!r.ok);await r.text();}assert.equal(calls,0);assert.equal(store.used(Date.now()),0);}finally{await gate.close();store.close();}
});
