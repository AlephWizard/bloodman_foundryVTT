import assert from "node:assert/strict";
import fs from "node:fs";
import {
  computeActorStructureMigrationData,
  normalizeMigrationRunOptions
} from "../../src/migrations/index.mjs";

function loadFixture(name) {
  const fixtureUrl = new URL(`../fixtures/migrations/${name}`, import.meta.url);
  return JSON.parse(fs.readFileSync(fixtureUrl, "utf8"));
}

function run() {
  const legacyActor = loadFixture("actor-legacy-structure.json");
  const migrationUpdate = computeActorStructureMigrationData(legacyActor);
  assert.deepEqual(migrationUpdate, {
    "system.npcRole": "",
    "system.profile.quickNotes": "",
    "system.equipment.monnaies": "Couronnes",
    "system.equipment.monnaiesActuel": 0,
    "system.equipment.bagSlotsEnabled": true,
    "system.equipment.transportNpcs": ["Actor.abc", "Actor.xyz"],
    "system.characteristics.PHY.xp": [true, false, false],
    "system.characteristics.ESP.xp": [false, false, false]
  });

  const alreadyNormalized = {
    type: "personnage",
    system: {
      npcRole: "",
      profile: { quickNotes: "RAS" },
      equipment: {
        monnaies: "Couronnes",
        monnaiesActuel: 12.5,
        bagSlotsEnabled: false,
        transportNpcs: []
      },
      characteristics: {
        PHY: { xp: [false, true, false] }
      }
    }
  };
  assert.equal(computeActorStructureMigrationData(alreadyNormalized), null);

  const legacyBooleanXpAndTransport = {
    type: "personnage",
    system: {
      npcRole: "",
      profile: { quickNotes: "RAS" },
      equipment: {
        monnaies: "Couronnes",
        monnaiesActuel: 12.5,
        bagSlotsEnabled: false,
        transportNpcs: [" Actor.abc ", 123, { bad: true }, "Actor.xyz", ""]
      },
      characteristics: {
        PHY: { xp: ["false", "off", "1"] }
      }
    }
  };
  assert.deepEqual(computeActorStructureMigrationData(legacyBooleanXpAndTransport), {
    "system.equipment.transportNpcs": ["Actor.abc", "Actor.xyz"],
    "system.characteristics.PHY.xp": [false, false, true]
  });

  assert.deepEqual(
    normalizeMigrationRunOptions({ includeCompendiums: true }, { includeCompendiums: false }),
    { includeCompendiums: true }
  );
  assert.deepEqual(
    normalizeMigrationRunOptions({}, { includeCompendiums: true }),
    { includeCompendiums: true }
  );
  assert.deepEqual(
    normalizeMigrationRunOptions({ includeCompendiums: "yes" }, { includeCompendiums: false }),
    { includeCompendiums: false }
  );
}

run();
console.log("migrations-actor-structure.test.mjs: OK");
