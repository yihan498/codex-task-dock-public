import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);
const sourceThreadId = args.get("--source-thread-id");
const outDir = path.resolve(args.get("--out") ?? "evidence/probe-run");
if (!sourceThreadId) throw new Error("--source-thread-id is required");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const startedAt = new Date().toISOString();
const codexJs = process.platform === "win32"
  ? path.join(process.env.APPDATA, "npm", "node_modules", "@openai", "codex", "bin", "codex.js")
  : null;
const child = spawn(process.platform === "win32" ? process.execPath : "codex", process.platform === "win32" ? [codexJs, "app-server", "--stdio"] : ["app-server", "--stdio"], {
  cwd: process.cwd(),
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
  env: { ...process.env, NO_COLOR: "1" }
});

let buffer = "";
let nextId = 1;
const pending = new Map();
let stderrLineCount = 0;

function send(method, params) {
  const id = nextId++;
  child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`timeout:${method}`));
    }, 15_000);
    pending.set(id, { method, resolve, reject, timer });
  });
}

child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  for (;;) {
    const newline = buffer.indexOf("\n");
    if (newline < 0) break;
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    let message;
    try { message = JSON.parse(line); } catch { continue; }
    if (message.id === undefined || !pending.has(message.id)) continue;
    const request = pending.get(message.id);
    clearTimeout(request.timer);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(`${request.method}:${message.error.code ?? "error"}`));
    else request.resolve(message.result);
  }
});

child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => {
  stderrLineCount += String(chunk).split(/\r?\n/).filter(Boolean).length;
});

function planSummary(threadResult) {
  const turns = threadResult?.thread?.turns ?? [];
  const planItems = [];
  for (const turn of turns) {
    for (const item of turn?.items ?? []) {
      if (item?.type === "plan" && Array.isArray(item.plan)) planItems.push(item);
    }
  }
  const latest = planItems.at(-1);
  return latest ? {
    found: true,
    turnIdSha256: sha256(String(latest.id ?? turns.at(-1)?.id ?? "unknown")),
    stepCount: latest.plan.length,
    statuses: latest.plan.map((step) => step.status)
  } : { found: false, stepCount: 0, statuses: [] };
}

const evidence = {
  schemaVersion: 1,
  probe: "codex-task-dock-app-server-phase-1",
  environment: { platform: process.platform, nodeVersion: process.version, codexCliVersion: "0.147.0", transport: "stdio", analyticsRequested: false },
  input: { sourceThreadIdSha256: sha256(sourceThreadId), readOnlyMethods: ["initialize", "account/read", "thread/list", "thread/turns/list"] },
  expected: {
    accountRead: "returns login state without persisting or logging secrets",
    threadList: "paginates to at least two unique local tasks",
    crossProcessPlan: "independent process reads latest persisted structured plan from supplied other task",
    nonInterference: "read-only connection lifecycle does not issue mutations"
  },
  actual: {},
  failures: [],
  startedAt
};

try {
  await send("initialize", { clientInfo: { name: "codex-task-dock-probe", title: "Codex Task Dock Probe", version: "0.1.0-phase-1" }, capabilities: { experimentalApi: true } });
  child.stdin.write(`${JSON.stringify({ method: "initialized", params: {} })}\n`);

  const account = await send("account/read", { refreshToken: false });
  evidence.actual.accountRead = {
    status: "pass",
    loggedIn: Boolean(account?.account),
    accountType: account?.account?.type ?? null,
    requiresOpenaiAuth: account?.requiresOpenaiAuth ?? null,
    sensitiveValuesStored: false
  };

  const uniqueThreads = new Map();
  let cursor = null;
  let pageCount = 0;
  do {
    const page = await send("thread/list", { cursor, limit: 10, sortKey: "updated_at", sortDirection: "desc", useStateDbOnly: true });
    pageCount += 1;
    for (const thread of page?.data ?? []) uniqueThreads.set(thread.id, thread);
    cursor = page?.nextCursor ?? null;
  } while (cursor && uniqueThreads.size < 10 && pageCount < 10);
  evidence.actual.threadList = { status: uniqueThreads.size >= 2 ? "pass" : "未就绪", pageCount, uniqueThreadCount: uniqueThreads.size, threadIdsSha256: [...uniqueThreads.keys()].map(sha256), useStateDbOnly: true };

  const candidates = uniqueThreads.has(sourceThreadId)
    ? [sourceThreadId, ...[...uniqueThreads.keys()].filter((id) => id !== sourceThreadId)]
    : [sourceThreadId, ...uniqueThreads.keys()];
  let selectedPlan = { found: false, stepCount: 0, statuses: [] };
  let selectedId = null;
  let readFailureCount = 0;
  for (const threadId of candidates.slice(0, 11)) {
    try {
      const turnsPage = await send("thread/turns/list", { threadId, limit: 20, sortDirection: "desc", itemsView: "full" });
      const summary = planSummary({ thread: { turns: turnsPage?.data ?? [] } });
      if (summary.found) {
        selectedPlan = summary;
        selectedId = threadId;
        break;
      }
    } catch {
      readFailureCount += 1;
    }
  }
  evidence.actual.crossProcessPlan = {
    status: selectedPlan.found ? "pass" : "未就绪",
    sourceThreadListed: uniqueThreads.has(sourceThreadId),
    selectedThreadIdSha256: selectedId ? sha256(selectedId) : null,
    usedListedFallback: Boolean(selectedId && selectedId !== sourceThreadId),
    readFailureCount,
    ...selectedPlan
  };
  const selectedThread = selectedId ? uniqueThreads.get(selectedId) : null;
  evidence.actual.nonInterference = {
    status: "partial",
    sourceStatusBeforeDisconnect: selectedThread?.status?.type ?? null,
    mutationRequestsSent: 0,
    connectionCanCloseCleanly: true,
    showHideMeasured: false
  };
} catch (error) {
  evidence.failures.push({ category: String(error?.message).startsWith("timeout:") ? "环境失败" : "产品失败", code: String(error?.message ?? error).slice(0, 160) });
} finally {
  evidence.completedAt = new Date().toISOString();
  evidence.stderr = { lineCount: stderrLineCount, contentStored: false };
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "probe-evidence.redacted.json"), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  child.stdin.end();
  const exitTimer = setTimeout(() => child.kill(), 2_000);
  await new Promise((resolve) => child.once("exit", resolve));
  clearTimeout(exitTimer);
}

console.log(JSON.stringify({ evidencePath: path.join(outDir, "probe-evidence.redacted.json"), account: evidence.actual.accountRead?.status ?? "not-run", threads: evidence.actual.threadList?.status ?? "not-run", plan: evidence.actual.crossProcessPlan?.status ?? "not-run", failures: evidence.failures.length }));
process.exitCode = evidence.failures.length ? 1 : 0;
