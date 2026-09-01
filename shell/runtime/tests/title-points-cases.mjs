import assert from 'node:assert/strict';
import {titlePoints} from '../../ui/title-points.mjs';
export const cases=[
 ['keywords-only-guarded-company-object-is-not-discarded',()=>{
  const r=titlePoints('不要删除星河集团的合同文件，我只是想比较两个版本并保留全部原件，这是一项非常重要的资料核对工作',{keywords:true});assert.ok(r.text.includes('不要删除'));assert.ok(r.text.includes('星河集团'));assert.ok(!r.parts.some(p=>p.text==='删除'));
 }],
 ['keywords-only-negated-action-and-completed-background-never-become-current',()=>{
  const negative=titlePoints('不要核对合同，这次只整理附件目录和交接清单，所有原始材料都要保留供后续审核使用',{keywords:true});
  assert.ok(negative.text.includes('不要核对'));assert.ok(negative.text.includes('整理'));assert.ok(!negative.parts.some(p=>p.text==='核对'));
  const current=titlePoints('接口测试已经完成，本次只需要整理交接清单和附件目录，不做部署；这是一个需要仔细核对全部资料的工作',{keywords:true});
  assert.ok(current.text.includes('整理'));assert.ok(current.text.includes('不做部署'));assert.ok(!current.text.includes('接口'));assert.ok(!current.parts.some(p=>p.text==='测试'));
 }],
 ['keywords-only-no-excerpt-for-long-unknown-or-negative',()=>{
  const raw='暂不部署软件和接口，这轮只排查测试环境里的错误日志并核对附件目录，后面的发布安排等确认';
  const r=titlePoints(raw,{keywords:true});assert.equal(r.mode,'extract');assert.ok(r.text.includes('暂不部署'));assert.ok(r.text.includes('排查'));assert.ok([...r.text].length<=32);assert.ok(!r.text.includes('这轮只'));
  const unknown=titlePoints('我想请你看看这个东西应该怎么办，因为现在还没有想清楚该叫什么名字，也不知道从哪开始',{keywords:true});assert.equal(unknown.text,'待命名任务');
 }],
 ['negative-and-following-current-action-stay-together',()=>{
  const raw='暂不部署软件和接口，这轮只排查测试环境里的错误日志并核对附件目录，后面的发布安排等确认';
  const result=titlePoints(raw);assert.equal(result.mode,'excerpt');assert.ok(result.text.includes('暂不部署软件和接口'));assert.ok(result.text.includes('这轮只排查测试环境里的错误日志并核对附件目录'));
  const another='不要删除合同，只核对附件目录并整理缺失材料，保留全部原始记录方便后续同事继续处理';
  const next=titlePoints(another);assert.ok(next.text.includes('不要删除合同'));assert.ok(next.text.includes('只核对附件目录并整理缺失材料'));
 }],
 ['unfamiliar-negation-is-conservative-not-positive-keywords',()=>{
  for(const negative of ['未授权部署','勿发布','先别修改']){
   const raw=`${negative}软件和接口，本轮仅检查附件目录和交接清单的版本信息，其他后续事项等待确认后处理`;
   const result=titlePoints(raw);assert.equal(result.mode,'excerpt');assert.ok(result.text.includes(negative));assert.ok(result.text.includes('本轮仅检查附件目录和交接清单'));
  }
 }],
 ['company-or-tool-only-is-not-successful-summary',()=>{
  for(const raw of [
   '请协助使用Python清洗工资表中的日期和金额列，处理空值并输出问题记录，这些文件需要认真检查后再给我答复',
   '请协助星河集团对工资结算数据进行归一化处理，保留原始记录并说明所有异常，这些内容还需要进一步确认'
  ]){const result=titlePoints(raw);assert.equal(result.mode,'excerpt');assert.ok(result.text.length>10);}
 }],
 ['entity-functional-characters-remain-intact',()=>{
  for(const name of ['美的集团','是德科技有限公司','自在科技有限公司','海天集团']){
   const raw=`请帮我处理${name}的报表文件，新增材料里面有“0901数据核对清单”，需要进行核对并说明差异`;
   assert.ok(titlePoints(raw).text.includes(name),name+' corrupted');
  }
 }],
 ['quoted-object-remains-complete',()=>{
  const filename='美的集团的年度核对清单';
  const raw=`请检查“${filename}”与之前项目中的资料，说明附件的区别并给出本次核对结果，不要进行原件修改`;
  const result=titlePoints(raw);assert.ok(result.text.includes('不要'),'negative scope absent');
  const plain=`请帮我处理海天集团的报表文件，材料中有“${filename}”，需要核对并说明差异`;
  assert.ok(titlePoints(plain).text.includes(filename),'quoted filename changed');
 }],
 ['current-step-not-completed-background',()=>{
  const raw='接口测试已经完成，本次只需要整理交接清单和附件目录，不做部署；这是一个需要仔细核对全部资料的工作';
  const result=titlePoints(raw);
  assert.equal(result.mode,'excerpt');assert.ok(result.text.includes('本次只需要整理交接清单和附件目录'));
  assert.ok(result.text.includes('不做部署'));assert.ok(!result.text.includes('接口测试'));
 }],
 ['late-negative-qualifier-not-truncated-away',()=>{
  const raw='这个任务的背景比较复杂，我想先说明之前发生的几次变化以及相关人员的意见，避免再出现相同的问题；不要执行，现在只整理附件目录';
  const result=titlePoints(raw);assert.ok(result.text.includes('不要执行'));assert.ok(result.text.includes('现在只整理附件目录'));
 }],
 ['source-spans-are-complete-not-arbitrary-word-tails',()=>{
  const raw='请仔细核对这个项目的完整收入和现金流数据并整理报表清单，随后向我说明相关变化的具体来源和依据';
  const result=titlePoints(raw);assert.ok(!result.text.includes('入和现金流数据并整理'));
  for(const span of result.spans){assert.ok(span.start>=0&&span.end<=raw.length);assert.ok(result.text.includes(raw.slice(span.start,span.end)));}
 }],
 ['two-company-comparison-does-not-drop-an-entity',()=>{
  const raw='请比较海天集团和星河集团的年度报表，帮我分析现金流差异，并整理这两个公司的原始附件目录用于核验';
  const result=titlePoints(raw);assert.ok(result.text.includes('海天集团'));assert.ok(result.text.includes('星河集团'));
 }]
];
