import {spawnSync} from 'node:child_process';
let tests=0,failures=0,errors=0,summary=[];
const commands=[[process.execPath,['runtime/tests/browser-runner.mjs']]];
if(!process.argv.includes('--browser-only'))commands.push([process.env.DOCK_CARGO||'cargo',['test','--offline','--manifest-path','src-tauri/Cargo.toml','--lib','agent_report_']]);
for(const [exe,args] of commands){const r=spawnSync(exe,args,{encoding:'utf8',windowsHide:true,timeout:120000,env:{...process.env,DOCK_BROWSER_CASES:'./desktop-view-cases.cjs'}});console.log(r.stdout);if(r.stderr)console.error(r.stderr);const p=r.stdout?.match(/TDD_GUARD_RESULT=(.+)/);if(p){const v=JSON.parse(p[1]);tests+=v.tests;failures+=v.failures;errors+=v.errors;summary.push(v.summary);}else{const m=r.stdout?.match(/test result: (?:ok|FAILED)\. (\d+) passed; (\d+) failed/);if(m){tests+=Number(m[1])+Number(m[2]);failures+=Number(m[2]);if(Number(m[2]))summary.push('agent_report_native_projection');}else errors++;}}
console.log('TDD_GUARD_RESULT='+JSON.stringify({tests,failures,errors,category:errors?'environment_failure':failures?'product_failure':'pass',summary:summary.join(';')}));process.exitCode=failures||errors?1:0;
