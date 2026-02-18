import assert from "node:assert/strict";
import { buildDamageRerollHooks } from "../../src/hooks/damage-reroll.mjs";

function withGameContext(gameValue, callback) {
  const previousGame = globalThis.game;
  globalThis.game = gameValue;
  try {
    return callback();
  } finally {
    globalThis.game = previousGame;
  }
}

async function run() {
  await withGameContext({
    user: { id: "u1", isGM: true },
    actors: new Map()
  }, async () => {
    const attacker = { id: "a1", isOwner: true, items: new Map(), sheet: { rendered: false, render: () => {} } };
    const hooks = buildDamageRerollHooks({
      toFiniteNumber: (value, fallback = 0) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
      },
      validateNumericEquality: (left, right) => Number(left) === Number(right),
      resolveAttackerActorInstancesForDamageApplied: () => [attacker],
      normalizeRerollTarget: target => ({ actorId: String(target.actorId || ""), share: Number(target.share || 0) }),
      getRerollTargetKey: target => target.actorId,
      isSameRerollTarget: (left, right) => left.actorId === right.actorId,
      getActorInstancesById: () => [],
      wasRerollRequestProcessed: () => false,
      rememberRerollRequest: () => {},
      isDamageRerollItemType: () => true,
      normalizeRerollTargets: targets => targets,
      resolveDamageTokenDocument: async () => null,
      toBooleanFlag: value => value === true,
      getTokenCurrentPv: () => Number.NaN,
      getProtectionPA: () => 0,
      resolveCombatTargetName: (_tokenName, _actorName, fallback) => fallback,
      applyDamageToActor: async () => null,
      postDamageTakenChatMessage: async () => {},
      getTokenActorType: () => "",
      syncZeroPvStatusForToken: async () => {},
      logDamageRerollValidation: () => {},
      emitDamageAppliedMessage: () => {},
      bmLog: { warn: () => {}, debug: () => {} }
    });

    await hooks.handleDamageAppliedMessage({
      attackerUserId: "u1",
      rollId: "r1",
      itemId: "it1",
      itemType: "arme",
      target: { actorId: "t1", share: 3 },
      damageFormula: "1d6",
      damageLabel: "normal"
    });
    assert.equal(attacker._lastDamageReroll.rollId, "r1");
    assert.equal(attacker._lastDamageReroll.itemId, "it1");
    assert.equal(attacker._lastDamageReroll.itemType, "arme");
    assert.equal(attacker._lastDamageReroll.targets.length, 1);

    const previousContextRef = attacker._lastDamageReroll;
    await hooks.handleDamageAppliedMessage({
      attackerUserId: "u2",
      rollId: "r2",
      itemId: "it2",
      itemType: "arme",
      target: { actorId: "t2", share: 1 }
    });
    assert.equal(attacker._lastDamageReroll, previousContextRef);
  });

  await withGameContext({
    user: { id: "gm", isGM: true },
    actors: new Map()
  }, async () => {
    const calls = [];
    const remembered = new Set();
    const tokenDoc = {
      actorLink: false,
      pv: 0,
      actor: null,
      name: "Target Token",
      update: async data => {
        calls.push({ kind: "token-update", data });
        tokenDoc.pv = Number(data?.["delta.system.resources.pv.current"]);
      }
    };
    const hooks = buildDamageRerollHooks({
      toFiniteNumber: (value, fallback = 0) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
      },
      validateNumericEquality: (left, right) => Number(left) === Number(right),
      resolveAttackerActorInstancesForDamageApplied: () => [],
      normalizeRerollTarget: target => target,
      getRerollTargetKey: () => "",
      isSameRerollTarget: () => false,
      getActorInstancesById: () => [],
      wasRerollRequestProcessed: id => remembered.has(id),
      rememberRerollRequest: id => {
        remembered.add(id);
        calls.push({ kind: "remember", id });
      },
      isDamageRerollItemType: type => type === "arme",
      normalizeRerollTargets: targets => Array.isArray(targets) ? targets : [],
      resolveDamageTokenDocument: async () => tokenDoc,
      toBooleanFlag: value => value === true,
      getTokenCurrentPv: token => Number(token?.pv),
      getProtectionPA: () => 0,
      resolveCombatTargetName: (tokenName, actorName, fallback) => tokenName || actorName || fallback,
      applyDamageToActor: async () => {
        calls.push({ kind: "apply-damage-actor" });
        return null;
      },
      postDamageTakenChatMessage: async () => {
        calls.push({ kind: "chat" });
      },
      getTokenActorType: () => "personnage",
      syncZeroPvStatusForToken: async (_token, _type, pv) => {
        calls.push({ kind: "sync", pv });
      },
      logDamageRerollValidation: (_scope, details) => {
        calls.push({ kind: "validation", details });
      },
      emitDamageAppliedMessage: (_data, result, _token, share) => {
        calls.push({ kind: "emit", share, finalDamage: result?.finalDamage });
      },
      bmLog: {
        warn: (...args) => calls.push({ kind: "warn", args }),
        debug: (...args) => calls.push({ kind: "debug", args })
      }
    });

    await hooks.handleDamageRerollRequest({
      requestId: "req-1",
      kind: "item-damage",
      itemType: "arme",
      penetration: 1,
      targets: [
        {
          share: 0,
          hpBefore: 5,
          targetName: "Target Token"
        }
      ]
    });

    assert.equal(calls.some(entry => entry.kind === "remember" && entry.id === "req-1"), true);
    assert.equal(calls.filter(entry => entry.kind === "token-update").length, 1);
    assert.equal(calls.filter(entry => entry.kind === "emit").length, 1);
    assert.equal(calls.filter(entry => entry.kind === "sync").length, 2);
    assert.equal(calls.filter(entry => entry.kind === "validation").length, 1);

    const callsBeforeDuplicate = calls.length;
    await hooks.handleDamageRerollRequest({
      requestId: "req-1",
      kind: "item-damage",
      itemType: "arme",
      penetration: 1,
      targets: [{ share: 0, hpBefore: 5 }]
    });
    assert.equal(calls.length, callsBeforeDuplicate);
  });
}

run()
  .then(() => {
    console.log("damage-reroll.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
