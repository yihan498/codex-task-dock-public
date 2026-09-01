import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=new URL('./',import.meta.url);
const server=createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 if(!['/','/index.html','/missing.html','/style.css'].includes(path)){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',path.endsWith('.css')?'text/css':'text/html; charset=utf-8');
 res.end(await readFile(new URL(path==='/'?'index.html':path.slice(1),root)));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const cli=process.env.DOCK_PLAYWRIGHT_CLI;
if(!cli)throw Error('DOCK_PLAYWRIGHT_CLI is required');
const call=args=>new Promise((resolve,reject)=>{
 const p=spawn(process.execPath,[cli,'-s=dock-reference-style',...args],{windowsHide:true});let out='';
 p.stdout.on('data',c=>out+=c);p.stderr.on('data',c=>out+=c);p.on('error',reject);p.on('close',c=>c===0?resolve(out):reject(Error(out)));
});
try{await call(['open','http://127.0.0.1:'+server.address().port]);console.log(await call(['run-code','--filename='+fileURLToPath(new URL('./render-cases.cjs',root))]));}
finally{await call(['close']).catch(()=>{});server.close();}
