import assert from "node:assert/strict";
import { createItemUseFlowRules } from "../../src/rules/item-use-flow.mjs";

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
}

async function run() {
  const rules = createItemUseFlowRules({
    toFiniteNumber,
    normalizeRollDieFormula: (value, fallback = "d4") => {
      const raw = String(value || fallback).trim();
      if (!raw) return "1d4";
      return /^\d/.test(raw) ? raw : `1${raw}`;
    }
  });

  assert.deepEqual(
    rules.resolveAbilityDamageRollPlan({ item: null }),
    { allowed: false, reason: "missing-item" }
  );

  assert.deepEqual(
    rules.resolveAbilityDamageRollPlan({
      item: { type: "pouvoir", system: { damageDie: "d8" } },
      powerUsableEnabled: true,
      powerActivated: false
    }),
    {
      allowed: false,
      reason: "power-not-activated",
      isUsablePower: true,
      formula: "1d8"
    }
  );

  assert.deepEqual(
    rules.resolveAbilityDamageRollPlan({
      item: { type: "pouvoir", system: { damageDie: "d8" } },
      powerUsableEnabled: true,
      powerActivated: true
    }),
    {
      allowed: true,
      reason: "",
      isUsablePower: true,
      formula: "1d8"
    }
  );

  assert.deepEqual(
    rules.resolveAbilityDamageRollPlan({
      item: { type: "aptitude", system: { damageDie: "d6" } },
      powerUsableEnabled: false,
      powerActivated: false
    }),
    {
      allowed: true,
      reason: "",
      isUsablePower: false,
      formula: "1d6"
    }
  );

  assert.deepEqual(
    rules.resolvePowerRollPlan({ item: null }),
    { allowed: false, reason: "missing-item", mode: "none", formula: "" }
  );
  assert.deepEqual(
    rules.resolvePowerRollPlan({
      item: { type: "aptitude", system: { damageEnabled: true, damageDie: "d6" } }
    }),
    { allowed: false, reason: "unsupported-item-type", mode: "none", formula: "" }
  );
  assert.deepEqual(
    rules.resolvePowerRollPlan({
      item: {
        type: "pouvoir",
        system: { healEnabled: true, healDie: "d10", damageEnabled: true, damageDie: "d6" }
      },
      powerUsableEnabled: false,
      powerActivated: false
    }),
    {
      allowed: true,
      reason: "",
      isUsablePower: false,
      mode: "heal",
      formula: "1d10"
    }
  );
  assert.deepEqual(
    rules.resolvePowerRollPlan({
      item: { type: "pouvoir", system: { damageDie: "d8" } },
      powerUsableEnabled: false,
      powerActivated: false
    }),
    {
      allowed: true,
      reason: "",
      isUsablePower: false,
      mode: "damage",
      formula: "1d8"
    }
  );
  assert.deepEqual(
    rules.resolvePowerRollPlan({
      item: { type: "pouvoir", system: { healEnabled: true, healDie: "d8" } },
      powerUsableEnabled: true,
      powerActivated: false
    }),
    {
      allowed: false,
      reason: "power-not-activated",
      isUsablePower: true,
      mode: "heal",
      formula: "1d8"
    }
  );
  assert.deepEqual(
    rules.resolvePowerRollPlan({
      item: { type: "pouvoir", system: { healEnabled: false, damageEnabled: false, healDie: "d8", damageDie: "d6" } },
      powerUsableEnabled: false,
      powerActivated: false
    }),
    {
      allowed: false,
      reason: "roll-disabled",
      isUsablePower: false,
      mode: "none",
      formula: ""
    }
  );

  assert.deepEqual(
    rules.resolveItemRerollRollPlan({ item: null }),
    { mode: "none", formula: "", reason: "missing-item" }
  );
  assert.deepEqual(
    rules.resolveItemRerollRollPlan({
      item: { type: "arme", system: { damageDie: "d8" } }
    }),
    { mode: "damage", formula: "1d8", reason: "" }
  );
  assert.deepEqual(
    rules.resolveItemRerollRollPlan({
      item: { type: "aptitude", system: { damageEnabled: false, damageDie: "d6" } }
    }),
    { mode: "none", formula: "", reason: "damage-disabled" }
  );
  assert.deepEqual(
    rules.resolveItemRerollRollPlan({
      item: { type: "pouvoir", system: { damageEnabled: true, damageDie: "d6" } }
    }),
    { mode: "damage", formula: "1d6", reason: "" }
  );
  assert.deepEqual(
    rules.resolveItemRerollRollPlan({
      item: { type: "soin", system: { healDie: "d10" } }
    }),
    { mode: "heal", formula: "1d10", reason: "" }
  );
  assert.deepEqual(
    rules.resolveItemRerollRollPlan({
      item: { type: "objet", system: {} }
    }),
    { mode: "none", formula: "", reason: "unsupported-item-type" }
  );

  assert.deepEqual(
    rules.resolveItemUsePlan({ item: null, objectUseEnabled: false }),
    { kind: "none" }
  );
  assert.deepEqual(
    rules.resolveItemUsePlan({
      item: { type: "pouvoir" },
      objectUseEnabled: false
    }),
    { kind: "power" }
  );
  assert.deepEqual(
    rules.resolveItemUsePlan({
      item: { type: "soin" },
      objectUseEnabled: false
    }),
    { kind: "heal" }
  );
  assert.deepEqual(
    rules.resolveItemUsePlan({
      item: { type: "ration" },
      objectUseEnabled: false
    }),
    { kind: "ration" }
  );
  assert.deepEqual(
    rules.resolveItemUsePlan({
      item: { type: "objet" },
      objectUseEnabled: false
    }),
    { kind: "none" }
  );
  assert.deepEqual(
    rules.resolveItemUsePlan({
      item: { type: "objet" },
      objectUseEnabled: true
    }),
    { kind: "object" }
  );
  assert.equal(
    rules.resolveHealUseMode({
      actorIsOwner: true,
      isGM: false
    }),
    "owner-roll"
  );
  assert.equal(
    rules.resolveHealUseMode({
      actorIsOwner: false,
      isGM: true
    }),
    "owner-roll"
  );
  assert.equal(
    rules.resolveHealUseMode({
      actorIsOwner: false,
      isGM: false
    }),
    "manual-roll"
  );

  assert.deepEqual(
    rules.resolveManualHealNextValue({
      current: 7,
      max: 10,
      rollTotal: 5
    }),
    {
      current: 7,
      max: 10,
      heal: 5,
      next: 10
    }
  );

  assert.deepEqual(
    rules.resolveManualHealNextValue({
      current: 7,
      max: 0,
      rollTotal: 5
    }),
    {
      current: 7,
      max: 0,
      heal: 5,
      next: 12
    }
  );

  assert.equal(rules.isObjectUseEnabled(true), true);
  assert.equal(rules.isObjectUseEnabled(false), false);

  assert.deepEqual(
    rules.buildHealAudioReference({
      id: "item-1",
      type: "soin",
      name: "Kit",
      system: { audioFile: "heal.mp3" }
    }),
    {
      id: "item-1",
      type: "soin",
      name: "Kit",
      system: { audioFile: "heal.mp3" }
    }
  );
}

run()
  .then(() => {
    console.log("item-use-flow.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
