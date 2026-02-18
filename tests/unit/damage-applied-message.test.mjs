import assert from "node:assert/strict";
import { buildDamageAppliedMessageHelpers } from "../../src/hooks/damage-applied-message.mjs";

async function run() {
  const emittedPayloads = [];
  const warns = [];

  const helpers = buildDamageAppliedMessageHelpers({
    hasSocket: () => true,
    socketEmit: (_channel, payload) => {
      emittedPayloads.push(payload);
      return true;
    },
    systemSocket: "system.bloodman",
    toFiniteNumber: (value, fallback = 0) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
    },
    resolveCombatTargetName: (tokenName, actorName, fallback) => tokenName || actorName || fallback,
    bmLog: { warn: message => warns.push(message) }
  });

  helpers.emitDamageAppliedMessage(
    {
      attackerUserId: "u1",
      attackerId: "a1",
      rollId: "r1",
      itemId: "it1",
      itemType: "arme",
      damageFormula: "1d6",
      damageLabel: "normal",
      penetration: 2,
      bonusBrut: 1,
      totalDamage: 7,
      targetName: "Cible"
    },
    {
      hpBefore: 10,
      hpAfter: 5,
      finalDamage: 5
    },
    {
      id: "t1",
      uuid: "Token.t1",
      actorId: "a-target",
      actorLink: true,
      name: "Target Token",
      actor: { name: "Target Actor" },
      parent: { id: "scene-1" }
    },
    7
  );
  assert.equal(emittedPayloads.length, 1);
  assert.equal(emittedPayloads[0].type, "damageApplied");
  assert.equal(emittedPayloads[0].target.tokenId, "t1");
  assert.equal(emittedPayloads[0].target.targetName, "Target Token");
  assert.equal(emittedPayloads[0].target.share, 7);
  assert.equal(warns.length, 0);

  const disabledSocketHelpers = buildDamageAppliedMessageHelpers({
    hasSocket: () => false,
    socketEmit: () => {
      throw new Error("should not be called");
    },
    systemSocket: "system.bloodman",
    toFiniteNumber: value => Number(value),
    resolveCombatTargetName: (_tokenName, _actorName, fallback) => fallback,
    bmLog: { warn: () => {} }
  });
  disabledSocketHelpers.emitDamageAppliedMessage({}, { finalDamage: 1 }, null, 1);

  const failedEmitWarnings = [];
  const failedEmitHelpers = buildDamageAppliedMessageHelpers({
    hasSocket: () => true,
    socketEmit: () => false,
    systemSocket: "system.bloodman",
    toFiniteNumber: value => Number(value),
    resolveCombatTargetName: (_tokenName, _actorName, fallback) => fallback,
    bmLog: { warn: message => failedEmitWarnings.push(message) }
  });
  failedEmitHelpers.emitDamageAppliedMessage({}, { finalDamage: 1, hpBefore: 3, hpAfter: 2 }, null, 1);
  assert.equal(failedEmitWarnings.length, 1);
}

run()
  .then(() => {
    console.log("damage-applied-message.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
