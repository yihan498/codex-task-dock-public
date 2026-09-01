async page=>{
 const passed=[],failed=[],assert=(value,message)=>{if(!value)throw Error(message);};
 const check=async(id,fn)=>{try{await fn();passed.push(id);}catch(e){failed.push({id,message:e.message});}};
 await page.setViewportSize({width:390,height:560});
 await page.addInitScript(()=>{
  window.__mode='live';window.__calls=[];
  window.__make=(id,options={})=>({threadId:id,title:'任务面板 · 核验'+id,titleSource:'name',runtimeState:'notLoaded',updatedAt:Date.now()/1000,
   agentReport:{source:'agent-report',threadId:id,turnId:'turn',runId:'run',seq:1,state:'active',seenAt:Date.now(),progressAt:Date.now(),fresh:true,
    plan:[{step:'核对来源',status:'completed'},{step:'检查具体合同附件',status:'in_progress'},{step:'验证并交付',status:'pending'}],...options}});
  window.__payload={connection:'live',stale:false,lastSuccessAt:new Date().toISOString(),reporting:{status:'available'},threads:[window.__make('one'),window.__make('finished',{state:'ended',reason:'completed'}),{threadId:'old',title:'已结束历史事项',runtimeState:'notLoaded',updatedAt:Date.now()/1000}]};
  window.__TAURI__={core:{invoke:async(c,a)=>{window.__calls.push({c,a});if(c==='fetch_task_snapshot'){if(window.__mode==='offline')throw Error('offline');return window.__payload;}}}};
 });
 await page.reload();await page.waitForTimeout(200);
 const refresh=async()=>{await page.locator('#refresh').click();await page.waitForTimeout(80);};
 const text=()=>page.locator('body').innerText();
 await check('current-default-excludes-ended-and-unreported',async()=>{
  assert(await page.locator('[data-filter=current][aria-pressed=true]').count()===1,'current not default');
  assert(await page.locator('.task').count()===1,'ended/unreported pollute current');
  assert(!(await text()).includes('已结束历史事项'),'history shown by default');assert((await text()).includes('未接入 1'),'missing scope not disclosed');
 });
 await check('real-step-number-segment-and-next-action',async()=>{
  assert((await text()).includes('第2步 / 共3步 · 当前步骤 · 检查具体合同附件'),'real current/total step missing');
  assert((await text()).includes('下一步 · 验证并交付'),'next step missing');
  assert(await page.locator('.step-rail .completed').count()===1&&await page.locator('.step-rail .in_progress').count()===1,'segments do not match source');
  assert((await text()).includes('Agent上报')&&!/\d+%/.test(await text()),'source missing or fabricated percent');
 });
 await check('stale-heartbeat-and-blocked-are-not-completed',async()=>{
  await page.evaluate(()=>{window.__payload.threads=[window.__make('waiting',{state:'blocked',seenAt:Date.now()-130000,progressAt:Date.now()-200000})]});await refresh();
  assert((await text()).includes('待更新')&&(await text()).includes('受阻'),'stale/blocked status lost');assert(await page.locator('.task').count()===1,'stale silently ended');
  assert((await text()).includes('步骤更新')&&(await text()).includes('报告'),'heartbeat time presented as progress time');
 });
 await check('three-current-cards-fit-with-pagination-for-four',async()=>{
  await page.evaluate(()=>{window.__payload.threads=[0,1,2,3].map(i=>window.__make('page'+i));});await refresh();
  assert(await page.locator('.task').count()===3,'page size not three');
  assert((await page.locator('#page-label').textContent()).includes('1 / 2'),'page count missing');
  assert(await page.locator('#tasks').evaluate(e=>e.scrollHeight<=e.clientHeight+1),'390x560 requires vertical scrolling');
  await page.setViewportSize({width:380,height:500});assert(await page.locator('#tasks').evaluate(e=>e.scrollHeight<=e.clientHeight+1),'380x500 requires vertical scrolling');
  await page.locator('#page-next').click();assert(await page.locator('.task').count()===1,'overflow task unavailable');
 });
 await check('end-removes-card-and-clamps-page',async()=>{
  await page.evaluate(()=>{window.__payload.threads.forEach(t=>t.agentReport.state='ended');window.__payload.threads[0].agentReport.state='active'});await refresh();
  assert(await page.locator('.task').count()===1,'end not reflected');assert((await page.locator('#page-label').textContent()).includes('1 / 1'),'page not clamped');
 });
 await check('no-plan-no-fake-rail-and-index-is-position',async()=>{
  await page.evaluate(()=>{window.__payload.threads=[window.__make('no-plan',{plan:[]}),window.__make('position',{plan:[{step:'待定前置',status:'pending'},{step:'实际第二步',status:'in_progress'}]})]});await refresh();
  assert((await text()).includes('步骤未上报'),'missing plan hidden');assert(await page.locator('.step-rail').count()===1,'missing plan gets fake rail');assert((await text()).includes('第2步 · 实际第二步'),'completed count mistaken for index');
 });
 await check('reporting-failure-and-offline-not-live',async()=>{
  await page.evaluate(()=>{window.__payload.reporting.status='unavailable'});await refresh();assert((await text()).includes('上报读取失败'),'DB failure looks empty/live');
  await page.evaluate(()=>{window.__mode='offline'});await refresh();assert((await text()).includes('连接中断'),'offline warning missing');
 });
 await check('zero-current-explicit-and-history-secondary',async()=>{
  await page.evaluate(()=>{window.__mode='live';window.__payload.reporting.status='available';window.__payload.threads=[]});await refresh();assert((await text()).includes('暂无未结束上报'),'empty current misleading');
  assert(await page.locator('[data-filter=all]').count()===1,'history unavailable');
 });
 await check('long-source-safe-and-200percent-readable',async()=>{
  await page.evaluate(()=>{window.__payload.threads=[window.__make('long',{plan:[{step:'<img src=x>这是一条较长但实际提供的步骤说明，需要保持文字安全且完整可查看',status:'in_progress'}]})];});await refresh();
  assert(await page.locator('.task img').count()===0,'report HTML injection');await page.setViewportSize({width:320,height:560});await page.evaluate(()=>document.documentElement.style.fontSize='32px');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'200% horizontal overflow');assert(await page.locator('#tasks').evaluate(e=>e.clientHeight>40),'accessible task area lost');
 });
 await check('real-provider-failure-preserves-stale-report-card',async()=>{
  await page.evaluate(()=>{window.__payload.reporting.status='available';window.__payload.threads=[window.__make('retained')]});await refresh();
  await page.evaluate(()=>{window.__payload.reporting.status='unavailable';delete window.__payload.threads[0].agentReport});await refresh();
  assert(await page.locator('.task').count()===1,'real provider failure discards last report');assert((await text()).includes('待更新'),'retained report not stale');
 });
 await check('known-company-only-is-never-hidden',async()=>{
  await page.evaluate(()=>{document.documentElement.style.fontSize='16px';window.__payload.reporting.status='available';const t=window.__make('company-only'),source={sourceThreadId:t.threadId,sourceTurnId:'u',sourceMessageId:'m'};t.business={company:{value:'用户已给出的测试公司',source}};window.__payload.threads=[t]});await page.setViewportSize({width:390,height:560});await refresh();
  assert((await page.locator('.task').innerText()).includes('用户已给出的测试公司'),'provided company hidden');
 });
 await check('current-deadline-risk-is-visible-not-status-inference',async()=>{
  await page.evaluate(()=>{const deadline=h=>new Date(Date.now()+h*3600000+8*3600000).toISOString().slice(0,19)+'+08:00';window.__payload.threads=[-1,6,24].map((hours,i)=>{const t=window.__make('risk-current'+i),source={sourceThreadId:t.threadId,sourceTurnId:'u',sourceMessageId:'m'};t.business={project:{value:'已提供测试项目',source},deadline:{value:deadline(hours),source,basis:{type:'explicit',timeZone:'Asia/Shanghai'}}};return t;})});await refresh();
  assert((await page.locator('#tasks').innerText()).includes('截止已过'),'overdue warning hidden');assert((await page.locator('#tasks').innerText()).includes('临近截止'),'upcoming warning hidden');assert((await page.locator('.task').first().innerText()).includes('已提供测试项目'),'project-only hidden');
 });
 await check('three-full-sourced-cards-no-scroll-and-original-keyboard',async()=>{
  await page.setViewportSize({width:380,height:500});await page.evaluate(()=>{window.__payload.threads=['实习','工作','学习'].map((partition,i)=>{const t=window.__make('full'+i),source={sourceThreadId:t.threadId,sourceTurnId:'u',sourceMessageId:'m'};t.business={company:{value:'布局测试公司',source},subject:{value:'具体处理对象核验',source},partition:{value:partition,source},deadline:{value:'2026-09-01T18:00:00+08:00',source,basis:{type:'explicit',timeZone:'Asia/Shanghai'}}};return t;})});await refresh();
  assert(await page.locator('.task').count()===3,'full cards missing');assert(await page.locator('#tasks').evaluate(e=>e.scrollHeight<=e.clientHeight+1),'full company/subject/deadline cards overflow');
  const first=page.locator('.task').first();await first.locator('summary').focus();await first.locator('summary').press('Enter');assert(await first.locator('details').getAttribute('open')!==null,'keyboard original unavailable');assert((await first.locator('.original-title').innerText()).includes('核验full0'),'original lost');
 });
 await page.setViewportSize({width:390,height:560});await page.evaluate(()=>{document.documentElement.style.fontSize='16px';window.__payload.threads=[window.__make('fixture',{plan:[{step:'定义真实进度合同',status:'completed'},{step:'验证托盘浮窗步骤显示',status:'in_progress'},{step:'构建并检查新候选',status:'pending'}]})];});await refresh();
 await page.screenshot({path:'output/playwright/agent-report-fixture-v1.png'});
 return {tests:passed.length+failed.length,failures:failed.length,errors:0,category:failed.length?'product_failure':'pass',summary:failed.map(x=>x.id).join(',')||'report view passed',failedTests:failed.map(x=>x.id),details:failed,passed};
}
