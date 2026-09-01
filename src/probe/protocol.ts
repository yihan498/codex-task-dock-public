export function redactLog(value) {
  const safe = {
    method: typeof value?.method === "string" ? value.method : undefined,
    loggedIn: typeof value?.loggedIn === "boolean" ? value.loggedIn : undefined,
    status: typeof value?.status === "string" ? value.status : undefined,
    count: Number.isInteger(value?.count) ? value.count : undefined
  };
  return JSON.stringify(Object.fromEntries(Object.entries(safe).filter(([, item]) => item !== undefined)));
}

export function classifyProbeFailure(code) {
  const categories = {
    ECONNREFUSED: "未就绪",
    SPAWN_FAILED: "环境失败",
    METHOD_NOT_FOUND: "产品失败",
    NO_OFFICIAL_DEEP_LINK: "外部门槛"
  };
  return categories[code] ?? "环境失败";
}

export function flattenThreadPages(pages) {
  const seen = new Set();
  const result = [];
  for (const page of Array.isArray(pages) ? pages : []) {
    for (const thread of Array.isArray(page?.data) ? page.data : []) {
      if (!thread?.id || seen.has(thread.id)) continue;
      seen.add(thread.id);
      result.push(thread);
    }
  }
  return result;
}
