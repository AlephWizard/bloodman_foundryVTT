import assert from "node:assert/strict";
import { normalizeBooleanFlag } from "../../src/rules/boolean-flags.mjs";

function run() {
  assert.equal(normalizeBooleanFlag(true), true);
  assert.equal(normalizeBooleanFlag(false), false);
  assert.equal(normalizeBooleanFlag(1), true);
  assert.equal(normalizeBooleanFlag(0), false);
  assert.equal(normalizeBooleanFlag("yes"), true);
  assert.equal(normalizeBooleanFlag("on"), true);
  assert.equal(normalizeBooleanFlag("false"), false);
  assert.equal(normalizeBooleanFlag(""), false);
  assert.equal(normalizeBooleanFlag(undefined, true), true);
}

run();
console.log("boolean-flags.test.mjs: OK");
