import assert from "node:assert/strict";
import { createDefaultDataBuilders } from "../../src/rules/default-data.mjs";

async function run() {
  const builders = createDefaultDataBuilders({
    characteristics: [{ key: "PHY" }, { key: "ESP" }, { key: "MOU" }]
  });

  const characteristics = builders.buildDefaultCharacteristics();
  assert.deepEqual(characteristics, {
    PHY: { base: 50, xp: [false, false, false] },
    ESP: { base: 50, xp: [false, false, false] },
    MOU: { base: 50, xp: [false, false, false] }
  });
  assert.notEqual(characteristics.PHY, characteristics.ESP);

  const modifiers = builders.buildDefaultModifiers();
  assert.deepEqual(modifiers, {
    label: "",
    all: 0,
    PHY: 0,
    ESP: 0,
    MOU: 0
  });

  assert.deepEqual(builders.buildDefaultResources(), {
    pv: { current: 0, max: 0, itemBonus: 0 },
    pp: { current: 0, max: 0, itemBonus: 0 },
    move: { value: 0, max: 0 },
    voyage: { current: 0, total: 0, max: 0 }
  });
  assert.deepEqual(builders.buildDefaultResources({ includeVoyage: false }), {
    pv: { current: 0, max: 0, itemBonus: 0 },
    pp: { current: 0, max: 0, itemBonus: 0 },
    move: { value: 0, max: 0 }
  });

  assert.deepEqual(builders.buildDefaultProfile(), {
    archetype: "",
    archetypeBonusValue: 0,
    archetypeBonusCharacteristic: "",
    vice: "",
    poids: "",
    taille: "",
    age: "",
    origine: "",
    historique: "",
    quickNotes: "",
    notes: "",
    aptitudes: "",
    pouvoirs: ""
  });

  assert.deepEqual(builders.buildDefaultEquipment(), {
    armes: "",
    protections: "",
    objets: "",
    monnaies: "",
    monnaiesActuel: 0,
    transports: "",
    transportNpcs: [],
    bagSlotsEnabled: false
  });
}

run()
  .then(() => {
    console.log("default-data.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
