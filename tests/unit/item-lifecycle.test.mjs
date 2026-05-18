import assert from "node:assert/strict";
import { createItemLifecycleHooks } from "../../src/hooks/item-lifecycle.mjs";

async function run() {
  const calls = [];
  const actor = { id: "actor-1" };
  const item = { id: "item-1", actor, parent: actor };

  const hooks = createItemLifecycleHooks({
    getCurrentUserId: () => "u1",
    notifyInvalidAudioSelection: itemArg => calls.push(["audio-invalid", itemArg.id]),
    normalizeItemAudioUpdate: (_item, data) => {
      calls.push(["audio", data.kind]);
      return { invalid: data.invalidAudio === true };
    },
    normalizeItemLinkUpdate: (_item, data, options) => calls.push(["link", data.kind, options.includeSourceWhenMissing]),
    normalizeItemPriceUpdate: (_item, data) => calls.push(["price", data.kind]),
    normalizeWeaponMagazineCapacityUpdate: (_item, data) => {
      calls.push(["ammo", data?.kind || "source"]);
      return data?.needsSourceFallback !== true;
    },
    normalizeItemSingleUseUpdate: (_item, data, options) => calls.push(["single-use", data.kind, options.includeSourceWhenMissing]),
    normalizeItemInventorySlotsUpdate: (_item, data, options) => calls.push(["slots", data.kind, options.includeSourceWhenMissing]),
    normalizeCharacteristicBonusItemUpdate: (_item, data) => calls.push(["bonuses", data.kind]),
    normalizeItemRollFormulaFields: (_item, data, options) => {
      calls.push(["formula", data.kind, options.includeSourceWhenMissing]);
      return data.invalidFormula
        ? { invalid: true, invalidFields: ["system.damageDie"], invalidFieldErrors: { "system.damageDie": "bad" } }
        : { invalid: false };
    },
    notifyInvalidItemRollFormula: (_item, fields, errors) => calls.push(["formula-invalid", fields, errors]),
    normalizeVoyageXpCostOnCreate: (_item, data, options) => {
      calls.push(["voyage-create-normalize", data.kind, options.flag]);
      return data.cancelCreate ? false : true;
    },
    normalizeVoyageXpCostOnUpdate: (_item, data) => calls.push(["voyage-update-normalize", data.kind]),
    applyVoyageXPCostOnCreate: async (actorArg, itemArg, options) => {
      calls.push(["voyage-apply", actorArg.id, itemArg.id, options.flag]);
    },
    handleItemDerivedSyncHook: async (itemArg, hookName, context) => {
      calls.push(["derived", itemArg.id, hookName, context.userId || context.options?.userId || ""]);
    },
    cleanupItemLinksAfterDeletion: async itemArg => {
      calls.push(["cleanup", itemArg.id]);
      return true;
    },
    renderOpenActorSheetsForActor: actorArg => calls.push(["render", actorArg.id])
  });

  assert.equal(
    hooks.onPreCreateItem(item, { kind: "create", needsSourceFallback: true }, { flag: "ok" }),
    true
  );
  assert.deepEqual(calls.splice(0), [
    ["audio", "create"],
    ["link", "create", true],
    ["price", "create"],
    ["ammo", "create"],
    ["ammo", "source"],
    ["single-use", "create", true],
    ["slots", "create", true],
    ["bonuses", "create"],
    ["formula", "create", true],
    ["voyage-create-normalize", "create", "ok"]
  ]);

  assert.equal(hooks.onPreCreateItem(item, { kind: "create", invalidFormula: true }, {}), false);
  assert.equal(calls.at(-1)[0], "formula-invalid");
  calls.length = 0;

  assert.equal(hooks.onPreUpdateItem(item, { kind: "update", invalidAudio: true }), undefined);
  assert.deepEqual(calls, [
    ["audio", "update"],
    ["audio-invalid", "item-1"],
    ["link", "update", false],
    ["price", "update"],
    ["ammo", "update"],
    ["single-use", "update", false],
    ["slots", "update", false],
    ["bonuses", "update"],
    ["formula", "update", false],
    ["voyage-update-normalize", "update"]
  ]);
  calls.length = 0;

  assert.equal(hooks.onPreUpdateItem(item, { kind: "update", invalidFormula: true }), false);
  assert.equal(calls.at(-1)[0], "formula-invalid");
  calls.length = 0;

  await hooks.onCreateItem(item, { flag: "created" }, "u1");
  assert.deepEqual(calls, [
    ["voyage-apply", "actor-1", "item-1", "created"],
    ["derived", "item-1", "createItem", "u1"]
  ]);
  calls.length = 0;

  await hooks.onCreateItem(item, { flag: "ignored" }, "u2");
  assert.deepEqual(calls, []);

  hooks.onUpdateItem(item, {}, { userId: "u1" }, "u1");
  await Promise.resolve();
  assert.deepEqual(calls, [["derived", "item-1", "updateItem", "u1"]]);
  calls.length = 0;

  hooks.onDeleteItem(item, { userId: "u2" }, "u2");
  assert.deepEqual(calls, [["render", "actor-1"]]);
  calls.length = 0;

  hooks.onDeleteItem(item, { userId: "u1" }, "u1");
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(calls, [
    ["cleanup", "item-1"],
    ["derived", "item-1", "deleteItem", "u1"],
    ["render", "actor-1"]
  ]);
}

run()
  .then(() => {
    console.log("item-lifecycle.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
