async (page) => {
  const failed = [], passed = [];
  const check = async (id, fn) => { try { await fn(); passed.push(id); } catch (e) { failed.push({id, message:String(e.message)}); } };
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  await page.setViewportSize({width:390,height:560});
  await page.addInitScript(() => {
    window.__calls = []; window.__mode = 'live';
    const now = Date.now();
    window.__payload = {connection:'live',stale:false,lastSuccessAt:new Date(now).toISOString(),threads:[
      {threadId:'fixture-1',title:'测试公司 · 核对八月发票清单',titleSource:'name',runtimeState:'notLoaded',updatedAt:Math.floor(now/1000),cwd:'SECRET_PATH',assistantText:'进度99%',userFields:{company:'FAKE_COMPANY'}},
      {threadId:'fixture-2',title:'<img src=x onerror="window.__xss=1">测试对象',titleSource:'name',runtimeState:'notLoaded',updatedAt:Math.floor(now/1000)-86400}
    ]};
    window.__openRequests=[];
    window.__TAURI__ = {core:{invoke:async (command,args) => {
      window.__calls.push(command);
      if (command === 'hide_dock') return;
      if (command === 'open_codex_task') { window.__openRequests.push(args); return; }
      if (command !== 'fetch_task_snapshot') throw new Error('unexpected command');
      if (window.__mode === 'offline') throw new Error('unavailable');
      if (window.__mode === 'invalid') return {connection:'live',stale:false,threads:'bad'};
      if (window.__mode === 'empty') return {...window.__payload,threads:[]};
      return {...window.__payload,stale:window.__mode === 'stale'};
    }}};
  });
  await page.reload(); await page.waitForTimeout(350);
  // Legacy title/date checks concern historical scope; current reports have separate tests.
  await page.locator('[data-filter="all"]').click();
  const content = () => page.locator('body').innerText();
  await check('live-title-and-accurate-counters', async () => {
    const text = await content();
    assert(text.includes('测试公司 · 核对八月发票清单'), 'real snapshot title not rendered');
    assert(text.includes('今日有更新') && text.includes('本机任务'), 'counters imply business tasks');
    assert(await page.locator('[data-metric="total"]').textContent() === '2', 'total mismatch');
    assert(await page.locator('[data-metric="today"]').textContent() === '0', 'updated timestamp used as stopped time');
  });
  await check('unknown-runtime-does-not-invent-business-progress', async () => {
    const text = await content();
    assert(text.includes('步骤暂不可确认'), 'source limitation missing');
    assert(!/99%|FAKE_COMPANY|SECRET_PATH|已完成\s*2|待开始\s*2/.test(text), 'untrusted business content displayed');
  });
  await check('all-filter-shows-safe-title-text', async () => {
    assert(await page.locator('[data-filter="all"]').count() === 1, 'all filter missing');
    await page.locator('[data-filter="all"]').click();
    assert(!(await content()).includes('onerror='), 'raw title noise remains');
    assert(await page.locator('.task img').count() === 0, 'HTML injection');
    assert(!await page.evaluate(() => window.__xss), 'script executed');
  });
  const refresh = async mode => {
    await page.evaluate(mode => {window.__mode=mode},mode);
    assert(await page.locator('#refresh').count() === 1, 'refresh missing');
    await page.locator('#refresh').click(); await page.waitForTimeout(120);
  };
  await check('server-stale-is-not-cleared-by-http-success', async () => {
    await refresh('stale'); assert((await content()).includes('数据已陈旧'), 'stale not shown');
  });
  await check('offline-preserves-last-good-tasks', async () => {
    await refresh('offline'); const text=await content();
    assert(text.includes('连接中断') && text.includes('测试公司 · 核对八月发票清单'), 'offline lost data or warning');
  });
  await check('invalid-schema-preserves-last-good-tasks', async () => {
    await refresh('invalid'); assert((await content()).includes('测试公司 · 核对八月发票清单'), 'invalid payload cleared tasks');
    assert((await content()).includes('连接中断'), 'invalid payload accepted');
  });
  await check('recovery-and-empty-are-distinct', async () => {
    await refresh('live'); assert((await content()).includes('本机采集正常'), 'did not recover');
    await refresh('empty'); assert((await content()).includes('尚无已采集任务'), 'empty state missing');
    assert(await page.locator('[data-metric="total"]').textContent() === '0','empty counter wrong');
  });
  await check('hide-only-calls-scoped-native-command', async () => {
    assert(await page.locator('#hide').count()===1,'hide missing'); await page.locator('#hide').click();
    assert(await page.evaluate(()=>window.__calls.includes('hide_dock')),'hide IPC not called');
    assert(await page.evaluate(()=>window.__calls.every(c=>['hide_dock','fetch_task_snapshot'].includes(c))),'unexpected IPC');
  });
  await check('compact-and-200percent-layout-no-horizontal-overflow', async () => {
    await refresh('live');
    await page.setViewportSize({width:320,height:560});
    await page.evaluate(()=>document.documentElement.style.fontSize='32px');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow');
    assert(await page.locator('#tasks').evaluate(el=>el.clientHeight>40),'task area vanished');
  });
  await check('first-offline-does-not-claim-retained-data', async () => {
    const offline = await page.context().newPage();
    try {
      await offline.addInitScript(() => { window.__TAURI__={core:{invoke:async()=>{throw new Error('first connection failure')}}}; });
      await offline.goto(page.url()); await offline.waitForTimeout(150);
      const text=await offline.locator('#connection').textContent();
      assert(text.includes('连接中断'), 'initial failure not disclosed');
      assert(!text.includes('保留'), 'claims retained data when no snapshot ever arrived');
      assert(await offline.locator('[data-metric="total"]').textContent()==='—', 'unknown count fabricated zero');
    } finally { await offline.close(); }
  });
  await page.setViewportSize({width:390,height:560});
  await page.evaluate(()=>document.documentElement.style.fontSize='16px');
  await check('bound-business-fields-render-as-text-without-fake-progress', async () => {
    await page.evaluate(() => {
      const source={sourceThreadId:'fixture-1',sourceTurnId:'u',sourceMessageId:'m'};
      window.__payload.threads[0].business={
        company:{value:'核验公司',source},workContent:{value:'检查',source},subject:{value:'<img src=x>合同清单',source},
        deadline:{value:'2026-09-01T18:00:00+08:00',source,basis:{type:'explicit',timeZone:'Asia/Shanghai'}},
        partition:{value:'实习',source},
        project:{value:'WRONG_PROJECT',source:{...source,sourceThreadId:'other'}}
      };
    });
    await refresh('live');
    const text=await content();
    assert(text.includes('核验公司')&&text.includes('检查')&&text.includes('合同清单'),'bound fields missing');
    assert(text.includes('2026-09-01')&&text.includes('18:00'),'explicit deadline missing');
    assert(text.includes('实习'),'provided partition missing');
    assert(!text.includes('WRONG_PROJECT'),'mismatched field accepted');
    assert(await page.locator('.task img').count()===0,'business field HTML injection');
    assert(text.includes('步骤暂不可确认'),'claims steps without plan');
  });
  await check('concise-title-deadline-without-repeated-process-metadata',async()=>{
    await page.evaluate(()=>{
      const source={sourceThreadId:'fixture-1',sourceTurnId:'u',sourceMessageId:'m'};
      window.__payload.threads[0].business={company:{value:'星河资本募集',source},subject:{value:'半年报整理',source},
        deadline:{value:'2026-09-01T18:00:00+08:00',source,basis:{type:'explicit',timeZone:'Asia/Shanghai'}}};
    });
    await refresh('live');
    const first=page.locator('.task').first();
    assert(await first.locator('h2 .identity-token').textContent()==='星河资本募集','company label missing');
    assert(await first.locator('h2 .work-line').textContent()==='半年报整理','work object not primary line');
    assert(!(await first.locator('h2').textContent()).includes('/'),'generated slash remains');
    assert(await first.locator('.meta').textContent()==='截止 2026-09-01 18:00','repeated source/update metadata remains');
    assert(!(await first.innerText()).includes('更新'),'update time substitutes business progress');
    assert((await first.locator('h2').getAttribute('title')).includes('用户消息摘要'),'source no longer discoverable');
  });
  await check('missing-business-keeps-title-without-empty-metadata',async()=>{
    const second=page.locator('.task').nth(1);
    assert((await second.locator('h2').textContent()).includes('待命名任务'),'unknown keyword title fabricated');
    assert(await second.locator('.meta').count()===0,'missing fields get empty/redundant lines');
    assert((await content()).includes('步骤暂不可确认'),'missing steps hidden');
  });
  await check('task-click-and-enter-open-exact-original-id',async()=>{
    const first=page.locator('.task h2').first();
    assert(await first.getAttribute('role')==='link','task heading is not keyboard link');
    await first.click();await first.press('Enter');
    const opened=await page.evaluate(()=>window.__openRequests);
    assert(opened.length===2&&opened.every(x=>x.threadId==='fixture-1'),'wrong task requested');
    assert((await content()).includes('已请求打开'),'OS request feedback missing');
  });
  const longTitles=[
   '这是之前做的明远集团的底稿文件，现在“项目材料”文件夹中有了一个新增的“0826明远资料补充”，只需要把我们公司债底稿…',
   '我想在workspace根目录里进行进一步的分区，思路是根据子项目的进展阶段，比如idea是有一个想法，先尝试；现在…',
   '我想做一个小小的笔记软件，现在我想先定下来他的大框架，之前我给你过一个GitHub上的mark项目，我想采用他… (2)'
  ];
  await check('real-long-requests-become-source-grounded-task-points',async()=>{
   await page.evaluate(titles=>{window.__payload.threads=titles.map((title,i)=>({threadId:'long-'+i,title,titleSource:'name',runtimeState:'notLoaded',updatedAt:Date.now()/1000}));},longTitles);
   await refresh('live');
   const expected=[['明远集团','资料补充','底稿'],['workspace','子项目','分区'],['笔记软件','大框架','mark']];
   for(let i=0;i<3;i++){
    const text=await page.locator('.task h2').nth(i).textContent();
    assert([...text].length<=32,'long conversational title still shown');
    assert(expected[i].every(part=>text.includes(part)),'identity or object lost: '+text);
    assert(!/我想|这是之前|现在|…/.test(text),'just truncated request rather than task points');
   }
  });
  await check('keyword-only-no-original-disclosure-or-fabricated-progress',async()=>{
   assert(await page.locator('.task details,.task summary,.original-title').count()===0,'user removed original disclosure still present');
   assert(!(await page.locator('.task h2').first().getAttribute('title')).includes(longTitles[0]),'hidden raw title remains');
   assert(!/截止|第\d+步|\d+%/.test(await page.locator('#tasks').innerText()),'title created date/progress facts');
  });
  await check('unseen-company-and-unknown-negated-request-are-safe',async()=>{
   const cases=[
    '请帮我处理星河集团的报表文件，新增材料里面有“0901数据核对清单”，需要进行核对并说明差异',
    '不要删除星河集团的合同文件，我只是想比较两个版本并保留全部原件，这是一项非常重要的资料核对工作',
    '我想请你看看这个东西应该怎么办，因为现在还没有想清楚该叫什么名字，也不知道从哪开始'
   ];
   await page.evaluate(titles=>{window.__payload.threads=titles.map((title,i)=>({threadId:'safe-'+i,title,titleSource:'name',runtimeState:'notLoaded',updatedAt:Date.now()/1000}));},cases);
   await refresh('live');
   const first=await page.locator('.task h2').first().textContent();
   assert(first.includes('星河集团')&&first.includes('清单'),'overfitted to screenshot company');
   const second=page.locator('.task').nth(1);assert((await second.locator('h2').textContent()).includes('不要'),'negation removed');
   assert(await second.locator('summary').count()===0,'excerpt retained');
   const third=page.locator('.task').nth(2);assert((await third.locator('h2').textContent())==='待命名任务','unknown request silently guessed');
   assert([...await third.locator('h2').textContent()].length<=32,'unknown title still floods list');
  });
  await check('extract-tokens-have-visual-hierarchy-without-generated-slashes',async()=>{
   await page.evaluate(titles=>{window.__payload.threads=titles.map((title,i)=>({threadId:'color-'+i,title,titleSource:'name',runtimeState:'notLoaded',updatedAt:Date.now()/1000}));},longTitles);
   await refresh('live');
   const first=page.locator('.task').first();
   assert(await first.locator('.identity-token').textContent()==='明远集团','entity not distinguished');
   assert((await first.locator('.work-line').textContent()).includes('0826明远资料补充'),'concrete object not primary');
   assert(!(await first.locator('h2').textContent()).includes('/'),'generated slash remains');
   const entity=await first.locator('.identity-token').evaluate(e=>({bg:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color,box:e.getBoundingClientRect().toJSON()}));
   const work=await first.locator('.work-line').evaluate(e=>({bg:getComputedStyle(e).backgroundColor,box:e.getBoundingClientRect().toJSON()}));
   assert(entity.bg!==work.bg&&entity.bg!=='rgba(0, 0, 0, 0)','color hierarchy missing');
   assert(entity.box.bottom<=work.box.top+1,'identity and work not separate rows');
   assert((await first.locator('.identity-token').getAttribute('title'))==='任务关键词','keywords promoted to confirmed business');
   assert(await page.locator('progress,[role=progressbar],.step-rail').count()===0,'unknown plan drawn as progress');
  });
  await check('slash-in-source-object-and-negative-excerpt-stay-intact',async()=>{
   const titles=['请帮我整理星河集团的报表文件，材料中有“2026/08核对清单”，需要核对并说明所有差异及来源',
    '暂不部署软件和接口，这轮只排查测试环境里的错误日志并核对附件目录，后面的发布安排等确认'];
   await page.evaluate(titles=>{window.__payload.threads=titles.map((title,i)=>({threadId:'literal-'+i,title,titleSource:'name',runtimeState:'notLoaded',updatedAt:Date.now()/1000}));},titles);
   await refresh('live');
   assert((await page.locator('.task').first().innerText()).includes('2026/08核对清单'),'literal slash path split');
   const second=page.locator('.task').nth(1);
   assert(await second.locator('.identity-token').count()===0,'excerpt reinterpreted as identity');
   assert((await second.locator('h2').textContent()).includes('暂不部署')&&(await second.locator('h2').textContent()).includes('排查'),'negative/current work lost');
   assert(await page.locator('.deadline').count()===0,'missing deadline placeholder created');
  });
  await check('deadline-icon-label-and-partition-not-inferred',async()=>{
   await page.evaluate(()=>{
    const source={sourceThreadId:'visual-bound',sourceTurnId:'u',sourceMessageId:'m'};
    window.__payload.threads=[{threadId:'visual-bound',title:'标题原文',titleSource:'name',runtimeState:'active',updatedAt:Date.now()/1000,
     plan:{current:2,total:4},business:{company:{value:'星河资本募集',source},subject:{value:'半年报整理',source},
      deadline:{value:'2026-09-01T18:00:00+08:00',source,basis:{type:'explicit',timeZone:'Asia/Shanghai'}}}}];
   });
   await refresh('live');const first=page.locator('.task').first();
   assert(await first.locator('.deadline svg[aria-hidden=true]').count()===1,'deadline locating icon missing');
   assert((await first.locator('.deadline').textContent()).includes('截止 2026-09-01 18:00'),'deadline lost readable label');
   assert(!(await first.innerText()).includes('实习'),'partition inferred from company');
   assert(await page.locator('progress,[role=progressbar],.step-rail').count()===0,'unsupported plan shape accepted');
   await page.setViewportSize({width:320,height:560});await page.evaluate(()=>document.documentElement.style.fontSize='32px');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'colored token overflow at 200%');
  });
  await check('accepted-dark-style-groups-only-bound-partitions',async()=>{
   await page.setViewportSize({width:390,height:560});await page.evaluate(()=>{
    document.documentElement.style.fontSize='16px';
    const now=Date.now()/1000;
    window.__payload.threads=['实习','工作','学习',null].map((partition,i)=>{const id='group-'+i,source={sourceThreadId:id,sourceTurnId:'u',sourceMessageId:'m'};
     return {threadId:id,title:'分组任务'+i,titleSource:'name',runtimeState:i===0?'active':'notLoaded',updatedAt:now,business:partition?{partition:{value:partition,source}}:{company:{value:'不能推断实习的公司',source}}};});
   });await refresh('live');
   assert((await page.locator('.partition-heading').allTextContents()).join('|')==='实习 · 1项|工作 · 1项|学习 · 1项|待归类 · 1项','bound partitions missing or guessed');
   assert(await page.locator('[data-partition="待归类"] .task').count()===1,'unknown company classified');
   assert(await page.locator('meta[name=color-scheme]').getAttribute('content')==='dark','accepted dark scheme absent');
   const bg=await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor.match(/\d+/g).map(Number));
   assert(bg.slice(0,3).every(v=>v<45),'light palette remains');
   assert(await page.locator('progress,[role=progressbar],.step-rail').count()===0,'unknown plan fabricated');
   assert(!/进行中\s*1|已完成\s*0/.test(await content()),'runtime/unknown cast as business counts');
  });
  await check('provided-deadlines-sort-and-mark-risk-without-inventing-status',async()=>{
   await page.evaluate(()=>{
    const deadline=delta=>{const d=new Date(Date.now()+delta+8*3600000);return d.toISOString().slice(0,19)+'+08:00'};
    window.__payload.threads=[24,6,-1].map((hours,i)=>{const id='risk-'+i,source={sourceThreadId:id,sourceTurnId:'u',sourceMessageId:'m'};
     return {threadId:id,title:'截止核对'+i,titleSource:'name',runtimeState:'notLoaded',updatedAt:Date.now()/1000,business:{partition:{value:'工作',source},deadline:{value:deadline(hours*3600000),source,basis:{type:'explicit',timeZone:'Asia/Shanghai'}}}};});
   });await refresh('live');
   assert(await page.locator('.task h2').first().textContent()==='截止核对2','overdue task not prioritised');
   assert(await page.locator('.deadline-risk.overdue').count()===1,'overdue marker absent');
   assert(await page.locator('.deadline-risk.soon').count()===1,'12-hour risk marker absent');
   assert(!/第\s*\d+|\d+%|已完成|进行中/.test(await page.locator('#tasks').innerText()),'deadline became progress');
  });
  await check('groups-refresh-without-duplicates-and-preserve-missing-default',async()=>{
   await page.evaluate(()=>{window.__payload.threads=[];});await refresh('live');
   assert(await page.locator('.partition-heading').count()===0,'stale groups persist empty');
   await page.evaluate(()=>{window.__payload.threads=[{threadId:'unknown-only',title:'未提供公司分类的具体任务',titleSource:'name',runtimeState:'notLoaded',updatedAt:Date.now()/1000}];});await refresh('live');
   assert(await page.locator('.task').count()===1&&await page.locator('.partition-heading').textContent()==='待归类 · 1项','unknown group incorrect');
   assert(await page.locator('.deadline-risk,.deadline').count()===0,'missing deadline fabricated');
  });
  await check('deadline-is-minute-precision-and-not-unfinished-claim',async()=>{
   await page.evaluate(()=>{document.documentElement.style.fontSize='16px';const source={sourceThreadId:'deadline-format',sourceTurnId:'u',sourceMessageId:'m'};
    window.__payload.threads=[{threadId:'deadline-format',title:'期限格式核对',runtimeState:'notLoaded',updatedAt:Date.now()/1000,business:{deadline:{value:'2020-01-02T18:35:19+08:00',source,basis:{type:'explicit',timeZone:'Asia/Shanghai'}}}}];
   });await refresh('live');
   assert(await page.locator('.deadline').textContent()==='截止 2020-01-02 18:35','seconds/timezone clutter remains');
   assert(await page.locator('.deadline-risk').textContent()==='截止已过','deadline label implies unfinished task');
  });
  return {tests:passed.length+failed.length,failures:failed.length,errors:0,category:failed.length?'product_failure':'pass',summary:failed.map(f=>f.id).join(',')||'runtime browser behavior passed',failedTests:failed.map(f=>f.id),details:failed,passed};
}
