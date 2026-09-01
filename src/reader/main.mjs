import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createReadOnlyClient,collectSnapshot,createNamingStore,createModelNaming,createIsolatedNamer,applyAutomaticNames} from './reader.mjs';
import {startCollectorService} from './service.mjs';
import {createDesktopObserver,mergeDesktopHistory} from './desktop-runtime.mjs';
import {resolveCodexExecutable,automaticNamingEnabled} from './config.mjs';
// Resolve only a validated local Codex executable. No account tokens or user
// message bodies are read from configuration files or persisted here.
const codexExecutable=await resolveCodexExecutable();
const client=createReadOnlyClient({executable:codexExecutable});
// Independent RPC process: a slow content read cannot hold the status/list connection hostage.
const fieldClient=createReadOnlyClient({executable:codexExecutable});
const background={};
const cache=new Map();
const desktop=createDesktopObserver();
const desktopHistory=new Map();
let naming=null,namingStore=null;
try{
 if(!automaticNamingEnabled())throw Error('automatic_naming_not_enabled');
 if(!process.env.LOCALAPPDATA)throw Error('naming_storage_unavailable');
 const dir=join(process.env.LOCALAPPDATA,'CodexTaskDock');await mkdir(dir,{recursive:true});
 namingStore=createNamingStore(join(dir,'naming-v1.sqlite'));
 const generate=createIsolatedNamer({executable:codexExecutable,cwd:fileURLToPath(new URL('./naming-workdir/',import.meta.url)),store:namingStore});
 naming=createModelNaming({store:namingStore,generate});
}catch{/* Naming failure must not stop runtime/status collection. No private error logs. */}
let priorityIds=[],expectedTurns={};
const service=await startCollectorService({collect:async()=>{
 const result=await collectSnapshot(client,{cache,maxFieldReads:8,priorityIds,expectedTurns,fieldClient,background,captureNamingInput:true});
 const observed=await desktop.collect(result.snapshot.threads.map(t=>t.threadId));
 const states=mergeDesktopHistory(desktopHistory,result.snapshot.threads,observed.states);
 for(const t of result.snapshot.threads)if(states[t.threadId])t.desktopRuntime=states[t.threadId];
 priorityIds=result.snapshot.threads.filter(t=>t.desktopRuntime?.state==='running'||Date.now()-t.updatedAt*1000<86400000).map(t=>t.threadId);
 expectedTurns=Object.fromEntries(result.snapshot.threads.filter(t=>priorityIds.includes(t.threadId)&&t.desktopRuntime?.turnId).map(t=>[t.threadId,t.desktopRuntime.turnId]));
 try{result.snapshot.threads=naming?naming.observe(result.snapshot.threads,cache):applyAutomaticNames(result.snapshot.threads,cache);}catch{result.snapshot.threads=result.snapshot.threads.map(t=>({...t,nameStatus:'unavailable'}));}
 result.desktop={status:observed.status,partial:observed.partial===true};return result;
}});
process.stdout.write(JSON.stringify({event:'ready',port:service.port,token:service.token})+'\n');
service.refresh();
let closing=false;
async function close(){if(closing)return;closing=true;background.closed=true;desktop.close();client.close();fieldClient.close();await naming?.close();namingStore?.close();await service.close();process.exitCode=0;}
process.stdin.resume();
process.stdin.on('end',close);
process.on('SIGTERM',close);
process.on('SIGINT',close);
