import assert from "node:assert/strict";
import { buildActorPreUpdateHooks } from "../../src/hooks/actor-pre-update.mjs";

function getProperty(object, path) {
  return String(path || "")
    .split(".")
    .reduce((current, key) => (current == null ? undefined : current[key]), object);
}

function setProperty(object, path, value) {
  const parts = String(path || "").split(".");
  const last = parts.pop();
  let current = object;
  for (const key of parts) {
    if (current[key] == null || typeof current[key] !== "object") current[key] = {};
    current = current[key];
  }
  current[last] = value;
}

function withGlobals(fn) {
  const previousFoundry = globalThis.foundry;
  const previousGame = globalThis.game;
  const previousUi = globalThis.ui;

  const notificationErrors = [];
  globalThis.foundry = { utils: { getProperty, setProperty } };
  globalThis.game = {
    users: new Map([
      ["u1", { role: 1 }],
      ["u2", { role: 3 }]
    ]),
    user: { id: "u2", role: 3 }
  };
  globalThis.ui = {
    notifications: {
      error: message => notificationErrors.push(String(message || ""))
    }
  };

  try {
    fn({ notificationErrors });
  } finally {
    globalThis.foundry = previousFoundry;
    globalThis.game = previousGame;
    globalThis.ui = previousUi;
  }
}

function buildHooks(overrides = {}) {
  return buildActorPreUpdateHooks({
    toFiniteNumber: (value, fallback = 0) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
    },
    isAssistantOrHigherRole: role => Number(role) >= 2,
    isBasicPlayerRole: role => Number(role) === 1,
    planActorUpdateRestrictionByRole: () => ({
      stripCharacteristicBase: false,
      stripVitalResources: false,
      stripStateModifiers: false,
      stripActorTokenImages: false,
      stripAmmoUpdates: false
    }),
    applyActorUpdateRestrictionPlan: () => {},
    stripUpdatePaths: () => false,
    normalizeCharacteristicXpUpdates: () => {},
    normalizeActorAmmoUpdateData: () => {},
    normalizeActorEquipmentCurrencyUpdateData: () => ({ invalid: false }),
    buildInvalidCurrencyCurrentMessage: () => "invalid-currency",
    normalizeCharacteristicBaseUpdatesForRole: () => {},
    buildInvalidStatePresetMessage: tokens => `invalid-state:${tokens.join(",")}`,
    buildStateModifierUpdateFromLabel: () => ({ ok: true, label: "", totals: {} }),
    applyStateModifierUpdateToData: () => {},
    getItemBonusTotals: () => ({ PHY: 0, ESP: 0 }),
    normalizeArchetypeBonusValue: value => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? Math.trunc(numeric) : Number.NaN;
    },
    normalizeCharacteristicKey: value => {
      const key = String(value || "").trim().toUpperCase();
      return key === "PHY" || key === "ESP" ? key : "";
    },
    getDerivedPvMax: (_actor, phyEffective) => Math.round(Number(phyEffective) / 5),
    t: key => key,
    ...overrides
  });
}

function buildActor(type = "personnage") {
  return {
    type,
    img: "actor.webp",
    system: {
      profile: { archetypeBonusValue: 0, archetypeBonusCharacteristic: "" },
      modifiers: { label: "" },
      characteristics: { PHY: { base: 10 }, ESP: { base: 10 } },
      resources: {
        pv: { itemBonus: 0, max: 5, current: 5 },
        pp: { itemBonus: 0, max: 5, current: 5 },
        voyage: { current: 2, total: 5, max: 5 }
      }
    },
    prototypeToken: { texture: { src: "token.webp" } }
  };
}

function run() {
  withGlobals(({ notificationErrors }) => {
    const hooks = buildHooks();
    assert.equal(hooks.onPreUpdateActor(buildActor("vehicle"), {}, {}, "u2"), undefined);
    assert.deepEqual(notificationErrors, []);
  });

  withGlobals(({ notificationErrors }) => {
    const appliedPlans = [];
    const hooks = buildHooks({
      planActorUpdateRestrictionByRole: ({ updaterRole }) => ({
        stripCharacteristicBase: Number(updaterRole) === 1,
        stripVitalResources: false,
        stripStateModifiers: true,
        stripActorTokenImages: false,
        stripAmmoUpdates: false
      }),
      applyActorUpdateRestrictionPlan: (_updateData, plan) => appliedPlans.push(plan)
    });
    hooks.onPreUpdateActor(buildActor("personnage"), {}, {}, "u1");
    assert.equal(appliedPlans.length, 1);
    assert.deepEqual(appliedPlans[0], {
      stripCharacteristicBase: true,
      stripVitalResources: false,
      stripStateModifiers: true,
      stripActorTokenImages: false,
      stripAmmoUpdates: false
    });
    assert.deepEqual(notificationErrors, []);
  });

  withGlobals(({ notificationErrors }) => {
    const hooks = buildHooks({
      normalizeActorEquipmentCurrencyUpdateData: () => ({ invalid: true, message: "currency-error" })
    });
    const result = hooks.onPreUpdateActor(buildActor("personnage"), {}, {}, "u2");
    assert.equal(result, false);
    assert.deepEqual(notificationErrors, ["currency-error"]);
  });

  withGlobals(({ notificationErrors }) => {
    const hooks = buildHooks({
      buildStateModifierUpdateFromLabel: () => ({ ok: false, invalidTokens: ["oops"] })
    });
    const updateData = { system: { modifiers: { label: "oops" } } };
    const result = hooks.onPreUpdateActor(buildActor("personnage"), updateData, {}, "u2");
    assert.equal(result, false);
    assert.deepEqual(notificationErrors, ["invalid-state:oops"]);
  });

  withGlobals(({ notificationErrors }) => {
    const trackingOptions = {};
    const updateData = { img: "new-actor.webp" };
    const hooks = buildHooks();
    hooks.onPreUpdateActor(buildActor("personnage"), updateData, trackingOptions, "u2");
    assert.equal(trackingOptions.bloodmanPreviousActorImage, "actor.webp");
    assert.equal(trackingOptions.bloodmanPreviousPrototypeImage, "token.webp");
    assert.equal(getProperty(updateData, "prototypeToken.texture.src"), "new-actor.webp");
    assert.equal(getProperty(updateData, "prototypeToken.img"), "new-actor.webp");
    assert.equal(getProperty(updateData, "token.img"), "new-actor.webp");
    assert.deepEqual(notificationErrors, []);
  });
}

run();
console.log("actor-pre-update-hook.test.mjs: OK");
