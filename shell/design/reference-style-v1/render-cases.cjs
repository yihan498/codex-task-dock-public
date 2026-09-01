async page=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base=page.url().match(/^https?:\/\/[^/]+/)[0];
 const contrast=()=>page.locator('h1,h2,h3,p,span,.counts').evaluateAll(els=>{
  const lum=c=>{const a=c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return a.reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0)};
  return els.filter(el=>el.textContent.trim()).map(el=>{let node=el,bg;while(node){bg=getComputedStyle(node).backgroundColor;if(bg!=='rgba(0, 0, 0, 0)')break;node=node.parentElement;}
   const fg=getComputedStyle(el).color,a=lum(fg),b=lum(bg);return {tag:el.tagName,text:el.textContent.slice(0,25),ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};});
 });
 await page.setViewportSize({width:380,height:500});await page.goto(base+'/index.html');
 if(!(await page.locator('.notice').innerText()).includes('非实时数据'))throw Error('demo disclaimer absent');
 if(await page.locator('.task').count()!==3)throw Error('demo count mismatch');
 if(await page.locator('.rail li').count()!==8||await page.locator('.rail .current').count()!==2||await page.locator('.rail .done').count()!==3)throw Error('step segments inconsistent');
 if(await page.locator('script,button,a[href]').count())throw Error('static prototype has runtime actions');
 const ratios=await contrast();if(ratios.some(r=>r.ratio<4.5))throw Error('contrast below 4.5: '+JSON.stringify(ratios.filter(r=>r.ratio<4.5)));
 const taskBoxes=await page.locator('.task').evaluateAll(es=>es.map(e=>({top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom})));
 const contentBottom=await page.locator('.content').evaluate(e=>e.getBoundingClientRect().bottom);
 if(taskBoxes.some(b=>b.bottom>contentBottom))throw Error('normal viewport hides task content');
 await page.screenshot({path:'output/playwright/reference-style-v2-demo.png'});
 await page.goto(base+'/missing.html');
 const missingText=await page.locator('body').innerText();
 if(!missingText.includes('缺失数据示意')||/进行中|待开始|已完成|今天 18:00|第\s*\d/.test(missingText)||await page.locator('.rail').count())throw Error('missing view invents facts');
 if(!missingText.includes('待归类'))throw Error('missing classification inferred');
 ratios.push(...await contrast());if(ratios.some(r=>r.ratio<4.5))throw Error('missing contrast');
 await page.screenshot({path:'output/playwright/reference-style-v2-missing.png'});
 await page.goto(base+'/index.html');await page.setViewportSize({width:320,height:500});await page.evaluate(()=>document.documentElement.style.fontSize='32px');
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('horizontal overflow');
 await page.screenshot({path:'output/playwright/reference-style-v2-200percent.png'});
 return {scope:'static style only; no live business data',errors,minContrast:Math.min(...ratios.map(r=>r.ratio)),taskBoxes,viewport:'380x500 / 320x500 at 200%',native:'not-tested'};
}
