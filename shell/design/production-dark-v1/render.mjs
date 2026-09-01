import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const server=createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 if(!['/','/index.html','/styles.css','/app.mjs','/title-points.mjs'].includes(path)){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',path.endsWith('.css')?'text/css':path.endsWith('.mjs')?'text/javascript':'text/html; charset=utf-8');
 res.end(await readFile(new URL('../../ui/'+(path==='/'?'index.html':path.slice(1)),import.meta.url)));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const cli=process.env.DOCK_PLAYWRIGHT_CLI;
if(!cli)throw Error('DOCK_PLAYWRIGHT_CLI is required');
const call=args=>new Promise((resolve,reject)=>{
 const p=spawn(process.execPath,[cli,'-s=dock-production-dark',...args],{windowsHide:true});let out='';
 p.stdout.on('data',c=>out+=c);p.stderr.on('data',c=>out+=c);p.on('error',reject);p.on('close',c=>c===0?resolve(out):reject(Error(out)));
});
try{await call(['open','http://127.0.0.1:'+server.address().port]);console.log(await call(['run-code','--filename='+fileURLToPath(new URL('./render-cases.cjs',import.meta.url))]));}
finally{await call(['close']).catch(()=>{});server.close();}
