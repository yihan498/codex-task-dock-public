import {createServer} from 'node:http';
const server=createServer((req,res)=>{res.end('{}');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
console.log(JSON.stringify({event:'ready',port:server.address().port,token:'a'.repeat(64)}));
process.stdin.resume();
process.stdin.on('end',()=>server.close());
