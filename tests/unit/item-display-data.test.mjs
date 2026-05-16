import assert from "node:assert/strict";
import { createItemDisplayDataBuilder } from "../../src/ui/item-display-data.mjs";

function run() {
  const buildItemDisplayData = createItemDisplayDataBuilder({
    isPowerUsableEnabled: value => value === true,
    formatMultilineTextToHtml: value => String(value || "").replace(/\n/g, "<br>"),
    resolveItemSingleUseDisplayData: systemData => ({
      show: Number(systemData?.singleUseCount || 0) > 1,
      label: `USES ${systemData?.singleUseCount || 0}`
    }),
    normalizeRollDieFormula: value => String(value || "").trim().toUpperCase(),
    toCheckboxBoolean: value => value === true || value === "true"
  });

  const item = {
    id: "item-a",
    system: {
      usableEnabled: true,
      note: "a\nb",
      singleUseCount: 3,
      damageEnabled: true,
      damageDie: " d6 ",
      healEnabled: "true",
      healDie: " d8 "
    },
    toObject() {
      return {
        system: { ...this.system }
      };
    }
  };

  const data = buildItemDisplayData(item);
  assert.equal(data._id, "item-a");
  assert.equal(data.usableEnabled, true);
  assert.equal(data.displayNoteHtml, "a<br>b");
  assert.equal(data.showSingleUseCount, true);
  assert.equal(data.singleUseCountLabel, "USES 3");
  assert.equal(data.singleUseCountClass, "item-chip item-meta bm-btn-usage-count");
  assert.equal(data.displayDamageDie, "D6");
  assert.equal(data.displayHealDie, "D8");
}

run();
console.log("item-display-data.test.mjs: OK");
