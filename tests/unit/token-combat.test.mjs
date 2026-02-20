import assert from "node:assert/strict";
import { buildTokenCombatHooks } from "../../src/hooks/token-combat.mjs";

function getProperty(object, path) {
  return String(path || "")
    .split(".")
    .reduce((current, key) => (current == null ? undefined : current[key]), object);
}

async function withGlobals({ gameValue, foundryValue }, callback) {
  const previousGame = globalThis.game;
  const previousFoundry = globalThis.foundry;
  globalThis.game = gameValue;
  globalThis.foundry = foundryValue;
  try {
    return await callback();
  } finally {
    globalThis.game = previousGame;
    globalThis.foundry = previousFoundry;
  }
}

function createHooks(overrides = {}) {
  return buildTokenCombatHooks({
    bmLog: { warn: () => {} },
    getTokenActorType: () => "personnage",
    isMissingTokenImage: () => false,
    getSafeTokenTextureFallback: () => "",
    repairTokenTextureSource: async () => {},
    applyTransparentTokenEffectBackground: () => {},
    refreshBossSoloNpcPvMax: async () => {},
    getCombatantDisplayName: () => "",
    focusActiveCombatantToken: () => {},
    resetActiveCombatantMoveGauge: async () => {},
    resetCombatMovementHistory: async () => {},
    decrementActiveCombatantTokenHudCounters: async () => {},
    resetCombatRuntimeKeys: () => {},
    isAssistantOrHigherRole: () => true,
    stripUpdatePaths: () => false,
    tokenImageUpdatePaths: [],
    getStartedActiveCombat: () => null,
    getCombatantForToken: () => null,
    normalizeActorMoveGauge: () => ({ value: 0, max: 0 }),
    getTokenMoveDistanceInCells: () => Number.NaN,
    tokenMoveLimitEpsilon: 0.000001,
    safeWarn: () => {},
    t: key => key,
    setActorMoveGauge: async () => {},
    syncActorAndPrototypeImageFromTokenImage: async () => {},
    syncCombatantNameForToken: async () => {},
    getTokenPvFromUpdate: () => null,
    getTokenCurrentPv: () => Number.NaN,
    syncZeroPvStatusForToken: async () => {},
    syncNpcDeadStatusToZeroPvForToken: async () => false,
    ...overrides
  });
}

async function run() {
  await withGlobals({
    gameValue: { user: { isGM: true, id: "u1" } },
    foundryValue: { utils: { getProperty } }
  }, async () => {
    const calls = [];
    const hooks = createHooks({
      getTokenActorType: () => "personnage-non-joueur",
      getTokenPvFromUpdate: () => null,
      syncZeroPvStatusForToken: async () => {
        calls.push({ kind: "zero-pv-status" });
      },
      syncNpcDeadStatusToZeroPvForToken: async () => {
        calls.push({ kind: "dead-to-zero" });
        return true;
      }
    });

    await hooks.onUpdateToken({ id: "token-npc" }, { statuses: ["dead"] }, {}, "u1");
    assert.equal(calls.filter(entry => entry.kind === "dead-to-zero").length, 1);
    assert.equal(calls.filter(entry => entry.kind === "zero-pv-status").length, 0);
  });

  await withGlobals({
    gameValue: { user: { isGM: true, id: "u1" } },
    foundryValue: { utils: { getProperty } }
  }, async () => {
    const calls = [];
    const hooks = createHooks({
      getTokenActorType: () => "personnage-non-joueur",
      getTokenPvFromUpdate: () => 3,
      syncZeroPvStatusForToken: async (_tokenDoc, _actorType, pvCurrent) => {
        calls.push({ kind: "zero-pv-status", pvCurrent });
      },
      syncNpcDeadStatusToZeroPvForToken: async () => {
        calls.push({ kind: "dead-to-zero" });
        return true;
      }
    });

    await hooks.onUpdateToken({ id: "token-npc" }, { "delta.system.resources.pv.current": 3 }, {}, "u1");
    assert.equal(calls.filter(entry => entry.kind === "zero-pv-status").length, 1);
    assert.equal(calls.filter(entry => entry.kind === "zero-pv-status")[0].pvCurrent, 3);
    assert.equal(calls.filter(entry => entry.kind === "dead-to-zero").length, 0);
  });

  await withGlobals({
    gameValue: { user: { isGM: true, id: "u1" } },
    foundryValue: { utils: { getProperty } }
  }, async () => {
    const calls = [];
    const hooks = createHooks({
      getTokenActorType: () => "personnage",
      syncNpcDeadStatusToZeroPvForToken: async () => {
        calls.push({ kind: "dead-to-zero" });
        return true;
      }
    });

    await hooks.onUpdateToken({ id: "token-player" }, { statuses: ["dead"] }, {}, "u1");
    assert.equal(calls.length, 0);
  });

  await withGlobals({
    gameValue: { user: { isGM: false, id: "u1" } },
    foundryValue: { utils: { getProperty } }
  }, async () => {
    const calls = [];
    const hooks = createHooks({
      getTokenActorType: () => "personnage-non-joueur",
      syncNpcDeadStatusToZeroPvForToken: async () => {
        calls.push({ kind: "dead-to-zero" });
        return true;
      }
    });

    await hooks.onUpdateToken({ id: "token-npc" }, { statuses: ["dead"] }, {}, "u1");
    assert.equal(calls.length, 0);
  });
}

run()
  .then(() => {
    console.log("token-combat.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
