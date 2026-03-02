import assert from "node:assert/strict";
import { buildDamageRequestHooks } from "../../src/hooks/damage-request.mjs";

async function withGameContext(gameValue, callback) {
  const previousGame = globalThis.game;
  globalThis.game = gameValue;
  try {
    return await callback();
  } finally {
    globalThis.game = previousGame;
  }
}

async function run() {
  await withGameContext({ user: { isGM: false } }, async () => {
    const calls = [];
    const hooks = buildDamageRequestHooks({
      toFiniteNumber: value => Number(value),
      wasDamageRequestProcessed: () => false,
      rememberDamageRequest: () => calls.push("remember"),
      resolveDamageTokenDocument: async () => null,
      resolveDamageActors: async () => ({ tokenActor: null, uuidActor: null, worldActor: null }),
      resolveDamageCurrent: () => Number.NaN,
      resolveCombatTargetName: (_tokenName, _actorName, fallback) => fallback,
      postDamageTakenChatMessage: async () => calls.push("chat"),
      emitDamageAppliedMessage: () => calls.push("emit"),
      applyDamageToActor: async () => {
        calls.push("apply");
        return null;
      },
      safeWarn: () => calls.push("warn"),
      t: key => key,
      bmLog: { debug: () => {}, error: () => {} }
    });
    await hooks.handleIncomingDamageRequest({ requestId: "req-no-gm", damage: 6 });
    assert.deepEqual(calls, []);
  });

  await withGameContext({ user: { isGM: true } }, async () => {
    const calls = [];
    const remembered = new Set();
    const tokenDoc = {
      id: "token-1",
      actorLink: false,
      name: "Cible Token",
      update: async updateData => calls.push({ kind: "token-update", updateData })
    };
    const hooks = buildDamageRequestHooks({
      toFiniteNumber: (value, fallback = 0) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
      },
      wasDamageRequestProcessed: requestId => remembered.has(requestId),
      rememberDamageRequest: requestId => {
        remembered.add(requestId);
        calls.push({ kind: "remember", requestId });
      },
      resolveDamageTokenDocument: async () => tokenDoc,
      resolveDamageActors: async () => ({ tokenActor: null, uuidActor: null, worldActor: null }),
      resolveDamageCurrent: () => 15,
      resolveCombatTargetName: (tokenName, actorName, fallback) => tokenName || actorName || fallback,
      postDamageTakenChatMessage: async payload => calls.push({ kind: "chat", payload }),
      emitDamageAppliedMessage: (_data, result) => calls.push({ kind: "emit", result }),
      applyDamageToActor: async () => {
        calls.push({ kind: "apply" });
        return null;
      },
      safeWarn: () => calls.push({ kind: "warn" }),
      t: key => key,
      bmLog: { debug: () => {}, error: () => {} }
    });

    await hooks.handleIncomingDamageRequest({
      requestId: "req-1",
      damage: 10,
      penetration: 2,
      targetPA: 5,
      targetName: "Cible"
    });
    assert.equal(calls.filter(entry => entry.kind === "remember").length, 1);
    assert.deepEqual(calls.filter(entry => entry.kind === "token-update"), [{
      kind: "token-update",
      updateData: { "delta.system.resources.pv.current": 8 }
    }]);
    assert.equal(calls.filter(entry => entry.kind === "chat").length, 1);
    assert.equal(calls.filter(entry => entry.kind === "chat")[0].payload.amount, 7);
    assert.equal(calls.filter(entry => entry.kind === "emit").length, 1);
    assert.equal(calls.filter(entry => entry.kind === "emit")[0].result.finalDamage, 7);
    assert.equal(calls.filter(entry => entry.kind === "apply").length, 0);

    const callCountAfterFirst = calls.length;
    await hooks.handleIncomingDamageRequest({
      requestId: "req-1",
      damage: 10,
      penetration: 2,
      targetPA: 5
    });
    assert.equal(calls.length, callCountAfterFirst);
  });

  await withGameContext({ user: { isGM: true } }, async () => {
    const calls = [];
    const hooks = buildDamageRequestHooks({
      toFiniteNumber: (value, fallback = 0) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
      },
      wasDamageRequestProcessed: () => false,
      rememberDamageRequest: () => {},
      resolveDamageTokenDocument: async () => ({ id: "token-2", actorLink: true, name: "Token Lie" }),
      resolveDamageActors: async () => ({
        tokenActor: { id: "a1", name: "Actor Lie", type: "personnage" },
        uuidActor: null,
        worldActor: null
      }),
      resolveDamageCurrent: () => Number.NaN,
      resolveCombatTargetName: (tokenName, actorName, fallback) => tokenName || actorName || fallback,
      postDamageTakenChatMessage: async payload => calls.push({ kind: "chat", payload }),
      emitDamageAppliedMessage: (_data, result) => calls.push({ kind: "emit", result }),
      applyDamageToActor: async (actor, share, options) => {
        calls.push({ kind: "apply", actorId: actor.id, share, options });
        return {
          finalDamage: 4,
          penetration: options.penetration,
          paInitial: 2,
          paEffective: 1,
          hpBefore: 9,
          hpAfter: 5
        };
      },
      safeWarn: () => calls.push({ kind: "warn" }),
      t: key => key,
      bmLog: { debug: () => {}, error: () => {} }
    });

    await hooks.handleIncomingDamageRequest({ damage: 5, penetration: 1, targetName: "Target Linked" });
    assert.equal(calls.filter(entry => entry.kind === "apply").length, 1);
    assert.equal(calls.filter(entry => entry.kind === "emit").length, 1);
    assert.equal(calls.filter(entry => entry.kind === "chat").length, 0);
    assert.equal(calls.filter(entry => entry.kind === "warn").length, 0);
  });

  await withGameContext({ user: { isGM: true } }, async () => {
    const calls = [];
    const hooks = buildDamageRequestHooks({
      toFiniteNumber: (value, fallback = 0) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
      },
      wasDamageRequestProcessed: () => false,
      rememberDamageRequest: () => {},
      resolveDamageTokenDocument: async () => null,
      resolveDamageActors: async () => ({ tokenActor: null, uuidActor: null, worldActor: null }),
      resolveDamageCurrent: () => Number.NaN,
      resolveCombatTargetName: (_tokenName, _actorName, fallback) => fallback,
      postDamageTakenChatMessage: async payload => calls.push({ kind: "chat", payload }),
      emitDamageAppliedMessage: () => calls.push({ kind: "emit" }),
      applyDamageToActor: async () => {
        calls.push({ kind: "apply" });
        return null;
      },
      safeWarn: message => calls.push({ kind: "warn", message }),
      t: key => key,
      bmLog: { debug: () => {}, error: () => {} }
    });

    await hooks.handleIncomingDamageRequest({
      damage: 4,
      penetration: 1,
      targetPA: 2,
      targetPvCurrent: 10,
      targetName: "Fallback"
    });
    assert.equal(calls.filter(entry => entry.kind === "chat").length, 1);
    assert.equal(calls.filter(entry => entry.kind === "chat")[0].payload.amount, 3);
    assert.equal(calls.filter(entry => entry.kind === "warn").length, 0);

    await hooks.handleIncomingDamageRequest({ damage: 4, targetName: "No Resolve" });
    assert.equal(calls.filter(entry => entry.kind === "warn").length, 1);
  });
}

run()
  .then(() => {
    console.log("damage-request.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
