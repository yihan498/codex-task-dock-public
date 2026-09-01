import { assert, test } from "./test-kit.mjs";

let protocol;
try {
  protocol = await import("../src/probe/protocol.ts");
} catch {
  protocol = {};
}

test("account-read-redaction-removes-secrets", () => {
  const line = protocol.redactLog?.({
    method: "account/read",
    email: "person@example.com",
    authUrl: "https://auth.example.test/oauth?token=secret",
    accessToken: "secret-token",
    loggedIn: true
  });
  assert.equal(typeof line, "string");
  assert.equal(line.includes("person@example.com"), false);
  assert.equal(line.includes("https://auth.example.test"), false);
  assert.equal(line.includes("secret-token"), false);
  assert.equal(line.includes("loggedIn"), true);
});

test("probe-results-use-required-failure-categories", () => {
  assert.equal(protocol.classifyProbeFailure?.("ECONNREFUSED"), "未就绪");
  assert.equal(protocol.classifyProbeFailure?.("SPAWN_FAILED"), "环境失败");
  assert.equal(protocol.classifyProbeFailure?.("METHOD_NOT_FOUND"), "产品失败");
  assert.equal(protocol.classifyProbeFailure?.("NO_OFFICIAL_DEEP_LINK"), "外部门槛");
});

test("pagination-deduplicates-thread-ids", () => {
  const pages = [
    { data: [{ id: "thread-1" }, { id: "thread-2" }], nextCursor: "p2" },
    { data: [{ id: "thread-2" }, { id: "thread-3" }] }
  ];
  assert.deepEqual(protocol.flattenThreadPages?.(pages).map((item) => item.id), ["thread-1", "thread-2", "thread-3"]);
});
