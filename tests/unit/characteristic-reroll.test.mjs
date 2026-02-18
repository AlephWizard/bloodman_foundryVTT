import assert from "node:assert/strict";
import { createCharacteristicRerollRules } from "../../src/rules/characteristic-reroll.mjs";

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
}

async function run() {
  const rules = createCharacteristicRerollRules({ toFiniteNumber });

  assert.deepEqual(
    rules.resolveCharacteristicRerollPlan({
      actorType: "personnage",
      requestedKey: "",
      lastRollKey: "PHY",
      currentPP: 10,
      ppCost: 2
    }),
    { mode: "", allowed: false, reason: "missing-key" }
  );

  assert.deepEqual(
    rules.resolveCharacteristicRerollPlan({
      actorType: "personnage",
      requestedKey: "PHY",
      lastRollKey: "ESP",
      currentPP: 10,
      ppCost: 2
    }),
    { mode: "", allowed: false, reason: "stale-key" }
  );

  assert.deepEqual(
    rules.resolveCharacteristicRerollPlan({
      actorType: "personnage",
      requestedKey: "PHY",
      lastRollKey: "PHY",
      currentPP: 1,
      ppCost: 2
    }),
    {
      mode: "player",
      allowed: false,
      reason: "not-enough-pp",
      currentPP: 1,
      nextPP: 0,
      cost: 2
    }
  );

  assert.deepEqual(
    rules.resolveCharacteristicRerollPlan({
      actorType: "personnage",
      requestedKey: "PHY",
      lastRollKey: "PHY",
      currentPP: 5,
      ppCost: 2
    }),
    {
      mode: "player",
      allowed: true,
      reason: "",
      currentPP: 5,
      nextPP: 3,
      cost: 2
    }
  );

  assert.deepEqual(
    rules.resolveCharacteristicRerollPlan({
      actorType: "personnage-non-joueur",
      requestedKey: "PHY",
      lastRollKey: "PHY",
      isGM: false,
      isRerollWindowActive: true,
      currentChaos: 9,
      npcChaosCost: 3
    }),
    { mode: "", allowed: false, reason: "gm-required" }
  );

  assert.deepEqual(
    rules.resolveCharacteristicRerollPlan({
      actorType: "personnage-non-joueur",
      requestedKey: "PHY",
      lastRollKey: "PHY",
      isGM: true,
      isRerollWindowActive: false,
      currentChaos: 9,
      npcChaosCost: 3
    }),
    { mode: "", allowed: false, reason: "window-expired" }
  );

  assert.deepEqual(
    rules.resolveCharacteristicRerollPlan({
      actorType: "personnage-non-joueur",
      requestedKey: "PHY",
      lastRollKey: "PHY",
      isGM: true,
      isRerollWindowActive: true,
      currentChaos: 1,
      npcChaosCost: 3
    }),
    {
      mode: "npc",
      allowed: false,
      reason: "not-enough-chaos",
      currentChaos: 1,
      nextChaos: 0,
      cost: 3
    }
  );

  assert.deepEqual(
    rules.resolveCharacteristicRerollPlan({
      actorType: "personnage-non-joueur",
      requestedKey: "PHY",
      lastRollKey: "PHY",
      isGM: true,
      isRerollWindowActive: true,
      currentChaos: 7,
      npcChaosCost: 3
    }),
    {
      mode: "npc",
      allowed: true,
      reason: "",
      currentChaos: 7,
      nextChaos: 4,
      cost: 3
    }
  );

  assert.deepEqual(
    rules.resolveCharacteristicXpProgress({
      xpValue: [true, false, false],
      defaultSlots: 3
    }),
    {
      updated: true,
      xp: [true, true, false],
      shouldPromptGrowth: false
    }
  );

  assert.deepEqual(
    rules.resolveCharacteristicXpProgress({
      xpValue: [true, true, false],
      defaultSlots: 3
    }),
    {
      updated: true,
      xp: [true, true, true],
      shouldPromptGrowth: true
    }
  );

  assert.deepEqual(
    rules.resolveCharacteristicXpProgress({
      xpValue: [true, true, true],
      defaultSlots: 3
    }),
    {
      updated: false,
      xp: [true, true, true],
      shouldPromptGrowth: true
    }
  );

  assert.deepEqual(
    rules.resolveCharacteristicXpProgress({
      xpValue: null,
      defaultSlots: 3
    }),
    {
      updated: true,
      xp: [true, false, false],
      shouldPromptGrowth: false
    }
  );
}

run()
  .then(() => {
    console.log("characteristic-reroll.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
