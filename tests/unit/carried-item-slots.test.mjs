import assert from "node:assert/strict";
import {
  getCarriedItemInventorySlots,
  normalizeCarriedItemInventorySlots,
  sumCarriedItemInventorySlots
} from "../../src/rules/carried-item-slots.mjs";

function run() {
  assert.equal(normalizeCarriedItemInventorySlots(undefined), 1);
  assert.equal(normalizeCarriedItemInventorySlots(0), 1);
  assert.equal(normalizeCarriedItemInventorySlots("3"), 3);
  assert.equal(normalizeCarriedItemInventorySlots(2.9), 2);

  assert.equal(getCarriedItemInventorySlots({ system: { inventorySlots: 4 } }), 4);
  assert.equal(getCarriedItemInventorySlots({ system: {} }), 1);

  assert.equal(
    sumCarriedItemInventorySlots([
      { system: { inventorySlots: 2 } },
      { system: { inventorySlots: 3 } },
      { system: {} }
    ]),
    6
  );
}

run();
console.log("carried-item-slots.test.mjs: OK");
