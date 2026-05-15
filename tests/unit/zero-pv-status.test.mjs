import assert from "node:assert/strict";
import { createZeroPvStatusController } from "../../src/rules/zero-pv-status.mjs";

function getProperty(source, path) {
  return String(path || "").split(".").reduce((cursor, key) => cursor?.[key], source);
}

function setNested(source, path, value) {
  const keys = String(path || "").split(".").filter(Boolean);
  let cursor = source;
  while (keys.length > 1) {
    const key = keys.shift();
    cursor[key] ??= {};
    cursor = cursor[key];
  }
  cursor[keys[0]] = value;
}

function createTokenDoc({
  id = "token-1",
  actor = null,
  actorLink = false,
  actorId = "",
  statuses = [],
  deltaPv = undefined,
  actorDataPv = undefined,
  bar1 = null,
  bar2 = null
} = {}) {
  const tokenDoc = {
    id,
    actor,
    actorLink,
    actorId,
    statuses: [...statuses],
    updates: [],
    object: {
      drawCount: 0,
      drawEffects() {
        this.drawCount += 1;
      }
    },
    async update(updateData) {
      this.updates.push(updateData);
      if (Array.isArray(updateData.statuses)) this.statuses = updateData.statuses;
      if (Object.prototype.hasOwnProperty.call(updateData, "delta.system.resources.pv.current")) {
        setNested(this, "delta.system.resources.pv.current", updateData["delta.system.resources.pv.current"]);
      }
    }
  };
  if (deltaPv !== undefined) setNested(tokenDoc, "delta.system.resources.pv.current", deltaPv);
  if (actorDataPv !== undefined) setNested(tokenDoc, "actorData.system.resources.pv.current", actorDataPv);
  if (bar1) tokenDoc.bar1 = bar1;
  if (bar2) tokenDoc.bar2 = bar2;
  return tokenDoc;
}

function createController({ tokenDocs = [], stateCalls = [], transparentCalls = [] } = {}) {
  return createZeroPvStatusController({
    logger: { warn() {} },
    getProperty,
    getGame: () => globalThis.game,
    getTokenDocumentsForActor: () => tokenDocs,
    setActorStatePresetActive: async (actor, presetId, active) => {
      stateCalls.push({ actor, presetId, active });
      return true;
    },
    resolveStatePresetSelection: label => ({ ids: String(label || "") === "injured" ? ["body-injured"] : [] }),
    applyTransparentTokenEffectBackground: tokenObject => transparentCalls.push(tokenObject)
  });
}

async function run() {
  globalThis.CONFIG = {
    specialStatusEffects: { DEFEATED: "dead" },
    statusEffects: [
      { id: "dead", statuses: ["dead"], name: "Dead" },
      { id: "bleeding", statuses: ["bleeding"], name: "Bleeding" }
    ]
  };
  globalThis.foundry = { utils: { getProperty } };
  globalThis.game = {
    user: { isGM: true },
    actors: new Map([["world-npc", { type: "personnage-non-joueur", system: { resources: { pv: { current: 6 } } } }]])
  };

  const controller = createController();
  assert.equal(controller.getTokenActorType({ actorId: "world-npc" }), "personnage-non-joueur");
  assert.equal(controller.isPvBarAttribute("system.resources.pv.current"), true);
  assert.equal(controller.isPvBarAttribute("system.resources.pm.current"), false);
  assert.equal(controller.getTokenBarPvValue(createTokenDoc({ bar1: { attribute: "system.resources.pv.current", value: "4" } })), 4);

  const linkedActor = { type: "personnage", system: { resources: { pv: { current: 9 } } } };
  assert.equal(controller.getTokenCurrentPv(createTokenDoc({ actor: linkedActor, actorLink: true, deltaPv: 2 })), 9);
  assert.equal(controller.getTokenCurrentPv(createTokenDoc({ actor: linkedActor, actorLink: false, deltaPv: 2 })), 2);
  assert.equal(
    controller.getTokenPvFromUpdate(
      createTokenDoc({ bar1: { attribute: "system.resources.pv.current", value: 8 } }),
      { bar1: { value: "1" } }
    ),
    1
  );

  const stateCalls = [];
  const transparentCalls = [];
  const playerActor = { id: "actor-1", type: "personnage", system: { resources: { pv: { current: 0 } } } };
  const playerToken = createTokenDoc({ id: "player-token", actor: playerActor, statuses: ["dead"] });
  const playerController = createController({ stateCalls, transparentCalls });
  await playerController.syncZeroPvStatusForToken(playerToken, "personnage", 0);
  assert.deepEqual(playerToken.statuses, ["bleeding"]);
  assert.deepEqual(stateCalls, [{ actor: playerActor, presetId: "body-injured", active: true }]);
  assert.equal(playerToken.object.drawCount, 1);
  assert.equal(transparentCalls[0], playerToken.object);

  const npcToken = createTokenDoc({
    id: "npc-token",
    actor: { id: "actor-2", type: "personnage-non-joueur", system: { resources: { pv: { current: 5 } } } },
    statuses: ["dead"],
    deltaPv: 5
  });
  assert.equal(await playerController.syncNpcDeadStatusToZeroPvForToken(npcToken, "personnage-non-joueur"), true);
  assert.equal(getProperty(npcToken, "delta.system.resources.pv.current"), 0);
  assert.deepEqual(npcToken.statuses, ["dead"]);

  assert.equal(playerController.resolveInjuredStateActive("injured"), true);
  assert.equal(playerController.resolveInjuredStateActive("other"), false);
}

run()
  .then(() => {
    console.log("zero-pv-status.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
