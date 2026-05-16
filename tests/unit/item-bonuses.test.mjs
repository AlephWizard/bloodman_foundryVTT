import assert from "node:assert/strict";
import { createItemBonusRules } from "../../src/rules/item-bonuses.mjs";

function run() {
  const calls = [];
  const rules = createItemBonusRules({
    characteristics: [{ key: "PHY" }],
    characteristicBonusItemTypes: new Set(["arme"]),
    resourceBonusItemTypes: new Set(["aptitude"]),
    isActorItemLinkedChild: item => item?.id === "linked",
    computeItemCharacteristicBonusTotals: args => {
      calls.push({ kind: "characteristic", args });
      return { PHY: args.items.length };
    },
    computeItemResourceBonusTotals: args => {
      calls.push({ kind: "resource", args });
      return { pv: args.items.length, pp: 0 };
    },
    toCheckboxBoolean: value => value === true || value === "true"
  });

  const actor = {
    items: [
      { id: "visible", type: "arme" },
      { id: "linked", type: "arme" },
      null
    ]
  };

  assert.deepEqual(rules.getVisibleActorItems(actor), [{ id: "visible", type: "arme" }]);
  assert.deepEqual(rules.getItemBonusTotals(actor), { PHY: 1 });
  assert.equal(calls[0].args.characteristics[0].key, "PHY");
  assert.equal(calls[0].args.characteristicBonusItemTypes.has("arme"), true);
  assert.equal(calls[0].args.isBonusEnabled("true"), true);

  assert.deepEqual(rules.getItemResourceBonusTotals(actor), { pv: 1, pp: 0 });
  assert.equal(calls[1].args.resourceBonusItemTypes.has("aptitude"), true);

  const explicitItems = [{ id: "forced" }, null];
  assert.deepEqual(rules.getItemBonusTotals(actor, { items: explicitItems }), { PHY: 1 });
}

run();
console.log("item-bonuses.test.mjs: OK");
