import { classifyCompatibilityOutcome } from "./compatibility.ts";

export function selectProbeTargets(liveThreads = [], archivedThreads = [], preferred = {}) {
  const byStatus = (status) => liveThreads.find((thread) => thread?.status?.type === status)?.id;
  return {
    active: preferred.active ?? byStatus("active"),
    idle: preferred.idle ?? byStatus("idle"),
    notLoaded: preferred.notLoaded ?? byStatus("notLoaded"),
    historical: archivedThreads[0]?.id
  };
}

export function summarizeObservedStatuses(selected = {}, threads = []) {
  const byId = new Map(threads.map((thread) => [thread.id, thread?.status?.type ?? "unknown"]));
  return Object.fromEntries(
    Object.entries(selected).map(([selector, threadId]) => [selector, threadId && byId.has(threadId) ? byId.get(threadId) : "absent"])
  );
}

export function buildReadOnlyRequests(threadId, threadItemsListAvailable = false) {
  const requests = [
    { method: "thread/read", params: { threadId, includeTurns: true } },
    { method: "thread/turns/list", params: { threadId, limit: 20, sortDirection: "desc", itemsView: "notLoaded" } },
    { method: "thread/turns/list", params: { threadId, limit: 20, sortDirection: "desc", itemsView: "summary" } },
    { method: "thread/turns/list", params: { threadId, limit: 20, sortDirection: "desc", itemsView: "full" } }
  ];
  if (threadItemsListAvailable) {
    requests.push({ method: "thread/items/list", params: { threadId, limit: 50, sortDirection: "desc" } });
  }
  return requests;
}

function validStructuredPlan(plan) {
  return Array.isArray(plan) && plan.every((step) =>
    step && typeof step.step === "string" && ["pending", "inProgress", "completed"].includes(step.status)
  );
}

export function countStructuredPlanEvents(messages = []) {
  return messages.filter((message) =>
    (message?.method === "turn/plan/updated" && validStructuredPlan(message?.params?.plan)) ||
    (message?.type === "turn_plan" && validStructuredPlan(message?.plan))
  ).length;
}

export function summarizeLivePlanNotifications(messages = []) {
  const structured = messages.filter((message) =>
    message?.method === "turn/plan/updated" && validStructuredPlan(message?.params?.plan)
  );
  const latest = structured.at(-1)?.params?.plan ?? [];
  return {
    structuredNotificationCount: structured.length,
    latestStepCount: latest.length,
    latestStatuses: latest.map((step) => step.status)
  };
}

function fingerprint(run = {}) {
  return [...(run.cases ?? [])]
    .map((entry) => `${entry.id}=${entry.outcome}`)
    .sort()
    .join("|");
}

export function compareMatrixRuns(first, second) {
  const firstFingerprint = fingerprint(first);
  const secondFingerprint = fingerprint(second);
  return { stable: firstFingerprint === secondFingerprint, firstFingerprint, secondFingerprint };
}

function paramsShape(params = {}) {
  const result = {};
  for (const key of ["includeTurns", "itemsView", "limit", "sortDirection"]) {
    if (params[key] !== undefined) result[key] = params[key];
  }
  return result;
}

export function sanitizeRuntimeCase(input = {}) {
  return {
    id: input.id,
    selector: input.selector,
    method: input.method,
    paramsShape: paramsShape(input.params),
    rpcCode: input.rpcCode,
    structuredPlanCount: input.structuredPlanCount ?? 0,
    outcome: classifyCompatibilityOutcome(input)
  };
}
