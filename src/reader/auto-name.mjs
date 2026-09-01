import {createHash} from 'node:crypto';

// Local, extractive display data: no model, files, execution, account calls or business writes.
const version='local-keywords-v1';
const validId=s=>typeof s==='string'&&s.length>0&&s.length<=160&&!/\s/.test(s);
const size=s=>[...s].length;
const actions='自动命名|核对|整理|翻译|校验|设计|实现|创建|开发|修改|更新|优化|修复|审阅|审查|比较|对比|分析|提取|提炼|总结|跟进|申诉|检查|准备|制作|汇总|补充|导出|转换|标注|编写|生成|搭建|阅读';
const actionRE=new RegExp(actions,'g');
const responseNameCache=new WeakMap();
const generic=/^(?:继续(?:做)?|谢谢|可以|好的|处理(?:一下)?|材料|文件|对象|任务|项目|公司|待确认|未提供|待命名|一下|这个|那个|内容|工作)$/;
const lead=/^(?:请帮我|请帮|请协助|请|帮我|我现在想|我现在|我希望|我想|我需要|现在|当前|本次|本轮|只需要|需要|只|先|另外|关于|针对|这是|之前做的|之前|我们|我的|给|为|把|对|一个|一下|这份|这本|这张|这个|该)/;
function trimLead(s){s=s.trim();while(lead.test(s))s=s.replace(lead,'').trim();return s;}
function companyText(raw){
 // Consume one request prefix. Iteratively removing single characters corrupts proper names.
 const prefix=new RegExp('^(?:(?:这是|之前做的|请(?:帮我|帮|协助)?|帮我|我想|我需要|我希望|现在)(?:'+actions+')?(?:给|为|把|对)?|(?:'+actions+')(?:给|为|把|对)?|给|把|对)');
 return raw.replace(prefix,'').trim();
}
function safeText(s){return typeof s==='string'&&s.trim()&&size(s)<=32&&!/[<>\r\n\\]|https?:|@|sk-/.test(s)&&!generic.test(s);}
function cleanText(raw){
 if(typeof raw!=='string'||raw.length>65536||/<(?:codex_delegation|environment_context|permissions|instructions|app-context|recommended_plugins)\b/.test(raw)&&!raw.includes('## My request:')||/^# AGENTS\.md instructions/m.test(raw))return '';
 let text=raw.includes('## My request:')?raw.split('## My request:').slice(1).join('## My request:'):raw;
 text=text.replace(/<([\w-]+)\b[^>]*>[\s\S]*?<\/\1>/g,' ').replace(/<[^>]*>/g,' ');
 let fence=null;const lines=[];
 for(const line of text.split(/\r?\n/)){
  const marker=/^\s*(`{3,}|~{3,})/.exec(line)?.[1];
  if(marker){if(!fence)fence=marker[0];else if(marker[0]===fence)fence=null;continue;}
  if(fence||/^\s*>/.test(line)||/https?:\/\/|[\w.+-]+@[\w.-]+\.|(?:token|password|secret|令牌|密码|密钥)\s*[:：]/i.test(line))continue;
  // Absolute paths never contribute company/project names; attachments aren't read.
  lines.push(line.replace(/[A-Za-z]:[\\/][^\s"<>]+/g,' ').replace(/(?:^|\s)\/[^\s]+/g,' ').trim());
 }
 const cleaned=lines.join('\n');return cleaned.length<=8192?cleaned:'';
}
export {cleanText as cleanNamingText};
function chooseParts(text){
 const result={identity:null,object:null,action:null,reset:/换个(?:项目|话题|任务)|切换(?:到|项目)|另一个项目|现在改做|(?:现在|接下来|这次|本次).*个人|(?:工作|任务|项目).*(?:已完成|已经完成)/.test(text)};
 const accepted=[];
 for(let clause of text.split(/[，,。；;\n!?！？]/)){
  clause=clause.trim();if(!clause||/不要|不需要|不提交|不做|暂不|先不|无需|禁止|未授权|并非|不是|已完成|已经完成/.test(clause))continue;
  accepted.push(clause);
  const label=/^(公司|项目|处理对象|工作内容)\s*[:：]\s*(.+)$/.exec(clause);
  if(label){const value=label[2].trim();if(safeText(value)){if(label[1]==='公司'||label[1]==='项目')result.identity={kind:label[1]==='公司'?'company':'project',text:value};else result.object=value;}continue;}
  const company=/(?:[\p{Script=Han}A-Za-z0-9_]+?)(?:股份有限公司|有限责任公司|有限公司|集团|银行|证券|科技|高投|基金|公司)/gu;
  const companies=[...clause.matchAll(company)].map(m=>companyText(m[0])).filter(s=>safeText(s)&&!/^(?:我们|我们公司|实习公司|一家公司|其他公司|其他项目)$/.test(s));
  if(companies.length===1)result.identity={kind:'company',text:companies[0]};
  const named=/(?:项目(?:名|名称)?(?:叫|为|是)|名字(?:叫做|叫|是)|命名为)\s*[“"「]?([\p{Script=Han}A-Za-z_][\p{Script=Han}A-Za-z0-9_.-]{0,23})/u.exec(clause);
  if(named&&safeText(named[1]))result.identity={kind:'project',text:named[1]};
  const matches=[...clause.matchAll(actionRE)];
  for(let i=0;i<matches.length;i++){
   const m=matches[i],end=matches[i+1]?.index??clause.length;
   let rawObject=clause.slice(m.index+m[0].length,end);
   if(result.identity)rawObject=rawObject.replace(result.identity.text,'').replace(/^的/,'');
   let object=rawObject.trim().replace(/^[“"「《]+|[”"」》]+$/g,'').replace(/(?:即可|就可以|可以吗|一下|的内容|的工作)$/,'').trim();
   object=object.replace(/(?:，|然后|并且|以及|之后|方便|让我|用于|作为|名字|名称|要求|目的是|希望|能否).*$/,'').trim();
   if(result.identity)object=object.replace(result.identity.text,'').replace(/^的/,'').trim();
   // Keep a concrete complete phrase, never truncate a sentence into a fake title.
   if(safeText(object)&&size(object)<=24&&!/我|你|怎么|什么|是不是|能不能|需要|希望|是否|哪|没有|那么|这么/.test(object)){
    result.object=object;result.action=m[0];
   }
  }
 }
 // Descriptive tasks without an imperative: named tools and concrete noun phrases only.
 const positive=accepted.join('，');
 if(!result.identity){const m=/\b([A-Za-z_][A-Za-z0-9_.+#-]{0,23})\s*(?:账号|项目|软件|工具|插件)/.exec(positive);if(m&&safeText(m[1]))result.identity={kind:'project',text:m[1]};}
 if(!result.object){
  const m=/(?:[“「《"])([^”」》"]{2,24})(?:[”」》"])/.exec(positive);
  if(m&&safeText(m[1])&&/\.(?:xlsx?|docx?|pdf|csv|md|pptx?)$|清单|台账|手册|报告|合同/.test(m[1]))result.object=m[1];
 }
 if(!result.object){
  const m=/([\p{Script=Han}A-Za-z0-9_]{0,10}(?:账号冻结|账号申诉|半年报|募集说明书|任务面板|维护手册|验收清单|付款台账|对账单|接口文档|笔记软件))/u.exec(positive);
  if(m){let value=trimLead(m[1]);if(result.identity)value=value.replace(result.identity.text,'');if(safeText(value))result.object=value;}
 }
 return result;
}
export function deriveTaskName(response,threadId,previous){
 const thread=response?.thread;if(!validId(threadId)||thread?.id!==threadId||!Array.isArray(thread.turns))return null;
 const cached=responseNameCache.get(response);
 if(cached?.thread===thread&&cached.turns===thread.turns&&cached.turnCount===thread.turns.length&&cached.threadId===threadId&&cached.previous===previous)return cached.result;
 const messages=[],cleanedByText=new Map();
 for(const turn of thread.turns){
  if(!validId(turn?.id)||!Array.isArray(turn.items))continue;
  for(const item of turn.items){
   if(item?.type!=='userMessage'||!validId(item.id)||!Array.isArray(item.content))continue;
   const raw=item.content.filter(b=>b?.type==='text'&&typeof b.text==='string').map(b=>b.text).join('\n');
   let text=cleanedByText.get(raw);
   if(text===undefined){text=cleanText(raw);if(cleanedByText.size<32)cleanedByText.set(raw,text);}
   messages.push({turnId:turn.id,messageId:item.id,text});
  }
 }
 // Bounded extraction work; bodies exist only during this call and aren't cached or served.
 // Omit only pure acknowledgements. Use one contiguous semantic tail, never first+last islands.
 const selected=messages.filter(m=>! /^(?:继续(?:做)?|谢谢|好(?:的)?|可以|嗯|收到)[，,。！!\s]*$/.test(m.text)).slice(-15);
 const turnId=messages.at(-1)?.turnId??null;
 const fingerprint=createHash('sha256').update(JSON.stringify({version,threadId,turnId,selected})).digest('hex');
 if(previous?.threadId===threadId&&previous.fingerprint===fingerprint&&previous.version===version)return previous;
 let identity=null,object=null,action=null;
 for(const message of selected){
  if(!message.text){identity=null;object=null;action=null;continue;}
  const next=chooseParts(message.text);
  if(next.reset||next.identity&&identity&&next.identity.text!==identity.text||!next.object&&/不要|不需要|不做|暂不|无需|禁止/.test(message.text)){identity=null;object=null;action=null;}
  if(next.identity)identity=next.identity;
  if(next.object){object=next.object;action=next.action;}
 }
 const parts=object?[...(identity?[identity]:[]),{kind:'object',text:object},...(action?[{kind:'action',text:action}]:[])]:[];
 const result={version,threadId,turnId,fingerprint,status:parts.length?'ready':'unrecognized',parts};
 responseNameCache.set(response,{thread,turns:thread.turns,turnCount:thread.turns.length,threadId,previous,result});
 return result;
}
export function applyAutomaticNames(threads,cache){
 return threads.map(t=>{
  const saved=cache.get(t.threadId),n=saved?.name;
  if(saved?.readStatus==='unavailable')return {...t,nameStatus:'unavailable'};
  if(!n||saved.updatedAt!==t.updatedAt||n.threadId!==t.threadId||n.turnId!==t.desktopRuntime?.turnId)return {...t,nameStatus:'pending'};
  if(n.status!=='ready'||!n.parts.length)return {...t,nameStatus:'unrecognized'};
  return {...t,nameStatus:'ready',displayName:{source:'local-user-keywords',threadId:t.threadId,turnId:n.turnId,parts:n.parts.map(p=>({...p}))}};
 });
}
