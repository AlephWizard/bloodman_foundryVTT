import assert from "node:assert/strict";
import { buildDamageRerollHooks } from "../../src/hooks/damage-reroll.mjs";

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

  await withGameContext({
    user: { id: "gm", isGM: true },
    actors: new Map()
  }, async () => {
    const calls = [];
    const targetActor = {
      id: "target-actor",
      name: "Linked Target",
      system: { resources: { pv: { current: 3 } } },
      update: async (data, options) => {
        calls.push({ kind: "actor-update", data, options });
        const next = Number(data?.["system.resources.pv.current"]);
        if (Number.isFinite(next)) targetActor.system.resources.pv.current = next;
      }
    };
    const tokenDoc = {
      actorLink: true,
      actor: targetActor,
      actorId: "target-actor",
      name: "Linked Token"
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
      wasRerollRequestProcessed: () => false,
      rememberRerollRequest: () => {},
      isDamageRerollItemType: type => type === "arme",
      normalizeRerollTargets: targets => Array.isArray(targets) ? targets : [],
      resolveDamageTokenDocument: async () => tokenDoc,
      toBooleanFlag: value => value === true,
      getTokenCurrentPv: () => Number.NaN,
      getProtectionPA: () => 0,
      resolveCombatTargetName: (tokenName, actorName, fallback) => tokenName || actorName || fallback,
      applyDamageToActor: async (actor, share) => {
        calls.push({ kind: "apply-damage-actor", share, hpBeforeRead: actor.system.resources.pv.current });
        actor.system.resources.pv.current = Math.max(0, actor.system.resources.pv.current - share);
        return {
          hpBefore: 10,
          hpAfter: actor.system.resources.pv.current,
          finalDamage: share,
          paEffective: 0
        };
      },
      postDamageTakenChatMessage: async () => {},
      getTokenActorType: () => "personnage",
      syncZeroPvStatusForToken: async () => {},
      logDamageRerollValidation: () => {},
      emitDamageAppliedMessage: () => {},
      bmLog: { warn: () => {}, debug: () => {} }
    });

    await hooks.handleDamageRerollRequest({
      requestId: "req-linked",
      kind: "item-damage",
      itemType: "arme",
      targets: [{ share: 4, hpBefore: 10, targetActorLink: true }]
    });

    assert.equal(calls[0].kind, "actor-update");
    assert.equal(calls[0].options?.bloodmanAllowVitalResourceUpdate, true);
    assert.equal(calls[1].kind, "apply-damage-actor");
    assert.equal(calls[1].hpBeforeRead, 10);
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
