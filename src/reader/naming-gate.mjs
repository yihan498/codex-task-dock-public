import {createServer} from 'node:http';
import {createHash,randomBytes} from 'node:crypto';
const endpoint='https://chatgpt.com/backend-api/codex/responses';
export const namingOutputSchema={type:'object',additionalProperties:false,required:['parts'],properties:{parts:{type:'array',maxItems:4,items:{type:'object',additionalProperties:false,required:['kind','text','evidence'],properties:{kind:{type:'string',enum:['company','project','object','action']},text:{type:'string',maxLength:32},evidence:{type:'string',maxLength:200}}}}}};
const sha=s=>createHash('sha256').update(s).digest('hex');
const fail=()=>{throw Error('naming_context_rejected');};
const only=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(k=>keys.includes(k));
export function inspectNamingRequest(b,p){
 if(!only(b,['model','instructions','input','tools','tool_choice','parallel_tool_calls','reasoning','store','stream','include','text','prompt_cache_key','client_metadata'])||b.model!=='gpt-5.4-mini'||b.instructions!==p.instructions||!Array.isArray(b.tools)||b.tools.length||b.store!==false||b.stream!==true||!Array.isArray(b.input)||b.input.length!==3)fail();
 const expected=[['developer',[p.developer,p.permissions]],['user',null],['user',[p.prompt]]];
 const input=b.input.map((m,i)=>{
  if(!only(m,['type','id','role','content'])||m.type!=='message'||m.role!==expected[i][0]||!Array.isArray(m.content)||m.content.length!==(i===0?2:1))fail();
  const content=m.content.map((c,j)=>{if(!only(c,['type','text'])||c.type!=='input_text'||typeof c.text!=='string'||(i===1?sha(c.text)!==p.globalHash:c.text!==expected[i][1][j]))fail();return {type:'input_text',text:c.text};});
  return {type:'message',role:m.role,content};
 });
 // Rebuild a closed envelope. Local session IDs, metadata, cache references and provider
 // extras are not forwarded; fixed controls cannot be overridden by incoming fields.
 return {model:'gpt-5.4-mini',instructions:p.instructions,input,tools:[],tool_choice:'none',parallel_tool_calls:false,reasoning:{effort:'low'},store:false,stream:true,text:{verbosity:'low',format:{type:'json_schema',name:'task_keywords',strict:true,schema:namingOutputSchema}}};
}

export async function startNamingGate({store,jobKey,policy,now=Date.now,forward=fetch,authorize=()=>true,onDiagnostic=()=>{}}){
 const secret=randomBytes(24).toString('hex');let attempted=false,closed=false,lastError=null;const controllers=new Set();
 const server=createServer(async(req,res)=>{
  const deny=(status,code)=>{lastError=code;if(!res.headersSent)res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:code,type:'invalid_request_error'}}));};
  if(closed||req.method!=='POST'||req.url!=='/'+secret+'/responses'||req.headers.origin||req.headers['content-encoding'])return deny(403,'naming_request_rejected');
  const abort=new AbortController();controllers.add(abort);const timeout=setTimeout(()=>{abort.abort();req.destroy();res.destroy();},45000);
  try{
   let size=0;const chunks=[];for await(const b of req){size+=b.length;if(size>32768)return deny(413,'naming_request_too_large');chunks.push(b);}
   let body;try{body=inspectNamingRequest(JSON.parse(Buffer.concat(chunks).toString('utf8')),policy);}catch{return deny(400,'naming_context_rejected');}
   if(typeof req.headers.authorization!=='string'||!req.headers.authorization.startsWith('Bearer '))return deny(403,'naming_auth_unavailable');
   if(!authorize())return deny(409,'naming_source_changed');
   if(attempted)return deny(429,'naming_limit');
   attempted=true;
   if(!store.reserve(jobKey,now()))return deny(429,'naming_limit');
   if(!authorize())return deny(409,'naming_source_changed');
   // Token handling is memory-only. No cookies, proxy headers, host or arbitrary headers.
   const headers={'content-type':'application/json',accept:'text/event-stream',authorization:req.headers.authorization};
   for(const key of ['chatgpt-account-id','originator','version','user-agent'])if(typeof req.headers[key]==='string')headers[key]=req.headers[key];
   const upstream=await forward(endpoint,{method:'POST',headers,body:JSON.stringify(body),redirect:'error',signal:abort.signal});
   const mime=upstream.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
   try{onDiagnostic({kind:'upstream-response',status:upstream.status,contentType:!mime?'missing':['application/json','text/event-stream','text/plain','text/html','application/octet-stream'].includes(mime)?mime:'other'});}catch{}
   if(!upstream.ok){await upstream.body?.cancel();return deny(502,'naming_upstream_unavailable');}
   if(!upstream.body)return deny(502,'naming_response_invalid');
   const iterator=upstream.body[Symbol.asyncIterator]();let prefix=Buffer.alloc(0),received=0;
   while(prefix.length<6){const next=await iterator.next();if(next.done)break;prefix=Buffer.concat([prefix,Buffer.from(next.value)]);if(prefix.length>131072){await iterator.return();return deny(502,'naming_response_too_large');}}
   const isSse=/^(?:\uFEFF)?\s*(?:data:|event:|:)/.test(prefix.toString('utf8',0,Math.min(prefix.length,64)));
   try{onDiagnostic({kind:'upstream-format',format:isSse?'sse':'other',prefixBytes:prefix.length});}catch{}
   if(!isSse){await iterator.return();return deny(502,'naming_response_invalid');}
   res.writeHead(200,{'content-type':'text/event-stream'});res.write(prefix);received=prefix.length;
   for(;;){const next=await iterator.next();if(next.done)break;const b=next.value;received+=b.length;if(received>131072){abort.abort();res.destroy();lastError='naming_response_too_large';return;}res.write(b);}
   res.end();
  }catch{if(!res.destroyed)deny(502,'naming_upstream_unavailable');}
  finally{clearTimeout(timeout);controllers.delete(abort);}
 });
 server.on('clientError',(_,socket)=>socket.destroy());
 await new Promise((ok,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',ok);});
 return {url:'http://127.0.0.1:'+server.address().port+'/'+secret,get error(){return lastError;},async close(){closed=true;for(const c of controllers)c.abort();server.closeAllConnections();await new Promise(ok=>server.close(ok));}};
}
