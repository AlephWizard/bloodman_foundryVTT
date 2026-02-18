import assert from "node:assert/strict";
import { createUiRefreshQueueRules } from "../../src/rules/ui-refresh-queue.mjs";

function run() {
  const rules = createUiRefreshQueueRules();

  assert.equal(rules.mergeDeferredForce(false, false), false);
  assert.equal(rules.mergeDeferredForce(false, true), true);
  assert.equal(rules.mergeDeferredForce(true, false), true);
  assert.equal(rules.mergeDeferredForce(true, true), true);

  const rootA = { find: () => [] };
  const rootB = { find: () => [] };
  assert.equal(rules.resolveDeferredRoot(null, null), null);
  assert.equal(rules.resolveDeferredRoot(rootA, null), rootA);
  assert.equal(rules.resolveDeferredRoot(null, rootB), rootB);
  assert.equal(rules.resolveDeferredRoot(rootA, rootB), rootB);
  assert.equal(rules.resolveDeferredRoot({ nope: true }, null), null);
}

run();
console.log("ui-refresh-queue.test.mjs: OK");
