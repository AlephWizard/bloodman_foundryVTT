import assert from "node:assert/strict";
import { createItemRerollExecutionRules } from "../../src/rules/item-reroll-execution.mjs";

async function run() {
  const socketCalls = [];
  const chatCalls = [];
  const debugCalls = [];
  const validationLogs = [];
  const syncCalls = [];
  const damageCalls = [];
  const postedMessages = [];
  const actorUpdates = [];
  const tokenUpdates = [];

  const linkedActor = {
    id: "actor-linked",
    name: "Linked Actor",
    system: { resources: { pv: { current: 11 } } },
    update: async data => {
      actorUpdates.push(data);
      const next = Number(data?.["system.resources.pv.current"]);
      if (Number.isFinite(next)) linkedActor.system.resources.pv.current = next;
    }
  };
  const linkedToken = {
    id: "token-linked",
    name: "Linked Token",
    actorLink: true,
    actor: linkedActor,
    _pv: 11,
    update: async data => {
      tokenUpdates.push({ tokenId: "token-linked", data });
      const next = Number(data?.["delta.system.resources.pv.current"]);
      if (Number.isFinite(next)) linkedToken._pv = next;
    }
  };
  const unlinkedToken = {
    id: "token-unlinked",
    name: "Unlinked Token",
    actorLink: false,
    actor: { id: "actor-unlinked" },
    _pv: 9,
    update: async data => {
      tokenUpdates.push({ tokenId: "token-unlinked", data });
      const next = Number(data?.["delta.system.resources.pv.current"]);
      if (Number.isFinite(next)) unlinkedToken._pv = next;
    }
  };
  const tokenMap = new Map([
    ["token-linked", linkedToken],
    ["token-unlinked", unlinkedToken]
  ]);

  const rules = createItemRerollExecutionRules({
    normalizeRerollTarget: target => target,
    normalizeRerollTargets: targets => targets.map(target => ({ ...target, aliased: true })),
    resolveDamageTokenDocument: async target => tokenMap.get(String(target?.tokenId || "")) || null,
    toBooleanFlag: value => value === true || String(value).toLowerCase() === "true",
    getActorById: () => null,
    getProtectionPA: actor => (actor?.id === "actor-unlinked" ? 2 : 1),
    getTokenCurrentPv: tokenDoc => Number(tokenDoc?._pv),
    estimateRerollHpBefore: ({ rawHpBefore }) => Number(rawHpBefore),
    validateNumericEquality: (a, b) => Number(a) === Number(b),
    getTokenActorType: () => "personnage",
    syncZeroPvStatusForToken: async (...args) => {
      syncCalls.push(args);
    },
    resolveCombatTargetName: (tokenName, actorName, fallback) => tokenName || actorName || fallback,
    applyDamageToActor: async (actor, share, options) => {
      damageCalls.push({ actorId: actor?.id, share, options });
      return {
        hpAfter: 8,
        finalDamage: 4,
        paEffective: 1
      };
    },
    buildLocalTokenRerollResult: ({ hpBefore, share, penetration, paInitial }) => ({
      hpBefore,
      hpAfter: Math.max(0, Number(hpBefore) - 3),
      finalDamage: 3,
      penetration,
      paInitial,
      paEffective: 1,
      pa: 1
    }),
    postDamageTakenChatMessage: async data => {
      postedMessages.push(data);
    },
    computeExpectedHpAfter: ({ hpBefore, finalDamage }) => Math.max(0, Number(hpBefore) - Number(finalDamage || 0)),
    logDamageRerollValidation: (...args) => {
      validationLogs.push(args);
    },
    buildItemDamageRerollPayload: payload => ({ ...payload, kind: "item-damage" }),
    hasSocket: () => true,
    socketEmit: (...args) => socketCalls.push(args),
    systemSocket: "bloodman.socket",
    getActiveGMUserIds: () => ["gm1"],
    enableChatTransportFallback: true,
    createChatMessage: async data => {
      chatCalls.push(data);
      return data;
    },
    rerollRequestChatMarkup: "<span>reroll</span>",
    logDebug: (...args) => debugCalls.push(args),
    createRequestId: () => "req-1"
  });

  const relayResult = await rules.relayItemRerollToGMs({
    context: { rollId: "roll-1", attackerId: "attacker-ctx", itemId: "ctx-item", itemType: "arme", penetration: 2 },
    itemId: "item-1",
    itemType: "arme",
    itemName: "Pistolet",
    actorId: "attacker-1",
    attackerUserId: "user-1",
    totalDamage: 12,
    rollResults: [6, 6],
    allocations: [{ tokenId: "token-linked", share: 12 }]
  });
  assert.equal(relayResult.requestId, "req-1");
  assert.equal(socketCalls.length, 1);
  assert.equal(socketCalls[0][0], "bloodman.socket");
  assert.equal(chatCalls.length, 1);
  assert.equal(Array.isArray(chatCalls[0].whisper), true);
  assert.equal(debugCalls.length, 1);

  await rules.applyLocalItemRerollTargets({
    allocations: [
      { tokenId: "token-linked", actorId: "actor-linked", targetActorLink: true, targetName: "Target A", share: 4, baseShare: 4, hpBefore: 12 },
      { tokenId: "token-unlinked", actorId: "actor-unlinked", targetActorLink: false, targetName: "Target B", share: 3, baseShare: 3, hpBefore: 10 },
      { tokenId: "token-unlinked", actorId: "actor-unlinked", targetActorLink: false, targetName: "Target Zero", share: 0, baseShare: 0, hpBefore: 10 }
    ],
    penetrationValue: 2,
    validationMeta: { itemId: "item-1", rollId: "roll-1" },
    defaultTargetName: "Cible"
  });

  assert.equal(actorUpdates.length >= 1, true);
  assert.equal(tokenUpdates.length >= 2, true);
  assert.equal(damageCalls.length, 1);
  assert.equal(postedMessages.length, 1);
  assert.equal(syncCalls.length >= 2, true);
  assert.equal(validationLogs.some(entry => entry[0] === "local-target-zero-share"), true);
  assert.equal(validationLogs.some(entry => entry[0] === "local-target"), true);
}

run()
  .then(() => {
    console.log("item-reroll-execution.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
