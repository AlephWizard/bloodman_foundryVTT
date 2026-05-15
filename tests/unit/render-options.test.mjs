import assert from "node:assert/strict";

import {
  getDocumentUuidOrId,
  isFoundryDocumentLike,
  sanitizeRenderOptions
} from "../../src/sheets/render-options.mjs";

function run() {
  assert.equal(isFoundryDocumentLike(null), false, "null should not be document-like");
  assert.equal(isFoundryDocumentLike({}), false, "plain objects should not be document-like");
  assert.equal(isFoundryDocumentLike({ documentName: "Actor" }), true, "documentName should mark Foundry documents");
  assert.equal(
    isFoundryDocumentLike({ update() {}, toObject() {} }),
    true,
    "update/toObject pair should mark Foundry document-like values"
  );

  class TokenDocument {}
  assert.equal(isFoundryDocumentLike(new TokenDocument()), true, "Document suffix should mark Foundry document-like values");

  const actorDoc = { documentName: "Actor", uuid: "Actor.abc", id: "abc" };
  const tokenDoc = { update() {}, toObject() {}, id: "token-1" };
  const options = {
    token: tokenDoc,
    actor: actorDoc,
    force: true,
    bloodmanResetRerollState: true,
    nested: { token: tokenDoc }
  };
  const sanitized = sanitizeRenderOptions(options);

  assert.notEqual(sanitized, options, "Sanitizing should clone the top-level options object");
  assert.equal("token" in sanitized, false, "Top-level document-like token should be removed");
  assert.equal("actor" in sanitized, false, "Top-level document-like actor should be removed");
  assert.equal(sanitized.force, true, "Non document-like options should be preserved");
  assert.equal(sanitized.bloodmanResetRerollState, true, "Bloodman render flags should be preserved");
  assert.equal(sanitized.nested, options.nested, "Nested values should not be deep-mutated");

  assert.deepEqual(sanitizeRenderOptions(null), {}, "Invalid options should sanitize to an empty object");
  assert.deepEqual(sanitizeRenderOptions(false), {}, "Non-object options should sanitize to an empty object");

  assert.equal(getDocumentUuidOrId({ uuid: " Actor.1 ", id: "fallback" }), "Actor.1", "uuid should be preferred");
  assert.equal(getDocumentUuidOrId({ id: " item-1 " }), "item-1", "id should be used when uuid is missing");
  assert.equal(getDocumentUuidOrId({ _id: " legacy-1 " }), "legacy-1", "_id should be used as legacy fallback");
  assert.equal(getDocumentUuidOrId(null), "", "Missing document should return an empty reference");
}

run();
console.log("render-options.test.mjs: OK");
