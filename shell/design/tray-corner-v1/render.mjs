import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../../ui/',import.meta.url);
const server=createServer(async(req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname;
 if(!['/','/index.html','/styles.css','/app.mjs'].includes(name)){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',name.endsWith('.mjs')?'text/javascript':name.endsWith('.css')?'text/css':'text/html; charset=utf-8');
 res.end(await readFile(new URL(name==='/'?'index.html':name.slice(1),root)));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
// Separate process keeps the HTTP server responsive while the existing CLI drives the browser.
import {spawn} from 'node:child_process';
const cli=process.env.DOCK_PLAYWRIGHT_CLI;
if(!cli)throw Error('DOCK_PLAYWRIGHT_CLI is required');
const call=args=>new Promise((resolve,reject)=>{
 const p=spawn(process.execPath,[cli,'-s=dock-corner-qa',...args],{windowsHide:true});let output='';
 p.stdout.on('data',c=>output+=c);p.stderr.on('data',c=>output+=c);p.on('error',reject);
 p.on('close',code=>code===0?resolve(output):reject(new Error(output)));
});
try{
 await call(['open','http://127.0.0.1:'+server.address().port]);
 console.log(await call(['run-code','--filename='+fileURLToPath(new URL('./render-cases.cjs',import.meta.url))]));
}finally{await call(['close']).catch(()=>{});server.close();}
