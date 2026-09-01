async page => {
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.__TAURI__={core:{invoke:async cmd=>cmd==='fetch_task_snapshot'?{
   connection:'live',stale:false,lastSuccessAt:new Date().toISOString(),threads:[
    {threadId:'fixture',title:'示例 · 星河资本募集/半年报整理',titleSource:'name',runtimeState:'notLoaded',updatedAt:Date.now()/1000},
    {threadId:'second',title:'示例 · 测试公司/核对募集材料/附件目录',titleSource:'name',runtimeState:'notLoaded',updatedAt:Date.now()/1000},
    {threadId:'third',title:'示例 · 项目文档/整理交接清单',titleSource:'name',runtimeState:'notLoaded',updatedAt:Date.now()/1000}
   ]}:undefined}};
 });
 await page.setViewportSize({width:390,height:560});await page.reload();await page.waitForTimeout(250);
 await page.screenshot({path:'output/playwright/tray-corner-v1-390.png'});
 await page.setViewportSize({width:320,height:560});
 await page.evaluate(()=>document.documentElement.style.fontSize='32px');
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('horizontal overflow');
 await page.screenshot({path:'output/playwright/tray-corner-v1-200percent.png'});
 return {fixtureOnly:true,nativeTaskbarAndPosition:'not-tested',viewports:2,pageErrors:errors};
}
