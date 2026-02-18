import assert from "node:assert/strict";
import { createItemBucketRules } from "../../src/rules/item-buckets.mjs";

async function run() {
  const rules = createItemBucketRules({
    itemBucketTypes: ["arme", "objet", "ration", "soin", "protection", "aptitude", "pouvoir"],
    carriedItemTypes: new Set(["arme", "objet", "ration", "soin"])
  });

  const items = [
    { id: "1", type: "arme" },
    { id: "2", type: "APTITUDE" },
    { id: "3", type: "pouvoir" },
    { id: "4", type: "objet" },
    { id: "5", type: "unknown" },
    null
  ];

  const buckets = rules.buildTypedItemBuckets(items);
  assert.equal(Array.isArray(buckets.arme), true);
  assert.equal(Array.isArray(buckets.aptitude), true);
  assert.equal(Array.isArray(buckets.pouvoir), true);
  assert.equal(buckets.arme.length, 1);
  assert.equal(buckets.aptitude.length, 1);
  assert.equal(buckets.pouvoir.length, 1);
  assert.equal(buckets.objet.length, 1);
  assert.equal(buckets.ration.length, 0);

  const counts = rules.getActorItemCounts(items);
  assert.deepEqual(counts, {
    total: 5,
    aptitudes: 1,
    pouvoirs: 1,
    carried: 2
  });
}

run()
  .then(() => {
    console.log("item-buckets.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
