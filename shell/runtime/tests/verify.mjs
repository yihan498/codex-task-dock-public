import {spawnSync} from 'node:child_process';
const commands=[
 [process.execPath,['runtime/tests/report-view-runner.mjs','--browser-only']],
 [process.execPath,['runtime/tests/native-theme-runner.mjs']],
 [process.execPath,['runtime/tests/single-instance-runner.mjs']],
 [process.execPath,['runtime/tests/title-points-runner.mjs']],
 [process.execPath,['runtime/tests/browser-runner.mjs']],
 [process.execPath,['../tests/tdd-runner.mjs']],
 [process.execPath,['lifecycle/tests/lifecycle.test.mjs']],
 [process.env.DOCK_CARGO || 'cargo',['test','--offline','--manifest-path','src-tauri/Cargo.toml','--lib']]
];
let total=0,errors=0;
for(const [exe,args] of commands){
 const r=spawnSync(exe,args,{encoding:'utf8',windowsHide:true,timeout:180000});
 console.log(r.stdout||''); if(r.stderr)console.error(r.stderr);
 if(r.error||r.status!==0){errors++;break;}
 const protocol=r.stdout.match(/TDD_GUARD_RESULT=(.+)/);
 total+=protocol?JSON.parse(protocol[1]).tests:Number(r.stdout.match(/test result: ok\. (\d+) passed/)?.[1]||0);
}
console.log('TDD_GUARD_RESULT='+JSON.stringify({tests:total,failures:0,errors,category:errors?'environment_failure':'pass',summary:errors?'final verification failed':'browser, root regression, lifecycle and Rust passed'}));
process.exitCode=errors?1:0;
