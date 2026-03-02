import assert from "node:assert/strict";
import { normalizeRollDieFormula, stripRollCommandPrefix, isValidSimpleRollFormula } from "../../src/rules/roll-formula.mjs";

async function run() {
  assert.equal(stripRollCommandPrefix("/r 1d6+2"), "1d6+2");
  assert.equal(stripRollCommandPrefix("/roll d8+1"), "d8+1");
  assert.equal(stripRollCommandPrefix("  2d4+3 "), "2d4+3");

  assert.equal(normalizeRollDieFormula(null, "d4"), "1d4");
  assert.equal(normalizeRollDieFormula("1d8", "d4"), "1d8");
  assert.equal(normalizeRollDieFormula("d10", "d4"), "1d10");
  assert.equal(normalizeRollDieFormula("", "d6"), "1d4");
  assert.equal(normalizeRollDieFormula(undefined, "2d6"), "2d6");
  assert.equal(normalizeRollDieFormula("/r d6+2", "d4"), "1d6+2");
  assert.equal(normalizeRollDieFormula("1d8 + d4 + 3", "d4"), "1d8+1d4+3");

  assert.equal(isValidSimpleRollFormula("/r 1d4+3", "d4"), true);
  assert.equal(isValidSimpleRollFormula("d12+2d4+5", "d4"), true);
  assert.equal(isValidSimpleRollFormula("abc", "d4"), false);
  assert.equal(isValidSimpleRollFormula("1d6+@str", "d4"), false);
}

run()
  .then(() => {
    console.log("roll-formula.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
