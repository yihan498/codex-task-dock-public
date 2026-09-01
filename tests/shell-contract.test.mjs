import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "./test-kit.mjs";

test("tray-and-shortcut-share-idempotent-visibility-toggle", async () => {
  const { createVisibilityController } = await import("../shell/src/visibility.mjs");
  const calls = [];
  const controller = createVisibilityController({
    show: async () => calls.push("show"),
    hide: async () => calls.push("hide"),
    focus: async () => calls.push("focus")
  });

  await controller.toggle("tray");
  assert.equal(controller.isVisible(), true);
  await controller.setVisible(true);
  await controller.toggle("shortcut");
  await controller.setVisible(false);

  assert.equal(controller.isVisible(), false);
  assert.deepEqual(calls, ["show", "focus", "hide"]);
  assert.deepEqual(controller.events(), [
    { source: "tray", visible: true },
    { source: "shortcut", visible: false }
  ]);
});

test("readonly-projection-omits-progress-next-step-and-missing-business-fields", async () => {
  const { projectReadonlyTask } = await import("../shell/src/projection.mjs");
  const projected = projectReadonlyTask({
    threadId: "thread-redacted",
    runtimeStatus: "active",
    userFields: { project: "Dock" },
    assistantText: "进度 90%，下一步发布，截止今天",
    structuredPlan: null
  });

  assert.deepEqual(projected, {
    threadId: "thread-redacted",
    runtimeStatus: "active",
    project: "Dock"
  });
  assert.equal("progress" in projected, false);
  assert.equal("nextStep" in projected, false);
  assert.equal("deadline" in projected, false);
  assert.equal("businessStatus" in projected, false);
});

test("readonly-projection-computes-only-structured-plan-position-and-next-pending", async () => {
  const { projectReadonlyTask } = await import("../shell/src/projection.mjs");
  const projected = projectReadonlyTask({
    threadId: "thread-redacted",
    runtimeStatus: "idle",
    userFields: {},
    structuredPlan: [
      { step: "已完成", status: "completed" },
      { step: "当前项", status: "inProgress" },
      { step: "首个待办", status: "pending" },
      { step: "后续待办", status: "pending" }
    ]
  });

  assert.deepEqual(projected.progress, { current: 2, total: 4, label: "2 / 4" });
  assert.equal(projected.nextStep, "首个待办");
  assert.equal("businessStatus" in projected, false);
});

test("tauri-shell-has-minimal-local-only-capability-and-hidden-window", async () => {
  const capability = JSON.parse(await readFile(new URL("../shell/src-tauri/capabilities/main.json", import.meta.url), "utf8"));
  const config = JSON.parse(await readFile(new URL("../shell/src-tauri/tauri.conf.json", import.meta.url), "utf8"));

  assert.deepEqual(capability.windows, ["main"]);
  assert.deepEqual(capability.permissions, ["allow-fetch-task-snapshot", "allow-hide-dock", "allow-open-codex-task"]);
  assert.equal(JSON.stringify(capability).match(/(?:fs|http|shell|process|notification|autostart):/), null);
  assert.equal("remote" in capability, false);
  assert.equal(config.app.windows[0].visible, false);
  assert.equal(config.app.security.csp.includes("connect-src ipc: http://ipc.localhost"), true);
  assert.equal(config.app.security.csp.includes("frame-src 'none'"), true);
  assert.equal(config.app.withGlobalTauri, true);
  assert.equal(config.app.windows[0].width, 390);
  assert.equal(config.app.windows[0].height, 560);
  assert.equal("bundle" in config, false);
});

test("native-shell-registers-tray-and-configurable-shortcut-without-task-control", async () => {
  const rust = await readFile(new URL("../shell/src-tauri/src/lib.rs", import.meta.url), "utf8");
  assert.match(rust, /TrayIconBuilder/);
  assert.match(rust, /CODEX_TASK_DOCK_SHORTCUT/);
  assert.match(rust, /toggle_main_window/);
  assert.doesNotMatch(rust, /thread\/resume|turn\/start|thread\/archive|thread\/delete/);
});

test("tauri-windows-icon-is-present", async () => {
  const icon = await readFile(new URL("../shell/src-tauri/icons/icon.ico", import.meta.url));
  assert.equal(icon.length > 22, true);
  assert.deepEqual([...icon.subarray(0, 4)], [0, 0, 1, 0]);
});

test("concurrent-visibility-requests-are-serialized-and-idempotent", async () => {
  const { createVisibilityController } = await import("../shell/src/visibility.mjs");
  const calls = [];
  const controller = createVisibilityController({
    show: async () => {
      await Promise.resolve();
      calls.push("show");
    },
    hide: async () => calls.push("hide"),
    focus: async () => calls.push("focus")
  });

  await Promise.all([
    controller.setVisible(true, "tray"),
    controller.setVisible(true, "shortcut")
  ]);

  assert.equal(controller.isVisible(), true);
  assert.deepEqual(calls, ["show", "focus"]);
  assert.deepEqual(controller.events(), [{ source: "tray", visible: true }]);
});
