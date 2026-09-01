import { assert, test } from "./test-kit.mjs";

let compat;
try {
  compat = await import("../src/probe/compatibility.ts");
} catch {
  compat = {};
}

test("compatibility-matrix-covers-required-methods-states-and-initializers", () => {
  const matrix = compat.buildCompatibilityMatrix?.({ threadItemsListAvailable: true });
  assert.deepEqual(matrix?.initializers.map((item) => item.id), ["initialize-plain", "initialize-experimental"]);
  assert.deepEqual(matrix?.selectors, ["active", "idle", "notLoaded", "historical"]);
  assert.deepEqual(
    [...new Set(matrix?.cases.map((item) => item.method + ":" + (item.itemsView ?? item.includeTurns ?? "")))].sort(),
    [
      "thread/items/list:full",
      "thread/read:true",
      "thread/turns/list:full",
      "thread/turns/list:notLoaded",
      "thread/turns/list:summary"
    ]
  );
  assert.equal(matrix.cases.some((item) => item.method === "thread/resume" || item.method === "turn/start"), false);
});

test("compatibility-outcomes-are-closed-four-state-vocabulary", () => {
  assert.deepEqual(compat.ALLOWED_OUTCOMES, ["supported", "unsupported", "stale", "environment-failure"]);
  assert.equal(compat.classifyCompatibilityOutcome?.({ ok: true, structuredPlanCount: 1 }), "supported");
  assert.equal(compat.classifyCompatibilityOutcome?.({ rpcCode: -32601 }), "unsupported");
  assert.equal(compat.classifyCompatibilityOutcome?.({ rpcCode: -32603 }), "unsupported");
  assert.equal(compat.classifyCompatibilityOutcome?.({ ok: true, structuredPlanCount: 0 }), "stale");
  assert.equal(compat.classifyCompatibilityOutcome?.({ environmentError: "SPAWN_FAILED" }), "environment-failure");
});

test("compatibility-evidence-is-structural-and-redacted", () => {
  const sanitized = compat.sanitizeCompatibilityEvidence?.({
    method: "thread/read",
    params: { threadId: "thread-secret", includeTurns: true },
    rpcCode: -32603,
    payload: {
      email: "person@example.test",
      authUrl: "https://auth.example.test/oauth",
      token: "secret-token",
      title: "Confidential company task",
      message: "full task message"
    }
  });
  const text = JSON.stringify(sanitized);
  assert.equal(text.includes("thread-secret"), false);
  assert.equal(text.includes("person@example.test"), false);
  assert.equal(text.includes("https://"), false);
  assert.equal(text.includes("secret-token"), false);
  assert.equal(text.includes("Confidential"), false);
  assert.equal(text.includes("full task message"), false);
  assert.deepEqual(sanitized.paramsShape, { includeTurns: true });
  assert.equal(sanitized.rpcCode, -32603);
});

test("historical-recovery-and-live-listening-have-independent-verdicts", () => {
  assert.deepEqual(
    compat.separatePlanVerdicts?.({
      historical: { ok: true, structuredPlanCount: 1 },
      live: { ok: true, structuredPlanCount: 0 }
    }),
    { historicalPlanRecovery: "supported", crossWindowLivePlanListening: "stale" }
  );
});

test("minimal-trigger-record-keeps-version-method-shape-and-redacted-result", () => {
  const trigger = compat.buildMinimalTriggerRecord?.({
    codexVersion: "0.147.0",
    appServerVersion: "0.147.0",
    initializer: "experimental",
    selector: "active",
    method: "thread/turns/list",
    params: { threadId: "thread-secret", itemsView: "full", limit: 20, sortDirection: "desc" },
    rpcCode: -32603
  });
  assert.deepEqual(trigger, {
    codexVersion: "0.147.0",
    appServerVersion: "0.147.0",
    initializer: "experimental",
    selector: "active",
    method: "thread/turns/list",
    paramsShape: { itemsView: "full", limit: 20, sortDirection: "desc" },
    outcome: "unsupported",
    rpcCode: -32603
  });
});
