async (page) => {
 const passed=[],failed=[],errors=[];
 page.on('pageerror',e=>errors.push(String(e.message)));
 const check=async(id,fn)=>{try{await fn();passed.push(id);}catch(e){failed.push({id,message:String(e.message)});}};
 const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
 await page.addInitScript(()=>{
  window.__mode=sessionStorage.getItem('qa-mode')||'live';window.__active=0;window.__maxActive=0;window.__count=0;
  const now=Date.now();
  window.__payload={connection:'live',stale:false,lastSuccessAt:new Date(now).toISOString(),threads:Array.from({length:213},(_,i)=>({
   threadId:'fixture-'+i,title:(i===0?'【排版测试】':'测试项目 · ')+(i===0?'超长中文对象用于验证标题换行且没有覆盖其他行'.repeat(3):'核对记录 '+i),titleSource:'name',runtimeState:'notLoaded',updatedAt:Math.floor(now/1000)-i
  }))};
  window.__TAURI__={core:{invoke:async cmd=>{
   if(cmd==='hide_dock')throw new Error('test-hide-failure');
   window.__active++;window.__maxActive=Math.max(window.__maxActive,window.__active);window.__count++;
   try{
    if(window.__mode==='held')await new Promise(resolve=>{window.__release=resolve});
    if(window.__mode==='offline')throw new Error('test offline');
    if(window.__mode==='nodata')return {connection:'connecting',stale:false,threads:null,lastSuccessAt:null};
    return window.__payload;
   }finally{window.__active--;}
  }}};
 });
 await page.setViewportSize({width:390,height:560});await page.reload();await page.waitForTimeout(250);
 await check('213-items-scroll-and-long-title-wrap',async()=>{
  assert(await page.locator('.task').count()===213,'not all tasks rendered');
  assert(await page.locator('#tasks').evaluate(el=>el.scrollHeight>el.clientHeight && el.clientHeight>=250),'scroll area invalid');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow');
  await page.screenshot({path:'runtime/output/playwright/a-fixture-390.png'});
 });
 await check('scroll-position-survives-unchanged-refresh',async()=>{
  await page.locator('#tasks').evaluate(el=>el.scrollTop=600);
  const before=await page.locator('#tasks').evaluate(el=>el.scrollTop);
  await page.locator('#refresh').click();await page.waitForTimeout(100);
  assert(await page.locator('#tasks').evaluate(el=>el.scrollTop)===before,'refresh jumped scroll');
 });
 await check('single-flight-across-auto-and-manual-refresh',async()=>{
  await page.evaluate(()=>{window.__mode='held';document.querySelector('#refresh').click();});
  await page.waitForTimeout(5200);
  assert(await page.evaluate(()=>window.__maxActive)===1,'overlapping native requests');
  assert(await page.locator('#refresh').isDisabled(),'refresh not disabled');
  await page.evaluate(()=>{window.__mode='live';window.__release();});await page.waitForTimeout(100);
 });
 await check('old-timestamp-is-stale-even-with-live-connection',async()=>{
  await page.evaluate(()=>window.__payload.lastSuccessAt=new Date(Date.now()-60000).toISOString());
  await page.locator('#refresh').click();await page.waitForTimeout(100);
  assert((await page.locator('#connection').textContent()).includes('数据已陈旧'),'false live freshness');
  await page.screenshot({path:'runtime/output/playwright/a-stale.png'});
 });
 await check('invalid-and-millisecond-timestamps',async()=>{
  await page.evaluate(()=>{window.__payload.threads=[
   {threadId:'ms',title:'毫秒时间测试',runtimeState:'notLoaded',updatedAt:Date.now()},
   {threadId:'bad',title:'无效时间测试',runtimeState:'notLoaded',updatedAt:'nonsense'},
   {threadId:'max',title:'超范围时间测试',runtimeState:'notLoaded',updatedAt:9e20},
   {threadId:'duplicate',title:'重复ID测试',runtimeState:'notLoaded'},
   {threadId:'duplicate',title:'重复不计数',runtimeState:'notLoaded'}
  ];});
  await page.locator('#refresh').click();await page.waitForTimeout(100);
  assert(await page.locator('[data-metric=today]').textContent()==='1','invalid timestamp counted today');
  assert(await page.locator('[data-metric=total]').textContent()==='4','duplicate ids double counted');
 });
 await check('initial-no-snapshot-does-not-claim-zero',async()=>{
  await page.evaluate(()=>sessionStorage.setItem('qa-mode','nodata'));await page.reload();await page.waitForTimeout(150);
  assert(await page.locator('[data-metric=total]').textContent()==='—','unknown count fabricated zero');
  assert((await page.locator('#connection').textContent()).includes('等待采集'),'initial state missing');
  await page.screenshot({path:'runtime/output/playwright/a-no-data.png'});
 });
 await check('initial-bridge-failure-is-explicit',async()=>{
  await page.evaluate(()=>sessionStorage.setItem('qa-mode','offline'));await page.reload();await page.waitForTimeout(150);
  assert((await page.locator('#connection').textContent()).includes('连接中断'),'initial failure missing');
  assert(await page.locator('[data-metric=total]').textContent()==='—','offline initial count fabricated');
 });
 await check('hide-failure-has-visible-feedback',async()=>{
  await page.locator('#hide').click();assert((await page.locator('#connection').textContent()).includes('隐藏未成功'),'hide failed silently');
 });
 await page.evaluate(()=>sessionStorage.removeItem('qa-mode'));await page.reload();await page.waitForTimeout(150);
 await page.setViewportSize({width:320,height:560});
 await check('320-width-and-200percent-readable-scroll',async()=>{
  await page.screenshot({path:'runtime/output/playwright/a-fixture-320.png'});
  await page.evaluate(()=>document.documentElement.style.fontSize='32px');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'200% horizontal overflow');
  assert(await page.locator('#tasks').evaluate(el=>el.clientHeight>40),'200% tasks inaccessible');
  await page.screenshot({path:'runtime/output/playwright/a-fixture-200percent.png'});
 });
 await check('no-browser-runtime-errors',async()=>assert(errors.length===0,errors.join(',')));
 await page.setViewportSize({width:390,height:560});await page.evaluate(()=>document.documentElement.style.fontSize='16px');
 let real={status:'not-measured'};
 try{
  const r=await page.request.get('http://127.0.0.1:4317/api/snapshot');const source=await r.json();
  const payload={connection:source.connection,stale:source.stale,lastSuccessAt:source.lastSuccessAt||null,threads:source.snapshot?.threads?.map(t=>({threadId:t.threadId,title:t.title,titleSource:t.titleSource||'unknown',runtimeState:t.runtimeState,updatedAt:t.updatedAt}))||null};
  await page.evaluate(p=>{window.__mode='live';window.__payload=p},payload);
  await page.locator('#refresh').click();await page.waitForTimeout(150);
  await page.screenshot({path:'runtime/output/playwright/a-real-metadata.png'});
  real={status:'browser-render-of-readonly-snapshot-not-native-ipc',count:payload.threads?.length||0,named:payload.threads?.filter(t=>t.titleSource==='name').length||0};
 }catch{real={status:'collector-unavailable'};}
 return {tests:passed.length+failed.length,passed,failed,real,nativeInteraction:'not-measured'};
}
