import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {cleanNamingText} from './auto-name.mjs';
export const namingRecipe='model-user-keywords-v8';
const recipe=namingRecipe;
const hash=s=>createHash('sha256').update(s).digest('hex');
const validId=s=>typeof s==='string'&&s.length>0&&s.length<=160&&!/\s/.test(s);
export const namingDay=ms=>new Date(ms+8*3600000).toISOString().slice(0,10);

// No attachments or assistant output. This bounded source lives only in reader memory.
export function selectNamingInput(response,threadId){
 const t=response?.thread;if(!validId(threadId)||t?.id!==threadId||!Array.isArray(t.turns))return null;
 let turnId=null;const texts=[];
 for(const turn of t.turns){if(!validId(turn?.id)||!Array.isArray(turn.items))continue;
  for(const item of turn.items){if(item?.type!=='userMessage'||!validId(item.id)||!Array.isArray(item.content))continue;
   const raw=item.content.filter(x=>x?.type==='text'&&typeof x.text==='string').map(x=>x.text).join('\n');
   if(!raw.includes('## My request:')&&(/^(?:\s*# AGENTS\.md instructions|\s*<(?:environment_context|permissions|app-context|recommended_plugins)\b)/.test(raw)))continue;
   turnId=turn.id;
   // Redact contact values, not the surrounding business sentence. Secrets/code still
   // pass through the conservative cleaner; a truly unreadable message stays a barrier.
   const redacted=raw.length>65536?raw:raw.replace(/https?:\/\/[^\s<>"）)]+/g,'').replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'').replace(/(?<!\d)(?:\+?86[ -]?)?1[3-9]\d{9}(?!\d)/g,'');
   const text=cleanNamingText(redacted).trim().replace(/^\\?_[A-Za-z][A-Za-z0-9_-]*(?:\s+|$)/,'').trim();
   if(!text){
    const requestTail=raw.includes('## My request:')?raw.split('## My request:').slice(1).join('## My request:').trim():null;
    const barrier=raw.length>65536||/(?:token|password|secret|令牌|密码|密钥)\s*[:：]|^\s*(`{3,}|~{3,})/im.test(raw);
    // An attachment-only turn has no naming text, but it must not erase the
    // task identity established by earlier user turns. Sensitive/code-only
    // turns remain a hard barrier and never inherit earlier content.
    if(barrier||requestTail===null&&raw.trim())texts.length=0;
    continue;
   }
   if(!/^(?:继续(?:做)?|谢谢|好(?:的)?|可以|嗯|收到)[，,。！!\s]*$/.test(text))texts.push({text,turnId:turn.id});
  }
 }
 // Keep a bounded task-defining anchor as well as the newest work. A declared
 // topic/project change starts a new anchor so an unrelated old project cannot leak in.
 let anchor=0;
 for(let i=1;i<texts.length;i++)if(/(?:换个(?:项目|话题)|现在(?:改为|转为)|已完成[，,。 ]*现在)/.test(texts[i].text))anchor=i;
 const scoped=texts.slice(anchor);
 const compose=entries=>{
  const parts=[];
  if(entries.length===1)parts.push([...entries[0].text].slice(-2000).join(''));
  else if(entries.length>1){
   const first=[...entries[0].text].slice(0,600).join('');let remaining=1398,tail=[];
   for(let i=entries.length-1;i>0&&remaining>0;i--){const chars=[...entries[i].text],part=chars.slice(-remaining).join('');tail.unshift(part);remaining-=part.length+2;if(chars.length>part.length)break;}
   parts.push(first,...tail);
  }
  return [...parts.join('\n\n')].slice(0,2000).join('');
 };
 const text=compose(scoped),fingerprint=hash(recipe+'\n'+text),ancestors=[],seen=new Set([fingerprint]);
 for(let length=scoped.length-1;length>=1&&ancestors.length<16;length--){
  const priorText=compose(scoped.slice(0,length)),priorFingerprint=hash(recipe+'\n'+priorText);
  if(priorText&&!seen.has(priorFingerprint)){ancestors.push({fingerprint:priorFingerprint,turnId:scoped[length-1].turnId});seen.add(priorFingerprint);}
 }
 return {threadId,turnId,text,fingerprint,ancestors};
}

export function validateModelName(value,text){
 if(!value||typeof value!=='object'||Object.keys(value).some(k=>k!=='parts')||!Array.isArray(value.parts)||value.parts.length>4)return null;
 if(!value.parts.length)return [];
 const created=/(?:新建|创建)(?:一个|一名)?\s*(?:sub\s*)?agent[\s，,、]*(?:叫(?:他|它)?|名为)\s*\\?_?([A-Za-z][A-Za-z0-9_-]{0,31})/i.exec(text)?.[1]?.toLowerCase();
 if(created){const project=value.parts.find(p=>p?.kind==='project')?.text?.replace(/^_+/,'').toLowerCase();if(project!==created)return null;}
 const kinds=new Set();let count=0;
 for(const p of value.parts){
  if(!p||Object.keys(p).some(k=>!['kind','text','evidence'].includes(k))||!['company','project','object','action'].includes(p.kind)||kinds.has(p.kind)||typeof p.text!=='string'||!p.text.trim()||[...p.text].length>32||/[<>\r\n\\]|https?:|@|sk-/.test(p.text)||typeof p.evidence!=='string'||!p.evidence.trim()||p.evidence.length>200||!text.includes(p.evidence))return null;
  const negative=/(?:不要|不需要|禁止|无需|暂不|不做|不删除|不提交|不开发|不实施|不执行|不修改|不安装|\b(?:do\s+not|don['’]t|never|must\s+not|should\s+not|cannot)\b)/i;
  if(p.evidence.includes(p.text)){
   if(!text.split(/[，,。；;\n!?！？]/).some(c=>c.includes(p.text)&&!negative.test(c)))return null;
  }else{
   // A translated object is a model judgment, not mechanically proven fact.
   // Inspect the enclosing source clause: a short quote must not hide "do not".
   let positive=false,offset=0,index;
   while((index=text.indexOf(p.evidence,offset))!==-1){
    const before=text.slice(0,index),after=text.slice(index+p.evidence.length);
    const start=Math.max(...[...before.matchAll(/[，,。；;\n!?！？.]/g)].map(m=>m.index),-1)+1;
    const end=after.search(/[，,。；;\n!?！？.]/);
    const clause=text.slice(start,index+p.evidence.length+(end<0?after.length:end));
    if(!negative.test(clause))positive=true;
    offset=index+1;
   }
   if(p.kind!=='object'||!positive)return null;
  }
  if(p.kind==='object'&&(/^(?:内容|任务|任务进度|进度|工作|到哪一步|没有提交成功|学习与能力强化|能力强化|学习提升)$/.test(p.text)||/^_?[A-Za-z0-9-]+子?agent$/i.test(p.text)))return null;
  kinds.add(p.kind);count+=[...p.text].length;
 }
 if(!kinds.has('object')||count>80)return null;
 return value.parts.map(p=>({kind:p.kind,text:p.text.trim()}));
}

// One shared database per user installation; quota commits before any upstream send.
// It stores hashes, compact names and fixed statuses, never source bodies/credentials.
export function createNamingStore(path){
 const db=new DatabaseSync(path);db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS calls (job TEXT PRIMARY KEY, day TEXT NOT NULL); CREATE TABLE IF NOT EXISTS names (key TEXT PRIMARY KEY, status TEXT NOT NULL, parts TEXT NOT NULL, day TEXT NOT NULL);');
 db.exec('BEGIN IMMEDIATE');try{const columns=db.prepare('PRAGMA table_info(names)').all().map(c=>c.name);if(!columns.includes('attempts'))db.exec('ALTER TABLE names ADD COLUMN attempts INTEGER NOT NULL DEFAULT 1');if(!columns.includes('retry_at'))db.exec('ALTER TABLE names ADD COLUMN retry_at INTEGER NOT NULL DEFAULT 0');if(!columns.includes('failure'))db.exec('ALTER TABLE names ADD COLUMN failure TEXT');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');db.close();throw e;}
 return {
  reserve(job,now){
   const day=namingDay(now);db.exec('BEGIN IMMEDIATE');
   try{const last=db.prepare('SELECT max(day) AS day FROM calls').get().day;
    if(last&&day<last||db.prepare('SELECT 1 FROM calls WHERE job=?').get(job)||db.prepare('SELECT count(*) AS n FROM calls WHERE day=?').get(day).n>=30){db.exec('ROLLBACK');return false;}
    db.prepare('INSERT INTO calls VALUES (?,?)').run(job,day);db.exec('COMMIT');return true;
   }catch(e){db.exec('ROLLBACK');throw e;}
  },
  used(now){return db.prepare('SELECT count(*) AS n FROM calls WHERE day=?').get(namingDay(now)).n;},
  reserved(job){return Boolean(db.prepare('SELECT 1 FROM calls WHERE job=?').get(job));},
  get(key){const r=db.prepare('SELECT * FROM names WHERE key=?').get(key);if(!r)return null;return {status:r.status,parts:JSON.parse(r.parts),day:r.day,attempts:r.attempts,retryAt:r.retry_at,failure:r.failure||'unclassified_legacy'};},
  put(key,status,parts,now,attempts=1,retryAt=0,failure=null){if(!['ready','unrecognized','unavailable','limited'].includes(status))throw Error('invalid_status');if(failure!==null&&!['output_rejected','upstream_unavailable','context_rejected','auth_unavailable','model_unavailable','quota'].includes(failure))throw Error('invalid_failure');db.prepare('INSERT INTO names (key,status,parts,day,attempts,retry_at,failure) VALUES (?,?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET status=excluded.status,parts=excluded.parts,day=excluded.day,attempts=excluded.attempts,retry_at=excluded.retry_at,failure=excluded.failure WHERE names.status!=\'ready\' AND names.attempts<=excluded.attempts').run(key,status,JSON.stringify(parts),namingDay(now),attempts,retryAt,failure);},
  close(){db.close();}
 };
}

export function eligibleForNaming(t,now){
 const r=t.desktopRuntime;if(r?.source!=='desktop-ipc'||r.threadId!==t.threadId||!validId(r.turnId))return false;
 return r.state==='running'&&Number.isSafeInteger(r.seenAt)&&now>=r.seenAt&&now-r.seenAt<=20000||r.state==='stopped'&&Number.isSafeInteger(r.stoppedAt)&&r.stoppedAt>0&&r.stoppedAt<=now&&namingDay(r.stoppedAt)===namingDay(now);
}

export function createModelNaming({store,generate,now=Date.now}){
 let desired=new Map(),busy=null,closed=false,activeKey=null;const pending=new Map();
 const withRetained=(base,status,source,failure)=>{
  for(const ancestor of source?.ancestors||[]){
   const cached=store.get(hash(recipe+'\n'+base.threadId+'\n'+ancestor.fingerprint));
   if(cached?.status==='ready')return {...base,nameStatus:status,...(failure?{nameFailure:failure}:{}),displayName:{source:'model-user-content-retained',threadId:base.threadId,turnId:source.turnId,sourceTurnId:ancestor.turnId,parts:cached.parts}};
  }
  return {...base,nameStatus:status,...(failure?{nameFailure:failure}:{})};
 };
 function pump(){
  if(busy||closed)return;
  busy=(async()=>{
   while(pending.size&&!closed){const [key,job]=pending.entries().next().value;pending.delete(key);
    if(desired.get(job.threadId)?.key!==key||!eligibleForNaming(job.task,now()))continue;
    activeKey=key;
    let status='unavailable',parts=[],failure='output_rejected';
    try{const result=await generate(job);const valid=validateModelName(result,job.text);if(valid){parts=valid;status=parts.length?'ready':'unrecognized';}}
    catch(e){if(e?.message==='naming_source_changed'||e?.message==='naming_closed'){activeKey=null;continue;}failure=/^naming_(?:upstream|network|proxy|tls)_/.test(e?.message)?'upstream_unavailable':/^naming_context_/.test(e?.message)?'context_rejected':e?.message==='naming_auth_unavailable'?'auth_unavailable':/^naming_response_/.test(e?.message)?'output_rejected':'model_unavailable';if(e?.message==='naming_limit'){status='limited';failure='quota';}}
    store.put(key,status,parts,now(),job.attempt,status==='unavailable'?now()+60000:0,['unavailable','limited'].includes(status)?failure:null);
    activeKey=null;
   }
  })().catch(()=>{}).finally(()=>{busy=null;if(pending.size&&!closed)pump();});
 }
 return {
  observe(threads,cache){
   desired=new Map();const views=threads.map(t=>{
    // No regex-generated pseudo-name as an invisible fallback for the model route.
    const {displayName:ignored,nameStatus:old,...base}=t;
    if(!eligibleForNaming(t,now()))return base;
    const saved=cache.get(t.threadId),s=saved?.namingInput;
    if(saved?.readStatus==='unavailable')return {...base,nameStatus:'unavailable',nameFailure:'source_read_unavailable'};
    if(!s||s.threadId!==t.threadId||s.turnId!==t.desktopRuntime.turnId)return {...base,nameStatus:'pending'};
    if(!s.text)return {...base,nameStatus:'unrecognized'};
    const key=hash(recipe+'\n'+t.threadId+'\n'+s.fingerprint),job={...s,key,task:t,isCurrent:()=>!closed&&desired.get(t.threadId)?.key===key&&eligibleForNaming(desired.get(t.threadId)?.task||{},now())};desired.set(t.threadId,job);
    let cached=store.get(key);
    if(key!==activeKey&&(!cached||['unavailable','limited'].includes(cached.status)&&cached.attempts<2)&&store.reserved(key+':attempt:2')){store.put(key,'unavailable',[],now(),2,0,'model_unavailable');cached=store.get(key);}
    if(!cached&&key!==activeKey&&store.reserved(key+':attempt:1')){store.put(key,'unavailable',[],now(),1,now()+60000,'model_unavailable');cached=store.get(key);}
    if(key!==activeKey&&cached?.status==='unavailable'&&cached.attempts===2&&store.reserved(key+':attempt:1')&&!store.reserved(key+':attempt:2'))cached={...cached,attempts:1};
    const retry=cached?.status==='unavailable'&&cached.attempts<2&&cached.retryAt<=now();
    if(cached&&!retry&&!(cached.status==='limited'&&cached.day<namingDay(now()))){
     if(cached.status==='ready')return {...base,nameStatus:'ready',displayName:{source:'model-user-content',threadId:t.threadId,turnId:s.turnId,parts:cached.parts}};
     if(['unavailable','limited','unrecognized'].includes(cached.status))return withRetained(base,cached.status,s,cached.status==='unavailable'?cached.failure:null);
     return {...base,nameStatus:cached.status};
    }
    job.attempt=retry?cached.attempts+1:cached?.attempts||1;job.attemptKey=key+':attempt:'+job.attempt;
    if(key!==activeKey&&pending.size<128)pending.set(key,job);
    return withRetained(base,'pending',s,null);
   });
   for(const [key,job] of pending)if(desired.get(job.threadId)?.key!==key)pending.delete(key);
   pump();return views;
  },
  async drain(){while(busy)await busy;},
  async close(){closed=true;pending.clear();await generate.close?.();while(busy)await busy;}
 };
}
