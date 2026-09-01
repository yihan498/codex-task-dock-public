import {assert,test} from './test-kit.mjs';
import * as core from '../src/core.ts';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ids={sourceThreadId:'t1',sourceTurnId:'u1',sourceMessageId:'m1'};
const user=(text,extra={})=>({kind:'userMessage',text,messageTime:'2026-08-30T09:00:00+08:00',...ids,...extra});
const bound={kind:'userMessage',...ids};
const now='2026-08-31T02:00:00Z';
const binding={kind:'appServerSubscription',threadId:'t1',turnId:'u1'};
const plan=[{step:'核对清单',status:'completed'},{step:'校验对象',status:'inProgress'},{step:'整理结果',status:'pending'}];
const observation=(sequence,changes={})=>({
 source:{kind:'appServerSubscription',mode:'live',threadId:'t1',turnId:'u1',receivedAt:now,localSequence:sequence},
 notification:{method:'turn/plan/updated',params:{turnId:'u1',plan}},
 ...changes
});

test('source-identifiers-required-before-extraction',()=>{
 for(const key of Object.keys(ids))for(const value of [undefined,'',' ']){
  assert.deepEqual(core.extractBusinessFields(user('公司：测试公司',{[key]:value})),{});
 }
});
test('manual-source-is-local-not-invented-codex-turn',()=>{
 const result=core.extractBusinessFields({kind:'dockManualInput',text:'项目：测试项目',sourceThreadId:'t1',sourceRecordId:'local-record-1'});
 assert.deepEqual(result.project?.source,{kind:'dockManualInput',sourceThreadId:'t1',sourceRecordId:'local-record-1'});
 assert.deepEqual(core.extractBusinessFields({kind:'dockManualInput',text:'项目：测试项目',...ids}),{});
});
test('business-binding-is-required-and-exact',()=>{
 const input=user('公司：测试公司');
 assert.deepEqual(core.extractBoundBusinessFields?.(input,bound),core.extractBusinessFields(input));
 assert.deepEqual(core.extractBoundBusinessFields?.(input),{});
 for(const key of ['kind',...Object.keys(ids)]){
  assert.deepEqual(core.extractBoundBusinessFields?.(input,{...bound,[key]:'wrong'}),{});
 }
 assert.deepEqual(core.extractBoundBusinessFields?.({...input,kind:'assistantMessage'},{...bound,kind:'assistantMessage'}),{});
});
test('manual-binding-matches-selected-thread-and-local-record',()=>{
 const input={kind:'dockManualInput',text:'分区：工作',sourceThreadId:'t1',sourceRecordId:'r1'};
 assert.equal(core.extractBoundBusinessFields?.(input,{kind:input.kind,sourceThreadId:'t1',sourceRecordId:'r1'})?.partition?.value,'工作');
 assert.deepEqual(core.extractBoundBusinessFields?.(input,{kind:input.kind,sourceThreadId:'other',sourceRecordId:'r1'}),{});
});
test('conflicting-labels-and-quoted-examples-are-not-facts',()=>{
 assert.deepEqual(core.extractBusinessFields(user('公司：A\n公司：B')), {});
 assert.equal(core.extractBusinessFields(user('公司：A\n公司：A')).company.value,'A');
 assert.deepEqual(core.extractBusinessFields(user('~~~\n公司：示例\n~~~\n> 公司：引用')), {});
 assert.deepEqual(core.extractBusinessFields(user('截止时间：2026-08-31 18:00\n截止时间：下周前后')), {});
});
test('relative-deadline-converts-instant-before-calendar-day',()=>{
 assert.equal(core.extractBusinessFields(user('截止时间：明天 18:00',{messageTime:'2026-08-30T20:30:00Z'})).deadline?.value,'2026-09-01T18:00:00+08:00');
 assert.equal(core.extractBusinessFields(user('截止时间：明天 18:00',{messageTime:'2026-08-31T01:00:00+14:00'})).deadline?.value,'2026-08-31T18:00:00+08:00');
});
test('relative-calendar-month-year-and-leap-boundaries',()=>{
 for(const [time,expected] of [
  ['2026-12-31T12:00:00+08:00','2027-01-01T18:00:00+08:00'],
  ['2024-02-28T12:00:00+08:00','2024-02-29T18:00:00+08:00'],
  ['2024-02-29T12:00:00+08:00','2024-03-01T18:00:00+08:00']
 ])assert.equal(core.extractBusinessFields(user('截止时间：明天 18:00',{messageTime:time})).deadline?.value,expected);
});
test('invalid-or-unzoned-message-time-cannot-anchor-tomorrow',()=>{
 for(const time of [undefined,'2026-08-30T12:00:00','2026-02-30T12:00:00Z','2026-08-30T25:00:00Z','2026-08-30T12:00:00+25:00']){
  assert.deepEqual(core.extractBusinessFields(user('截止时间：明天 18:00',{messageTime:time})),{});
 }
 assert.deepEqual(core.extractBusinessFields(user('截止时间：2026-02-30 18:00')),{});
});
test('date-counters-share-shanghai-calendar-and-source-gate',()=>{
 const record=core.extractBusinessFields(user('截止时间：2026-08-31 01:00'));
 assert.deepEqual(core.computeDateCounters([record],'2026-08-30T16:00:00Z'),{today:1,imminent:1});
 const invalid={deadline:{value:'2026-08-31garbage',source:ids}};
 assert.deepEqual(core.computeDateCounters([invalid,{deadline:{value:'2026-08-31T01:00:00+08:00'}}],'2026-08-31T00:00:00+08:00'),{today:0,imminent:0});
 assert.deepEqual(core.computeDateCounters([record],'2026-08-31'),{today:0,imminent:0});
});
test('invalid-or-ambiguous-plan-has-no-progress',()=>{
 for(const p of [[],[null,{id:'a',status:'inProgress'}],[{id:'a',status:'inProgress'},{id:'b',status:'inProgress'}],[{id:'a',status:'inProgress'},{id:'b',status:'unknown'}],[{step:' ',status:'inProgress'}],[{id:'a',status:'inProgress'},{id:'a',status:'pending'}]]){
  assert.deepEqual(core.derivePlanView(p),{});
 }
});
test('deadline-basis-required-before-counting',()=>{
 const value='2026-08-31T18:00:00+08:00';
 for(const basis of [undefined,{}, {type:'guess',timeZone:'Asia/Shanghai'},
   {type:'relative',timeZone:'Asia/Shanghai'}, {type:'explicit',timeZone:'UTC'}]){
  assert.deepEqual(core.computeDateCounters([{deadline:{value,source:ids,basis}}],now),{today:0,imminent:0});
 }
});
test('no-current-step-never-implies-business-completion',()=>{
 for(const p of [[{step:'未开始',status:'pending'}],[{step:'已做完',status:'completed'}]]){
  assert.deepEqual(core.derivePlanView(p),{});
  assert.equal(core.deriveBusinessCompletion(p),undefined);
 }
});
test('deadline-basis-shape-and-optional-time-match-schema',()=>{
 const count=basis=>core.computeDateCounters([{deadline:{value:'2026-08-31T18:00:00+08:00',source:ids,basis}}],now);
 for(const type of ['explicit','relative']){
  for(const messageTime of ['not-a-date',null,'2026-08-31T18:00:00+00:60']){
   assert.deepEqual(count({type,timeZone:'Asia/Shanghai',messageTime}),{today:0,imminent:0});
  }
  assert.deepEqual(count({type,timeZone:'Asia/Shanghai',messageTime:now,extra:true}),{today:0,imminent:0});
  assert.deepEqual(count({type,timeZone:'Asia/Shanghai',messageTime:now}),{today:1,imminent:1});
 }
 assert.deepEqual(count({type:'explicit',timeZone:'Asia/Shanghai'}),{today:1,imminent:1});
});
test('official-idless-plan-uses-subscription-binding-and-step-text',()=>{
 const result=core.reducePlanObservations?.([observation(1)],binding,now);
 assert.deepEqual(result,{progress:{current:2,total:3},currentStep:'校验对象',nextStep:'整理结果',source:{kind:'appServer.plan',threadId:'t1',turnId:'u1',receivedAt:now,localSequence:1}});
 assert.equal(Object.hasOwn(result||{},'nextStepId'),false);
});
test('plan-binding-missing-or-conflicting-is-rejected',()=>{
 assert.deepEqual(core.reducePlanObservations?.([observation(1)],undefined,now),{});
 for(const key of ['threadId','turnId','kind']){
  assert.deepEqual(core.reducePlanObservations?.([observation(1)],{...binding,[key]:'other'},now),{});
 }
 const item=observation(1);item.notification.params.threadId='other';
 assert.deepEqual(core.reducePlanObservations?.([item],binding,now),{});
 item.notification.params.threadId='t1';item.notification.params.turnId='other';
 assert.deepEqual(core.reducePlanObservations?.([item],binding,now),{});
});
test('historical-unknown-expired-and-future-plans-are-not-live',()=>{
 for(const change of [{mode:'historical'},{kind:'assistantText'},{receivedAt:'2026-08-31T01:59:00Z'},{receivedAt:'2026-08-31T02:00:01Z'},{receivedAt:'2026-02-30T02:00:00Z'}]){
  const item=observation(1);Object.assign(item.source,change);
  assert.deepEqual(core.reducePlanObservations?.([item],binding,now),{});
 }
});
test('plan-reducer-is-scoped-ordered-and-idempotent',()=>{
 const newer=observation(2);newer.notification={method:'turn/plan/updated',params:{turnId:'u1',plan:[{step:'新计划',status:'inProgress'}]}};
 const result=core.reducePlanObservations?.([newer,observation(1),newer],binding,now);
 assert.equal(result?.currentStep,'新计划');assert.equal(result?.progress.total,1);
 const unrelated=observation(99);unrelated.source={...unrelated.source,threadId:'other'};
 assert.deepEqual(core.reducePlanObservations?.([newer,unrelated],binding,now),result);
});
test('latest-invalid-plan-cannot-resurrect-previous-plan',()=>{
 const newer=observation(2);newer.notification={method:'turn/plan/updated',params:{turnId:'u1',plan:[null]}};
 assert.deepEqual(core.reducePlanObservations?.([observation(1),newer],binding,now),{});
 newer.notification.params.plan=[{step:'完成',status:'completed'}];
 assert.deepEqual(core.reducePlanObservations?.([observation(1),newer],binding,now),{});
});
test('conflicting-local-sequence-is-not-official-event-identity',()=>{
 const a=observation(1),b=observation(1);b.notification={method:'turn/plan/updated',params:{turnId:'u1',plan:[{step:'冲突',status:'inProgress'}]}};
 assert.deepEqual(core.reducePlanObservations?.([a,b],binding,now),{});
});
test('schema-accepts-real-deadline-and-rejects-extras',async()=>{
 const schema=JSON.parse(await readFile(new URL('../contracts/task-contract.schema.json',import.meta.url),'utf8'));
 const deadline=core.extractBusinessFields(user('截止时间：明天 18:00')).deadline;
 const manual=core.extractBusinessFields({kind:'dockManualInput',text:'项目：测试项目',sourceThreadId:'t1',sourceRecordId:'r1'});
 const clone=x=>JSON.parse(JSON.stringify(x));
 const instance={threadId:'t1',business:{deadline}};
 const extra=clone(instance);extra.business.deadline.extra='forbidden';
 const missingTime=clone(instance);delete missingTime.business.deadline.basis.messageTime;
 const emptySource=clone(instance);emptySource.business.deadline.source.sourceMessageId='';
 const invalidDate=clone(instance);invalidDate.business.deadline.value='2026-02-30T18:00:00+08:00';
 const noZone=clone(instance);noZone.business.deadline.value='2026-08-31T18:00:00';
 const observed=core.reducePlanObservations([observation(1)],binding,now);
 const cases=[
  {id:'real-relative-deadline',instance,valid:true},
  {id:'real-explicit-deadline',instance:{threadId:'t1',business:core.extractBusinessFields(user('截止时间：2026-08-31 18:00'))},valid:true},
  {id:'extra-property',instance:extra,valid:false},
  {id:'relative-missing-time',instance:missingTime,valid:false},
  {id:'empty-source',instance:emptySource,valid:false},
  {id:'manual-provenance',instance:{threadId:'t1',business:manual},valid:true},
  {id:'invalid-calendar-date',instance:invalidDate,valid:false},
  {id:'missing-zone',instance:noZone,valid:false},
  {id:'official-plan-projection',instance:{threadId:'t1',planView:observed},valid:true}
 ];
 const r=spawnSync(process.env.DOCK_SCHEMA_PYTHON||'D:/Anaconda/python.exe',[fileURLToPath(new URL('./schema-common-validation.py',import.meta.url))],{input:JSON.stringify({schema,cases}),encoding:'utf8',windowsHide:true});
 assert.equal(r.status,0,r.stdout||r.stderr);
});
