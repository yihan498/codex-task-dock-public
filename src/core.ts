const BUSINESS_LABELS = new Map([
  ["公司", "company"],
  ["项目", "project"],
  ["工作内容", "workContent"],
  ["处理对象", "subject"],
  ["截止时间", "deadline"],
  ["分区", "partition"]
]);

const ALLOWED_INPUT_KINDS = new Set(["userMessage", "dockManualInput"]);
const ALLOWED_PARTITIONS = new Set(["实习", "工作", "学习"]);
const USER_SOURCE_KEYS = ["sourceThreadId", "sourceTurnId", "sourceMessageId"];
const MANUAL_SOURCE_KEYS = ["sourceThreadId", "sourceRecordId"];
const PLAN_STATUSES = new Set(["pending", "inProgress", "completed"]);
const SHANGHAI_DAY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit"
});

function validId(value) {
  return typeof value === "string" && value.length > 0 && !/\s/.test(value);
}

function validInputSource(input) {
  const keys = input?.kind === "dockManualInput" ? MANUAL_SOURCE_KEYS : USER_SOURCE_KEYS;
  return ALLOWED_INPUT_KINDS.has(input?.kind) && keys.every((key) => validId(input[key]));
}

function validStoredSource(source) {
  if (!source || typeof source !== "object") return false;
  const manual = source.kind === "dockManualInput";
  const keys = manual ? MANUAL_SOURCE_KEYS : USER_SOURCE_KEYS;
  return (manual || source.kind === undefined) &&
    keys.every((key) => validId(source[key])) &&
    Object.keys(source).every((key) => keys.includes(key) || (manual && key === "kind"));
}

function validDeadlineBasis(basis) {
  if (!basis || typeof basis !== "object" || Array.isArray(basis) ||
      basis.timeZone !== "Asia/Shanghai" ||
      !Object.keys(basis).every((key) => ["type", "timeZone", "messageTime"].includes(key))) return false;
  const hasMessageTime = Object.hasOwn(basis, "messageTime");
  if (hasMessageTime && !Number.isFinite(parseInstant(basis.messageTime))) return false;
  return basis.type === "explicit" || (basis.type === "relative" && hasMessageTime);
}

function provenance(input) {
  if (input.kind === "dockManualInput") {
    return { kind: "dockManualInput", sourceThreadId: input.sourceThreadId, sourceRecordId: input.sourceRecordId };
  }
  return {
    sourceThreadId: input.sourceThreadId,
    sourceTurnId: input.sourceTurnId,
    sourceMessageId: input.sourceMessageId
  };
}

function validDateParts(year, month, day, hour, minute) {
  const value = new Date(Date.UTC(year, month - 1, day, hour, minute));
  return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 &&
    value.getUTCDate() === day && value.getUTCHours() === hour && value.getUTCMinutes() === minute;
}

function formatShanghai(year, month, day, hour, minute) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00+08:00`;
}

// Require an actual instant, not an unzoned date that Date.parse may interpret locally.
function parseInstant(text) {
  if (typeof text !== "string") return NaN;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(text);
  if (!match) return NaN;
  const [, year, month, day, hour, minute, second, zone] = match;
  if (!validDateParts(+year, +month, +day, +hour, +minute) || +second > 59) return NaN;
  if (zone !== "Z" && (+zone.slice(1, 3) > 23 || +zone.slice(4, 6) > 59)) return NaN;
  return Date.parse(text);
}

function shanghaiDay(instant) {
  const parts = SHANGHAI_DAY_FORMATTER.formatToParts(new Date(instant));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return [Number(values.year), Number(values.month), Number(values.day)];
}

function parseDeadline(text, messageTime) {
  const absolute = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(text);
  if (absolute) {
    const [, y, m, d, hh, mm] = absolute.map(Number);
    if (!validDateParts(y, m, d, hh, mm)) return undefined;
    return { value: formatShanghai(y, m, d, hh, mm), basis: { type: "explicit", timeZone: "Asia/Shanghai" } };
  }

  const relative = /^明天\s+(\d{1,2}):(\d{2})$/.exec(text);
  const messageInstant = parseInstant(messageTime);
  if (!relative || !Number.isFinite(messageInstant)) return undefined;
  const hour = Number(relative[1]);
  const minute = Number(relative[2]);
  const [year, month, day] = shanghaiDay(messageInstant);
  const base = new Date(Date.UTC(year, month - 1, day));
  base.setUTCDate(base.getUTCDate() + 1);
  if (!validDateParts(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), hour, minute)) return undefined;
  return {
    value: formatShanghai(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), hour, minute),
    basis: { type: "relative", messageTime, timeZone: "Asia/Shanghai" }
  };
}

export function extractBusinessFields(input) {
  if (!validInputSource(input) || typeof input.text !== "string") return {};
  const result = {};
  const seen = new Map();
  const conflicted = new Set();
  let fence = null;
  for (const rawLine of input.text.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    const marker = /^(`{3,}|~{3,})/.exec(trimmed)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length && trimmed === marker) fence = null;
      continue;
    }
    if (fence || trimmed.startsWith(">")) continue;
    const match = /^([^：:]+)[：:]\s*(.+?)\s*$/.exec(rawLine.trim());
    if (!match) continue;
    const key = BUSINESS_LABELS.get(match[1].trim());
    if (!key) continue;
    const rawValue = match[2].trim();
    if (!rawValue) continue;
    if (seen.has(key) && seen.get(key) !== rawValue) {
      conflicted.add(key);
      delete result[key];
    }
    seen.set(key, rawValue);
    if (conflicted.has(key)) continue;
    if (key === "partition" && !ALLOWED_PARTITIONS.has(rawValue)) continue;
    if (key === "deadline") {
      const parsed = parseDeadline(rawValue, input.messageTime);
      if (parsed) result[key] = { ...parsed, source: provenance(input) };
      continue;
    }
    result[key] = { value: rawValue, source: provenance(input) };
  }
  return result;
}

// The caller must obtain binding from a trusted reader, never from the text being parsed.
// Matching identifiers is validation, not authentication of an arbitrary caller.
export function extractBoundBusinessFields(input, binding) {
  if (!validInputSource(input) || !binding || binding.kind !== input.kind) return {};
  const keys = input.kind === "dockManualInput" ? MANUAL_SOURCE_KEYS : USER_SOURCE_KEYS;
  if (!keys.every((key) => input[key] === binding[key])) return {};
  return extractBusinessFields(input);
}

export function computeDateCounters(records, nowText, options = {}) {
  const threshold = options.imminentHours ?? 24;
  const now = parseInstant(nowText);
  if (!Number.isFinite(now) || !Number.isFinite(threshold) || threshold < 0) return { today: 0, imminent: 0 };
  const currentDay = shanghaiDay(now).join("-");
  let today = 0;
  let imminent = 0;
  for (const record of Array.isArray(records) ? records : []) {
    const deadlineText = record?.deadline?.value;
    const instant = parseInstant(deadlineText);
    if (!Number.isFinite(instant) || !validStoredSource(record?.deadline?.source) ||
        !validDeadlineBasis(record?.deadline?.basis)) continue;
    if (shanghaiDay(instant).join("-") === currentDay) today += 1;
    const diff = instant - now;
    if (Number.isFinite(diff) && diff >= 0 && diff <= threshold * 60 * 60 * 1000) imminent += 1;
  }
  return { today, imminent };
}

export function derivePlanView(plan) {
  if (!validPlan(plan)) return {};
  const currentIndex = plan.findIndex((item) => item?.status === "inProgress");
  if (currentIndex < 0) return {};
  const result = { progress: { current: currentIndex + 1, total: plan.length } };
  const next = plan.slice(currentIndex + 1).find((item) => item?.status === "pending");
  if (next?.id) result.nextStepId = next.id;
  return result;
}

function validPlan(plan) {
  if (!Array.isArray(plan) || plan.length === 0) return false;
  const ids = new Set();
  let active = 0;
  return plan.every((item) => {
    if (!item || typeof item !== "object" || !PLAN_STATUSES.has(item.status)) return false;
    const hasStep = typeof item.step === "string" && item.step.trim().length > 0;
    if (item.step !== undefined && !hasStep) return false;
    if (item.id !== undefined) {
      if (!validId(item.id) || ids.has(item.id)) return false;
      ids.add(item.id);
    }
    if (!hasStep && !validId(item.id)) return false;
    if (item.status === "inProgress") active += 1;
    return active <= 1;
  });
}

export function reducePlanObservations(observations, binding, nowText) {
  const now = parseInstant(nowText);
  if (!Array.isArray(observations) || binding?.kind !== "appServerSubscription" ||
      !validId(binding.threadId) || !validId(binding.turnId) || !Number.isFinite(now)) return {};
  const scoped = observations.filter((item) =>
    item?.source?.threadId === binding.threadId && item?.source?.turnId === binding.turnId);
  if (!scoped.length || scoped.some((item) => !Number.isSafeInteger(item.source.localSequence) || item.source.localSequence < 0)) return {};
  const maximum = scoped.reduce((maximum, item) => Math.max(maximum, item.source.localSequence), -1);
  const latest = scoped.filter((item) => item.source.localSequence === maximum);
  // localSequence is assigned by the collector; it is not an official event ID.
  try {
    if (new Set(latest.map((item) => JSON.stringify(item))).size !== 1) return {};
  } catch { return {}; }
  const { source, notification } = latest[0];
  const received = parseInstant(source.receivedAt);
  if (source.kind !== "appServerSubscription" || source.mode !== "live" ||
      !Number.isFinite(received) || received > now || now - received > 10000) return {};
  const params = notification?.params;
  if (notification?.method !== "turn/plan/updated" || params?.turnId !== binding.turnId ||
      (params.threadId !== undefined && params.threadId !== binding.threadId) || !validPlan(params.plan) ||
      !params.plan.every((item) => typeof item.step === "string" && item.step.trim())) return {};
  const view = derivePlanView(params.plan);
  if (!view.progress) return {};
  const current = view.progress.current - 1;
  const next = params.plan.slice(current + 1).find((item) => item.status === "pending");
  return {
    progress: view.progress,
    currentStep: params.plan[current].step,
    ...(next ? { nextStep: next.step } : {}),
    source: { kind: "appServer.plan", threadId: binding.threadId, turnId: binding.turnId,
      receivedAt: source.receivedAt, localSequence: maximum }
  };
}

export function deriveBusinessCompletion() {
  return undefined;
}

export function reduceSystemEvents(events) {
  const sorted = [...(Array.isArray(events) ? events : [])].sort((a, b) => a.sequence - b.sequence);
  const seen = new Set();
  const state = { threadId: undefined, lastSequence: undefined, runtimeState: undefined, appliedEventIds: [] };
  for (const event of sorted) {
    if (!event?.eventId || seen.has(event.eventId)) continue;
    seen.add(event.eventId);
    state.threadId = event.threadId;
    state.lastSequence = event.sequence;
    state.runtimeState = event.state;
    state.appliedEventIds.push(event.eventId);
  }
  return state;
}
