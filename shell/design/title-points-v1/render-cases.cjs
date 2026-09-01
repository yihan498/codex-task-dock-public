async page => {
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  const titles=[
   '设计 Codex 任务面板',
   '这是之前做的明远集团的底稿文件，现在“项目材料”文件夹中有了一个新增的“0826明远资料补充”，只需要把我们公司债底稿…',
   '我想在workspace根目录里进行进一步的分区，思路是根据子项目的进展阶段，比如idea是有一个想法，先尝试；现在…',
   '我想做一个小小的笔记软件，现在我想先定下来他的大框架，之前我给你过一个GitHub上的mark项目，我想采用他… (2)'
  ];
  window.__TAURI__={core:{invoke:async cmd=>cmd==='fetch_task_snapshot'?{
   connection:'live',stale:false,lastSuccessAt:new Date().toISOString(),threads:titles.map((title,i)=>({threadId:'fixture-'+i,title,titleSource:'name',runtimeState:'notLoaded',updatedAt:Date.now()/1000}))}:undefined}};
 });
 await page.setViewportSize({width:390,height:560});await page.reload();await page.waitForTimeout(300);
 const labels=await page.locator('.task h2').allTextContents();
 await page.screenshot({path:'output/playwright/title-points-v3-390.png'});
 await page.locator('.task details summary').first().click();
 await page.screenshot({path:'output/playwright/title-points-v3-original.png'});
 await page.locator('.task details summary').first().click();
 await page.setViewportSize({width:320,height:560});await page.evaluate(()=>document.documentElement.style.fontSize='32px');
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('horizontal overflow');
 await page.screenshot({path:'output/playwright/title-points-v3-200percent.png'});
 return {source:'user-supplied screenshot transcriptions; fixture IDs only',labels,native:'not-tested',errors};
}
