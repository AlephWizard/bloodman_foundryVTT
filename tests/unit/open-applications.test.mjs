import assert from "node:assert/strict";
import {
  collectOpenApplications,
  getApplicationDocumentActor
} from "../../src/ui/open-applications.mjs";

function actor(id) {
  return {
    id,
    documentName: "Actor",
    items: new Map()
  };
}

function run() {
  const v1 = { appId: 1, actor: actor("a1") };
  const v2 = { appId: 2, document: actor("a2") };
  const duplicate = { appId: 1, actor: actor("ignored") };
  const applications = collectOpenApplications({
    uiNamespace: { windows: { 1: v1, duplicate } },
    foundryNamespace: { applications: { instances: new Map([[2, v2]]) } }
  });

  assert.equal(applications.length, 2);
  assert.equal(getApplicationDocumentActor(v1)?.id, "a1");
  assert.equal(getApplicationDocumentActor(v2)?.id, "a2");
  assert.equal(getApplicationDocumentActor({ document: { documentName: "Item", items: new Map() } }), null);
}

run();
console.log("open-applications.test.mjs: OK");
