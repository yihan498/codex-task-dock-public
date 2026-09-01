async page => {
 const c=await page.context().newCDPSession(page);await c.send("DOM.enable");await c.send("CSS.enable");const d=await c.send("DOM.getDocument");const n=await c.send("DOM.querySelector",{nodeId:d.root.nodeId,selector:".a h2"});
 return {fonts:await c.send("CSS.getPlatformFontsForNode",{nodeId:n.nodeId}),layout:await page.evaluate(()=>Array.from(document.querySelectorAll(".dock")).map(e=>({variant:e.className,bodyHeight:e.querySelector(".task-body").clientHeight,scrollHeight:e.querySelector(".task-body").scrollHeight,font:getComputedStyle(e.querySelector("h2")).fontFamily})))};
}
