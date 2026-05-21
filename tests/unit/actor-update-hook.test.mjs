import assert from "node:assert/strict";
import { buildActorUpdateHooks } from "../../src/hooks/actor-update.mjs";

function getProperty(object, path) {
  return String(path || "")
    .split(".")
    .reduce((current, key) => (current == null ? undefined : current[key]), object);
}

async function withGlobals(fn) {
  const previousFoundry = globalThis.foundry;
  const previousGame = globalThis.game;

  globalThis.foundry = { utils: { getProperty } };
  globalThis.game = { user: { id: "u1", isGM: true } };

  try {
    return await fn();
  } finally {
    globalThis.foundry = previousFoundry;
    globalThis.game = previousGame;
  }
}

function buildActor(overrides = {}) {
  const actor = {
    id: "actor-1",
    type: "personnage",
    isOwner: true,
    system: {
      profile: { archetypeBonusValue: 0, archetypeBonusCharacteristic: "" },
      characteristics: { PHY: { base: 40 }, ESP: { base: 35 } },
      resources: {
        pv: { itemBonus: 0, max: 2, current: 9 },
        pp: { itemBonus: 0, max: 2, current: 8 },
        move: { value: 0, max: 0 }
      }
    },
    updates: [],
    async update(updateData) {
      this.updates.push(updateData);
    },
    ...overrides
  };
  return actor;
}

function buildHooks(overrides = {}) {
  const moveUpdates = [];
  return {
    moveUpdates,
    hooks: buildActorUpdateHooks({
      characteristics: [{ key: "PHY" }, { key: "ESP" }],
      normalizeArchetypeBonusValue: value => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? Math.trunc(numeric) : 0;
      },
      normalizeCharacteristicKey: value => {
        const key = String(value || "").trim().toUpperCase();
        return key === "PHY" || key === "ESP" ? key : "";
      },
      getItemBonusTotals: () => ({ PHY: 0, ESP: 0 }),
      normalizeActorMoveGauge: () => ({ value: 7, max: 7 }),
      setActorMoveGauge: async (actor, value, max) => {
        moveUpdates.push({ actorId: actor.id, value, max });
      },
      getDerivedPvMax: (_actor, phyEffective) => Math.round(Number(phyEffective) / 5),
      syncZeroPvBodyStateForActor: async () => {},
      syncZeroPvStatusForToken: async () => {},
      syncZeroPvStatusForActor: async () => {},
      syncInjuredStateStatusForActor: async () => {},
      resolveInjuredStateActive: () => false,
      tokenTextureValidityCache: { delete: () => {} },
      resolveWorldActorFromTokenDocument: () => null,
      syncSceneTokenImagesFromActorImage: async () => {},
      syncPrototypeTokenImageFromActorImage: async () => {},
      bmLog: { warn: () => {} },
      ...overrides
    })
  };
}

async function run() {
  await withGlobals(async () => {
    const actor = buildActor();
    const { hooks, moveUpdates } = buildHooks();

    await hooks.handleUpdateActorDerivedResources(
      actor,
      {
        "system.characteristics.PHY.base": 40,
        "system.characteristics.ESP.base": 35
      },
      {},
      "u1"
    );

    assert.deepEqual(moveUpdates, [{ actorId: "actor-1", value: 7, max: 7 }]);
    assert.deepEqual(actor.updates, [
      {
        "system.resources.pv.max": 8,
        "system.resources.pp.max": 7,
        "system.resources.pv.current": 8,
        "system.resources.pp.current": 7
      }
    ]);
  });

  await withGlobals(async () => {
    const actor = buildActor();
    const { hooks, moveUpdates } = buildHooks();

    await hooks.handleUpdateActorDerivedResources(
      actor,
      {
        system: {
          characteristics: {
            PHY: { base: 40 },
            ESP: { base: 35 }
          }
        }
      },
      {},
      "u1"
    );

    assert.deepEqual(moveUpdates, [{ actorId: "actor-1", value: 7, max: 7 }]);
    assert.deepEqual(actor.updates, [
      {
        "system.resources.pv.max": 8,
        "system.resources.pp.max": 7,
        "system.resources.pv.current": 8,
        "system.resources.pp.current": 7
      }
    ]);
  });

  await withGlobals(async () => {
    const actor = buildActor();
    const { hooks, moveUpdates } = buildHooks();

    await hooks.handleUpdateActorDerivedResources(
      actor,
      {
        "system.resources.move.value": 3,
        "system.characteristics.PHY.base": 40
      },
      {},
      "u1"
    );

    assert.deepEqual(moveUpdates, []);
    assert.deepEqual(actor.updates, []);
  });

  await withGlobals(async () => {
    const actor = buildActor({
      system: {
        profile: { archetypeBonusValue: 5, archetypeBonusCharacteristic: "ESP" },
        characteristics: { PHY: { base: 40 }, ESP: { base: 35 } },
        resources: {
          pv: { itemBonus: 0, max: 8, current: 8 },
          pp: { itemBonus: 0, max: 2, current: 20 },
          move: { value: 0, max: 0 }
        }
      }
    });
    const { hooks, moveUpdates } = buildHooks();

    await hooks.handleUpdateActorDerivedResources(
      actor,
      {
        "system.profile.archetypeBonusValue": 5,
        "system.profile.archetypeBonusCharacteristic": "ESP"
      },
      {},
      "u1"
    );

    assert.deepEqual(moveUpdates, [{ actorId: "actor-1", value: 7, max: 7 }]);
    assert.deepEqual(actor.updates, [
      {
        "system.resources.pp.max": 8,
        "system.resources.pp.current": 8
      }
    ]);
  });
}

run()
  .then(() => {
    console.log("actor-update-hook.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
