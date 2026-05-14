import assert from "node:assert/strict";

import {
  createCustomDamageOption,
  DAMAGE_CONFIG_OPTIONS,
  getDamageOptionByFormula,
  getDefaultDamageOption,
  normalizeDamageFormula,
  validateDamageFormula
} from "../../src/dice/damage-config-options.mjs";

function run() {
  assert.equal(DAMAGE_CONFIG_OPTIONS.length, 12);
  assert.deepEqual(DAMAGE_CONFIG_OPTIONS[0], { label: "1D4", formula: "1d4" });
  assert.deepEqual(DAMAGE_CONFIG_OPTIONS.at(-1), { label: "2D12", formula: "2d12" });

  assert.equal(normalizeDamageFormula(" 1D10 + 1D4 "), "1d10+1d4");
  assert.equal(normalizeDamageFormula(""), "");

  assert.deepEqual(getDamageOptionByFormula("1D6"), { label: "1D6", formula: "1d6" });
  assert.equal(getDamageOptionByFormula("3d6"), null);

  assert.deepEqual(createCustomDamageOption("3D6"), { label: "3D6", formula: "3d6" });
  assert.deepEqual(createCustomDamageOption("", "1D8"), { label: "1D8", formula: "1d8" });

  assert.deepEqual(getDefaultDamageOption("2D10"), { label: "2D10", formula: "2d10" });
  assert.deepEqual(getDefaultDamageOption("unknown"), DAMAGE_CONFIG_OPTIONS[0]);

  assert.equal(validateDamageFormula("2D6").valid, true);
  assert.equal(validateDamageFormula("hello").valid, false);
}

run();
console.log("damage-config-options.test.mjs: OK");
