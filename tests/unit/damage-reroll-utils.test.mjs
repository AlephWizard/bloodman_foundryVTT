import assert from "node:assert/strict";
import { buildDamageRerollUtils } from "../../src/rules/damage-reroll-utils.mjs";

async function run() {
  const calls = [];
  const rollQueue = [
    { total: 4, dice: [{ results: [{ result: 2 }, { result: 2 }] }] },
    { total: 3, dice: [{ results: [{ result: 1 }, { result: 2 }] }] },
    { total: 7, dice: [{ results: [{ result: 3 }, { result: 4 }] }] }
  ];

  const utils = buildDamageRerollUtils({
    getDamagePayloadField: (data, keys) => {
      for (const key of keys) {
        const value = data?.[key];
        if (value == null || value === "") continue;
        return value;
      }
      return undefined;
    },
    toBooleanFlag: value => value === true || String(value).toLowerCase() === "true",
    resolveCombatTargetName: (tokenName, actorName, fallback) => tokenName || actorName || fallback,
    getTokenCurrentPv: tokenDoc => Number(tokenDoc?.pv),
    getCanvas: () => ({ scene: { id: "scene-active" } }),
    toFiniteNumber: (value, fallback = 0) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
    },
    normalizeRollDieFormula: (value, fallback) => {
      const formula = String(value || "").trim();
      return formula || fallback;
    },
    evaluateRoll: async formula => {
      calls.push(formula);
      return rollQueue.shift();
    }
  });

  const normalizedTarget = utils.normalizeRerollTarget({
    token_id: "t1",
    token_uuid: "Token.t1",
    sceneId: "s1",
    actorid: "a1",
    target_actor_link: "true"
  }, { includeAliases: true });
  assert.equal(normalizedTarget.tokenId, "t1");
  assert.equal(normalizedTarget.tokenUuid, "Token.t1");
  assert.equal(normalizedTarget.sceneId, "s1");
  assert.equal(normalizedTarget.actorId, "a1");
  assert.equal(normalizedTarget.targetActorLink, true);
  assert.equal(normalizedTarget.tokenid, "t1");
  assert.equal(normalizedTarget.targetactorlink, true);

  assert.deepEqual(utils.normalizeRerollTargets(null), []);
  assert.equal(utils.getRerollTargetKey({ tokenUuid: "Token.A" }), "Token.A");
  assert.equal(utils.isSameRerollTarget({ actorId: "A1" }, { actor_id: "A1" }), true);
  assert.equal(utils.isSameRerollTarget({ tokenId: "T1" }, { token_id: "T2" }), false);

  const fallbackTargets = utils.buildFallbackRerollTargets([
    { document: { id: "t1", uuid: "Token.t1", actorId: "a1", actorLink: true, name: "Alpha", pv: 9 } },
    { document: { id: "t2", uuid: "Token.t2", actorId: "a2", actorLink: false, name: "Beta", pv: 6 } }
  ], 5);
  assert.equal(fallbackTargets.length, 2);
  assert.equal(fallbackTargets[0].share, 3);
  assert.equal(fallbackTargets[1].share, 2);
  assert.equal(fallbackTargets[0].sceneId, "scene-active");
  assert.equal(fallbackTargets[0].hpBefore, 9);

  assert.equal(utils.isDamageRerollContextReady({ targets: [{ hpBefore: 3 }, { hpBefore: "4" }] }), true);
  assert.equal(utils.isDamageRerollContextReady({ targets: [{ hpBefore: "x" }] }), false);

  const allocations = utils.buildRerollAllocations({
    totalDamage: 10,
    targets: [
      { share: 6, baseShare: 6, id: "a" },
      { share: 4, baseShare: 4, id: "b" }
    ]
  }, 9);
  assert.deepEqual(allocations.map(target => target.share), [5, 4]);

  const freeAllocations = utils.buildRerollAllocations({
    totalDamage: 7,
    targets: [
      { share: 12, baseShare: 12, id: "a" },
      { share: 8, baseShare: 8, id: "b" }
    ]
  }, 10);
  assert.deepEqual(freeAllocations.map(target => target.share), [6, 4]);

  assert.deepEqual(
    utils.computeDamageAfterProtection({
      share: 9,
      paInitial: 3,
      penetration: 1
    }),
    {
      share: 9,
      paInitial: 3,
      penetration: 1,
      paEffective: 2,
      finalDamage: 7
    }
  );

  assert.equal(
    utils.estimateRerollHpBefore({
      rawHpBefore: 14,
      referenceShare: 6,
      penetration: 2,
      linkedCurrentHp: 8,
      linkedPaInitial: 3
    }),
    14
  );
  assert.equal(
    utils.estimateRerollHpBefore({
      rawHpBefore: "",
      referenceShare: 6,
      penetration: 2,
      linkedCurrentHp: 8,
      linkedPaInitial: 3
    }),
    13
  );
  assert.equal(
    utils.estimateRerollHpBefore({
      rawHpBefore: "",
      referenceShare: 6,
      penetration: 2,
      linkedCurrentHp: Number.NaN,
      linkedPaInitial: Number.NaN,
      tokenCurrentHp: 9,
      tokenPaInitial: 4
    }),
    13
  );

  assert.deepEqual(
    utils.buildLocalTokenRerollResult({
      hpBefore: 13,
      share: 6,
      penetration: 2,
      paInitial: 3
    }),
    {
      hpBefore: 13,
      hpAfter: 8,
      finalDamage: 5,
      penetration: 2,
      paInitial: 3,
      paEffective: 1,
      pa: 1
    }
  );
  assert.equal(
    utils.buildLocalTokenRerollResult({
      hpBefore: Number.NaN,
      share: 6,
      penetration: 2,
      paInitial: 3
    }),
    null
  );

  assert.equal(
    utils.computeExpectedHpAfter({
      hpBefore: 13,
      finalDamage: 5
    }),
    8
  );
  assert.equal(
    Number.isNaN(utils.computeExpectedHpAfter({ hpBefore: Number.NaN, finalDamage: 4 })),
    true
  );

  assert.deepEqual(
    utils.buildItemDamageRerollPayload({
      requestId: "r1",
      attackerUserId: "u1",
      attackerId: "a1",
      context: {
        rollId: "roll-1",
        itemId: "ctx-item",
        itemType: "arme",
        itemName: "Pistolet",
        formula: "1d6",
        degats: "1d6+2",
        bonusBrut: 2,
        rollKeepHighest: true,
        penetration: 1
      },
      itemId: "fallback-item",
      itemType: "fallback-type",
      itemName: "fallback-name",
      totalDamage: 9,
      rollResults: [4, 5],
      targets: [{ tokenId: "t1" }]
    }),
    {
      type: "rerollDamage",
      requestId: "r1",
      kind: "item-damage",
      rerollUsed: false,
      attackerUserId: "u1",
      attackerId: "a1",
      rollId: "roll-1",
      itemId: "ctx-item",
      itemType: "arme",
      itemName: "Pistolet",
      damageFormula: "1d6",
      damageLabel: "1d6+2",
      bonusBrut: 2,
      rollKeepHighest: true,
      penetration: 1,
      totalDamage: 9,
      rollResults: [4, 5],
      targets: [{ tokenId: "t1" }]
    }
  );

  const rollValues = utils.getRollValuesFromRoll({
    dice: [
      { results: [{ result: 1 }, { result: 4 }] },
      { results: [{ result: "x" }, { result: 6 }] }
    ]
  });
  assert.deepEqual(rollValues, [1, 4, 6]);

  const evalNormal = await utils.evaluateRerollDamageFormula("1d4", false);
  assert.equal(evalNormal.rawTotal, 4);
  assert.deepEqual(evalNormal.rollResults, [2, 2]);
  assert.equal(evalNormal.modeTag, "");

  const evalKeepHighest = await utils.evaluateRerollDamageFormula("1d6", true);
  assert.equal(evalKeepHighest.rawTotal, 7);
  assert.deepEqual(evalKeepHighest.rollResults, [3, 4]);
  assert.equal(evalKeepHighest.modeTag.includes("garder le plus haut"), true);
  assert.deepEqual(calls, ["1d4", "1d6", "1d6"]);
}

run()
  .then(() => {
    console.log("damage-reroll-utils.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
