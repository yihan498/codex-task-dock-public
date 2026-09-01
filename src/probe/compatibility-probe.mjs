import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import path from "node:path";
import process from "node:process";
import { buildMinimalTriggerRecord } from "./compatibility.ts";
import {
  buildReadOnlyRequests,
  compareMatrixRuns,
  sanitizeRuntimeCase,
  selectProbeTargets,
  summarizeObservedStatuses,
  summarizeLivePlanNotifications
} from "./compatibility-runtime.ts";

const cliArgs = new Map();
for (let index = 2; index < process.argv.length; index += 2) cliArgs.set(process.argv[index], process.argv[index + 1]);
const outDir = path.resolve(cliArgs.get("--out") ?? "evidence/phase-2-compatibility");
const preferredTargets = {
  active: cliArgs.get("--active-thread-id") ?? cliArgs.get("--source-thread-id"),
  idle: cliArgs.get("--idle-thread-id"),
  notLoaded: cliArgs.get("--notloaded-thread-id")
};
const codexVersion = cliArgs.get("--codex-version") ?? "0.147.0";
const listenMs = Number(cliArgs.get("--listen-ms") ?? 1500);
const sha256 = (value) => createHash("sha256").update(String(value)).digest("hex");

function isStructuredPlan(plan) {
  return Array.isArray(plan) && plan.every((step) =>
    step && typeof step.step === "string" && ["pending", "inProgress", "completed"].includes(step.status)
  );
}

function inspectStructuredPlanNodes(value, signatures = new Map()) {
  let count = 0;
  if (!value || typeof value !== "object") return { count, signatures };
  if (value.method === "turn/plan/updated" && isStructuredPlan(value.params?.plan)) {
    count += 1;
    signatures.set("turn/plan/updated", (signatures.get("turn/plan/updated") ?? 0) + 1);
  }
  if (["turn_plan", "plan_update"].includes(value.type) && isStructuredPlan(value.plan)) {
    count += 1;
    signatures.set(value.type, (signatures.get(value.type) ?? 0) + 1);
  }
  if (value.type === "function_call" && value.name === "update_plan" && typeof value.arguments === "string") {
    try {
      const parsed = JSON.parse(value.arguments);
      if (isStructuredPlan(parsed.plan)) {
        count += 1;
        signatures.set("function_call:update_plan", (signatures.get("function_call:update_plan") ?? 0) + 1);
      }
    } catch {
      signatures.set("function_call:update_plan:invalid-json", (signatures.get("function_call:update_plan:invalid-json") ?? 0) + 1);
    }
  }
  for (const child of Object.values(value)) {
    if (child && typeof child === "object") count += inspectStructuredPlanNodes(child, signatures).count;
  }
  return { count, signatures };
}

async function inspectRolloutStructuredPlans(rolloutPath) {
  if (!rolloutPath) return { outcome: "stale", structuredPlanCount: 0, eventSignatures: {}, pathSha256: null };
  let count = 0;
  const signatures = new Map();
  try {
    const lines = createInterface({ input: createReadStream(rolloutPath, { encoding: "utf8" }), crlfDelay: Infinity });
    for await (const line of lines) {
      let parsed;
      try { parsed = JSON.parse(line); } catch { continue; }
      count += inspectStructuredPlanNodes(parsed, signatures).count;
    }
    return {
      outcome: count > 0 ? "supported" : "stale",
      structuredPlanCount: count,
      eventSignatures: Object.fromEntries([...signatures.entries()].sort()),
      pathSha256: sha256(rolloutPath)
    };
  } catch (error) {
    return {
      outcome: "environment-failure",
      structuredPlanCount: 0,
      eventSignatures: {},
      pathSha256: sha256(rolloutPath),
      errorCode: error?.code ?? "READ_FAILED"
    };
  }
}

function createAppServerClient(initializer) {
  const codexJs = process.platform === "win32"
    ? path.join(process.env.APPDATA, "npm", "node_modules", "@openai", "codex", "bin", "codex.js")
    : null;
  const child = spawn(
    process.platform === "win32" ? process.execPath : "codex",
    process.platform === "win32" ? [codexJs, "app-server", "--stdio"] : ["app-server", "--stdio"],
    { cwd: process.cwd(), stdio: ["pipe", "pipe", "pipe"], windowsHide: true, env: { ...process.env, NO_COLOR: "1" } }
  );
  let buffer = "";
  let nextId = 1;
  let stderrLineCount = 0;
  const pending = new Map();
  const notifications = [];

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
      if (message.id !== undefined && pending.has(message.id)) {
        const request = pending.get(message.id);
        clearTimeout(request.timer);
        pending.delete(message.id);
        if (message.error) {
          const error = new Error("rpc-error");
          error.rpcCode = message.error.code;
          request.reject(error);
        } else request.resolve(message.result);
      } else if (message.method === "turn/plan/updated" && isStructuredPlan(message.params?.plan)) {
        notifications.push({ method: message.method, params: { plan: message.params.plan.map((step) => ({ step: "[REDACTED]", status: step.status })) } });
      }
    }
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderrLineCount += String(chunk).split(/\r?\n/).filter(Boolean).length; });

  function send(method, params) {
    const id = nextId++;
    child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        const error = new Error("rpc-timeout");
        error.environmentError = "TIMEOUT";
        reject(error);
      }, 15_000);
      pending.set(id, { resolve, reject, timer });
    });
  }

  async function initialize() {
    const params = initializer === "experimental"
      ? { clientInfo: { name: "codex-task-dock-compat", version: "0.2.0-phase-2" }, capabilities: { experimentalApi: true } }
      : { clientInfo: { name: "codex-task-dock-compat", version: "0.2.0-phase-2" } };
    const result = await send("initialize", params);
    child.stdin.write(`${JSON.stringify({ method: "initialized", params: {} })}\n`);
    return result;
  }

  async function close() {
    child.stdin.end();
    const timer = setTimeout(() => child.kill(), 2000);
    await new Promise((resolve) => child.once("exit", resolve));
    clearTimeout(timer);
  }

  return { send, initialize, close, notifications, stderrLineCount: () => stderrLineCount };
}

async function runInitializer(runIndex, initializer) {
  const client = createAppServerClient(initializer);
  const result = { runIndex, initializer, cases: [], selectorAvailability: {}, livePlanListening: null, stderr: null, appServerVersion: null, historicalRollout: null };
  try {
    const initialized = await client.initialize();
    result.appServerVersion = initialized?.serverInfo?.version ?? codexVersion;
    const livePage = await client.send("thread/list", { limit: 100, sortKey: "updated_at", sortDirection: "desc", useStateDbOnly: true });
    const historicalPage = await client.send("thread/list", { archived: true, limit: 100, sortKey: "updated_at", sortDirection: "desc", useStateDbOnly: true });
    const liveThreads = livePage?.data ?? [];
    const historicalThreads = historicalPage?.data ?? [];
    const selected = selectProbeTargets(liveThreads, historicalThreads, preferredTargets);
    result.selectorAvailability = Object.fromEntries(Object.entries(selected).map(([key, value]) => [key, Boolean(value)]));
    result.desktopTargetProvided = Object.fromEntries(Object.entries(preferredTargets).map(([key, value]) => [key, Boolean(value)]));
    result.appServerObservedStatus = summarizeObservedStatuses(selected, [...liveThreads, ...historicalThreads]);
    const allThreads = new Map([...liveThreads, ...historicalThreads].map((thread) => [thread.id, thread]));

    for (const [selector, threadId] of Object.entries(selected)) {
      const requests = buildReadOnlyRequests(threadId, true);
      for (const request of requests) {
        const view = request.params.itemsView ?? (request.params.includeTurns ? "includeTurns" : "default");
        const id = `${initializer}-${selector}-${request.method}-${view}`;
        if (!threadId) {
          result.cases.push({ id, selector, method: request.method, paramsShape: {}, structuredPlanCount: 0, outcome: "stale", reason: "selector-unavailable" });
          continue;
        }
        try {
          const response = await client.send(request.method, request.params);
          const structuredPlanCount = inspectStructuredPlanNodes(response).count;
          result.cases.push(sanitizeRuntimeCase({ id, selector, method: request.method, params: request.params, ok: true, structuredPlanCount }));
        } catch (error) {
          result.cases.push(sanitizeRuntimeCase({
            id,
            selector,
            method: request.method,
            params: request.params,
            rpcCode: error.rpcCode,
            environmentError: error.environmentError,
            structuredPlanCount: 0
          }));
        }
      }
      if (selector === "historical" && threadId) {
        result.historicalRollout = await inspectRolloutStructuredPlans(allThreads.get(threadId)?.path);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, listenMs));
    const liveSummary = summarizeLivePlanNotifications(client.notifications);
    result.livePlanListening = {
      ...liveSummary,
      outcome: liveSummary.structuredNotificationCount > 0 ? "supported" : "stale",
      observationMs: listenMs
    };
  } catch (error) {
    result.environmentFailure = error?.code ?? error?.environmentError ?? "APP_SERVER_FAILED";
    result.livePlanListening = { outcome: "environment-failure", structuredNotificationCount: 0, observationMs: listenMs };
  } finally {
    result.stderr = { lineCount: client.stderrLineCount(), contentStored: false };
    await client.close();
  }
  return result;
}

const evidence = {
  schemaVersion: 1,
  probe: "codex-task-dock-phase2-compatibility",
  currentVersion: { codexCli: codexVersion, platform: process.platform, node: process.version },
  restrictions: {
    readOnlyMethods: ["initialize", "thread/list", "thread/read", "thread/turns/list", "thread/items/list"],
    forbiddenMethods: ["thread/resume", "turn/start"],
    assistantTextParsing: false,
    rawPayloadStored: false
  },
  runs: [],
  startedAt: new Date().toISOString()
};

for (let runIndex = 1; runIndex <= 2; runIndex += 1) {
  const plain = await runInitializer(runIndex, "plain");
  const experimental = await runInitializer(runIndex, "experimental");
  evidence.runs.push({
    runIndex,
    initializers: [plain, experimental],
    cases: [...plain.cases, ...experimental.cases]
  });
}

evidence.stability = compareMatrixRuns(evidence.runs[0], evidence.runs[1]);
evidence.minimal32603Triggers = evidence.runs.flatMap((run) => run.cases)
  .filter((entry) => entry.rpcCode === -32603)
  .map((entry) => buildMinimalTriggerRecord({
    codexVersion,
    appServerVersion: codexVersion,
    initializer: entry.id.startsWith("experimental-") ? "experimental" : "plain",
    selector: entry.selector,
    method: entry.method,
    params: entry.paramsShape,
    rpcCode: entry.rpcCode
  }));
evidence.historicalPlanRecovery = evidence.runs[1].initializers.find((item) => item.initializer === "experimental")?.historicalRollout ?? { outcome: "stale" };
evidence.crossWindowLivePlanListening = evidence.runs[1].initializers.find((item) => item.initializer === "experimental")?.livePlanListening ?? { outcome: "stale" };
evidence.completedAt = new Date().toISOString();

await mkdir(outDir, { recursive: true });
const evidencePath = path.join(outDir, "compatibility-matrix.redacted.json");
await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  evidencePath,
  stable: evidence.stability.stable,
  historicalPlanRecovery: evidence.historicalPlanRecovery.outcome,
  crossWindowLivePlanListening: evidence.crossWindowLivePlanListening.outcome,
  trigger32603Count: evidence.minimal32603Triggers.length
}));
