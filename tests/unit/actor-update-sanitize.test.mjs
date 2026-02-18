import assert from "node:assert/strict";
import { buildActorUpdateSanitizer } from "../../src/hooks/actor-update-sanitize.mjs";

function run() {
  const calls = [];
  const sanitizer = buildActorUpdateSanitizer({
    deepClone: data => ({ ...(data || {}), nested: { ...((data || {}).nested || {}) } }),
    planActorUpdateRestrictionByRole: ({
      updaterRole,
      allowCharacteristicBase,
      allowVitalResourceUpdate,
      allowAmmoUpdate
    }) => {
      assert.equal(updaterRole, 1);
      assert.equal(allowCharacteristicBase, false);
      assert.equal(allowVitalResourceUpdate, false);
      assert.equal(allowAmmoUpdate, false);
      return {
        stripCharacteristicBase: true,
        stripVitalResources: true,
        stripStateModifiers: true,
        stripActorTokenImages: true,
        stripAmmoUpdates: true
      };
    },
    isBasicPlayerRole: role => role === 1,
    isAssistantOrHigherRole: role => role >= 2,
    stripUnauthorizedCharacteristicBaseUpdates: data => {
      calls.push("strip:characteristics");
      data.characteristicsStripped = true;
    },
    stripUpdatePaths: (_data, paths) => {
      calls.push(`strip:${String(paths?.[0] || "")}`);
    },
    vitalResourcePathList: ["system.resources.pv.current", "system.resources.pp.current"],
    stateModifierPaths: ["system.modifiers"],
    actorTokenImageUpdatePaths: ["prototypeToken.texture.src"],
    ammoUpdatePaths: ["system.ammo"],
    normalizeActorAmmoUpdateData: (actor, data) => {
      calls.push(`normalize-ammo:${String(actor?.id || "")}`);
      data.ammoNormalized = true;
    },
    normalizeCharacteristicXpUpdates: (data, actor) => {
      calls.push(`normalize-xp:${String(actor?.id || "")}`);
      data.xpNormalized = true;
    },
    normalizeCharacteristicBaseUpdatesForRole: (data, role) => {
      calls.push(`normalize-base:${String(role)}`);
      data.baseNormalized = true;
    }
  });

  const sourceUpdateData = { foo: 1, nested: { value: 2 } };
  const actor = { id: "a1" };
  const sanitized = sanitizer.sanitizeActorUpdateForRole(sourceUpdateData, 1, {
    actor,
    allowCharacteristicBase: false,
    allowVitalResourceUpdate: false,
    allowAmmoUpdate: false
  });
  assert.notEqual(sanitized, sourceUpdateData);
  assert.deepEqual(calls, [
    "strip:characteristics",
    "strip:system.resources.pv.current",
    "strip:system.modifiers",
    "strip:prototypeToken.texture.src",
    "strip:system.ammo",
    "normalize-ammo:a1",
    "normalize-xp:a1",
    "normalize-base:1"
  ]);
  assert.equal(sanitized.characteristicsStripped, true);
  assert.equal(sanitized.ammoNormalized, true);
  assert.equal(sanitized.xpNormalized, true);
  assert.equal(sanitized.baseNormalized, true);
  assert.equal(sourceUpdateData.characteristicsStripped, undefined);

  const callsNoBase = [];
  const sanitizerNoBase = buildActorUpdateSanitizer({
    deepClone: data => ({ ...(data || {}) }),
    planActorUpdateRestrictionByRole: () => buildDefaultTruePlan(),
    stripUnauthorizedCharacteristicBaseUpdates: () => callsNoBase.push("strip-characteristics"),
    stripUpdatePaths: () => callsNoBase.push("strip-paths"),
    normalizeActorAmmoUpdateData: () => callsNoBase.push("normalize-ammo"),
    normalizeCharacteristicXpUpdates: () => callsNoBase.push("normalize-xp"),
    normalizeCharacteristicBaseUpdatesForRole: () => callsNoBase.push("normalize-base"),
    vitalResourcePathList: ["a"],
    stateModifierPaths: ["b"],
    actorTokenImageUpdatePaths: ["c"],
    ammoUpdatePaths: ["d"]
  });
  sanitizerNoBase.sanitizeActorUpdateForRole({}, 3, {
    enforceCharacteristicBaseRange: false
  });
  assert.deepEqual(callsNoBase, [
    "strip-characteristics",
    "strip-paths",
    "strip-paths",
    "strip-paths",
    "strip-paths",
    "normalize-ammo",
    "normalize-xp"
  ]);

  const callsFallback = [];
  const sanitizerFallback = buildActorUpdateSanitizer({
    deepClone: data => ({ ...(data || {}) }),
    stripUnauthorizedCharacteristicBaseUpdates: () => callsFallback.push("strip-characteristics"),
    stripUpdatePaths: () => callsFallback.push("strip-paths"),
    normalizeActorAmmoUpdateData: () => callsFallback.push("normalize-ammo"),
    normalizeCharacteristicXpUpdates: () => callsFallback.push("normalize-xp"),
    normalizeCharacteristicBaseUpdatesForRole: () => callsFallback.push("normalize-base")
  });
  sanitizerFallback.sanitizeActorUpdateForRole({}, 1, {});
  assert.deepEqual(callsFallback, ["normalize-ammo", "normalize-xp", "normalize-base"]);
}

function buildDefaultTruePlan() {
  return {
    stripCharacteristicBase: true,
    stripVitalResources: true,
    stripStateModifiers: true,
    stripActorTokenImages: true,
    stripAmmoUpdates: true
  };
}

run();
console.log("actor-update-sanitize.test.mjs: OK");
