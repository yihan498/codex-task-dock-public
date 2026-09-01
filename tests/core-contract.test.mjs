import { assert, test } from "./test-kit.mjs";
import { readFile } from "node:fs/promises";

let core;
try {
  core = await import("../src/core.ts");
} catch {
  core = {};
}

const provenance = {
  sourceThreadId: "thread-1",
  sourceTurnId: "turn-1",
  sourceMessageId: "message-1"
};

test("explicit-fields-are-extracted-with-provenance", () => {
  const result = core.extractBusinessFields?.({
    kind: "userMessage",
    text: "公司：星河资本\n项目：债券研究\n工作内容：核对募集说明书\n处理对象：样本A\n截止时间：2026-08-31 18:00\n分区：实习",
    messageTime: "2026-08-30T09:00:00+08:00",
    ...provenance
  });
  assert.equal(result?.company?.value, "星河资本");
  assert.equal(result?.deadline?.value, "2026-08-31T18:00:00+08:00");
  assert.deepEqual(result?.company?.source, provenance);
});

test("missing-fields-are-omitted-and-not-counted", () => {
  const result = core.extractBusinessFields?.({
    kind: "userMessage",
    text: "项目：债券研究",
    messageTime: "2026-08-30T09:00:00+08:00",
    ...provenance
  });
  assert.deepEqual(Object.keys(result ?? {}).sort(), ["project"]);
  assert.equal(core.computeDateCounters?.([result], "2026-08-30T09:00:00+08:00", { imminentHours: 24 }).imminent, 0);
});

test("business-fields-reject-non-user-sources", () => {
  const result = core.extractBusinessFields?.({
    kind: "assistantMessage",
    text: "公司：不应采信\n截止时间：2026-08-31 18:00",
    messageTime: "2026-08-30T09:00:00+08:00",
    ...provenance
  });
  assert.deepEqual(result, {});
});

test("ambiguous-date-is-rejected", () => {
  const result = core.extractBusinessFields?.({
    kind: "userMessage",
    text: "截止时间：下周前后",
    messageTime: "2026-08-30T09:00:00+08:00",
    ...provenance
  });
  assert.equal(Object.hasOwn(result ?? {}, "deadline"), false);
});

test("relative-date-binds-message-time-and-asia-shanghai", () => {
  const result = core.extractBusinessFields?.({
    kind: "userMessage",
    text: "截止时间：明天 18:00",
    messageTime: "2026-08-30T23:30:00+08:00",
    ...provenance
  });
  assert.equal(result?.deadline?.value, "2026-08-31T18:00:00+08:00");
  assert.equal(result?.deadline?.basis.messageTime, "2026-08-30T23:30:00+08:00");
  assert.equal(result?.deadline?.basis.timeZone, "Asia/Shanghai");
});

test("progress-is-current-in-progress-index-over-total", () => {
  const plan = [
    { id: "a", status: "completed" },
    { id: "b", status: "inProgress" },
    { id: "c", status: "pending" }
  ];
  assert.deepEqual(core.derivePlanView?.(plan), { progress: { current: 2, total: 3 }, nextStepId: "c" });
});

test("progress-and-next-step-are-omitted-without-structured-plan", () => {
  assert.deepEqual(core.derivePlanView?.(undefined), {});
  assert.deepEqual(core.derivePlanView?.("先做 A 再做 B"), {});
});

test("today-and-imminent-count-only-explicit-deadlines", () => {
  const withDeadline = core.extractBusinessFields?.({
    kind: "userMessage",
    text: "项目：A\n截止时间：2026-08-30 20:00",
    messageTime: "2026-08-30T09:00:00+08:00",
    ...provenance
  });
  const withoutDeadline = core.extractBusinessFields?.({
    kind: "userMessage",
    text: "项目：B",
    messageTime: "2026-08-30T09:00:00+08:00",
    ...provenance,
    sourceMessageId: "message-2"
  });
  assert.deepEqual(
    core.computeDateCounters?.([withDeadline, withoutDeadline], "2026-08-30T09:00:00+08:00", { imminentHours: 24 }),
    { today: 1, imminent: 1 }
  );
});

test("idle-not-loaded-and-turn-completed-do-not-mean-business-complete", () => {
  for (const state of ["idle", "notLoaded", "turnCompleted"]) {
    assert.equal(core.deriveBusinessCompletion?.({ threadState: state }), undefined);
  }
});

test("duplicate-and-out-of-order-events-are-idempotent", () => {
  const events = [
    { eventId: "2", sequence: 2, threadId: "thread-1", state: "idle" },
    { eventId: "1", sequence: 1, threadId: "thread-1", state: "active" },
    { eventId: "2", sequence: 2, threadId: "thread-1", state: "idle" }
  ];
  assert.deepEqual(core.reduceSystemEvents?.(events), {
    threadId: "thread-1",
    lastSequence: 2,
    runtimeState: "idle",
    appliedEventIds: ["1", "2"]
  });
});

test("machine-contract-encodes-source-whitelist-and-omission-rules", async () => {
  const contract = JSON.parse(await readFile(new URL("../contracts/task-contract.schema.json", import.meta.url), "utf8"));
  assert.deepEqual(contract.policy.businessFieldSources, ["userMessage", "dockManualInput"]);
  assert.deepEqual(contract.policy.systemFieldSources, ["appServer.threadState", "appServer.goal", "appServer.plan"]);
  assert.equal(contract.policy.missingBusinessFields, "omit");
  assert.equal(contract.policy.defaultImminentThresholdHours, 24);
  assert.equal(contract.policy.progress.mode, "inProgressIndexOverTotal");
  assert.equal(contract.policy.progress.fallback, "omit");
  assert.equal(contract.policy.runtimeStateIsBusinessCompletion, false);
  assert.equal(contract.policy.network.listenHost, "127.0.0.1");
  assert.equal(contract.policy.telemetry.defaultEnabled, false);
});
