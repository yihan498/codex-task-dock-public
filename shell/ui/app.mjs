import {titlePoints} from './title-points.mjs';
const $=selector=>document.querySelector(selector);
const invoke=(command,args)=>{
 const fn=window.__TAURI__?.core?.invoke;
 return typeof fn==='function'?fn(command,args):Promise.reject(new Error('native_bridge_unavailable'));
};
const dayFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'});
const timeFormat=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
const millis=value=>typeof value==='number'&&Number.isFinite(value)&&value>0?(value<1e11?value*1000:value):NaN;
const validTime=value=>Number.isFinite(value)&&value<=8640000000000000;
function reportView(r,id){
 if(!r||r.source!=='agent-report'||r.threadId!==id||!['active','blocked','ended'].includes(r.state)||!Array.isArray(r.plan)||r.plan.length>12||
  !Number.isSafeInteger(r.seenAt)||!Number.isSafeInteger(r.progressAt)||r.progressAt>r.seenAt||typeof r.fresh!=='boolean')return null;
 if(!r.plan.every(p=>typeof p.step==='string'&&p.step.trim()&&[...p.step].length<=160&&['pending','in_progress','completed'].includes(p.status))||r.plan.filter(p=>p.status==='in_progress').length>1)return null;
 return r;
}
function desktopView(r,id){
 if(!r||r.source!=='desktop-ipc'||r.threadId!==id||!['running','stopped','unknown'].includes(r.state)||!Number.isSafeInteger(r.seenAt)||!Array.isArray(r.plan)||r.plan.length>12)return null;
 if(!r.plan.every(p=>typeof p?.step==='string'&&p.step.trim()&&[...p.step].length<=160&&['pending','in_progress','completed'].includes(p.status))||r.plan.filter(p=>p.status==='in_progress').length>1)return null;
 return r;
}
function businessText(raw,threadId){
 const result={};
 for(const key of ['company','project','workContent','subject','partition','deadline']){
  const field=raw?.[key],source=field?.source;
  if(typeof field?.value!=='string'||!field.value.trim()||field.value.length>4096||
   source?.sourceThreadId!==threadId||!['sourceThreadId','sourceTurnId','sourceMessageId'].every(k=>typeof source[k]==='string'&&source[k]&&!/\s/.test(source[k])))continue;
  if(key==='partition'&&!['实习','工作','学习'].includes(field.value))continue;
  if(key==='deadline'&&(field.basis?.type!=='explicit'||field.basis.timeZone!=='Asia/Shanghai'))continue;
  result[key]=field.value;
 }
 return result;
}
function displayNameView(d,t){
 const retained=d?.source==='model-user-content-retained';
 const automatic=['local-user-keywords','model-user-content','model-user-content-retained'].includes(d?.source);
 if(!automatic&&d?.source!=='reviewed-user-content'||d.threadId!==t.threadId||d.turnId!==t.desktopRuntime?.turnId||typeof d.turnId!=='string'||!d.turnId.trim())return null;
 if(retained&&(typeof d.sourceTurnId!=='string'||!d.sourceTurnId.trim()||d.sourceTurnId.length>100))return null;
 const p=d.parts;if(!Array.isArray(p)||p.length<1||!automatic&&p.length<2||p.length>4||!p.every(x=>['company','project','object','action'].includes(x?.kind)&&typeof x.text==='string'&&x.text.trim()&&[...x.text].length<=48)||p.reduce((n,x)=>n+[...x.text].length,0)>80||!automatic&&!p.some(x=>['project','company'].includes(x.kind))||!p.some(x=>x.kind==='object'))return null;
 return {source:d.source,parts:p.map(x=>({kind:x.kind,text:x.text})),retained};
}
function normalize(data){
 if(!data||!['live','connecting','disconnected'].includes(data.connection)||typeof data.stale!=='boolean'||!(data.threads===null||Array.isArray(data.threads)))throw new Error('invalid_snapshot');
 const seen=new Set();
 const threads=data.threads===null?null:data.threads.map(t=>{
  if(!t||typeof t.threadId!=='string'||!t.threadId.trim()||typeof t.title!=='string'||typeof t.runtimeState!=='string')throw new Error('invalid_thread');
  const desktopRuntime=desktopView(t.desktopRuntime,t.threadId);
  return {threadId:t.threadId,title:t.title,nameStatus:['ready','pending','unavailable','unrecognized','limited'].includes(t.nameStatus)?t.nameStatus:null,titleSource:['name','missing'].includes(t.titleSource)?t.titleSource:'unknown',updatedAt:millis(t.updatedAt),business:businessText(t.business,t.threadId),desktopRuntime,displayName:displayNameView(t.displayName,{threadId:t.threadId,desktopRuntime})};
 }).filter(t=>{if(seen.has(t.threadId))return false;seen.add(t.threadId);return true;});
 return {connection:data.connection,stale:data.stale,lastSuccessAt:typeof data.lastSuccessAt==='string'?data.lastSuccessAt:null,threads,desktop:data.desktop?.status==='available'?'available':'unavailable',desktopPartial:data.desktop?.partial===true};
}
let lastGood=null, latest=null, failed=false, busy=false, filter='current', signature='', stopped=false,pageIndex=0;
const partitions=['实习','工作','学习','待归类'];
const deadlineTime=task=>Date.parse(task.business.deadline||'');
function deadlineRisk(task){
 const left=deadlineTime(task)-Date.now();
 return left<0?'overdue':left<=12*3600000?'soon':'';
}
function render(){
 const all=lastGood?.threads, today=dayFormat.format(new Date());
 const isToday=t=>t.desktopRuntime?.state==='stopped'&&validTime(t.desktopRuntime.stoppedAt)&&dayFormat.format(new Date(t.desktopRuntime.stoppedAt))===today;
 $('[data-metric="total"]').textContent=all?String(all.length):'—';
 $('[data-metric="today"]').textContent=all?String(all.filter(isToday).length):'—';
 const current=filter==='current',compact=filter!=='all';document.body.classList.toggle('current-view',compact);
 const fresh=r=>r&&Date.now()>=r.seenAt&&Date.now()-r.seenAt<=20000&&!failed&&latest?.connection==='live'&&!latest?.stale&&lastGood?.desktop==='available';
 const candidates=(all||[]).filter(t=>filter==='all'||(current?t.desktopRuntime?.state==='running'&&fresh(t.desktopRuntime):isToday(t))).sort((a,b)=>
  (Number.isFinite(deadlineTime(a))?deadlineTime(a):Infinity)-(Number.isFinite(deadlineTime(b))?deadlineTime(b):Infinity)||
  (validTime(b.updatedAt)?b.updatedAt:0)-(validTime(a.updatedAt)?a.updatedAt:0)||a.threadId.localeCompare(b.threadId));
 const pages=Math.max(1,Math.ceil(candidates.length/3));pageIndex=Math.min(pageIndex,pages-1);
 const visible=compact?candidates.slice(pageIndex*3,pageIndex*3+3):candidates;
 $('#pagination').hidden=!compact;$('#page-label').textContent=(pageIndex+1)+' / '+pages;
 $('#page-prev').disabled=pageIndex===0;$('#page-next').disabled=pageIndex===pages-1;
 const unknown=(all||[]).filter(t=>!t.desktopRuntime||t.desktopRuntime.state==='unknown'||t.desktopRuntime.state==='running'&&!fresh(t.desktopRuntime)).length;
 const scope=$('.scope'),currentNeedsScope=current&&(lastGood?.desktop!=='available'||failed||lastGood?.desktopPartial);
 scope.hidden=current&&!currentNeedsScope;
 scope.textContent=current?(lastGood?.desktop!=='available'||failed?'桌面连接待确认 · 不推断运行或结束':`部分已确认 · ${unknown} 项状态待确认`):filter==='today'?'今日停止的任务 · 不等同于业务已完成':'步骤暂不可确认 · 历史任务不代表正在执行';
 const nextSignature=JSON.stringify([filter,pageIndex,all!==undefined,visible,visible.map(deadlineRisk),visible.map(t=>fresh(t.desktopRuntime))]);
 if(nextSignature!==signature){
  signature=nextSignature; const root=$('#tasks'),scroll=root.scrollTop;root.replaceChildren();
  if(!visible.length){const p=document.createElement('p');p.className='empty';p.textContent=!all?'正在连接本机 Codex…':current?(lastGood?.desktop==='available'?'暂无已确认正在运行的任务':'暂不能确认当前任务'):filter==='today'?'暂无确认在今日停止的任务':'尚无已采集任务';root.append(p);}
  for(const partition of partitions){
   const members=visible.filter(t=>(t.business.partition||'待归类')===partition);
   if(!members.length)continue;
   const group=document.createElement('section');group.className='partition-group';group.dataset.partition=partition;
   const heading=document.createElement('h3');heading.className='partition-heading';heading.textContent=partition+' · '+members.length+'项';
   group.append(heading);root.append(group);
  for(const task of members){
   const article=document.createElement('article');article.className='task';
   const info=task.business;
   const descriptive=info.workContent||info.subject;
   const points=titlePoints(task.title,{keywords:true});
   const h=document.createElement('h2');
   // Presentation roles are not new business facts. Never split literal source text on '/'.
   const parts=descriptive?[
    {text:info.company,kind:'company'},{text:info.project,kind:'project'},
    ...[...new Set([info.workContent,info.subject].filter(Boolean))].map(text=>({text,kind:'object'}))
   ].filter(p=>p.text):task.displayName?.parts||(!task.nameStatus&&points.mode==='extract'?points.parts:null);
   if(parts){
    const identity=document.createElement('span');identity.className='identity-line';
    const work=document.createElement('span');work.className='work-line';
    const objects=[];
    for(const part of parts){
     if(['company','project','entity','tool'].includes(part.kind)){
      const token=document.createElement('span');token.className='identity-token '+(['project','tool'].includes(part.kind)?'project-token':'company-token');
      token.textContent=part.text;
      token.title=descriptive?(part.kind==='company'?'公司 · 用户提供':'项目 · 用户提供'):task.displayName?'用户内容概括':'任务关键词';
      token.setAttribute('aria-label',token.title+'：'+part.text);
      if(identity.childNodes.length)identity.append(document.createTextNode(' '));identity.append(token);
     }else objects.push(part.text);
    }
    if(identity.childNodes.length){h.append(identity,document.createTextNode(' '));}
    work.textContent=objects.join(' · ');h.append(work);
   }else h.textContent=task.nameStatus?({unrecognized:'未识别到任务关键词',unavailable:'自动命名暂不可用',pending:'任务内容同步中',ready:'名称待同步',limited:'命名今日额度已用完'}[task.nameStatus]):points.text;
   article.append(h);
   if(compact&&task.desktopRuntime){
    const r=task.desktopRuntime,index=r.plan.findIndex(p=>p.status==='in_progress');
    if(index>=0){
     const label=document.createElement('p');label.className='step-label';
     label.textContent='第'+(index+1)+'步 / 共'+r.plan.length+'步 · 当前步骤 · '+r.plan[index].step;label.title=label.textContent;article.append(label);
     const rail=document.createElement('div');rail.className='step-rail';rail.setAttribute('role','img');rail.setAttribute('aria-label',r.plan.map((p,i)=>'第'+(i+1)+'步 '+p.step+' '+({completed:'已完成',in_progress:'进行中',pending:'待开始'}[p.status])).join('；'));for(const p of r.plan){const segment=document.createElement('span');segment.className=p.status;rail.append(segment);}article.append(rail);
     const next=r.plan.find((p,i)=>p.status==='pending'&&i>index);
     if(next){const p=document.createElement('p');p.className='next-step';p.textContent='下一步 · '+next.step;p.title=p.textContent;article.append(p);}
    }
    const provenance=document.createElement('p');provenance.className='report-source';
    const status=r.state==='stopped'?'已停止':'运行中';
    const clock=value=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
    provenance.textContent=status+(index>=0?' · 桌面计划':'')+' · '+clock(r.state==='stopped'&&validTime(r.stoppedAt)?r.stoppedAt:r.seenAt);
    provenance.title='状态来自本机桌面；步骤为桌面当前显示的结构化计划，可能沿用前轮计划';
    article.append(provenance);
   }
   const provenance=descriptive?'用户消息摘要':task.titleSource==='missing'?'未设置任务名称':'Codex任务标题';
   h.setAttribute('role','link');h.tabIndex=0;h.title=(descriptive?'用户消息摘要 · ':task.displayName?.source==='model-user-content-retained'?'沿用上一可靠名称 · 后台重新命名中 · ':task.displayName?.source==='model-user-content'?'用户内容自动概括 · ':task.displayName?.source==='local-user-keywords'?'本地用户内容自动提取 · ':task.displayName?'用户内容概括 · ':'')+'点击或按回车打开对应 Codex 任务';
   const open=async()=>{
    try{await invoke('open_codex_task',{threadId:task.threadId});$('#connection').textContent='已请求打开原Codex任务';}
    catch{$('#connection').textContent='打开未成功 · 请确认Codex已安装且任务仍在列表中';}
   };
   h.addEventListener('click',open);
   h.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();open();}});
   const meta=document.createElement('p');meta.className='meta';
   const labels=[];
   if(info.company&&!descriptive)labels.push('公司 '+info.company);
   if(info.project&&!descriptive)labels.push('项目 '+info.project);
   if(labels.length){meta.textContent=labels.join(' · ');article.append(meta);}
   if(info.deadline){
    const deadline=document.createElement('p');deadline.className='meta deadline';deadline.title='截止时间 · 亚洲/上海（UTC+08:00）';
    const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 16 16');icon.setAttribute('aria-hidden','true');
    const circle=document.createElementNS(icon.namespaceURI,'circle');circle.setAttribute('cx','8');circle.setAttribute('cy','8');circle.setAttribute('r','6');
    const hands=document.createElementNS(icon.namespaceURI,'path');hands.setAttribute('d','M8 4v4l3 2');icon.append(circle,hands);
    const risk=deadlineRisk(task);
    deadline.title+=' · '+info.deadline;
    deadline.append(icon,document.createTextNode((current&&risk?(risk==='overdue'?'截止已过 ':'临近截止 '):'截止 ')+info.deadline.slice(current?5:0,16).replace('T',' ')));article.append(deadline);
    if(risk)deadline.classList.add(risk);
    if(risk){const badge=document.createElement('span');badge.className='deadline-risk '+risk;badge.textContent=risk==='overdue'?'截止已过':'12小时内';article.append(badge);}
   }
   group.append(article);
  }
  }
  root.scrollTop=scroll;
 }
 $('#shown').textContent=all?candidates.length+' 项':'';
 const date=Date.parse(lastGood?.lastSuccessAt||'');
 const aged=!Number.isFinite(date)||Date.now()-date>10000||date>Date.now()+5000;
 const stale=latest?.stale||aged;
 const state=$('#connection');
 state.textContent=failed?(lastGood?'连接中断 · 保留上次数据':'连接中断 · 尚未取得任务快照'):!latest||latest.threads===null?'等待采集服务提供快照':latest.connection!=='live'?'采集服务离线 · 保留上次数据':stale?'数据已陈旧 · 等待采集更新':current?(lastGood?.desktop==='available'?'已连接本机 Codex · 只读':'Codex 桌面连接待确认'):'本机采集正常 · 非实时业务进度';
 state.classList.toggle('warning',failed||!!latest&&(stale||latest.connection!=='live'));
 $('#updated').textContent=Number.isFinite(date)?'上次采集 '+timeFormat.format(new Date(date))+' · 只读':'仅只读 · 不控制主任务';
}
async function refresh(){
 if(busy||stopped)return;
 busy=true;$('#refresh').disabled=true;
 try{
  const data=normalize(await invoke('fetch_task_snapshot'));
  latest=data;failed=false;if(data.threads!==null)lastGood=data;
 }catch{failed=true;}
 finally{busy=false;$('#refresh').disabled=false;render();}
}
$('#refresh').addEventListener('click',refresh);
$('#hide').addEventListener('click',async()=>{
 try{await invoke('hide_dock');}catch{$('#connection').textContent='隐藏未成功 · 可使用窗口关闭按钮';$('#connection').classList.add('warning');}
});
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{
 filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
 pageIndex=0;signature='';$('#tasks').scrollTop=0;render();
}));
$('#page-prev').addEventListener('click',()=>{pageIndex=Math.max(0,pageIndex-1);render();});
$('#page-next').addEventListener('click',()=>{pageIndex++;render();});
const timer=setInterval(refresh,5000);
window.addEventListener('pagehide',()=>{stopped=true;clearInterval(timer);});
refresh();
