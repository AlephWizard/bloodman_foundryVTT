import assert from "node:assert/strict";
import { createGrowthRollRules } from "../../src/rules/growth-roll.mjs";

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
}

async function run() {
  const rules = createGrowthRollRules({ toFiniteNumber });

  assert.equal(
    rules.computeGrowthEffectiveScore({
      base: 20,
      modifierAll: 3,
      modifierKey: 2,
      itemBonus: 1,
      archetypeBonus: 4
    }),
    20
  );
  assert.equal(
    rules.computeGrowthEffectiveScore({
      base: "x",
      modifierAll: "2",
      modifierKey: undefined,
      itemBonus: null,
      archetypeBonus: 1
    }),
    0
  );
  assert.equal(
    rules.computeGrowthEffectiveScore({
      base: 55,
      modifierAll: -30,
      modifierKey: -10,
      itemBonus: 12,
      archetypeBonus: 8
    }),
    55
  );

  assert.deepEqual(
    rules.resolveGrowthOutcome({
      rollTotal: 70,
      effectiveScore: 65
    }),
    {
      rollTotal: 70,
      effectiveScore: 65,
      success: true
    }
  );
  assert.deepEqual(
    rules.resolveGrowthOutcome({
      rollTotal: 60,
      effectiveScore: 65
    }),
    {
      rollTotal: 60,
      effectiveScore: 65,
      success: false
    }
  );

  assert.deepEqual(
    rules.buildGrowthUpdateData({
      base: 12,
      success: true,
      xpSlots: 3
    }),
    {
      nextBase: 13,
      nextXp: [false, false, false]
    }
  );
  assert.deepEqual(
    rules.buildGrowthUpdateData({
      base: 12,
      success: false,
      xpSlots: 4
    }),
    {
      nextBase: 12,
      nextXp: [false, false, false, false]
    }
  );
}

run()
  .then(() => {
    console.log("growth-roll.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
