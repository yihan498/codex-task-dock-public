import {createServer} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
export async function startCollectorService(options={}) {
 const token=randomBytes(32).toString('hex');
 let state={connection:'connecting',stale:true,lastSuccessAt:null,snapshot:null,capabilities:{livePlan:false}};
 let inFlight=null,closed=false;
 function refresh(){
  if(closed)return Promise.resolve();
  if(inFlight)return inFlight;
  inFlight=Promise.resolve().then(()=>options.collect()).then(result=>{state=result;})
   .catch(()=>{state={...state,connection:'disconnected',stale:true};})
   .finally(()=>{inFlight=null;});
  return inFlight;
 }
 const server=createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options','nosniff');
  const deny=(status,code)=>{res.writeHead(status);res.end(JSON.stringify({error:code}));};
  if(req.headers.origin)return deny(403,'origin_forbidden');
  const supplied=Buffer.from(req.headers.authorization||''),expected=Buffer.from('Bearer '+token);
  if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return deny(401,'unauthorized');
  if(req.method!=='GET')return deny(405,'method_forbidden');
  if(req.url!=='/api/snapshot')return deny(404,'not_found');
  const body=JSON.stringify(state);
  if(Buffer.byteLength(body)>2*1024*1024)return deny(503,'snapshot_too_large');
  res.end(body);
 });
 server.requestTimeout=5000;server.headersTimeout=5000;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const port=server.address().port;
 const timer=setInterval(refresh,options.intervalMs||5000);
 return {port,token,url:'http://127.0.0.1:'+port,refresh,
  async close(){closed=true;clearInterval(timer);server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 };
}
