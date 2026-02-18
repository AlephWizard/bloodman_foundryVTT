import assert from "node:assert/strict";
import {
  toFiniteNumber,
  normalizeCharacteristicKey,
  normalizeArchetypeBonusValue,
  computeArchetypeCharacteristicBonus,
  computeDerivedPvMax,
  computeItemCharacteristicBonusTotals,
  computeNormalizedMoveGauge,
  computeItemResourceBonusTotals,
  computeItemResourceBonusUpdateData,
  computeResourceCharacteristicEffectiveScores,
  computeDerivedResourceSyncUpdateData,
  computeUpdateActorDerivedResourceUpdateData
} from "../../src/rules/derived-resources.mjs";

function run() {
  assert.equal(toFiniteNumber("12.4", 0), 12.4);
  assert.equal(toFiniteNumber("x", 7), 7);

  const keys = new Set(["PHY", "ESP", "MOU"]);
  assert.equal(normalizeCharacteristicKey(" phy ", keys), "PHY");
  assert.equal(normalizeCharacteristicKey("FOR", keys), "");

  assert.equal(normalizeArchetypeBonusValue("3.9", 0), 3);
  assert.equal(normalizeArchetypeBonusValue("", 6.8), 6);
  assert.equal(Number.isNaN(normalizeArchetypeBonusValue("abc", 0)), true);
  assert.equal(
    computeArchetypeCharacteristicBonus({
      profile: { archetypeBonusCharacteristic: "esp", archetypeBonusValue: "4" },
      characteristicKey: "ESP",
      characteristicKeys: keys
    }),
    4
  );
  assert.equal(
    computeArchetypeCharacteristicBonus({
      profile: { archetypeBonusCharacteristic: "PHY", archetypeBonusValue: 4 },
      characteristicKey: "ESP",
      characteristicKeys: keys
    }),
    0
  );

  assert.equal(
    computeDerivedPvMax({
      actorType: "personnage",
      phyEffective: 27
    }),
    5
  );
  assert.equal(
    computeDerivedPvMax({
      actorType: "personnage-non-joueur",
      npcRole: "sbire",
      phyEffective: 27
    }),
    3
  );
  assert.equal(
    computeDerivedPvMax({
      actorType: "personnage-non-joueur",
      npcRole: "boss-seul",
      phyEffective: 27,
      playerCount: 4
    }),
    20
  );

  const characteristics = [{ key: "PHY" }, { key: "ESP" }, { key: "MOU" }];
  const types = new Set(["arme", "armure"]);
  const totals = computeItemCharacteristicBonusTotals({
    items: [
      {
        type: "arme",
        system: {
          characteristicBonusEnabled: true,
          characteristicBonuses: { PHY: 2, ESP: 1 }
        }
      },
      {
        type: "armure",
        system: {
          characteristicBonusEnabled: "on",
          characteristicBonuses: { PHY: 1, MOU: -1 }
        }
      },
      {
        type: "consommable",
        system: {
          characteristicBonusEnabled: true,
          characteristicBonuses: { PHY: 50 }
        }
      }
    ],
    characteristics,
    characteristicBonusItemTypes: types,
    isBonusEnabled: value => value === true || value === "on"
  });
  assert.deepEqual(totals, { PHY: 3, ESP: 1, MOU: -1 });

  assert.deepEqual(
    computeNormalizedMoveGauge({
      max: 6.8,
      hasStoredMax: false,
      storedValue: NaN,
      initializeWhenMissing: true
    }),
    { max: 6, value: 6, hasStoredMax: false }
  );
  assert.deepEqual(
    computeNormalizedMoveGauge({
      max: 7,
      hasStoredMax: true,
      storedValue: 12,
      initializeWhenMissing: false
    }),
    { max: 7, value: 7, hasStoredMax: true }
  );
  assert.deepEqual(
    computeNormalizedMoveGauge({
      max: 5,
      hasStoredMax: true,
      storedValue: -3,
      initializeWhenMissing: false
    }),
    { max: 5, value: 0, hasStoredMax: true }
  );

  const resourceTotals = computeItemResourceBonusTotals({
    items: [
      {
        type: "aptitude",
        system: { rawBonusEnabled: true, rawBonuses: { pv: 2, pp: 1 } }
      },
      {
        type: "pouvoir",
        system: { rawBonusEnabled: true, rawBonuses: { pv: -1, pp: 3 } }
      },
      {
        type: "objet",
        system: { rawBonusEnabled: true, rawBonuses: { pv: 999, pp: 999 } }
      }
    ],
    resourceBonusItemTypes: new Set(["aptitude", "pouvoir"])
  });
  assert.deepEqual(resourceTotals, { pv: 1, pp: 4 });

  assert.deepEqual(
    computeItemResourceBonusUpdateData({
      totals: { pv: 3, pp: 0 },
      currentPv: 12,
      currentPp: 5,
      currentPvMax: 10,
      currentPpMax: 8,
      storedPv: 1,
      storedPp: 2
    }),
    {
      "system.resources.pv.max": 12,
      "system.resources.pv.current": 12,
      "system.resources.pp.max": 6,
      "system.resources.pp.current": 5,
      "system.resources.pv.itemBonus": 3,
      "system.resources.pp.itemBonus": 0
    }
  );

  assert.deepEqual(
    computeResourceCharacteristicEffectiveScores({
      phyBase: 10,
      espBase: 15,
      phyItemBonus: 2,
      espItemBonus: -1,
      archetypeBonusCharacteristic: "ESP",
      archetypeBonusValue: 3
    }),
    { phyEffective: 12, espEffective: 17 }
  );

  assert.deepEqual(
    computeDerivedResourceSyncUpdateData({
      derivedPvMax: 11,
      espEffective: 24,
      storedPvBonus: 1,
      storedPpBonus: -2,
      currentPvMax: 20,
      currentPpMax: 5,
      currentPv: 30,
      currentPp: 8,
      clampMaxToZero: true
    }).updates,
    {
      "system.resources.pv.max": 12,
      "system.resources.pp.max": 3,
      "system.resources.pv.current": 12,
      "system.resources.pp.current": 3
    }
  );

  assert.deepEqual(
    computeUpdateActorDerivedResourceUpdateData({
      derivedPvMax: 11,
      espEffective: 24,
      storedPvBonus: 1,
      storedPpBonus: -2,
      currentPvMax: 20,
      currentPpMax: 5,
      currentPv: 30,
      currentPp: 8,
      pvMaxChange: false,
      ppMaxChange: true
    }).updates,
    {
      "system.resources.pv.max": 12,
      "system.resources.pv.current": 20,
      "system.resources.pp.current": 5
    }
  );
}

run();
console.log("derived-resources.test.mjs: OK");
