import {readdir as nativeReaddir,realpath as nativeRealpath,stat as nativeStat} from 'node:fs/promises';
import {execFile as nativeExecFile} from 'node:child_process';
import {promisify} from 'node:util';
import {win32 as path} from 'node:path';

const version=/^codex-cli \d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const safeDirectory=name=>typeof name==='string'&&name!=='.'&&name!=='..'&&/^[0-9A-Za-z._-]+$/.test(name);
const inside=(root,candidate)=>{
 const relative=path.relative(root,candidate);
 return relative!==''&&!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep);
};

export const automaticNamingEnabled=(env=process.env)=>
 env.CODEX_TASK_DOCK_ENABLE_AUTOMATIC_NAMING==='1';

async function defaultVerify(executable){
 const result=await promisify(nativeExecFile)(executable,['--version'],{windowsHide:true,timeout:5000});
 return result.stdout.trim();
}

export async function resolveCodexExecutable({
 env=process.env,readdir=nativeReaddir,realpath=nativeRealpath,stat=nativeStat,verify=defaultVerify
}={}){
 const validate=async candidate=>{
  try{
   if(!path.isAbsolute(candidate)||path.basename(candidate).toLowerCase()!=='codex.exe')return null;
   const resolved=await realpath(candidate),info=await stat(resolved);
   if(!info.isFile())return null;
   return version.test((await verify(resolved)).trim())?resolved:null;
  }catch{return null;}
 };
 const override=env.CODEX_TASK_DOCK_CODEX_EXECUTABLE;
 if(override){
  const resolved=await validate(override);
  if(resolved)return resolved;
  throw Error('codex_executable_unavailable');
 }
 try{
  if(!env.LOCALAPPDATA)throw Error('missing_local_app_data');
  const root=path.join(env.LOCALAPPDATA,'OpenAI','Codex','bin'),realRoot=await realpath(root);
  const entries=await readdir(root,{withFileTypes:true}),candidates=[];
  for(const entry of entries){
   if(!entry.isDirectory()||!safeDirectory(entry.name))continue;
   try{
    const candidate=await realpath(path.join(root,entry.name,'codex.exe'));
    if(!inside(realRoot,candidate))continue;
    const info=await stat(candidate);if(info.isFile())candidates.push({candidate,mtimeMs:info.mtimeMs});
   }catch{}
  }
  candidates.sort((a,b)=>b.mtimeMs-a.mtimeMs||a.candidate.localeCompare(b.candidate));
  for(const {candidate} of candidates){
   try{if(version.test((await verify(candidate)).trim()))return candidate;}catch{}
  }
 }catch{}
 throw Error('codex_executable_unavailable');
}
