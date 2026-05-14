import assert from "node:assert/strict";

import {
  getCreateTypeIconByLabelText,
  getCreateTypeIconByTypeKey,
  injectDocumentCreateTypeIcons,
  installCreateTypeIconObserver,
  normalizeCreateTypeLabel,
  refreshAllCreateTypeIcons
} from "../../src/ui/document-create-type-icons.mjs";

function run() {
  assert.equal(normalizeCreateTypeLabel("  Personnage non joueur  "), "personnage non joueur");
  assert.equal(getCreateTypeIconByTypeKey("arme"), "fa-gun");
  assert.equal(getCreateTypeIconByTypeKey("personnage-non-joueur"), "fa-mask");
  assert.equal(getCreateTypeIconByLabelText("Pouvoir"), "fa-bolt");
  assert.equal(getCreateTypeIconByLabelText("Personnage non joueur"), "fa-mask");

  assert.doesNotThrow(() => injectDocumentCreateTypeIcons(null));
  assert.doesNotThrow(() => refreshAllCreateTypeIcons());
  assert.equal(installCreateTypeIconObserver({ enabled: true }), false);
}

run();
console.log("document-create-type-icons.test.mjs: OK");
