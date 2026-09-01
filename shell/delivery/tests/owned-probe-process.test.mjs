import assert from 'node:assert/strict';
import {startOwnedProbe} from '../owned-probe-process.mjs';
for(const body of ['process.stdout.write("bad\\n");setInterval(()=>{},1000)','setInterval(()=>{},1000)','process.exit(0)']){
 const records=[];await assert.rejects(startOwnedProbe(process.execPath,['-e',body],records,{timeout:200}));
 assert.equal(records.length,1);assert.equal(records[0].exited,true);assert.throws(()=>process.kill(records[0].pid,0));
}
console.log(JSON.stringify({tests:3,failures:0,network:false,model:false,ownedExited:true}));
