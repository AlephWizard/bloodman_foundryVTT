import assert from "node:assert/strict";
import { buildSocketActorResolutionHelpers } from "../../src/rules/socket-actor-resolution.mjs";

async function run() {
  const worldActor = { id: "world-a1", type: "personnage", source: "world" };
  const worldNpc = { id: "world-npc", type: "personnage-non-joueur", source: "world" };
  const actors = new Map([
    ["world-a1", worldActor],
    ["world-npc", worldNpc]
  ]);

  const helpers = buildSocketActorResolutionHelpers({
    compatFromUuid: async uuid => {
      if (uuid === "Actor.uuid-character") {
        return { document: { id: "uuid-character", type: "personnage", documentName: "Actor", source: "uuid" } };
      }
      if (uuid === "Actor.uuid-npc") {
        return { document: { id: "uuid-npc", type: "personnage-non-joueur", documentName: "Actor", source: "uuid" } };
      }
      if (uuid === "Token.token-a1") {
        return {
          documentName: "Token",
          actor: { id: "token-character", type: "personnage", documentName: "Actor", source: "token", isToken: true, token: { actorLink: true } }
        };
      }
      return null;
    },
    getActorById: actorId => actors.get(actorId) || null
  });

  const resolvedCharacter = await helpers.resolveActorForSocketPayload({
    actorBaseId: "world-a1",
    actorUuid: "Actor.uuid-character"
  });
  assert.equal(resolvedCharacter, worldActor);

  const resolvedNpc = await helpers.resolveActorForSocketPayload({
    actorBaseId: "world-npc",
    actorUuid: "Actor.uuid-npc"
  });
  assert.equal(resolvedNpc.id, "uuid-npc");
  assert.equal(resolvedNpc.source, "uuid");

  const resolvedTokenCharacter = await helpers.resolveActorForSocketPayload({
    actorBaseId: "world-a1",
    actorUuid: "Token.token-a1"
  });
  assert.equal(resolvedTokenCharacter, worldActor);

  const resolvedFallbackWorld = await helpers.resolveActorForSocketPayload({
    actorBaseId: "world-npc"
  });
  assert.equal(resolvedFallbackWorld, worldNpc);

  const resolvedFromAliasMethods = await helpers.resolveActorForSheetRequest({
    actorBaseId: "world-a1",
    actorUuid: "Token.token-a1"
  });
  assert.equal(resolvedFromAliasMethods, worldActor);
}

run()
  .then(() => {
    console.log("socket-actor-resolution.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
