import {assert,test} from './test-kit.mjs';
import {startCollectorService} from '../src/reader/service.mjs';
const snapshot={connection:'live',stale:false,lastSuccessAt:new Date().toISOString(),snapshot:{threads:[]},capabilities:{livePlan:false}};
test('collector-service-private-ephemeral-loopback',async()=>{
 const s=await startCollectorService({collect:async()=>snapshot,intervalMs:60000});
 assert.ok(s?.port>0,'service must start');try{
  assert.match(s.token,/^[a-f0-9]{64}$/);
  const rejected=await fetch(s.url+'/api/snapshot');assert.equal(rejected.status,401);
  await s.refresh();
  const ok=await fetch(s.url+'/api/snapshot',{headers:{Authorization:'Bearer '+s.token}});
  assert.equal(ok.status,200);assert.deepEqual((await ok.json()).snapshot,{threads:[]});
 }finally{await s?.close();}
});
test('collector-service-rejects-web-origin-and-mutations',async()=>{
 const s=await startCollectorService({collect:async()=>snapshot,intervalMs:60000});assert.ok(s);
 try{
  const headers={Authorization:'Bearer '+s.token,Origin:'https://example.com'};
  assert.equal((await fetch(s.url+'/api/snapshot',{headers})).status,403);
  assert.equal((await fetch(s.url+'/api/snapshot',{method:'POST',headers:{Authorization:'Bearer '+s.token}})).status,405);
  assert.equal((await fetch(s.url+'/not-an-api',{headers:{Authorization:'Bearer '+s.token}})).status,404);
 }finally{await s?.close();}
});
test('collector-service-failure-is-not-empty-success-and-recovers',async()=>{
 let fail=true;const good={...snapshot,snapshot:{threads:[{threadId:'t1',title:'测试'}]}};
 const s=await startCollectorService({collect:async()=>{if(fail)throw new Error('PRIVATE');return good;},intervalMs:60000});assert.ok(s);
 try{
  const read=async()=>await (await fetch(s.url+'/api/snapshot',{headers:{Authorization:'Bearer '+s.token}})).json();
  await s.refresh();assert.equal((await read()).snapshot,null);assert.equal((await read()).connection,'disconnected');
  fail=false;await s.refresh();assert.deepEqual((await read()).snapshot,good.snapshot);
  fail=true;await s.refresh();const stale=await read();assert.equal(stale.stale,true);assert.deepEqual(stale.snapshot,good.snapshot);
  assert.equal(JSON.stringify(stale).includes('PRIVATE'),false);
  fail=false;await s.refresh();assert.equal((await read()).stale,false);
 }finally{await s?.close();}
});
test('collector-service-refresh-does-not-overlap',async()=>{
 let release,calls=0;const work=new Promise(r=>release=r);
 const s=await startCollectorService({collect:async()=>{calls++;await work;return snapshot;},intervalMs:60000});assert.ok(s);
 try{const a=s.refresh(),b=s.refresh();release();await Promise.all([a,b]);assert.equal(calls,1);}
 finally{await s?.close();}
});
