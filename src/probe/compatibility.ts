export const ALLOWED_OUTCOMES = ["supported", "unsupported", "stale", "environment-failure"];

const READ_CASES = [
  { method: "thread/read", includeTurns: true },
  { method: "thread/turns/list", itemsView: "notLoaded" },
  { method: "thread/turns/list", itemsView: "summary" },
  { method: "thread/turns/list", itemsView: "full" }
];

export function buildCompatibilityMatrix({ threadItemsListAvailable = false } = {}) {
  const selectors = ["active", "idle", "notLoaded", "historical"];
  const methodCases = threadItemsListAvailable
    ? [...READ_CASES, { method: "thread/items/list", itemsView: "full" }]
    : READ_CASES;
  return {
    initializers: [
      { id: "initialize-plain", params: { clientInfo: { name: "codex-task-dock-compat", version: "0.2.0-phase-2" } } },
      { id: "initialize-experimental", params: { clientInfo: { name: "codex-task-dock-compat", version: "0.2.0-phase-2" }, capabilities: { experimentalApi: true } } }
    ],
    selectors,
    cases: selectors.flatMap((selector) => methodCases.map((entry) => ({ selector, ...entry })))
  };
}

export function classifyCompatibilityOutcome(result = {}) {
  if (result.environmentError) return "environment-failure";
  if (result.rpcCode !== undefined) return "unsupported";
  if (result.ok && Number(result.structuredPlanCount) > 0) return "supported";
  return "stale";
}

function paramsShape(params = {}) {
  const shape = {};
  for (const key of ["includeTurns", "itemsView", "limit", "sortDirection"]) {
    if (params[key] !== undefined) shape[key] = params[key];
  }
  return shape;
}

export function sanitizeCompatibilityEvidence(input = {}) {
  return {
    method: input.method,
    paramsShape: paramsShape(input.params),
    rpcCode: input.rpcCode,
    outcome: classifyCompatibilityOutcome(input)
  };
}

export function separatePlanVerdicts({ historical = {}, live = {} } = {}) {
  return {
    historicalPlanRecovery: classifyCompatibilityOutcome(historical),
    crossWindowLivePlanListening: classifyCompatibilityOutcome(live)
  };
}

export function buildMinimalTriggerRecord(input = {}) {
  return {
    codexVersion: input.codexVersion,
    appServerVersion: input.appServerVersion,
    initializer: input.initializer,
    selector: input.selector,
    method: input.method,
    paramsShape: paramsShape(input.params),
    outcome: classifyCompatibilityOutcome(input),
    rpcCode: input.rpcCode
  };
}
