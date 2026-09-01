async page=>{
 const passed=[],failed=[],assert=(v,m)=>{if(!v)throw Error(m);};
 const check=async(id,fn)=>{try{await fn();passed.push(id);}catch(e){failed.push({id,message:e.message});}};
 await page.setViewportSize({width:380,height:500});
 await page.addInitScript(()=>{
  window.__calls=[];
  window.__make=(id,state='running')=>({threadId:id,title:'请帮我处理星河集团的报表文件，新增材料里面有“0901数据核对清单”，需要进行核对并说明差异',titleSource:'name',runtimeState:'notLoaded',updatedAt:Date.now()/1000,
   desktopRuntime:{source:'desktop-ipc',threadId:id,turnId:'turn-'+id,state,seenAt:Date.now(),...(state==='stopped'?{stoppedAt:Date.now()-1000,reason:'completed'}:{}),plan:[{step:'核对来源',status:'completed'},{step:'检查附件',status:'in_progress'},{step:'交付结果',status:'pending'}]}});
  window.__payload={connection:'live',stale:false,lastSuccessAt:new Date().toISOString(),desktop:{status:'available'},threads:[window.__make('running'),window.__make('stopped','stopped'),{threadId:'unknown',title:'未知',runtimeState:'active',updatedAt:Date.now()/1000}]};
  window.__TAURI__={core:{invoke:async(c,a)=>{window.__calls.push({c,a});if(c==='fetch_task_snapshot')return window.__payload;}}};
 });
 await page.reload();await page.waitForTimeout(150);
 const refresh=async()=>{await page.locator('#refresh').click();await page.waitForTimeout(60);};
 await check('desktop-current-only-real-running-no-excerpt',async()=>{
  assert(await page.locator('.task').count()===1,'current not actual running');
  assert(await page.locator('details,summary,.original-title').count()===0,'excerpt/original still exists');
  const h=page.locator('.task h2');assert((await h.innerText()).includes('星河集团'),'keyword identity absent');
  assert(!(await h.getAttribute('title')).includes('请帮我'),'full title hidden in tooltip');
  assert((await page.locator('#tasks').innerText()).includes('第2步 / 共3步 · 当前步骤 · 检查附件'),'real current/total step absent');
  assert((await page.locator('.report-source').innerText()).includes('运行中'),'runtime not explicit');
  await h.press('Enter');assert(await page.evaluate(()=>window.__calls.some(x=>x.c==='open_codex_task'&&x.a.threadId==='running')),'exact task navigation lost');
 });
 await check('stop-goes-today-and-restart-returns-current',async()=>{
  await page.evaluate(()=>{window.__payload.threads[0]=window.__make('running','stopped')});await refresh();assert(await page.locator('.task').count()===0,'stopped still current');
  await page.locator('[data-filter=today]').click();assert(await page.locator('.task').count()===2,'today missing stopped tasks or includes unknown');
  await page.evaluate(()=>{window.__payload.threads[0]=window.__make('running');window.__payload.threads[0].desktopRuntime.turnId='new-turn'});await refresh();assert(await page.locator('.task').count()===1,'restarted task duplicates in today');
  await page.locator('[data-filter=current]').click();assert(await page.locator('.task').count()===1,'restart absent current');
 });
 await check('today-uses-stop-day-not-update-day',async()=>{
  await page.evaluate(()=>{const t=window.__make('yesterday','stopped');t.desktopRuntime.stoppedAt=Date.now()-86400000;window.__payload.threads=[t]});await refresh();await page.locator('[data-filter=today]').click();assert(await page.locator('.task').count()===0,'updatedAt substitutes stop day');
 });
 await check('connection-loss-not-running-not-completed',async()=>{
  await page.evaluate(()=>{window.__payload.threads=[window.__make('stale')];window.__payload.desktop.status='unavailable'});await refresh();await page.locator('[data-filter=current]').click();assert(await page.locator('.task').count()===0,'disconnected source claims running');
  assert((await page.locator('.scope').innerText()).includes('待确认'),'connection gap hidden');
  await page.locator('[data-filter=today]').click();assert(await page.locator('.task').count()===0,'connection loss implies completed');
 });
 await check('three-current-cards-fit-pagination-and-missing-plan-honest',async()=>{
  await page.evaluate(()=>{window.__payload.desktop.status='available';window.__payload.threads=[0,1,2,3].map(i=>window.__make('page'+i));window.__payload.threads[0].desktopRuntime.plan=[]});await refresh();await page.locator('[data-filter=current]').click();
  assert(await page.locator('.task').count()===3,'no compact pages');assert(await page.locator('#tasks').evaluate(e=>e.scrollHeight<=e.clientHeight+1),'three cards need scrolling');
  assert(await page.locator('.step-rail').count()===2,'missing plan fabricated');assert(!/尚无步骤计划|计划步骤已列出/.test(await page.locator('#tasks').innerText()),'missing plan placeholder occupies the task card');assert(!/\d+%/.test(await page.locator('#tasks').innerText()),'invented percent');
  await page.locator('#page-next').click();assert(await page.locator('.task').count()===1,'page four inaccessible');
 });
 await check('current-live-view-hides-global-unknown-count-and-keeps-specific-name-readable',async()=>{
  await page.evaluate(()=>{const t=window.__make('specific');t.desktopRuntime.plan=[];t.title='未命名任务';t.nameStatus='unavailable';t.displayName={source:'model-user-content-retained',threadId:'specific',turnId:'turn-specific',sourceTurnId:'turn-before',parts:[{kind:'project',text:'Codex Task Dock'},{kind:'object',text:'当前任务和今日任务自动命名'},{kind:'action',text:'继续修改'}]};window.__payload.desktop.status='available';window.__payload.desktop.partial=false;window.__payload.threads=[t,{threadId:'unknown',title:'未知',runtimeState:'active',updatedAt:Date.now()/1000}]});await refresh();await page.locator('[data-filter=current]').click();
  assert(await page.locator('.scope').isHidden(),'global unknown count occupies the live current view');
  const h=page.locator('.task h2');assert((await h.innerText()).includes('Codex Task Dock')&&(await h.innerText()).includes('当前任务和今日任务自动命名')&&(await h.innerText()).includes('继续修改'),'specific name content was clipped from the DOM');
  assert(await h.evaluate(e=>e.scrollWidth<=e.clientWidth+1&&e.scrollHeight<=e.clientHeight+1),'specific name is visually clipped');
  const work=h.locator('.work-line');assert(await work.evaluate(e=>{const child=e.getBoundingClientRect(),parent=e.parentElement.getBoundingClientRect();return e.scrollWidth<=e.clientWidth+1&&child.right<=parent.right+1&&child.bottom<=parent.bottom+1}),'work object overflows the visible title boundary');
  assert(await page.locator('.step-label,.step-rail,.next-step').count()===0,'unreliable progress was not omitted');
 });
 await check('current-known-fields-and-keyword-only',async()=>{
  await page.evaluate(()=>{const t=window.__make('fields'),source={sourceThreadId:t.threadId,sourceTurnId:'u',sourceMessageId:'m'};t.business={company:{value:'星河资本募集',source},subject:{value:'半年报整理',source},partition:{value:'实习',source},deadline:{value:'2026-09-01T18:00:00+08:00',source,basis:{type:'explicit',timeZone:'Asia/Shanghai'}}};window.__payload.threads=[t]});await refresh();
  const text=await page.locator('#tasks').innerText();assert(text.includes('星河资本募集')&&text.includes('半年报整理')&&text.includes('09-01 18:00'),'known fields omitted');assert(!/摘录|原名|请帮我/.test(text),'unwanted title detail');
 });
 await check('partial-desktop-batch-shows-confirmed-current-with-visible-limit',async()=>{
  await page.evaluate(()=>{window.__payload.desktop.partial=true});await refresh();assert(await page.locator('.task').count()===1,'valid current hidden by partial batch');assert((await page.locator('.scope').innerText()).includes('部分已确认'),'partial collection masquerades as full online');
 });
 await check('today-content-name-keeps-key-elements-and-original-navigation',async()=>{
  await page.evaluate(()=>{const t=window.__make('named','stopped');t.title='未命名任务';t.displayName={source:'reviewed-user-content',threadId:'named',turnId:'turn-named',parts:[{kind:'project',text:'X'},{kind:'object',text:'账号冻结申诉'},{kind:'action',text:'回复跟进'}]};window.__payload.threads=[t]});await refresh();await page.locator('[data-filter=today]').click();
  const h=page.locator('.task h2'),s=await h.innerText();assert(s.includes('X')&&s.includes('账号冻结申诉')&&s.includes('回复跟进'),'content summary missing');assert(!/待命名|未命名|摘录/.test(s),'placeholder remains');assert((await h.getAttribute('title')).includes('内容概括'),'inferred summary presented as original title');await h.press('Enter');assert(await page.evaluate(()=>window.__calls.some(x=>x.c==='open_codex_task'&&x.a.threadId==='named')),'summary changed navigation');assert((await page.locator('.report-source').innerText()).includes('已停止'),'summary changed state');
 });
 await check('content-name-wrong-turn-is-rejected-without-raw-html',async()=>{
  await page.evaluate(()=>{const t=window.__payload.threads[0];t.title='安全原名';t.displayName.turnId='wrong';t.displayName.parts[1].text='<img src=x onerror=alert(1)>'});await refresh();assert((await page.locator('.task h2').innerText())==='安全原名','stale name reused');assert(await page.locator('.task h2 img').count()===0,'raw HTML inserted');
 });
 await check('content-name-valid-binding-displays-malicious-text-as-text',async()=>{
  await page.evaluate(()=>{window.__payload.threads[0].displayName.turnId='turn-named'});await refresh();assert((await page.locator('.task h2').innerText()).includes('<img'),'name text lost');assert(await page.locator('.task h2 img').count()===0,'name executed HTML');
 });
 await check('automatic-name-without-company-is-visible-and-refreshes',async()=>{
  await page.evaluate(()=>{const t=window.__make('auto','stopped');t.title='未命名任务';t.nameStatus='ready';t.displayName={source:'local-user-keywords',threadId:'auto',turnId:'turn-auto',parts:[{kind:'object',text:'设备维护手册'},{kind:'action',text:'翻译'}]};window.__payload.threads=[t]});await refresh();
  assert((await page.locator('.task h2').innerText()).includes('设备维护手册'),'automatic name rejected');assert((await page.locator('.task h2').getAttribute('title')).includes('自动提取'),'automatic source not labelled');
  await page.evaluate(()=>{window.__payload.threads[0].displayName.parts=[{kind:'object',text:'采购验收清单'}]});await refresh();assert((await page.locator('.task h2').innerText())==='采购验收清单','single object rejected or cached old name');
 });
 await check('automatic-name-missing-source-is-honest-not-raw-excerpt',async()=>{
  await page.evaluate(()=>{delete window.__payload.threads[0].displayName;window.__payload.threads[0].nameStatus='unrecognized'});await refresh();assert((await page.locator('.task h2').innerText())==='未识别到任务关键词','missing name hidden');
  await page.evaluate(()=>{window.__payload.threads[0].nameStatus='pending'});await refresh();assert((await page.locator('.task h2').innerText())==='任务内容同步中','pending name hidden');
 });
 await check('model-name-source-and-limit-visible-without-old-title-fallback',async()=>{
  await page.evaluate(()=>{const t=window.__make('model','stopped');t.displayName={source:'model-user-content',threadId:'model',turnId:'turn-model',parts:[{kind:'company',text:'星河资本'},{kind:'object',text:'半年报'},{kind:'action',text:'整理'}]};t.nameStatus='ready';window.__payload.threads=[t]});await refresh();
  assert((await page.locator('.task h2').innerText()).includes('星河资本'),'model name rejected');assert((await page.locator('.task h2').getAttribute('title')).includes('自动概括'),'model source unlabelled');
  await page.evaluate(()=>{delete window.__payload.threads[0].displayName;window.__payload.threads[0].nameStatus='limited'});await refresh();assert((await page.locator('.task h2').innerText())==='命名今日额度已用完','limit hidden by old title');
 });
 await check('failed-renaming-keeps-specific-retained-name-without-placeholder',async()=>{
  await page.evaluate(()=>{const t=window.__make('retained','stopped');t.title='未命名任务';t.nameStatus='unavailable';t.displayName={source:'model-user-content-retained',threadId:'retained',turnId:'turn-retained',sourceTurnId:'turn-before',parts:[{kind:'project',text:'Codex Task Dock'},{kind:'object',text:'当前任务和今日任务自动命名'},{kind:'action',text:'继续修改'}]};window.__payload.threads=[t]});await refresh();
  const h=page.locator('.task h2'),text=await h.innerText();
  assert(text.includes('Codex Task Dock')&&text.includes('当前任务和今日任务自动命名'),'retained reliable name rejected');
  assert(!text.includes('自动命名暂不可用'),'failure placeholder shown instead of retained name');
  assert((await h.getAttribute('title')).includes('沿用上一可靠名称'),'retained provenance not disclosed');
 });
 await page.screenshot({path:'output/playwright/desktop-current-v1.png'});
 return {tests:passed.length+failed.length,failures:failed.length,errors:0,category:failed.length?'product_failure':'pass',summary:failed.map(x=>x.id).join(',')||'desktop view passed',failedTests:failed.map(x=>x.id),details:failed,passed};
}
