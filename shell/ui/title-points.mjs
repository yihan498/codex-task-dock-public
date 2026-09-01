// Extractive display labels only. Never writes business facts or changes the original title.
const letters='\\p{Script=Han}A-Za-z0-9_';
const length=text=>[...text].length;
const slice=(text,n)=>[...text].slice(0,n).join('');
function entityText(raw,afterEntity){
 let text=raw,changed=false;
 const lead=/^(?:这是|之前做的|之前|现在|只需要|需要|只要|只需|请帮我|请协助|请|帮我|我想|我希望|关于|针对)/;
 while(lead.test(text)){text=text.replace(lead,'');changed=true;}
 if(changed)text=text.replace(/^(?:(?:处理|比较|核对|检查|整理|查看|做的|使用|对|给|为|把|我们|公司债))+/,'');
 if(afterEntity)text=text.replace(/^(?:和|与|及)/,'');
 return text.trim();
}
export function titlePoints(value,{keywords=false}={}){
 const original=typeof value==='string'?value:'';
 if(length(original)<=32)return {text:original||'未命名任务',mode:'original',spans:[]};
 const excerpt=()=>keywords?{text:'待命名任务',mode:'original',spans:[]}:{text:slice(original,30)+'…',mode:'excerpt',spans:[{start:0,end:slice(original,30).length}]};
 // Keep negative or temporally qualified instructions intact rather than invert their intent.
 if(/[<>]/.test(original))return excerpt();
 const negative=/不|未|勿|别|禁止|无需|并非/;
 const temporal=/以后|将来|之后再|已经完成|已完成|本次|本轮|这轮|现在只|当前只|先.{0,30}再/;
 const qualified={test:text=>negative.test(text)||temporal.test(text)};
 if(!keywords&&qualified.test(original)){
  const clauses=[...original.matchAll(/[^，,；;。\n]+/g)];
  // Retain the complete relevant tail, not isolated prohibition keywords: following clauses
  // often state the actual work. Only an explicit completed-background clause can be omitted.
  const current=clauses.findIndex(m=>negative.test(m[0])||/本次|本轮|这轮|现在|当前|只|仅/.test(m[0]));
  const start=current>=0?current:clauses.findIndex(m=>qualified.test(m[0]));
  const tail=clauses.slice(Math.max(0,start));
  const selected=tail.filter(m=>!(tail.length>1&&!negative.test(m[0])&&/已经完成|已完成/.test(m[0])));
  if(selected.length)return {text:selected.map(m=>m[0]).join('；'),mode:'excerpt',spans:selected.map(m=>({start:m.index,end:m.index+m[0].length}))};
  return excerpt();
 }
 const candidates=[];
 const completed=keywords?[...original.matchAll(/[^，,；;。\n]*(?:已经完成|已完成)[^，,；;。\n]*/g)].map(m=>({start:m.index,end:m.index+m[0].length})):[];
 const add=(raw,score,offset,kind='object')=>{
  const text=raw.trim();if(length(text)<2||length(text)>64||/^(?:公司|集团|项目|材料|文件|任务|目录)$/.test(text))return;
  const start=original.indexOf(text,Math.max(0,offset));if(start<0)return;
  if(keywords&&kind!=='guard'&&(completed.some(r=>start>=r.start&&start<r.end)||candidates.some(c=>c.kind==='guard'&&start>=c.start&&start<c.end)))return;
  if(candidates.some(x=>x.text===text))return;
  candidates.push({text,start,end:start+text.length,score,kind});
 };
 if(keywords)for(const m of original.matchAll(/(?:暂不|不要|未授权|无需|勿|先别|禁止|不做|不|别|未)[^，,；;。\n]{1,16}/g))add(m[0],110,m.index,'guard');
 for(const m of original.matchAll(new RegExp(`[${letters}]+?(?:股份有限公司|有限责任公司|有限公司|集团|银行|证券|公司|基金|高投)`,'gu'))){
  add(entityText(m[0],candidates.some(x=>x.kind==='entity')),100,m.index,'entity');
 }
 for(const m of original.matchAll(/[“「『"]([^”」』"]{2,48})[”」』"]/g)){
  const concrete=/\d|清单|补充|报表|合同|附件/.test(m[1]);
  add(m[1],concrete?95:30,m.index+1,concrete?'object':'context');
 }
 // Preserve named tools/project identifiers, but not incidental hosting/example vocabulary.
 for(const m of original.matchAll(/[A-Za-z][A-Za-z0-9_.+#-]{2,}(?:项目|软件|工具)?/g)){
  if(!/^(?:GitHub|https?|www|idea)$/i.test(m[0]))add(m[0],85,m.index,'tool');
 }
 const nouns='资料补充|进展阶段|附件目录|核对清单|交接清单|笔记软件|子项目|任务面板|大框架|底稿(?:文件)?|半年报|年报|报表|合同|发票|清单|接口|页面|面板|软件|框架|分区|分类|测试|部署|排查|核对|整理';
 for(const m of original.matchAll(new RegExp(nouns,'gu'))){
  if(keywords&&candidates.some(c=>c.kind==='guard'&&m.index>=c.start&&m.index<c.end))continue;
  const action=/^(?:测试|部署|排查|核对|整理)$/.test(m[0]);
  add(m[0],keywords&&action?(candidates.some(c=>c.kind==='action')?74:90):75,m.index,action?'action':'object');
 }
 const chosen=[];
 for(const c of candidates.sort((a,b)=>b.score-a.score||a.start-b.start)){
  if(chosen.some(x=>x.text.includes(c.text)))continue;
  const next=[...chosen,c];
  if(length(next.map(x=>x.text).join('/'))>32&&chosen.length&&c.kind!=='entity')continue;
  chosen.push(c);if(chosen.length===4)break;
 }
 if(!chosen.some(x=>x.kind==='object'||keywords&&x.kind==='guard'&&/删除|核对|整理|部署|发布|修改|执行|处理|更改/.test(x.text)))return excerpt();
 return {text:chosen.map(x=>x.text).join('/'),mode:'extract',spans:chosen.map(({start,end})=>({start,end})),parts:chosen.map(({text,kind})=>({text,kind}))};
}
