import assert from "node:assert/strict";
import { buildDropDecisionDialogContent } from "../../src/ui/drop-decision-dialog.mjs";

function run() {
  const html = buildDropDecisionDialogContent({
    preview: {
      intro: "Deplacer <objet>",
      firstItemName: "Lame & bouclier",
      targetName: "Heritiere",
      costLabel: "Prix",
      totalCost: 12,
      specificsLabel: "Details",
      specificities: ["PA < 2", "Rare & fragile"],
      hasInvalidPrice: true
    },
    labels: {
      eyebrow: "Transfert",
      title: "Choix",
      itemLabel: "Objet",
      destinationLabel: "Destination",
      warningLabel: "Attention",
      warningText: "Prix invalide"
    },
    formatCurrencyValue: value => `${value} PO`
  });

  assert.match(html, /class="bm-drop-insufficient-funds bm-transfer-dialog"/);
  assert.match(html, /Lame &amp; bouclier/);
  assert.match(html, /Deplacer &lt;objet&gt;/);
  assert.match(html, /12 PO/);
  assert.match(html, /Prix invalide/);
  assert.doesNotMatch(html, /<style>/);
}

run();
console.log("drop-decision-dialog.test.mjs: OK");
