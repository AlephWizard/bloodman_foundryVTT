import assert from "node:assert/strict";
import { validateNumericEquality, createNumericValidationLogger } from "../../src/rules/numeric-validation.mjs";

async function run() {
  assert.equal(validateNumericEquality(1, 1), true);
  assert.equal(validateNumericEquality("2", 2), true);
  assert.equal(validateNumericEquality(1, 2), false);
  assert.equal(validateNumericEquality(Number.NaN, 1), false);

  const entries = [];
  const logger = createNumericValidationLogger({
    debug: (...args) => entries.push({ level: "debug", args }),
    warn: (...args) => entries.push({ level: "warn", args })
  });

  logger.logNumericValidation("ok-case", { okA: true, okB: true, info: 1 });
  logger.logNumericValidation("warn-case", { okA: true, okB: false });

  assert.equal(entries.length, 2);
  assert.equal(entries[0].level, "debug");
  assert.equal(entries[0].args[0], "reroll:validate");
  assert.equal(entries[0].args[1].scope, "ok-case");
  assert.equal(entries[1].level, "warn");
  assert.equal(entries[1].args[1].scope, "warn-case");
}

run()
  .then(() => {
    console.log("numeric-validation.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
