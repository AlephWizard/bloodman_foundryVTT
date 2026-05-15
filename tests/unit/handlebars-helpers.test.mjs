import assert from "node:assert/strict";

import {
  BLOODMAN_HANDLEBARS_HELPERS,
  registerBloodmanHandlebarsHelpers
} from "../../src/sheets/register-handlebars-helpers.mjs";

function createHandlebarsStub(existingHelpers = {}) {
  const calls = [];
  const handlebars = {
    helpers: { ...existingHelpers },
    registerHelper(name, helper) {
      calls.push({ name, helper });
      this.helpers[name] = helper;
    }
  };
  return { handlebars, calls };
}

function run() {
  assert.equal(BLOODMAN_HANDLEBARS_HELPERS.lt(1, 2), true, "lt should compare numeric values");
  assert.equal(BLOODMAN_HANDLEBARS_HELPERS.lt(2, 1), false, "lt should reject greater values");
  assert.equal(BLOODMAN_HANDLEBARS_HELPERS.gt("3", "2"), true, "gt should coerce numeric strings like the legacy helper");
  assert.equal(BLOODMAN_HANDLEBARS_HELPERS.gt("bad", 2), false, "gt should remain false for non numeric input");

  const { handlebars, calls } = createHandlebarsStub();
  const result = registerBloodmanHandlebarsHelpers({ handlebars });

  assert.equal(result.ok, true, "Registration should succeed with a valid Handlebars object");
  assert.deepEqual(result.registered.sort(), ["gt", "lt"], "Missing helpers should be registered");
  assert.equal(calls.length, 2, "Each helper should be registered once");
  assert.equal(typeof handlebars.helpers.lt, "function", "lt helper should be installed");
  assert.equal(typeof handlebars.helpers.gt, "function", "gt helper should be installed");

  const secondResult = registerBloodmanHandlebarsHelpers({ handlebars });
  assert.deepEqual(secondResult.registered, [], "Existing helpers should not be registered twice");
  assert.deepEqual(secondResult.skipped.sort(), ["gt", "lt"], "Existing helpers should be reported as skipped");
  assert.equal(calls.length, 2, "Second registration should not call registerHelper");

  const existingLt = () => "existing";
  const existing = createHandlebarsStub({ lt: existingLt });
  const existingResult = registerBloodmanHandlebarsHelpers({ handlebars: existing.handlebars });
  assert.deepEqual(existingResult.registered, ["gt"], "Only missing helpers should be added");
  assert.deepEqual(existingResult.skipped, ["lt"], "Pre-existing helpers should be skipped");
  assert.equal(existing.handlebars.helpers.lt, existingLt, "Pre-existing helpers should not be replaced");

  const missingResult = registerBloodmanHandlebarsHelpers({ handlebars: null });
  assert.equal(missingResult.ok, false, "Missing Handlebars should be reported");
  assert.equal(missingResult.reason, "missing-handlebars", "Missing Handlebars should have a stable reason");
}

run();
console.log("handlebars-helpers.test.mjs: OK");
