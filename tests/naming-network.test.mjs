import {test,assert} from './test-kit.mjs';
import * as api from '../src/reader/reader.mjs';
import {createServer} from 'node:http';
import {Readable} from 'node:stream';
test('MODEL_NETWORK_EMPTY_RESPONSE_IS_CONTROLLED',()=>{
 assert.equal(typeof api.adaptNamingResponse,'function');
 for(const status of [204,205,304]){const r=Readable.from([]);r.statusCode=status;r.headers={};const response=api.adaptNamingResponse(r);assert.equal(response.status,status);assert.equal(response.body,null);assert.equal(r.destroyed,true);}
 const invalid=Readable.from([]);invalid.statusCode=999;invalid.headers={};assert.throws(()=>api.adaptNamingResponse(invalid));
});
test('MODEL_EXISTING_PROXY_PARSE_FAIL_CLOSED',()=>{
 assert.equal(typeof api.namingProxy,'function');assert.deepEqual(api.namingProxy({ProxyEnable:1,ProxyServer:'127.0.0.1:7892'}),{host:'127.0.0.1',port:7892});assert.equal(api.namingProxy({ProxyEnable:0}),null);
 for(const c of [{ProxyEnable:1,ProxyServer:'evil.example:8080'},{ProxyEnable:1,ProxyServer:'127.0.0.1:99999'},{ProxyEnable:0,AutoConfigURL:'https://example/pac'}])assert.throws(()=>api.namingProxy(c));
});
test('MODEL_CONNECT_PROXY_NO_AUTH_BODY_AND_FIXED_DESTINATION',async()=>{
 assert.equal(typeof api.createFixedOpenAIForwarder,'function');let connects=0;
 const proxy=createServer();proxy.on('connect',(req,socket)=>{connects++;assert.equal(req.url,'chatgpt.com:443');assert.equal(req.headers.authorization,undefined);assert.equal(req.headers['proxy-authorization'],undefined);socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n');});await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
 const forward=api.createFixedOpenAIForwarder({host:'127.0.0.1',port:proxy.address().port});
 try{await assert.rejects(()=>forward('https://evil.example/',{method:'POST',headers:{authorization:'Bearer synthetic'},body:'PRIVATE'}));assert.equal(connects,0);await assert.rejects(()=>forward('https://chatgpt.com/backend-api/codex/responses',{method:'POST',headers:{authorization:'Bearer synthetic'},body:'PRIVATE',signal:AbortSignal.timeout(3000)}));assert.equal(connects,1);}finally{await new Promise(r=>proxy.close(r));}
});
