import assert from "node:assert/strict";
import { createOpenActorSheetController } from "../../src/sheets/open-actor-sheets.mjs";

function actor(id, options = {}) {
  return {
    id,
    uuid: options.uuid || `Actor.${id}`,
    type: options.type || "personnage",
    isOwner: options.isOwner ?? true,
    items: options.items || new Map(),
    ...options
  };
}

function actorCollection(actors = []) {
  return {
    get: id => actors.find(entry => entry.id === id) || null,
    [Symbol.iterator]: function* iterator() {
      yield* actors;
    }
  };
}

function run() {
  const worldActor = actor("a1");
  const tokenActor = actor("a1", { uuid: "Scene.s1.Token.t1.Actor.a1", parent: { id: "t1" } });
  const otherActor = actor("a2", { type: "note", isOwner: true });
  const tokenDoc = { id: "t1", actorId: "a1", actor: tokenActor };
  const game = {
    actors: actorCollection([worldActor, otherActor]),
    scenes: [
      { tokens: [tokenDoc] }
    ]
  };
  const app = {
    actor: worldActor,
    renderCalls: [],
    render(force) {
      this.renderCalls.push(force);
    }
  };
  const controller = createOpenActorSheetController({
    getGame: () => game,
    collectOpenApplications: () => [app],
    getApplicationDocumentActor: candidate => candidate.actor || null
  });

  assert.deepEqual(controller.getTokenDocumentsForActor(worldActor), [tokenDoc]);
  game.scenes[0].tokens.push({ id: "t2", actorId: "a1", actor: actor("a1", { uuid: "Scene.s1.Token.t2.Actor.a1" }) });
  assert.equal(controller.getTokenDocumentsForActor(worldActor).length, 1);
  controller.clearResolvedActorDocumentCaches();
  assert.equal(controller.getTokenDocumentsForActor(worldActor).length, 2);

  const actorInstances = controller.getActorInstancesById("a1");
  assert.equal(actorInstances.length, 3);
  assert.equal(controller.getOwnedCharacterActorInstances().some(entry => entry.id === "a2"), false);
  assert.deepEqual([...controller.getActorSheetMatchKeys({ id: "base", uuid: "Actor.base", token: { actorId: "world" } })], ["base", "Actor.base", "world"]);
  assert.ok(controller.getActorSheetDomMatchTokens({ uuid: "Actor.base" }).includes("Actor-base"));
  assert.deepEqual(controller.getOpenActorSheetApplicationsForActor(worldActor), [app]);

  controller.renderOpenActorSheetsForActor(worldActor);
  assert.deepEqual(app.renderCalls, [false]);

  const itemActor = actor("fallback", { items: new Map([["item-1", {}]]) });
  const openOnlyApp = { actor: itemActor };
  const fallbackController = createOpenActorSheetController({
    getGame: () => ({ actors: actorCollection([]), scenes: [] }),
    collectOpenApplications: () => [openOnlyApp],
    getApplicationDocumentActor: candidate => candidate.actor || null
  });
  assert.deepEqual(fallbackController.resolveAttackerActorInstancesForDamageApplied({ itemId: "item-1" }), [itemActor]);
}

run();
console.log("open-actor-sheets.test.mjs: OK");
