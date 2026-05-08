import assert from "node:assert/strict";
import {
  buildStartupCombatantNameNormalization,
  buildStartupNormalizationHooks,
  buildStartupSceneTokenNormalization
} from "../../src/hooks/startup-normalization.mjs";

async function run() {
  const calls = [];
  const actors = [{ id: "a1" }, { id: "a2" }];

  const hooks = buildStartupNormalizationHooks({
    getActors: () => actors,
    applyStartupActorNormalization: async actor => {
      calls.push(`actor:${actor.id}`);
    },
    applyStartupActorItemNormalization: async actor => {
      calls.push(`items:${actor.id}`);
    },
    applyStartupCombatantNameNormalization: async () => {
      calls.push("combatants");
    },
    applyStartupSceneTokenNormalization: async () => {
      calls.push("tokens");
    },
    refreshBossSoloNpcPvMax: async () => {
      calls.push("refresh");
    }
  });

  await hooks.runStartupNormalizationPass();
  assert.deepEqual(calls, [
    "actor:a1",
    "items:a1",
    "actor:a2",
    "items:a2",
    "combatants",
    "tokens",
    "refresh"
  ]);

  const fallbackHooks = buildStartupNormalizationHooks({});
  await fallbackHooks.runStartupNormalizationPass();

  const combatantA = {
    name: "Old A",
    updateCalls: [],
    async update(data) {
      this.updateCalls.push(data);
      this.name = data.name;
    }
  };
  const combatantB = {
    name: "Stay B",
    updateCalls: [],
    async update(data) {
      this.updateCalls.push(data);
      this.name = data.name;
    }
  };
  const normalizeCombatantNames = buildStartupCombatantNameNormalization({
    getCombats: () => [{ combatants: [combatantA, combatantB] }],
    getCombatantDisplayName: combatant => (combatant === combatantA ? "New A" : "Stay B")
  });
  await normalizeCombatantNames();
  assert.deepEqual(combatantA.updateCalls, [{ name: "New A" }]);
  assert.deepEqual(combatantB.updateCalls, []);

  const sharedActor = { img: "actor-a.webp" };
  const tokenCharacter = {
    actorLink: false,
    actorId: "a1",
    texture: { src: "broken.webp" },
    updateCalls: [],
    async update(data) {
      this.updateCalls.push(data);
      if (Object.prototype.hasOwnProperty.call(data, "actorLink")) this.actorLink = data.actorLink;
      if (Object.prototype.hasOwnProperty.call(data, "texture.src")) this.texture.src = data["texture.src"];
    }
  };
  const tokenNpc = {
    actorLink: true,
    texture: { src: "npc.webp" },
    updateCalls: [],
    async update(data) {
      this.updateCalls.push(data);
      if (Object.prototype.hasOwnProperty.call(data, "actorLink")) this.actorLink = data.actorLink;
    }
  };
  const syncedPvCalls = [];
  const normalizeSceneTokens = buildStartupSceneTokenNormalization({
    getScenes: () => [{ tokens: [tokenCharacter, tokenNpc] }],
    getTokenActorType: token => (token === tokenCharacter ? "personnage" : "personnage-non-joueur"),
    playerActorType: "personnage",
    npcActorType: "personnage-non-joueur",
    isCharacterLikeActorType: actorType => actorType === "personnage" || actorType === "personnage-non-joueur",
    getActorById: actorId => (actorId === "a1" ? sharedActor : null),
    getProperty: (source, path) => String(path).split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), source),
    needsTokenImageRepair: async tokenSrc => tokenSrc === "broken.webp",
    canLoadTextureSource: async texture => texture === "actor-a.webp",
    getTokenCurrentPv: token => (token === tokenCharacter ? 5 : Number.NaN),
    syncZeroPvStatusForToken: async (token, actorType, pvCurrent) => {
      syncedPvCalls.push({ token, actorType, pvCurrent });
    }
  });
  await normalizeSceneTokens();
  assert.deepEqual(tokenCharacter.updateCalls, [{ actorLink: true, "texture.src": "actor-a.webp" }]);
  assert.deepEqual(tokenNpc.updateCalls, [{ actorLink: false }]);
  assert.deepEqual(syncedPvCalls, [{ token: tokenCharacter, actorType: "personnage", pvCurrent: 5 }]);
}

run()
  .then(() => {
    console.log("startup-normalization-hooks.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
