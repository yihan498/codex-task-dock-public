import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {readFile,writeFile,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const config=JSON.parse(await readFile('src/reader/local-config.json'));
const tag=process.argv[2]||'v3',malicious=process.argv.includes('--malicious');
const record={kind:'app-server-no-environment-probe',at:new Date().toISOString(),syntheticOnly:true,requests:[],events:[]};
const target=resolve('shell/naming/isolation-fixture/forbidden-'+tag+'.txt');
const server=createServer(async(req,res)=>{
 let raw='';for await(const b of req){raw+=b;if(raw.length>2e6){res.writeHead(413).end();return;}}
 if(req.headers.authorization){record.authHeaderDetected=true;res.writeHead(403).end();return;}
 let body;try{body=JSON.parse(raw);}catch{res.writeHead(400).end();return;}
 const input=JSON.stringify(body.input||[]);record.requests.push({path:req.url,tools:body.tools??[],inputCharacters:input.length,hasSkills:input.includes('Available skills')||input.includes('SKILL.md'),hasWorkspaceContext:input.includes('user-context-v1')||input.includes('实习工作区规则'),roles:(body.input||[]).map(x=>({role:x.role,type:x.type,characters:JSON.stringify(x.content||x.output||'').length,tags:[...JSON.stringify(x.content||'').matchAll(/<\/?([A-Za-z_ -]+)[>\s]/g)].map(m=>m[1]),firstLine:x.role==='user'?(x.content?.[0]?.text||'').split('\n')[0].slice(0,100):null})),hasAuthorization:false});
 record.shape={...body,input:(body.input||[]).map(x=>({...x,content:x.content?.map(c=>({...c,text:x.role==='developer'?c.text:{sha256:createHash('sha256').update(c.text).digest('hex'),length:c.text.length}}))}))};
 res.writeHead(200,{'Content-Type':'text/event-stream'});
 const item=malicious&&record.requests.length===1?{id:'call_probe',type:'custom_tool_call',call_id:'call_probe',name:'apply_patch',input:'*** Begin Patch\n*** Add File: '+target.replaceAll('\\','/')+'\n+FORBIDDEN\n*** End Patch'}:{id:'msg_probe',type:'message',role:'assistant',content:[{type:'output_text',text:'OK'}]};
 for(const e of [{type:'response.created',response:{id:'r_probe',status:'in_progress',output:[]}},{type:'response.output_item.added',output_index:0,item},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{id:'r_probe',status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}}])res.write('data: '+JSON.stringify(e)+'\n\n');res.end();
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const disabled=['shell_tool','unified_exec','shell_snapshot','apps','plugins','remote_plugin','hooks','multi_agent','goals','computer_use','browser_use','browser_use_external','browser_use_full_cdp_access','in_app_browser','workspace_dependencies','image_generation','view_image','skill_search','skill_mcp_dependency_install','tool_suggest','code_mode_host','memories','unbounded_connection_retries','enable_request_compression'];
const args=['app-server','--stdio','--strict-config'];for(const key of disabled)args.push('--disable',key);args.push('--enable','skip_host_skill_discovery');
for(const value of ['skills.include_instructions=false','skills.bundled.enabled=false','orchestrator.skills.enabled=false','tools.update_plan.enabled=false','tools.experimental_request_user_input.enabled=false','include_environment_context=false'])args.push('-c',value);
for(const c of ['approval_policy="never"','sandbox_mode="read-only"','web_search="disabled"','project_doc_max_bytes=0','history.persistence="none"','features.code_mode.enabled=false','model_provider="dock_probe"','model="gpt-5.4-mini"',`model_providers.dock_probe={name="Synthetic local probe",base_url="http://127.0.0.1:${server.address().port}/v1",wire_api="responses",requires_openai_auth=false,request_max_retries=0,stream_max_retries=0}`])args.push('-c',c);
const child=spawn(config.codexExecutable,args,{stdio:['pipe','pipe','pipe'],windowsHide:true});let buffer='',stderr='',seq=0,done;
const pending=new Map(),completion=new Promise(ok=>done=ok),timer=setTimeout(()=>done('timeout'),30000);
child.stderr.on('data',b=>stderr+=b);child.on('exit',()=>{for(const p of pending.values())p.reject(Error('process_exited'));done('exited')});child.on('error',()=>done('process_error'));
child.stdout.on('data',b=>{buffer+=b;let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);let m;try{m=JSON.parse(line);}catch{continue;}if(m.id!==undefined&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error('rpc_'+m.error.code+' '+m.error.message)):p.resolve(m.result);}else if(m.method){record.events.push(m.method);if(m.id!==undefined)child.stdin.write(JSON.stringify({id:m.id,error:{code:-32601,message:'Tool and approval requests disabled'}})+'\n');if(m.method==='turn/completed')done('completed');}}});
const rpc=(method,params)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,method,params})+'\n');});
try{
 await rpc('initialize',{clientInfo:{name:'dock-naming-probe',version:'1'},capabilities:{experimentalApi:true}});child.stdin.write(JSON.stringify({method:'initialized',params:{}})+'\n');
 const cfg=await rpc('config/read',{}),keys=Object.keys(cfg.config?.mcp_servers||{}),overrides={};for(const k of keys){if(!/^[A-Za-z0-9_-]+$/.test(k))throw Error('unsupported_mcp_key');overrides['mcp_servers.'+k+'.enabled']=false;}record.disabledMcpCount=keys.length;
 const start=await rpc('thread/start',{model:'gpt-5.4-mini',modelProvider:'dock_probe',cwd:resolve('shell/naming/isolation-fixture'),approvalPolicy:'never',sandbox:'read-only',ephemeral:true,environments:[],dynamicTools:[],baseInstructions:'Return only the text OK.',developerInstructions:'This is a synthetic capability test.',config:overrides});
 record.ephemeral=start.thread.ephemeral;record.instructionSources=start.instructionSources??null;
 await rpc('turn/start',{threadId:start.thread.id,environments:[],input:[{type:'text',text:'Synthetic test. Reply OK.',text_elements:[]}]});record.completed=await completion;
}catch(e){record.error=e.message;}
finally{clearTimeout(timer);child.stdin.end();await new Promise(ok=>{if(child.exitCode!==null)return ok();const t=setTimeout(()=>{child.kill();ok();},3000);child.once('exit',()=>{clearTimeout(t);ok();});});server.closeAllConnections();await new Promise(ok=>server.close(ok));record.childExited=child.exitCode!==null;record.diagnostic=stderr.slice(-2000);record.forbiddenFileExists=await access(target).then(()=>true,()=>false);await writeFile('shell/delivery/evidence/naming-capabilities-'+tag+'.json',JSON.stringify(record,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(record));}
