import assert from "node:assert/strict";
import {
  getRollFormulaValidationError,
  isValidSimpleRollFormula,
  normalizeRollDieFormula,
  stripRollCommandPrefix,
  validateRollFormula
} from "../../src/rules/roll-formula.mjs";

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
  assert.equal(normalizeRollDieFormula(" (2D20KH + 3) ", "d4"), "(2d20kh+3)");
  assert.equal(normalizeRollDieFormula("10d6cs>=4", "d4"), "10d6cs>=4");

  assert.equal(isValidSimpleRollFormula("/r 1d4+3", "d4"), true);
  assert.equal(isValidSimpleRollFormula("d12+2d4+5", "d4"), true);
  assert.equal(isValidSimpleRollFormula("(2d20kh+3)", "d4"), true);
  assert.equal(isValidSimpleRollFormula("4d6kh3", "d4"), true);
  assert.equal(isValidSimpleRollFormula("10d6cs>=4", "d4"), true);
  assert.equal(isValidSimpleRollFormula("2d6rr<3+1d4", "d4"), true);
  assert.equal(isValidSimpleRollFormula("2d6xo=6", "d4"), true);
  assert.equal(isValidSimpleRollFormula("abc", "d4"), false);
  assert.equal(isValidSimpleRollFormula("1d6+@str", "d4"), false);
  assert.equal(isValidSimpleRollFormula("4d6kh3+", "d4"), false);

  const advanced = validateRollFormula("4d6kh3 + (1d4*2)", "d4", { useFallbackOnEmpty: false });
  assert.equal(advanced.valid, true);
  assert.equal(advanced.normalized, "4d6kh3+(1d4*2)");

  const invalidModifier = validateRollFormula("2d6foo3", "d4", { useFallbackOnEmpty: false });
  assert.equal(invalidModifier.valid, false);
  assert.match(invalidModifier.error, /Unknown dice modifier "foo"/);

  const invalidSyntax = getRollFormulaValidationError("1d6+", "d4", { useFallbackOnEmpty: false });
  assert.match(invalidSyntax, /Expected a number, a dice term, or '\('/);

  const emptyFormula = validateRollFormula("", "d4", { useFallbackOnEmpty: false });
  assert.equal(emptyFormula.valid, false);
  assert.match(emptyFormula.error, /empty/i);
}

run()
  .then(() => {
    console.log("roll-formula.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
