import {spawnSync} from 'node:child_process';
const r=spawnSync(process.env.DOCK_CARGO||'cargo',
 ['test','--offline','--manifest-path','src-tauri/Cargo.toml','--lib'],{encoding:'utf8',windowsHide:true,timeout:180000});
console.log(r.stdout||'');if(r.stderr)console.error(r.stderr);
const result=/test result: (ok|FAILED)\. (\d+) passed; (\d+) failed/.exec(r.stdout||'');
const failure=result?.[1]==='FAILED';
console.log('TDD_GUARD_RESULT='+JSON.stringify({tests:result?Number(result[2])+Number(result[3]):0,
 failures:result?Number(result[3]):0,errors:result?0:1,
 category:failure?'product_failure':r.status===0&&result?'pass':'environment_failure',
 summary:failure?'native_collector_contract':result?'native collector tests passed':'cargo not ready'}));
process.exitCode=r.status===0?0:1;
