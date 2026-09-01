import process from "node:process";
import { cases } from "./test-kit.mjs";

const suiteArg = process.argv.indexOf("--suite");
const suite = suiteArg >= 0 ? process.argv[suiteArg + 1] : "all";
if (suite === "all" || suite === "core") await import("./core-contract.test.mjs");
if (suite === "all" || suite === "probe") await import("./probe-protocol.test.mjs");
if (suite === "all" || suite === "compatibility") await import("./compatibility-probe.test.mjs");
if (suite === "all" || suite === "compatibility-runtime") await import("./compatibility-runtime.test.mjs");
if (suite === "all" || suite === "shell") await import("./shell-contract.test.mjs");
if (suite === "all" || suite === "source-bound") await import("./source-bound-data.test.mjs");
if (suite === "all" || suite === "source-bound") await import("./schema-checker-contract.test.mjs");
if (suite === "all" || suite === "reader") await import("./reader.test.mjs");
if (suite === "all" || suite === "reader-service") await import("./reader-service.test.mjs");
if (suite === "all" || suite === "desktop") await import("./desktop-runtime.test.mjs");
if (suite === "all" || suite === "keywords") await import("./keyword-contract.test.mjs");
if (suite === "all" || suite === "desktop-retry") await import("./desktop-retry.test.mjs");
if (suite === "all" || suite === "desktop-batch") await import("./desktop-batch.test.mjs");
if (suite === "all" || suite === "auto-name") await import("./auto-name.test.mjs");
if (suite === "all" || suite === "auto-name") await import("./auto-name-update.test.mjs");
if (suite === "all" || suite === "model-name") await import("./model-naming.test.mjs");
if (suite === "all" || suite === "model-name") await import("./model-naming-inflight.test.mjs");
if (suite === "all" || suite === "naming-gate") await import("./naming-gate.test.mjs");
if (suite === "all" || suite === "isolated-namer") await import("./isolated-namer.test.mjs");
if (suite === "all" || suite === "model-name") await import("./model-naming-reader.test.mjs");
if (suite === "all" || suite === "model-name") await import("./model-naming-hardening.test.mjs");
if (suite === "all" || suite === "naming-network") await import("./naming-network.test.mjs");
if (suite === "all" || suite === "model-name") await import("./model-naming-retry.test.mjs");
if (suite === "all" || suite === "model-name") await import("./model-naming-context.test.mjs");
if (suite === "all" || suite === "model-name") await import("./model-naming-paraphrase.test.mjs");
if (suite === "all" || suite === "model-name") await import("./model-naming-negation.test.mjs");
if (suite === "all" || suite === "model-name") await import("./model-naming-semantic.test.mjs");
if (suite === "all" || suite === "model-name") await import("./model-naming-diagnostics.test.mjs");
if (suite === "all" || suite === "model-name") await import("./model-naming-prefix.test.mjs");
if (suite === "all" || suite === "model-name") await import("./model-naming-recovery.test.mjs");
if (suite === "all" || suite === "model-name") await import("./model-naming-continuity.test.mjs");
if (suite === "all" || suite === "model-name") await import("./model-naming-retained.test.mjs");
if (suite === "all" || suite === "model-name") await import("./model-naming-exhausted.test.mjs");
if (suite === "all" || suite === "model-name") await import("./model-naming-unsent.test.mjs");
if (suite === "all" || suite === "model-name") await import("./model-naming-domain.test.mjs");
if (suite === "all" || suite === "model-name") await import("./model-naming-target.test.mjs");
if (suite === "all" || suite === "portable") await import("./portable-public-release.test.mjs");

const failures = [];
for (const entry of cases) {
  try {
    await entry.fn();
  } catch (error) {
    failures.push({ id: entry.id, message: String(error?.message ?? error) });
  }
}

const result = {
  tests: cases.length,
  failures: failures.length,
  errors: 0,
  category: failures.length ? "product_failure" : "pass",
  summary: failures.length ? `core-contract-behavior-missing: ${failures.map((item) => item.id).join(",")}` : `${cases.length} tests passed`,
  failedTests: failures.map((item) => item.id)
};

console.log(`TDD_GUARD_RESULT=${JSON.stringify(result)}`);
if (failures.length) {
  for (const failure of failures) console.error(`${failure.id}: ${failure.message}`);
  process.exitCode = 1;
}
