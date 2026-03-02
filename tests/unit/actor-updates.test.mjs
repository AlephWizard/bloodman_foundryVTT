import assert from "node:assert/strict";
import {
  createUpdateDataAccessors,
  planActorUpdateRestrictionByRole,
  planPreUpdateActorImagePropagation,
  normalizeVitalPathRawValue,
  clampVitalCurrentFromRawValue,
  VOYAGE_RESOURCE_PATHS,
  normalizeVoyageResourceValues,
  planPreUpdateVoyageResourceChange,
  planPreUpdateVoyageResourcePatch,
  normalizeArchetypeProfileUpdate,
  getArchetypeProfileNormalizationErrorNotificationKey,
  planArchetypeProfilePreUpdate,
  computePreUpdateActorDerivedVitals,
  planPreUpdateActorDerivedVitalPatch,
  computeAllowedVitalBounds,
  planPreUpdateVitalResourcePatch,
  computePreUpdateVitalNormalization,
  planStateModifierLabelUpdate
} from "../../src/rules/actor-updates.mjs";
import {
  normalizeArchetypeBonusValue,
  normalizeCharacteristicKey
} from "../../src/rules/derived-resources.mjs";

function run() {
  const characteristicKeys = new Set(["PHY", "ESP", "MOU"]);
  const toFinite = (value, fallback = 0) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
  };
  const getProperty = (object, path) => {
    return String(path || "")
      .split(".")
      .reduce((current, key) => (current == null ? undefined : current[key]), object);
  };
  const updateAccessors = createUpdateDataAccessors({
    updateData: {
      "system.resources.pv.max": "14",
      system: {
        resources: {
          pv: { current: "9" },
          pp: { current: null }
        }
      }
    },
    getProperty,
    toFiniteNumber: toFinite
  });
  assert.equal(updateAccessors.hasUpdatePath("system.resources.pv.max"), true);
  assert.equal(updateAccessors.hasUpdatePath("system.resources.pv.current"), true);
  assert.equal(updateAccessors.hasUpdatePath("system.resources.pp.current"), true);
  assert.equal(updateAccessors.hasUpdatePath("system.resources.pp.max"), false);
  assert.equal(updateAccessors.getUpdatedRawValue("system.resources.pv.max", 0), "14");
  assert.equal(updateAccessors.getUpdatedRawValue("system.resources.pv.current", 0), "9");
  assert.equal(updateAccessors.getUpdatedRawValue("system.resources.pp.current", 4), 4);
  assert.equal(updateAccessors.getUpdatedNumber("system.resources.pv.max", 0), 14);
  assert.equal(updateAccessors.getUpdatedNumber("system.resources.pv.current", 0), 9);
  assert.equal(updateAccessors.getUpdatedNumber("system.resources.pp.current", 4), 4);
  assert.equal(updateAccessors.getUpdatedNumber("system.resources.pp.max", 6), 6);
  assert.deepEqual(
    planActorUpdateRestrictionByRole({
      updaterRole: 1,
      allowCharacteristicBase: false,
      allowVitalResourceUpdate: false,
      allowAmmoUpdate: false,
      isBasicPlayerRole: role => role === 1,
      isAssistantOrHigherRole: role => role >= 2
    }),
    {
      stripCharacteristicBase: true,
      stripVitalResources: true,
      stripStateModifiers: true,
      stripActorTokenImages: true,
      stripAmmoUpdates: true
    }
  );
  assert.deepEqual(
    planActorUpdateRestrictionByRole({
      updaterRole: 1,
      allowCharacteristicBase: true,
      allowVitalResourceUpdate: true,
      allowAmmoUpdate: true,
      isBasicPlayerRole: role => role === 1,
      isAssistantOrHigherRole: role => role >= 2
    }),
    {
      stripCharacteristicBase: false,
      stripVitalResources: false,
      stripStateModifiers: true,
      stripActorTokenImages: true,
      stripAmmoUpdates: false
    }
  );
  assert.deepEqual(
    planActorUpdateRestrictionByRole({
      updaterRole: 3,
      allowCharacteristicBase: false,
      allowVitalResourceUpdate: false,
      allowAmmoUpdate: false,
      isBasicPlayerRole: role => role === 1,
      isAssistantOrHigherRole: role => role >= 2
    }),
    {
      stripCharacteristicBase: false,
      stripVitalResources: false,
      stripStateModifiers: false,
      stripActorTokenImages: false,
      stripAmmoUpdates: false
    }
  );
  assert.deepEqual(
    planPreUpdateActorImagePropagation({
      rawNextActorImage: null,
      updaterIsAssistantOrHigher: true,
      actorImage: "actor.webp",
      actorPrototypeImage: "token.webp"
    }),
    {
      kind: "skip",
      trackPreviousImages: false,
      applyPrototypeAndTokenImages: false
    }
  );
  assert.deepEqual(
    planPreUpdateActorImagePropagation({
      rawNextActorImage: "new.webp",
      updaterIsAssistantOrHigher: false,
      actorImage: " actor.webp ",
      actorPrototypeImage: " token.webp "
    }),
    {
      kind: "track",
      trackPreviousImages: true,
      previousActorImage: "actor.webp",
      previousPrototypeImage: "token.webp",
      applyPrototypeAndTokenImages: false,
      nextActorImage: "new.webp"
    }
  );
  assert.deepEqual(
    planPreUpdateActorImagePropagation({
      rawNextActorImage: "   ",
      updaterIsAssistantOrHigher: true,
      actorImage: "",
      actorPrototypeImage: ""
    }),
    {
      kind: "apply",
      trackPreviousImages: true,
      previousActorImage: "",
      previousPrototypeImage: "",
      applyPrototypeAndTokenImages: true,
      nextActorImage: "icons/svg/mystery-man.svg"
    }
  );

  assert.equal(normalizeVitalPathRawValue(null, 8), 8);
  assert.equal(normalizeVitalPathRawValue("", 6), 6);
  assert.equal(normalizeVitalPathRawValue("  ", 4), 4);
  assert.equal(normalizeVitalPathRawValue("7.9", 0), 7);
  assert.equal(normalizeVitalPathRawValue("-2", 0), 0);

  assert.equal(clampVitalCurrentFromRawValue("12", 0, 9), 9);
  assert.equal(clampVitalCurrentFromRawValue("5", 0, 9), 5);
  assert.equal(clampVitalCurrentFromRawValue("", 6, 5), 5);
  assert.equal(clampVitalCurrentFromRawValue(null, 3, 10), 3);
  assert.deepEqual(
    planStateModifierLabelUpdate({
      hasStateLabelUpdate: false,
      rawLabel: "fatigue"
    }),
    { kind: "skip" }
  );
  assert.deepEqual(
    planStateModifierLabelUpdate({
      hasStateLabelUpdate: true,
      rawLabel: "  fatigue  ",
      currentLabel: "fatigue"
    }),
    { kind: "unchanged" }
  );
  assert.deepEqual(
    planStateModifierLabelUpdate({
      hasStateLabelUpdate: true,
      rawLabel: "invalid state",
      currentLabel: "",
      buildStateModifierUpdate: () => ({ ok: false, invalidTokens: ["invalid state"] })
    }),
    { kind: "invalid", invalidTokens: ["invalid state"] }
  );
  assert.deepEqual(
    planStateModifierLabelUpdate({
      hasStateLabelUpdate: true,
      rawLabel: "epuise",
      currentLabel: "",
      buildStateModifierUpdate: () => ({ ok: true, label: "epuise", totals: { all: -5 } })
    }),
    { kind: "apply", label: "epuise", totals: { all: -5 } }
  );
  assert.deepEqual(
    computePreUpdateVitalNormalization({
      hasPvMaxUpdate: true,
      hasPpMaxUpdate: true,
      rawPvMax: " ",
      rawPpMax: "4.6",
      fallbackPvMax: 7,
      fallbackPpMax: 2
    }),
    { pvMax: 7, ppMax: 4 }
  );
  assert.deepEqual(
    computePreUpdateVitalNormalization({
      hasPvCurrentUpdate: true,
      hasPpCurrentUpdate: true,
      rawPvCurrent: "12",
      rawPpCurrent: "-1",
      fallbackPvCurrent: 0,
      fallbackPpCurrent: 3,
      allowedPvMax: 9,
      allowedPpMax: 5
    }),
    { pvCurrent: 9, ppCurrent: 0 }
  );
  assert.deepEqual(computePreUpdateVitalNormalization({}), {});
  assert.deepEqual(
    planPreUpdateVitalResourcePatch({
      hasPvMaxUpdate: true,
      hasPpMaxUpdate: true,
      hasPvCurrentUpdate: true,
      hasPpCurrentUpdate: true,
      rawPvMax: "11",
      rawPpMax: "4",
      rawPvCurrent: "12",
      rawPpCurrent: "9",
      fallbackPvMax: 6,
      fallbackPpMax: 3,
      fallbackPvCurrent: 1,
      fallbackPpCurrent: 1,
      storedPvMax: 6,
      storedPpMax: 3,
      derivedPvMax: 8,
      derivedPpMax: 5
    }),
    {
      normalizedVitalMaxValues: { pvMax: 11, ppMax: 4 },
      normalizedVitalCurrentValues: { pvCurrent: 11, ppCurrent: 4 }
    }
  );
  assert.deepEqual(
    planPreUpdateVitalResourcePatch({
      hasPvMaxUpdate: false,
      hasPpMaxUpdate: false,
      hasPvCurrentUpdate: true,
      hasPpCurrentUpdate: true,
      rawPvCurrent: "7",
      rawPpCurrent: "6",
      fallbackPvCurrent: 0,
      fallbackPpCurrent: 0,
      storedPvMax: Number.NaN,
      storedPpMax: undefined,
      derivedPvMax: 5,
      derivedPpMax: 4
    }),
    {
      normalizedVitalMaxValues: {},
      normalizedVitalCurrentValues: { pvCurrent: 5, ppCurrent: 4 }
    }
  );

  assert.deepEqual(
    normalizeVoyageResourceValues({
      actorVoyageCurrent: 2,
      actorVoyageTotal: 5,
      requestedCurrent: 8,
      requestedTotal: 6
    }),
    { normalizedCurrent: 6, normalizedTotal: 6 }
  );
  assert.deepEqual(
    normalizeVoyageResourceValues({
      actorVoyageCurrent: 4,
      actorVoyageTotal: 7,
      requestedCurrent: null,
      requestedTotal: ""
    }),
    { normalizedCurrent: 0, normalizedTotal: 0 }
  );
  assert.deepEqual(
    planPreUpdateVoyageResourceChange({
      actorType: "personnage",
      hasVoyageCurrentUpdate: true,
      hasVoyageMaxUpdate: true,
      actorVoyageCurrent: 2,
      actorVoyageTotal: 5,
      requestedCurrent: 8,
      requestedTotal: 6
    }),
    { kind: "apply", normalizedCurrent: 6, normalizedTotal: 6 }
  );
  assert.deepEqual(
    planPreUpdateVoyageResourceChange({
      actorType: "personnage",
      hasVoyageRootUpdate: true
    }),
    { kind: "skip" }
  );
  assert.deepEqual(
    planPreUpdateVoyageResourceChange({
      actorType: "personnage-non-joueur",
      hasVoyageRootUpdate: true
    }),
    {
      kind: "remove",
      pathsToStrip: [
        "system.resources.voyage",
        "system.resources.voyage.current",
        "system.resources.voyage.total",
        "system.resources.voyage.max"
      ],
      removePath: "system.resources.-=voyage"
    }
  );
  assert.deepEqual(
    planPreUpdateVoyageResourceChange({
      actorType: "personnage-non-joueur",
      hasVoyageCurrentUpdate: true
    }),
    {
      kind: "remove",
      pathsToStrip: [
        "system.resources.voyage",
        "system.resources.voyage.current",
        "system.resources.voyage.total",
        "system.resources.voyage.max"
      ],
      removePath: "system.resources.-=voyage"
    }
  );
  assert.deepEqual(
    planPreUpdateVoyageResourceChange({
      actorType: "personnage-non-joueur"
    }),
    { kind: "skip" }
  );
  assert.deepEqual(
    planPreUpdateVoyageResourcePatch({
      actorType: "personnage",
      hasUpdatePath: path => path === VOYAGE_RESOURCE_PATHS.current || path === VOYAGE_RESOURCE_PATHS.max,
      getUpdatedNumber: (path, fallback) => {
        if (path === VOYAGE_RESOURCE_PATHS.current) return 8;
        if (path === VOYAGE_RESOURCE_PATHS.max) return 6;
        return fallback;
      },
      actorVoyageCurrent: 2,
      actorVoyageTotal: 5
    }),
    { kind: "apply", normalizedCurrent: 6, normalizedTotal: 6 }
  );
  assert.deepEqual(
    planPreUpdateVoyageResourcePatch({
      actorType: "personnage-non-joueur",
      hasUpdatePath: path => path === VOYAGE_RESOURCE_PATHS.root,
      getUpdatedNumber: (_path, fallback) => fallback,
      actorVoyageCurrent: 2,
      actorVoyageTotal: 5
    }),
    {
      kind: "remove",
      pathsToStrip: [
        "system.resources.voyage",
        "system.resources.voyage.current",
        "system.resources.voyage.total",
        "system.resources.voyage.max"
      ],
      removePath: "system.resources.-=voyage"
    }
  );
  assert.deepEqual(
    planPreUpdateVoyageResourcePatch({
      actorType: "personnage",
      hasUpdatePath: () => false,
      getUpdatedNumber: (_path, fallback) => fallback,
      actorVoyageCurrent: 2,
      actorVoyageTotal: 5
    }),
    { kind: "skip" }
  );

  assert.deepEqual(
    normalizeArchetypeProfileUpdate({
      currentProfile: { archetypeBonusValue: 0, archetypeBonusCharacteristic: "" },
      rawBonusValue: "3",
      rawBonusCharacteristic: "esp",
      normalizeBonusValue: normalizeArchetypeBonusValue,
      normalizeCharacteristicKey: value => normalizeCharacteristicKey(value, characteristicKeys)
    }),
    { ok: true, normalizedBonusValue: 3, normalizedBonusCharacteristic: "ESP" }
  );
  assert.deepEqual(
    normalizeArchetypeProfileUpdate({
      currentProfile: { archetypeBonusValue: 1, archetypeBonusCharacteristic: "PHY" },
      rawBonusValue: "abc",
      rawBonusCharacteristic: "PHY",
      normalizeBonusValue: normalizeArchetypeBonusValue,
      normalizeCharacteristicKey: value => normalizeCharacteristicKey(value, characteristicKeys)
    }),
    { ok: false, errorCode: "invalid-number" }
  );
  assert.deepEqual(
    normalizeArchetypeProfileUpdate({
      currentProfile: { archetypeBonusValue: 0, archetypeBonusCharacteristic: "" },
      rawBonusValue: "1",
      rawBonusCharacteristic: "FOR",
      normalizeBonusValue: normalizeArchetypeBonusValue,
      normalizeCharacteristicKey: value => normalizeCharacteristicKey(value, characteristicKeys)
    }),
    { ok: false, errorCode: "invalid-characteristic" }
  );
  assert.deepEqual(
    normalizeArchetypeProfileUpdate({
      currentProfile: { archetypeBonusValue: 0, archetypeBonusCharacteristic: "" },
      rawBonusValue: "2",
      rawBonusCharacteristic: "",
      normalizeBonusValue: normalizeArchetypeBonusValue,
      normalizeCharacteristicKey: value => normalizeCharacteristicKey(value, characteristicKeys)
    }),
    { ok: false, errorCode: "characteristic-required" }
  );
  assert.deepEqual(
    planArchetypeProfilePreUpdate({
      hasArchetypeBonusValueUpdate: false,
      hasArchetypeBonusCharacteristicUpdate: false
    }),
    { kind: "skip" }
  );
  assert.deepEqual(
    planArchetypeProfilePreUpdate({
      hasArchetypeBonusValueUpdate: true,
      currentProfile: { archetypeBonusValue: 0, archetypeBonusCharacteristic: "" },
      rawBonusValue: "2",
      rawBonusCharacteristic: "",
      normalizeBonusValue: normalizeArchetypeBonusValue,
      normalizeCharacteristicKey: value => normalizeCharacteristicKey(value, characteristicKeys)
    }),
    { kind: "invalid", errorCode: "characteristic-required" }
  );
  assert.deepEqual(
    planArchetypeProfilePreUpdate({
      hasArchetypeBonusCharacteristicUpdate: true,
      currentProfile: { archetypeBonusValue: 0, archetypeBonusCharacteristic: "" },
      rawBonusValue: "1",
      rawBonusCharacteristic: "esp",
      normalizeBonusValue: normalizeArchetypeBonusValue,
      normalizeCharacteristicKey: value => normalizeCharacteristicKey(value, characteristicKeys)
    }),
    { kind: "apply", normalizedBonusValue: 1, normalizedBonusCharacteristic: "ESP" }
  );
  assert.equal(
    getArchetypeProfileNormalizationErrorNotificationKey("invalid-number"),
    "BLOODMAN.Notifications.InvalidArchetypeBonusNumber"
  );
  assert.equal(
    getArchetypeProfileNormalizationErrorNotificationKey("invalid-characteristic"),
    "BLOODMAN.Notifications.InvalidArchetypeBonusCharacteristic"
  );
  assert.equal(
    getArchetypeProfileNormalizationErrorNotificationKey("characteristic-required"),
    "BLOODMAN.Notifications.ArchetypeBonusCharacteristicRequired"
  );
  assert.equal(getArchetypeProfileNormalizationErrorNotificationKey("unknown"), null);

  assert.deepEqual(
    computePreUpdateActorDerivedVitals({
      phyBase: 10,
      espBase: 15,
      phyItemBonus: 2,
      espItemBonus: -1,
      archetypeBonusValue: 3,
      archetypeBonusCharacteristic: "ESP",
      storedPvBonus: 4,
      storedPpBonus: -2,
      roleOverride: "boss-seul",
      derivePvMax: (phyEffective, role) => {
        assert.equal(role, "boss-seul");
        return Math.round(phyEffective / 5) * 5;
      }
    }),
    {
      phyEffective: 12,
      espEffective: 17,
      pvMax: 14,
      ppMax: 1
    }
  );
  assert.deepEqual(
    planPreUpdateActorDerivedVitalPatch({
      phyBase: 10,
      espBase: 15,
      phyItemBonus: 2,
      espItemBonus: -1,
      archetypeBonusValue: 3,
      archetypeBonusCharacteristic: "ESP",
      storedPvBonus: 4,
      storedPpBonus: -2,
      roleOverride: "boss-seul",
      derivePvMax: (phyEffective, role) => {
        assert.equal(role, "boss-seul");
        return Math.round(phyEffective / 5) * 5;
      },
      hasPvMaxUpdate: false,
      hasPpMaxUpdate: false,
      hasPvCurrentUpdate: true,
      hasPpCurrentUpdate: true,
      rawPvCurrent: "20",
      rawPpCurrent: "7",
      fallbackPvCurrent: 0,
      fallbackPpCurrent: 0,
      storedPvMax: Number.NaN,
      storedPpMax: Number.NaN
    }),
    {
      phyEffective: 12,
      espEffective: 17,
      pvMax: 14,
      ppMax: 1,
      normalizedVitalMaxValues: {},
      normalizedVitalCurrentValues: {
        pvCurrent: 14,
        ppCurrent: 1
      }
    }
  );

  assert.deepEqual(
    computeAllowedVitalBounds({
      storedPvMax: 12,
      storedPpMax: 3,
      fallbackPvMax: 99,
      fallbackPpMax: 99
    }),
    { allowedPvMax: 12, allowedPpMax: 3 }
  );
  assert.deepEqual(
    computeAllowedVitalBounds({
      storedPvMax: Number.NaN,
      storedPpMax: undefined,
      fallbackPvMax: 8,
      fallbackPpMax: 5
    }),
    { allowedPvMax: 8, allowedPpMax: 5 }
  );
}

run();
console.log("actor-updates.test.mjs: OK");
