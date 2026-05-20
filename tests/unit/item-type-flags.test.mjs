import assert from "node:assert/strict";
import { createItemTypeFlagRules } from "../../src/rules/item-type-flags.mjs";

async function run() {
  const rules = createItemTypeFlagRules({
    damageRerollAllowedItemTypes: new Set(["arme", "aptitude", "pouvoir"]),
    voyageXpCostItemTypes: new Set(["aptitude", "pouvoir"]),
    carriedItemLimitActorTypes: new Set(["personnage", "personnage-non-joueur"]),
    carriedItemLimitDefault: 10
  });

  assert.equal(rules.isDamageRerollItemType("arme"), true);
  assert.equal(rules.isDamageRerollItemType("ARME"), true);
  assert.equal(rules.isDamageRerollItemType("soin"), false);

  assert.equal(rules.isVoyageXPCostItemType("pouvoir"), true);
  assert.equal(rules.isVoyageXPCostItemType("objet"), false);

  assert.equal(rules.isCarriedItemLimitedActorType("personnage"), true);
  assert.equal(rules.isCarriedItemLimitedActorType("personnage-non-joueur"), true);
  assert.equal(rules.isCarriedItemLimitedActorType("vehicule"), false);

  assert.equal(rules.getActorCarriedItemsLimit({ system: { equipment: { carriedItemsMax: 12 } } }), 12);
  assert.equal(rules.getActorCarriedItemsLimit({ system: { equipment: { carriedItemsMax: "15" } } }), 15);
  assert.equal(rules.getActorCarriedItemsLimit({ system: { equipment: { carriedItemsMax: 3.8 } } }), 3);
  assert.equal(rules.getActorCarriedItemsLimit({ system: { equipment: { carriedItemsMax: -4 } } }), 0);
  assert.equal(rules.getActorCarriedItemsLimit({ system: { equipment: { carriedItemsMax: "" } } }), 10);
  assert.equal(rules.getActorCarriedItemsLimit(null), 10);
}

run()
  .then(() => {
    console.log("item-type-flags.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
