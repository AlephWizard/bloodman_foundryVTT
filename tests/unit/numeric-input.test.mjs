import assert from "node:assert/strict";
import {
  parseLooseNumericInput,
  parseSimpleArithmeticInput,
  normalizeSignedModifierInput,
  buildItemModifierErrorMessage
} from "../../src/rules/numeric-input.mjs";

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
}

async function run() {
  assert.deepEqual(parseLooseNumericInput(""), { ok: true, empty: true, value: 0 });
  assert.deepEqual(parseLooseNumericInput(" 12 "), { ok: true, empty: false, value: 12 });
  assert.deepEqual(parseLooseNumericInput("1,5"), { ok: true, empty: false, value: 1.5 });
  assert.equal(parseLooseNumericInput("1+2").ok, false);

  assert.deepEqual(parseSimpleArithmeticInput(""), { ok: true, empty: true, value: 0 });
  assert.deepEqual(parseSimpleArithmeticInput("1+2*3"), { ok: true, empty: false, value: 7 });
  assert.deepEqual(parseSimpleArithmeticInput("(1+2)*3"), { ok: true, empty: false, value: 9 });
  assert.deepEqual(parseSimpleArithmeticInput("-2+5"), { ok: true, empty: false, value: 3 });
  assert.equal(parseSimpleArithmeticInput("1/0").ok, false);
  assert.equal(parseSimpleArithmeticInput("2**3").ok, false);

  assert.deepEqual(normalizeSignedModifierInput(null, 3, toFiniteNumber), { value: 3, invalid: false });
  assert.deepEqual(normalizeSignedModifierInput(" 2 ", 0, toFiniteNumber), { value: 2, invalid: false });
  assert.deepEqual(normalizeSignedModifierInput("bad", 4, toFiniteNumber), { value: 4, invalid: true });
  assert.deepEqual(normalizeSignedModifierInput(Number.NaN, 1, toFiniteNumber), { value: 1, invalid: true });

  assert.equal(buildItemModifierErrorMessage([]), null);
  assert.equal(buildItemModifierErrorMessage(["PHY", "PHY", "ESP"]), "Valeur non numerique: PHY, ESP");
}

run()
  .then(() => {
    console.log("numeric-input.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
