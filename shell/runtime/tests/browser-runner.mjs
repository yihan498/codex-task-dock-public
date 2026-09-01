import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const root=fileURLToPath(new URL('../../ui/',import.meta.url));
const cli=process.env.DOCK_PLAYWRIGHT_CLI;
if(!cli)throw Error('DOCK_PLAYWRIGHT_CLI must point to the installed Playwright CLI JavaScript entry');
const invoke=(args)=>new Promise((ok,fail)=>{
 const child=spawn(process.execPath,[cli,'-s=dock-runtime-tdd-'+process.pid,...args],{windowsHide:true});let out='',err='';
 child.stdout.on('data',c=>out+=c);child.stderr.on('data',c=>err+=c);child.on('error',fail);
 child.on('close',code=>code===0?ok(out):fail(new Error('CLI failed: '+err.slice(0,300)+out.slice(0,300))));
});
const server=createServer(async(req,res)=>{
 try{
 const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const path=resolve(root,'.'+(name==='/'?'/index.html':name));
 if(!path.startsWith(resolve(root)+sep)){res.writeHead(403).end();return;}
 const bytes=await readFile(path);
 res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css'})[extname(path)]||'application/octet-stream');res.end(bytes);
 }catch{res.writeHead(404).end();}
});
let result;
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 await invoke(['open','http://127.0.0.1:'+server.address().port]);
 const output=await invoke(['run-code','--filename='+fileURLToPath(new URL(process.env.DOCK_BROWSER_CASES||'./browser-cases.cjs',import.meta.url))]);
 const match=output.match(/### Result\s*\n([\s\S]*?)(?=\n### |$)/);
 if(!match)throw new Error('CLI result protocol absent');
 result=JSON.parse(match[1].trim());
}catch(e){result={tests:0,failures:0,errors:1,category:'environment_failure',summary:String(e.message)};}
finally{await invoke(['close']).catch(()=>{});server.close();}
console.log('TDD_GUARD_RESULT='+JSON.stringify(result));
process.exitCode=result.category==='pass'?0:1;
