import {readFile,access,mkdir,mkdtemp,writeFile,copyFile} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const source=resolve('src-tauri/src/single_instance.rs');
const passed=[],failed=[];
const assert=(ok,message)=>{if(!ok)throw Error(message)};
async function check(id,fn){try{await fn();passed.push(id)}catch(e){failed.push({id,message:e.message})}}
let available=true;
try{available=(await readFile(source,'utf8')).includes('pub fn startup()')}catch{available=false}
await check('single-instance-acquired-before-side-effects',async()=>{
 const lib=await readFile('src-tauri/src/lib.rs','utf8');
 assert(available,'shared production startup policy is absent');
 const run=lib.slice(lib.indexOf('pub fn run()'));
 assert(run.indexOf('single_instance::startup()')>=0&&run.indexOf('single_instance::startup()')<run.indexOf('tauri::Builder'),'lock not acquired before native setup');
 assert(run.includes('let _instance_guard')&&run.includes('Ok(None) => return 0')&&run.includes('Err(code) => return code'),'production error/duplicate codes not propagated');
 assert((await readFile('src-tauri/src/main.rs','utf8')).includes('std::process::exit(codex_task_dock_shell::run())'),'main discards production exit code');
});
let environment;
const children=new Set();
if(available){try{
 await mkdir('output/single-instance',{recursive:true});
 const tmp=await mkdtemp(resolve('output/single-instance/run-'));
 const helper=resolve(tmp,'helper.rs'),exe=resolve(tmp,'helper.exe'),other=resolve(tmp,'other.exe');
 // Generated test harness only; the included lock is the production Rust module.
 await writeFile(helper,`#[path=${JSON.stringify(source.replaceAll('\\','/'))}] mod single_instance;
 fn main(){let args:Vec<String>=std::env::args().collect();let result=if args[1]=="default"{single_instance::startup()}else{single_instance::startup_at(std::path::Path::new(&args[1]))};match result{Ok(Some(_guard))=>{println!("READY");let mut line=String::new();std::io::stdin().read_line(&mut line).unwrap();},Ok(None)=>println!("SECOND"),Err(code)=>{println!("ERROR");std::process::exit(code)}}}`);
 const compile=spawnSync(process.env.DOCK_RUSTC||'rustc',['--edition=2021',helper,'-o',exe],{encoding:'utf8',windowsHide:true});
 if(compile.status!==0)throw Error('harness compile failed: '+compile.stderr);
 await copyFile(exe,other);
 const testEnv={...process.env,TEMP:tmp,TMP:tmp};
 const launch=(path,binary=exe,env=testEnv)=>{
  const p=spawn(binary,[path],{windowsHide:true,stdio:['pipe','pipe','pipe'],env});children.add(p);
  const exit=new Promise(r=>p.once('exit',(code,signal)=>{children.delete(p);r({code,signal})}));
  const ready=new Promise((r,j)=>{let out='';const timer=setTimeout(()=>j(Error('helper startup timeout')),4000);
   p.stdout.on('data',c=>{out+=c;if(out.includes('\n')){clearTimeout(timer);r(out.trim())}});p.on('error',e=>{clearTimeout(timer);j(e)});});
  return {p,ready,exit};
 };
 const stop=async child=>{child.p.stdin.end('\n');await child.exit};
 await check('same-path-second-process-exits',async()=>{
  const path=resolve(tmp,'normal/instance.lock'),first=launch(path);assert(await first.ready==='READY','first not acquired');
  const second=launch(path);assert(await second.ready==='SECOND','duplicate acquired');assert((await second.exit).code===0,'duplicate error');await stop(first);
 });
 await check('different-executable-path-shares-lock',async()=>{
  const path=resolve(tmp,'cross/instance.lock'),a=launch(path),b=launch(path,other);const states=await Promise.all([a.ready,b.ready]);
  assert(states.filter(s=>s==='READY').length===1&&states.includes('SECOND'),'different copies both started');await stop(states[0]==='READY'?a:b);
 });
 await check('simultaneous-processes-have-one-winner',async()=>{
  for(let i=0;i<5;i++){
   const path=resolve(tmp,'race'+i+'/instance.lock');const pair=[launch(path),launch(path)];const states=await Promise.all(pair.map(p=>p.ready));
   assert(states.filter(s=>s==='READY').length===1&&states.includes('SECOND'),'race admits duplicate');await stop(pair[states.indexOf('READY')]);
  }
 });
 await check('killed-owner-releases-lock-without-deletion',async()=>{
  const path=resolve(tmp,'crash/instance.lock'),a=launch(path);assert(await a.ready==='READY','crash owner absent');a.p.kill();await a.exit;
  await access(path);const b=launch(path);assert(await b.ready==='READY','stale file blocks recovery');await stop(b);
 });
 await check('filesystem-error-is-not-reported-as-duplicate',async()=>{
  const blocked=resolve(tmp,'blocked');await writeFile(blocked,'test obstacle');const a=launch(resolve(blocked,'instance.lock'));
  assert(await a.ready==='ERROR'&&(await a.exit).code===2,'filesystem error hidden as duplicate');
 });
 await check('default-path-is-per-user-not-executable-directory',async()=>{
  const local=resolve(tmp,'user-data'),env={...testEnv,LOCALAPPDATA:local};const a=launch('default',exe,env);assert(await a.ready==='READY','default failed');
  const b=launch('default',other,env);assert(await b.ready==='SECOND','default follows executable path');await b.exit;
  await access(resolve(local,'CodexTaskDock/instance.lock'));await stop(a);
 });
 await check('missing-user-directory-fails-closed',async()=>{
  const env={...testEnv};delete env.LOCALAPPDATA;const a=launch('default',exe,env);assert(await a.ready==='ERROR'&&(await a.exit).code===2,'missing environment starts unlocked');
 });
 await check('production-startup-error-has-private-free-recovery-log',async()=>{
  const log=await readFile(resolve(tmp,'CodexTaskDock/startup-error.log'),'utf8');
  assert(log.includes('exit=2')&&log.includes('LOCALAPPDATA')&&log.includes('不要删除锁文件'),'diagnostic or recovery instructions absent');
  assert(!log.includes(tmp)&&!log.includes('token'),'diagnostics contains paths or secrets');
 });
}catch(e){environment=e.message}finally{for(const p of children){p.kill();}}}
const result={tests:passed.length+failed.length,failures:failed.length,errors:environment?1:0,category:environment?'environment_failure':failed.length?'product_failure':'pass',summary:environment||failed.map(f=>f.id).join(',')||'exclusive Windows subprocess lock passed',passed,failedTests:failed.map(f=>f.id),details:failed};
console.log('TDD_GUARD_RESULT='+JSON.stringify(result));process.exitCode=result.category==='pass'?0:1;
