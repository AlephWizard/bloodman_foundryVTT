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

class FakeSelection {
  constructor({ length = 1, text = "" } = {}) {
    this.length = length;
    this.props = new Map();
    this.classes = new Map();
    this._text = text;
  }

  prop(name, value) {
    this.props.set(name, value);
    return this;
  }

  toggleClass(name, value) {
    this.classes.set(name, value);
    return this;
  }

  first() {
    return this;
  }

  text(value) {
    if (value === undefined) return this._text;
    this._text = value;
    return this;
  }
}

function fakeRoot() {
  const selections = new Map([
    [".bag-slots-toggle[data-bag-slots='yes']", new FakeSelection()],
    [".bag-slots-toggle[data-bag-slots='no']", new FakeSelection()],
    [".objects-bag-list", new FakeSelection()],
    [".carry-slots-indicator", new FakeSelection({ text: "2 / 10" })]
  ]);
  return {
    selections,
    find: selector => selections.get(selector) || new FakeSelection({ length: 0 })
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
  const root = fakeRoot();
  const app = {
    actor: worldActor,
    root,
    renderCalls: [],
    render(force) {
      this.renderCalls.push(force);
    }
  };
  const controller = createOpenActorSheetController({
    getGame: () => game,
    getDocument: () => null,
    getJQuery: () => null,
    collectOpenApplications: () => [app],
    getApplicationDocumentActor: candidate => candidate.actor || null,
    getSheetElementWrapperForApp: candidate => candidate.root,
    carriedItemLimitBase: 10,
    carriedItemLimitWithBag: 15
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

  assert.equal(controller.patchBackpackControlsInRoot(root, true), true);
  assert.equal(root.selections.get(".bag-slots-toggle[data-bag-slots='yes']").props.get("checked"), true);
  assert.equal(root.selections.get(".bag-slots-toggle[data-bag-slots='no']").props.get("checked"), false);
  assert.equal(root.selections.get(".objects-bag-list").classes.get("is-disabled"), false);
  assert.equal(root.selections.get(".carry-slots-indicator").text(), "2 / 15");

  controller.updateOpenActorSheetsBackpackState(worldActor, false);
  assert.equal(app._optimisticBagSlotsEnabled, false);
  assert.deepEqual(app.renderCalls, [false]);
  assert.equal(root.selections.get(".objects-bag-list").classes.get("is-disabled"), true);

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
