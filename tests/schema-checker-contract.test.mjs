import {assert,test} from './test-kit.mjs';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('schema-checker-rejects-offset-normalization-at-every-date-entry',async()=>{
 const schema=JSON.parse(await readFile(new URL('../contracts/task-contract.schema.json',import.meta.url),'utf8'));
 const instant='2026-08-31T18:00:00Z';
 const make=(entry,value)=>{
  const task={threadId:'test-thread',business:{deadline:{value:instant,
   source:{sourceThreadId:'test-thread',sourceTurnId:'test-turn',sourceMessageId:'test-message'},
   basis:{type:'relative',timeZone:'Asia/Shanghai',messageTime:instant}}},
   planView:{source:{kind:'appServer.plan',threadId:'test-thread',turnId:'test-turn',receivedAt:instant,localSequence:1}}};
  if(entry==='deadline')task.business.deadline.value=value;
  if(entry==='messageTime')task.business.deadline.basis.messageTime=value;
  if(entry==='receivedAt')task.planView.source.receivedAt=value;
  return task;
 };
 const cases=[];
 for(const entry of ['deadline','messageTime','receivedAt']){
  for(const [valid,offsets] of [[false,['+00:60','+01:99','-00:99','+24:00','-23:60']],
   [true,['+00:00','-05:30','+23:59']]]){
   for(const offset of offsets)cases.push({id:`${entry}-${offset}`,valid,
    instance:make(entry,`2026-08-31T18:00:00${offset}`)});
  }
 }
 const result=spawnSync(process.env.DOCK_SCHEMA_PYTHON||'D:/Anaconda/python.exe',
  [fileURLToPath(new URL('./schema-common-validation.py',import.meta.url))],
  {input:JSON.stringify({schema,cases}),encoding:'utf8',windowsHide:true});
 assert.equal(result.status,0,result.stdout||result.stderr);
});
