// Synthetic loopback provider only. Do not run with real task input or auth headers.
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const config=JSON.parse(await readFile('src/reader/local-config.json'));
const disabled=['shell_tool','unified_exec','shell_snapshot','apps','plugins','remote_plugin','hooks','multi_agent','goals','computer_use','browser_use','browser_use_external','browser_use_full_cdp_access','in_app_browser','workspace_dependencies','image_generation','view_image','skill_search','skill_mcp_dependency_install','tool_suggest','code_mode_host','memories','unbounded_connection_retries','enable_request_compression'];
const args=['exec','--ignore-user-config','--strict-config','--ephemeral','--skip-git-repo-check','--sandbox','read-only','--color','never','--json','--cd',resolve('shell/naming/isolation-fixture')];
for(const key of disabled)args.push('--disable',key);
for(const c of ['approval_policy="never"','web_search="disabled"','project_doc_max_bytes=0','history.persistence="none"','features.code_mode.enabled=false','model_provider="dock_probe"','model="gpt-5.4-mini"'])args.push('-c',c);
const record={kind:'synthetic-loopback-capability-probe',at:new Date().toISOString(),requests:[],noRealTaskInput:true};
const server=createServer(async(req,res)=>{
 let raw='';for await(const b of req){raw+=b;if(raw.length>2e6){res.writeHead(413).end();return;}}
 const auth=Boolean(req.headers.authorization);if(auth){record.authHeaderDetected=true;res.writeHead(403).end();return;}
 let body;try{body=JSON.parse(raw);}catch{res.writeHead(400).end();return;}
 record.requests.push({path:req.url,model:body.model,tools:(body.tools||[]).map(t=>({type:t.type,name:t.name??t.function?.name,tools:t.tools?.map(x=>x.name)})),inputCharacters:JSON.stringify(body.input||[]).length,hasAuthorization:false});
 res.writeHead(200,{'Content-Type':'text/event-stream'});
 const message={id:'msg_probe',type:'message',role:'assistant',content:[{type:'output_text',text:'OK'}]};
 for(const e of [{type:'response.created',response:{id:'r_probe',status:'in_progress',output:[]}},{type:'response.output_item.added',output_index:0,item:message},{type:'response.output_text.delta',item_id:'msg_probe',output_index:0,content_index:0,delta:'OK'},{type:'response.output_item.done',output_index:0,item:message},{type:'response.completed',response:{id:'r_probe',status:'completed',output:[message],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}}])res.write('data: '+JSON.stringify(e)+'\n\n');res.end();
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
args.push('-c',`model_providers.dock_probe={name="Synthetic local probe",base_url="http://127.0.0.1:${server.address().port}/v1",wire_api="responses",requires_openai_auth=false,request_max_retries=0,stream_max_retries=0}`,'-');
const child=spawn(config.codexExecutable,args,{stdio:['pipe','pipe','pipe'],windowsHide:true});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);const timer=setTimeout(()=>child.kill(),30000);
child.stdin.end('Synthetic capability probe. Reply OK.');
record.exitCode=await new Promise(ok=>{child.on('error',()=>ok(-1));child.on('exit',ok)});clearTimeout(timer);server.closeAllConnections();await new Promise(ok=>server.close(ok));
record.eventTypes=stdout.split('\n').flatMap(l=>{try{return [JSON.parse(l).type]}catch{return []}});
record.diagnostic=stderr.slice(-3000);record.args=args;
await writeFile('shell/delivery/evidence/naming-capabilities-'+(process.argv[2]||'v2')+'.json',JSON.stringify(record,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(record));
