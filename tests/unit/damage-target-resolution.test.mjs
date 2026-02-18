import assert from "node:assert/strict";
import { buildDamageTargetResolution } from "../../src/rules/damage-target-resolution.mjs";

function createCollection(items = []) {
  const entries = new Map(items.map(item => [item.id, item]));
  return {
    get: id => entries.get(id) || null,
    [Symbol.iterator]: function *iterator() {
      for (const item of entries.values()) yield item;
    }
  };
}

async function run() {
  const tokenUuidDoc = { id: "token-uuid", source: "uuid-token" };
  const sceneToken = { id: "scene-token", source: "scene-token" };
  const activeSceneToken = { id: "active-token", source: "active-token" };
  const actorMatchOne = { id: "actor-match-1", actorId: "a1", name: "Brute", actor: { name: "Bandit" } };
  const actorMatchTwo = { id: "actor-match-2", actorId: "a1", name: "Chef", actor: { name: "Alice" } };
  const sceneA = { id: "scene-a", tokens: createCollection([sceneToken, actorMatchOne]) };
  const sceneB = { id: "scene-b", tokens: createCollection([actorMatchTwo]) };

  const worldActor = { id: "world-actor-1", source: "world-actor" };
  const gameRef = {
    scenes: createCollection([sceneA, sceneB]),
    actors: createCollection([worldActor])
  };
  const canvasRef = {
    scene: { tokens: createCollection([activeSceneToken]) }
  };

  const hooks = buildDamageTargetResolution({
    getDamagePayloadField: (data, keys) => {
      for (const key of keys) {
        const value = data?.[key];
        if (value == null || value === "") continue;
        return value;
      }
      return undefined;
    },
    compatFromUuid: async uuid => {
      if (uuid === "Token.token-uuid") return { document: tokenUuidDoc };
      if (uuid === "Actor.uuid-actor") return { id: "uuid-actor", source: "uuid-actor" };
      return null;
    },
    getGame: () => gameRef,
    getCanvas: () => canvasRef
  });

  const resolvedByUuid = await hooks.resolveDamageTokenDocument({ tokenUuid: "Token.token-uuid" });
  assert.equal(resolvedByUuid, tokenUuidDoc);

  const resolvedBySceneAndToken = await hooks.resolveDamageTokenDocument({
    sceneId: "scene-a",
    tokenId: "scene-token"
  });
  assert.equal(resolvedBySceneAndToken, sceneToken);

  const resolvedByActiveScene = await hooks.resolveDamageTokenDocument({ tokenId: "active-token" });
  assert.equal(resolvedByActiveScene, activeSceneToken);

  const resolvedByActorName = await hooks.resolveDamageTokenDocument({
    actorId: "a1",
    targetName: "alice"
  });
  assert.equal(resolvedByActorName, actorMatchTwo);

  const tokenDocFromGetActor = {
    actor: null,
    getActor: async () => ({ id: "token-actor", source: "getActor" })
  };
  const resolvedActorsFromGetActor = await hooks.resolveDamageActors(tokenDocFromGetActor, {
    actorUuid: "Actor.uuid-actor",
    actorId: "world-actor-1"
  });
  assert.equal(resolvedActorsFromGetActor.tokenActor.source, "getActor");
  assert.equal(resolvedActorsFromGetActor.uuidActor.source, "uuid-actor");
  assert.equal(resolvedActorsFromGetActor.worldActor, worldActor);

  const tokenDocFromObjectActor = {
    actor: null,
    object: { actor: { id: "token-actor-object", source: "object-actor" } }
  };
  const resolvedActorsFromObject = await hooks.resolveDamageActors(tokenDocFromObjectActor, {
    actorId: "world-actor-1"
  });
  assert.equal(resolvedActorsFromObject.tokenActor.source, "object-actor");
}

run()
  .then(() => {
    console.log("damage-target-resolution.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
