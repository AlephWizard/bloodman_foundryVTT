import assert from "node:assert/strict";
import { createDropDocumentResolutionController } from "../../src/sheets/drop-document-resolution.mjs";

function actorWithItems(id, items = []) {
  return {
    id,
    documentName: "Actor",
    items: new Map(items.map(item => [item.id, item]))
  };
}

async function run() {
  let currentTime = 1_000;
  let fromDropDataCalls = 0;
  const actorItem = { id: "item-a", name: "Actor item" };
  const actor = actorWithItems("actor-a", [actorItem]);
  const game = {
    actors: new Map([["actor-a", actor]])
  };
  const itemDocumentClass = {
    async fromDropData(entry) {
      fromDropDataCalls += 1;
      if (entry?.id === "direct") return { id: "direct", name: "Direct item" };
      throw new Error("not directly resolvable");
    }
  };
  const controller = createDropDocumentResolutionController({
    getItemDocumentClass: () => itemDocumentClass,
    getGame: () => game,
    fromUuid: async uuid => (uuid === "Actor.actor-a" ? actor : null),
    now: () => currentTime,
    cacheTtlMs: 10,
    cacheMax: 2
  });

  assert.equal(
    controller.buildDropDataCacheKey({
      type: "Item",
      documentUuid: "Actor.actor-a.Item.item-a",
      pack: "",
      itemId: "item-a",
      parentUuid: "Actor.actor-a"
    }),
    "item|Actor.actor-a.Item.item-a||item-a|Actor.actor-a"
  );
  assert.equal(controller.buildDropDataCacheKey(null), "");

  assert.equal(
    await controller.resolveDroppedItemFromActorDropData({
      id: "item-a",
      uuid: "Actor.actor-a.Item.item-a"
    }),
    actorItem
  );
  assert.equal(
    await controller.resolveDroppedItemFromActorDropData({
      itemId: "item-a",
      actorId: "actor-a"
    }),
    actorItem
  );

  const firstEntry = { type: "Item", id: "direct", uuid: "Item.direct" };
  const first = await controller.resolveDroppedItemFromDropDataCached(firstEntry);
  const second = await controller.resolveDroppedItemFromDropDataCached({ type: "Item", id: "direct", uuid: "Item.direct" });
  assert.equal(first.id, "direct");
  assert.equal(second, first);
  assert.equal(fromDropDataCalls, 1);

  currentTime += 11;
  const third = await controller.resolveDroppedItemFromDropDataCached({ type: "Item", id: "direct", uuid: "Item.direct" });
  assert.equal(third.id, "direct");
  assert.equal(fromDropDataCalls, 2);

  const fallback = await controller.resolveDroppedItemFromDropDataCached({
    type: "Item",
    id: "item-a",
    uuid: "Actor.actor-a.Item.item-a"
  });
  assert.equal(fallback, actorItem);
  assert.equal(fromDropDataCalls, 3);

  const missingFirst = await controller.resolveDroppedItemFromDropDataCached({ type: "Item", id: "missing", uuid: "Item.missing" });
  const missingSecond = await controller.resolveDroppedItemFromDropDataCached({ type: "Item", id: "missing", uuid: "Item.missing" });
  assert.equal(missingFirst, null);
  assert.equal(missingSecond, null);
  assert.equal(fromDropDataCalls, 5, "Failed drop resolutions should not poison the cache");

  const missingClassController = createDropDocumentResolutionController({
    getItemDocumentClass: () => null
  });
  assert.equal(await missingClassController.resolveDroppedItemFromDropDataCached({ id: "x" }), null);
}

run()
  .then(() => {
    console.log("drop-document-resolution.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
