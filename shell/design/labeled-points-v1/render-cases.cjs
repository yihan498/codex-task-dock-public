async page=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  const titles=['设计 Codex 任务面板','这是之前做的明远集团的底稿文件，现在“项目材料”文件夹中有了一个新增的“0826明远资料补充”，只需要把我们公司债底稿…','我想在workspace根目录里进行进一步的分区，思路是根据子项目的进展阶段，比如idea是有一个想法，先尝试；现在…','我想做一个小小的笔记软件，现在我想先定下来他的大框架，之前我给你过一个GitHub上的mark项目，我想采用他… (2)'];
  window.__payload={connection:'live',stale:false,lastSuccessAt:new Date().toISOString(),threads:titles.map((title,i)=>({threadId:'fixture-'+i,title,titleSource:'name',runtimeState:'notLoaded',updatedAt:Date.now()/1000}))};
  window.__TAURI__={core:{invoke:async cmd=>cmd==='fetch_task_snapshot'?window.__payload:undefined}};
 });
 await page.setViewportSize({width:390,height:560});await page.reload();await page.waitForTimeout(300);
 const titles=await page.locator('.task h2').allTextContents();
 await page.screenshot({path:'output/playwright/labeled-points-v1-390.png'});
 const contrast=async selector=>page.locator(selector).evaluateAll(els=>{
  const lum=rgb=>rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  const parse=c=>c.match(/[\d.]+/g).slice(0,3).map(Number);
  return els.map(el=>{const style=getComputedStyle(el);let bg=style.backgroundColor;
   if(bg==='rgba(0, 0, 0, 0)')bg=getComputedStyle(document.body).backgroundColor;
   const a=lum(parse(style.color)),b=lum(parse(bg));return {text:el.textContent,foreground:style.color,background:bg,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
  });
 });
 const contrasts=await contrast('.identity-token,.work-line,.title-source');
 await page.setViewportSize({width:320,height:560});await page.evaluate(()=>document.documentElement.style.fontSize='32px');
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('horizontal overflow');
 await page.screenshot({path:'output/playwright/labeled-points-v1-200percent.png'});
 await page.setViewportSize({width:390,height:560});await page.evaluate(()=>{
  document.documentElement.style.fontSize='16px';
  const source={sourceThreadId:'bound-fixture',sourceTurnId:'u',sourceMessageId:'m'};
  window.__payload.threads=[{threadId:'bound-fixture',title:'界面测试原名（不是实际任务）',titleSource:'name',runtimeState:'notLoaded',updatedAt:Date.now()/1000,business:{
   company:{value:'星河资本募集',source},subject:{value:'半年报整理',source},
   deadline:{value:'2026-09-01T18:00:00+08:00',source,basis:{type:'explicit',timeZone:'Asia/Shanghai'}}}}];
 });
 await page.locator('#refresh').click();await page.waitForTimeout(200);
 await page.evaluate(()=>document.querySelector('.scope').textContent='界面测试数据：用于展示日期样式，不是你的真实截止时间。');
 contrasts.push(...await contrast('.deadline'));
 await page.screenshot({path:'output/playwright/labeled-points-v1-bound-example.png'});
 if(contrasts.some(x=>x.ratio<4.5))throw Error('contrast below 4.5');
 if(await page.locator('progress,[role=progressbar],.step-rail').count())throw Error('false progress UI');
 return {titles,contrasts,errors,native:'not-tested',boundFixture:'synthetic deadline visibly labeled; not a business fact'};
}
