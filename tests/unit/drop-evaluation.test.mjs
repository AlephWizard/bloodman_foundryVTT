import assert from "node:assert/strict";
import { createDropEvaluationRules } from "../../src/rules/drop-evaluation.mjs";

function createResolver(table) {
  return async entry => {
    const key = String(entry?.id || "");
    if (!Object.prototype.hasOwnProperty.call(table, key)) throw new Error("missing");
    return table[key];
  };
}

async function run() {
  const droppedTable = {
    a: { id: "a", type: "arme", actor: { id: "source-1" }, system: { price: "10", inventorySlots: 3 } },
    b: { id: "b", type: "objet", actor: null, permission: 2, system: { price: "5" } },
    c: { id: "c", type: "ration", actor: { id: "target" }, system: { price: "1" } },
    d: { id: "d", type: "soin", actor: null, pack: "world.pack", permission: 0, system: { price: "3" } },
    e: {
      id: "e",
      type: "protection",
      actor: null,
      permission: 0,
      testUserPermission: () => false,
      system: { price: "oops" }
    }
  };

  const rules = createDropEvaluationRules({
    fromDropData: createResolver(droppedTable),
    roundCurrencyValue: value => Math.round((Number(value) || 0) * 100) / 100,
    getDropItemQuantity: entry => Number(entry?.quantity || 1),
    getDroppedItemUnitPrice: item => {
      const value = Number(item?.system?.price);
      if (!Number.isFinite(value) || value < 0) return { ok: false, value: 0 };
      return { ok: true, value };
    },
    carriedItemTypes: new Set(["arme", "objet", "ration", "soin", "protection"]),
    shouldCountCarriedItem: item => item?.id !== "b",
    getCarriedItemSlots: item => Number(item?.system?.inventorySlots || 1)
  });

  const transfers = await rules.resolveActorTransferEntries({
    entries: [{ id: "a" }, { id: "b" }, { id: "c" }],
    targetActorId: "target"
  });
  assert.equal(transfers.length, 1);
  assert.equal(transfers[0].sourceActor.id, "source-1");

  assert.deepEqual(
    await rules.resolveDropPermissionState({
      entries: [{ id: "b" }],
      targetActorId: "target",
      currentUser: { id: "u1" },
      isGM: true,
      canDropMenuItems: false,
      limitedLevel: 1
    }),
    { allowed: true }
  );

  assert.deepEqual(
    await rules.resolveDropPermissionState({
      entries: [{ id: "b" }],
      targetActorId: "target",
      currentUser: { id: "u1" },
      isGM: false,
      canDropMenuItems: false,
      limitedLevel: 1
    }),
    { allowed: false, reason: "role" }
  );

  assert.deepEqual(
    await rules.resolveDropPermissionState({
      entries: [{ id: "a" }],
      targetActorId: "target",
      currentUser: { id: "u1" },
      isGM: false,
      canDropMenuItems: false,
      limitedLevel: 3
    }),
    { allowed: true }
  );

  assert.deepEqual(
    await rules.resolveDropPermissionState({
      entries: [{ id: "e" }],
      targetActorId: "target",
      currentUser: { id: "u1" },
      isGM: false,
      canDropMenuItems: true,
      limitedLevel: 1
    }),
    { allowed: false, reason: "permission" }
  );

  const purchase = await rules.resolveDropPurchaseSummary({
    entries: [
      { id: "a", quantity: 2 }, // source actor => ignored
      { id: "b", quantity: 3 }, // counted
      { id: "c", quantity: 1 }, // same actor => ignored
      { id: "d", quantity: 1 }, // pack but source null => counted in purchase path by original logic
      { id: "e", quantity: 1 }  // invalid price
    ],
    targetActorId: "target"
  });
  assert.deepEqual(purchase, {
    hasInvalidPrice: true,
    totalCost: 18
  });

  const incomingCarried = await rules.computeIncomingCarriedItemCount({
    entries: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "e" }],
    targetActorId: "target"
  });
  assert.equal(incomingCarried, 4);
}

run()
  .then(() => {
    console.log("drop-evaluation.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
