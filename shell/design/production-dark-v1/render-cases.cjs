async page=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.__payload={connection:'live',stale:false,lastSuccessAt:new Date().toISOString(),threads:[
   '这是之前做的明远集团的底稿文件，现在“项目材料”文件夹中有了一个新增的“0826明远资料补充”，只需要把我们公司债底稿更新',
   '我想在workspace根目录里进行进一步的分区，思路是根据子项目的进展阶段，先尝试',
   '我想做一个小小的笔记软件，现在我想先定下来他的大框架，之前我应该给你分享过一个GitHub上的vmark项目'
  ].map((title,i)=>({threadId:'fixture-'+i,title,titleSource:'name',runtimeState:'notLoaded',updatedAt:Date.now()/1000}))};
  window.__TAURI__={core:{invoke:async()=>window.__payload}};
 });
 await page.setViewportSize({width:390,height:560});await page.reload();await page.locator('.task').first().waitFor();
 await page.locator('.scope').evaluate(e=>e.textContent='排版测试 · 用户已提供标题，非当前任务快照');
 await page.screenshot({path:'output/playwright/production-dark-v1-missing.png'});
 const missing={groups:await page.locator('.partition-heading').allTextContents(),progress:await page.locator('progress,[role=progressbar],.step-rail').count()};
 await page.evaluate(()=>{
  const entries=[['实习','星河资本募集','半年报整理'],['实习','明远集团','0826明远资料补充'],['工作','Workspace','项目分类整理']];
  window.__payload.threads=entries.map(([partition,company,subject],i)=>{const id='bound-'+i,source={sourceThreadId:id,sourceTurnId:'fixture',sourceMessageId:'fixture'};
   return {threadId:id,title:company+' '+subject,titleSource:'name',runtimeState:'notLoaded',updatedAt:Date.now()/1000,business:{partition:{value:partition,source},company:{value:company,source},subject:{value:subject,source},...(i===0?{deadline:{value:new Date(Date.now()+14*3600000).toISOString().slice(0,19)+'+08:00',source,basis:{type:'explicit',timeZone:'Asia/Shanghai'}}}:{})}};
  });document.querySelector('#refresh').click();
 });await page.locator('[data-partition="工作"]').waitFor();
 await page.locator('.scope').evaluate(e=>e.textContent='字段排版示意 · 分类与期限为测试值，非实况');
 await page.setViewportSize({width:380,height:500});
 const contrast=await page.locator('h1,h2,.identity-token,.partition-heading,.deadline-risk,summary,button,.scope,.meta,footer p').evaluateAll(els=>{
  const lum=c=>c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  return els.map(el=>{let n=el,bg;while(n){bg=getComputedStyle(n).backgroundColor;if(bg!=='rgba(0, 0, 0, 0)')break;n=n.parentElement}const a=lum(getComputedStyle(el).color),b=lum(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)});
 });
 const viewport=await page.locator('#tasks').evaluate(e=>e.getBoundingClientRect().bottom);
 const boxes=await page.locator('.task').evaluateAll(es=>es.map(e=>({top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom})));
 if(boxes.some(b=>b.bottom>viewport))throw Error('three compact sample tasks not visible');
 if(Math.min(...contrast)<4.5)throw Error('text contrast below4.5');
 await page.screenshot({path:'output/playwright/production-dark-v1-bound.png'});
 await page.setViewportSize({width:320,height:560});await page.evaluate(()=>document.documentElement.style.fontSize='32px');
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('horizontal overflow');
 await page.screenshot({path:'output/playwright/production-dark-v1-200percent.png'});
 return {scope:'production HTML with explicit fixtures; not native screenshots',errors,missing,minContrast:Math.min(...contrast),boxes,viewport,native:'not-tested'};
}
