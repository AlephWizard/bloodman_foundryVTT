import assert from "node:assert/strict";
import { normalizeRollDieFormula } from "../../src/rules/roll-formula.mjs";

async function run() {
  assert.equal(normalizeRollDieFormula(null, "d4"), "1d4");
  assert.equal(normalizeRollDieFormula("1d8", "d4"), "1d8");
  assert.equal(normalizeRollDieFormula("d10", "d4"), "1d10");
  assert.equal(normalizeRollDieFormula("", "d6"), "1d4");
  assert.equal(normalizeRollDieFormula(undefined, "2d6"), "2d6");
}

run()
  .then(() => {
    console.log("roll-formula.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
