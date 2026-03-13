import assert from "node:assert/strict";
import { buildItemDerivedSyncHooks } from "../../src/hooks/item-derived-sync.mjs";

async function run() {
  const calls = [];
  const hooks = buildItemDerivedSyncHooks({
    applyItemResourceBonuses: async actor => {
      calls.push({ kind: "resource", actorId: actor?.id });
    },
    syncActorDerivedCharacteristicsResources: async actor => {
      calls.push({ kind: "derived", actorId: actor?.id });
    },
    characteristicBonusItemTypes: new Set(["arme"]),
    shouldProcessItemMutation: (_item, context) => String(context?.userId || "") === "u1",
    bmLog: { warn: () => {} }
  });

  const actor = { id: "actor-1" };
  await hooks.handleItemDerivedSyncHook({ actor, type: "pouvoir" }, "updateItem", { userId: "u2" });
  assert.deepEqual(calls, []);

  await hooks.handleItemDerivedSyncHook({ actor, type: "pouvoir" }, "updateItem", { userId: "u1" });
  assert.deepEqual(calls, [
    { kind: "resource", actorId: "actor-1" },
    { kind: "derived", actorId: "actor-1" }
  ]);

  calls.length = 0;
  await hooks.handleItemDerivedSyncHook({ actor, type: "arme" }, "updateItem", { userId: "u1" });
  assert.deepEqual(calls, [
    { kind: "derived", actorId: "actor-1" }
  ]);
}

run()
  .then(() => {
    console.log("item-derived-sync.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
