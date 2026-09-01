import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import {Readable} from 'node:stream';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const endpoint='https://chatgpt.com/backend-api/codex/responses';
export function adaptNamingResponse(response){
 const headers=new Headers();for(const [k,v] of Object.entries(response.headers))if(v!==undefined)headers.set(k,Array.isArray(v)?v.join(','):v);
 const empty=[204,205,304].includes(response.statusCode);if(empty)response.destroy();
 return new Response(empty?null:Readable.toWeb(response),{status:response.statusCode,headers});
}
export function namingProxy(settings){
 if(settings?.AutoConfigURL)throw Error('naming_proxy_unsupported');
 if(!settings?.ProxyEnable)return null;
 const match=/^(127\.0\.0\.1|localhost):(\d{1,5})$/.exec(settings.ProxyServer||'');
 if(!match||Number(match[2])<1||Number(match[2])>65535)throw Error('naming_proxy_unsupported');
 return {host:match[1],port:Number(match[2])};
}
export async function systemNamingForwarder(){
 // Do not silently bypass a configured environment/PAC/remote gateway.
 if(['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy'].some(k=>process.env[k]))throw Error('naming_proxy_unsupported');
 const command="Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' | Select-Object ProxyEnable,ProxyServer,AutoConfigURL | ConvertTo-Json -Compress";
 const r=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,timeout:5000,maxBuffer:8192});
 return createFixedOpenAIForwarder(namingProxy(JSON.parse(r.stdout)));
}
export function createFixedOpenAIForwarder(proxy){
 return async(url,init)=>{
  if(url!==endpoint||init.method!=='POST')throw Error('naming_destination_rejected');
  if(!proxy)return fetch(endpoint,{...init,redirect:'error'});
  return new Promise((resolve,reject)=>{
   // The local proxy sees CONNECT host/port only. Authentication and text stay inside
   // a normal verified TLS connection to the fixed official server; never disable TLS.
   const agent=new https.Agent({keepAlive:false});
   agent.createConnection=(_options,callback)=>{
    let settled=false;const ready=(err,socket)=>{if(settled){if(err)socket?.destroy();return;}settled=true;callback(err,socket);};
    const tunnel=http.request({host:proxy.host,port:proxy.port,method:'CONNECT',path:'chatgpt.com:443',headers:{host:'chatgpt.com:443'},agent:false,signal:init.signal});
    tunnel.once('connect',(res,socket,head)=>{
     if(res.statusCode!==200||head.length){socket.destroy();ready(Error('naming_proxy_rejected'));return;}
     const secure=tls.connect({socket,servername:'chatgpt.com',rejectUnauthorized:true});
     const abort=()=>secure.destroy();init.signal?.addEventListener('abort',abort,{once:true});secure.once('close',()=>init.signal?.removeEventListener('abort',abort));
     secure.once('secureConnect',()=>ready(null,secure));secure.once('error',()=>ready(Error('naming_tls_unavailable')));
    });
    tunnel.once('error',()=>ready(Error('naming_proxy_unavailable')));tunnel.end();
   };
   const request=https.request(endpoint,{method:'POST',headers:{...init.headers,'content-length':Buffer.byteLength(init.body)},agent,signal:init.signal},response=>{
    response.once('close',()=>agent.destroy());
    try{resolve(adaptNamingResponse(response));}catch{response.destroy();request.destroy();agent.destroy();reject(Error('naming_response_invalid'));}
   });
   request.once('error',()=>{agent.destroy();reject(Error('naming_network_unavailable'));});request.end(init.body);
  });
 };
}
