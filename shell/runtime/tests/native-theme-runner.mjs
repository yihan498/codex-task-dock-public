import {readFile} from 'node:fs/promises';
const config=JSON.parse(await readFile('src-tauri/tauri.conf.json','utf8'));
const html=await readFile('ui/index.html','utf8');
const checks=[['native-titlebar-uses-dark-theme',()=>config.app.windows[0].theme==='Dark'],['native-controls-and-tray-preserved',()=>config.app.windows[0].decorations!==false&&config.app.windows[0].skipTaskbar===true&&config.app.windows[0].visible===false],['embedded-assets-use-release-cache-version',()=>html.includes('styles.css?v=20260901-18')&&html.includes('app.mjs?v=20260901-18')&&!html.includes('href="./styles.css"')&&!html.includes('src="./app.mjs"')]];
const failed=checks.filter(([,fn])=>!fn()).map(([id])=>id);
console.log('TDD_GUARD_RESULT='+JSON.stringify({tests:checks.length,failures:failed.length,errors:0,category:failed.length?'product_failure':'pass',summary:failed.join(',')||'native theme configuration passed; native rendering not verified',failedTests:failed}));process.exitCode=failed.length?1:0;
