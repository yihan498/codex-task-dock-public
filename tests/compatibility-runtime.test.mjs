import { assert, test } from "./test-kit.mjs";

let runtime;
try {
  runtime = await import("../src/probe/compatibility-runtime.ts");
} catch {
  runtime = {};
}

test("runtime-selects-active-idle-notloaded-and-historical-targets", () => {
  const selected = runtime.selectProbeTargets?.(
    [
      { id: "a", status: { type: "active" } },
      { id: "i", status: { type: "idle" } },
      { id: "n", status: { type: "notLoaded" } }
    ],
    [{ id: "h", status: { type: "notLoaded" } }]
  );
  assert.deepEqual(selected, { active: "a", idle: "i", notLoaded: "n", historical: "h" });
});

test("runtime-preferred-desktop-targets-override-appserver-notloaded-view", () => {
  const selected = runtime.selectProbeTargets?.(
    [
      { id: "desktop-active", status: { type: "notLoaded" } },
      { id: "desktop-idle", status: { type: "notLoaded" } },
      { id: "desktop-notloaded", status: { type: "notLoaded" } }
    ],
    [{ id: "archived", status: { type: "notLoaded" } }],
    { active: "desktop-active", idle: "desktop-idle", notLoaded: "desktop-notloaded" }
  );
  assert.deepEqual(selected, {
    active: "desktop-active",
    idle: "desktop-idle",
    notLoaded: "desktop-notloaded",
    historical: "archived"
  });
  assert.deepEqual(
    runtime.summarizeObservedStatuses?.(selected, [
      { id: "desktop-active", status: { type: "notLoaded" } },
      { id: "desktop-idle", status: { type: "notLoaded" } },
      { id: "desktop-notloaded", status: { type: "notLoaded" } }
    ]),
    { active: "notLoaded", idle: "notLoaded", notLoaded: "notLoaded", historical: "absent" }
  );
});

test("runtime-builds-readonly-request-matrix-with-exact-param-shapes", () => {
  const requests = runtime.buildReadOnlyRequests?.("thread-1", true);
  assert.deepEqual(requests, [
    { method: "thread/read", params: { threadId: "thread-1", includeTurns: true } },
    { method: "thread/turns/list", params: { threadId: "thread-1", limit: 20, sortDirection: "desc", itemsView: "notLoaded" } },
    { method: "thread/turns/list", params: { threadId: "thread-1", limit: 20, sortDirection: "desc", itemsView: "summary" } },
    { method: "thread/turns/list", params: { threadId: "thread-1", limit: 20, sortDirection: "desc", itemsView: "full" } },
    { method: "thread/items/list", params: { threadId: "thread-1", limit: 50, sortDirection: "desc" } }
  ]);
  assert.equal(requests.some((entry) => entry.method === "thread/resume" || entry.method === "turn/start"), false);
});

test("runtime-counts-only-structured-plan-events", () => {
  const messages = [
    { method: "turn/plan/updated", params: { threadId: "t", turnId: "u", plan: [{ step: "A", status: "inProgress" }] } },
    { type: "plan", text: "A then B" },
    { type: "agentMessage", text: "plan: do A" },
    { type: "turn_plan", plan: [{ step: "B", status: "pending" }] }
  ];
  assert.equal(runtime.countStructuredPlanEvents?.(messages), 2);
});

test("runtime-live-listener-accepts-only-plan-updated-notifications", () => {
  const result = runtime.summarizeLivePlanNotifications?.([
    { method: "turn/plan/updated", params: { threadId: "t", turnId: "u", plan: [{ step: "A", status: "inProgress" }, { step: "B", status: "pending" }] } },
    { method: "item/plan/delta", params: { delta: "ignored text" } },
    { method: "turn/completed", params: {} }
  ]);
  assert.deepEqual(result, { structuredNotificationCount: 1, latestStepCount: 2, latestStatuses: ["inProgress", "pending"] });
});

test("runtime-stability-compares-only-case-outcomes", () => {
  const first = { cases: [{ id: "a", outcome: "unsupported" }, { id: "b", outcome: "stale" }] };
  const second = { cases: [{ id: "b", outcome: "stale" }, { id: "a", outcome: "unsupported" }] };
  assert.deepEqual(runtime.compareMatrixRuns?.(first, second), {
    stable: true,
    firstFingerprint: "a=unsupported|b=stale",
    secondFingerprint: "a=unsupported|b=stale"
  });
});

test("runtime-evidence-omits-thread-ids-and-payload-content", () => {
  const evidence = runtime.sanitizeRuntimeCase?.({
    id: "active-thread-read",
    selector: "active",
    method: "thread/read",
    params: { threadId: "secret-thread", includeTurns: true },
    rpcCode: -32603,
    structuredPlanCount: 0,
    payload: { message: "secret message", email: "person@example.test" }
  });
  const text = JSON.stringify(evidence);
  assert.equal(text.includes("secret-thread"), false);
  assert.equal(text.includes("secret message"), false);
  assert.equal(text.includes("person@example.test"), false);
  assert.deepEqual(evidence, {
    id: "active-thread-read",
    selector: "active",
    method: "thread/read",
    paramsShape: { includeTurns: true },
    rpcCode: -32603,
    structuredPlanCount: 0,
    outcome: "unsupported"
  });
});
