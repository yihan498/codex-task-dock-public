import {test,assert} from './test-kit.mjs';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as config from '../src/reader/config.mjs';
import {createInstructionPolicyContext} from '../src/reader/isolated-namer.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const dir=name=>({name,isDirectory:()=>true});
const {resolveCodexExecutable}=config;

test('PUBLIC_RELEASE_DISCOVERS_NEWEST_VALID_CODEX_WITHOUT_LOCAL_CONFIG',async()=>{
 const root='C:\\Users\\Public\\AppData\\Local\\OpenAI\\Codex\\bin';
 const mtimes={old:10,new:20};
 const result=await resolveCodexExecutable({
  env:{LOCALAPPDATA:'C:\\Users\\Public\\AppData\\Local'},
  readdir:async()=>[dir('old'),dir('new'),dir('..\\escape'),{name:'note.txt',isDirectory:()=>false}],
  realpath:async value=>value,
  stat:async value=>({isFile:()=>true,mtimeMs:mtimes[value.includes('new')?'new':'old']}),
  verify:async value=>value.includes('old')?'codex-cli 0.151.0-alpha.7.2':'not-codex'
 });
 assert.equal(result,root+'\\old\\codex.exe');
});

test('PUBLIC_RELEASE_EXPLICIT_OVERRIDE_IS_VALIDATED_WITHOUT_DIRECTORY_SCAN',async()=>{
 let scans=0;
 const result=await resolveCodexExecutable({
  env:{CODEX_TASK_DOCK_CODEX_EXECUTABLE:'D:\\Portable\\codex.exe'},
  readdir:async()=>{scans++;return[];},
  realpath:async value=>value,
  stat:async()=>({isFile:()=>true,mtimeMs:1}),
  verify:async()=> 'codex-cli 1.2.3'
 });
 assert.equal(result,'D:\\Portable\\codex.exe');
 assert.equal(scans,0);
});

test('PUBLIC_RELEASE_FAILS_CLOSED_FOR_INVALID_OVERRIDE',async()=>{
 await assert.rejects(()=>resolveCodexExecutable({
  env:{CODEX_TASK_DOCK_CODEX_EXECUTABLE:'relative\\codex.exe'},
  realpath:async value=>value,
  stat:async()=>({isFile:()=>true,mtimeMs:1}),
  verify:async()=> 'codex-cli 1.2.3'
 }),/codex_executable_unavailable/);
});

test('PUBLIC_RELEASE_REMOTE_NAMING_REQUIRES_EXPLICIT_OPT_IN',()=>{
 assert.equal(typeof config.automaticNamingEnabled,'function');
 assert.equal(config.automaticNamingEnabled({}),false);
 assert.equal(config.automaticNamingEnabled({CODEX_TASK_DOCK_ENABLE_AUTOMATIC_NAMING:'0'}),false);
 assert.equal(config.automaticNamingEnabled({CODEX_TASK_DOCK_ENABLE_AUTOMATIC_NAMING:'true'}),false);
 assert.equal(config.automaticNamingEnabled({CODEX_TASK_DOCK_ENABLE_AUTOMATIC_NAMING:'1'}),true);
});

test('PUBLIC_RELEASE_DEFAULTS_TO_LOCAL_KEYWORD_NAMES',async()=>{
 const main=await readFile(new URL('../src/reader/main.mjs',import.meta.url),'utf8');
 assert.ok(main.includes('applyAutomaticNames'));
 assert.ok(main.includes(':applyAutomaticNames(result.snapshot.threads,cache)'));
});

test('PUBLIC_RELEASE_DYNAMICALLY_BINDS_CURRENT_GLOBAL_INSTRUCTIONS',async()=>{
 const content='RULE A\nRULE B\n';
 const context=await createInstructionPolicyContext({globalPath:'C:\\Users\\Public\\.codex\\AGENTS.md',readFile:async()=>content});
 assert.equal(context.fileHash,sha(content));
 assert.equal(context.globalHash,sha('# AGENTS.md instructions\n\n<INSTRUCTIONS>\n'+content+'</INSTRUCTIONS>'));
});

test('PUBLIC_RELEASE_HAS_NO_PERSONAL_CONFIG_OR_FIXED_CONTEXT_HASH',async()=>{
 const main=await readFile(new URL('../src/reader/main.mjs',import.meta.url),'utf8');
 const isolated=await readFile(new URL('../src/reader/isolated-namer.mjs',import.meta.url),'utf8');
 assert.ok(!main.includes('local-config.json'));
 assert.ok(!/[A-Z]:\\\\Users\\\\(?!Public\\\\)/i.test(isolated));
 assert.ok(!isolated.includes("const cliVersion="));
 assert.ok(!isolated.includes("const globalHash='"));
 assert.ok(!isolated.includes("const fileHash='"));
});
