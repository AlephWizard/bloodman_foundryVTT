import assert from "node:assert/strict";
import { createActorSheetPermissionController } from "../../src/ui/actor-sheet-permissions.mjs";

class FakeSelection {
  constructor({ length = 1 } = {}) {
    this.length = length;
    this.props = new Map();
    this.attrs = new Map();
    this.classes = new Map();
  }

  prop(name, value) {
    this.props.set(name, value);
    return this;
  }

  attr(name, value) {
    this.attrs.set(name, value);
    return this;
  }

  removeAttr(name) {
    this.attrs.delete(name);
    return this;
  }

  addClass(name) {
    this.classes.set(name, true);
    return this;
  }

  removeClass(name) {
    this.classes.set(name, false);
    return this;
  }
}

class FakeRoot extends FakeSelection {
  constructor() {
    super({ length: 1 });
    this.selections = new Map();
  }

  find(selector) {
    if (!this.selections.has(selector)) this.selections.set(selector, new FakeSelection());
    return this.selections.get(selector);
  }

  toggleClass(name, value) {
    this.classes.set(name, value);
    return this;
  }
}

function createController({
  basicPlayer = false,
  canEditCharacteristics = false,
  root = null
} = {}) {
  return createActorSheetPermissionController({
    isBasicPlayerRole: () => basicPlayer,
    canCurrentUserEditCharacteristics: () => canEditCharacteristics,
    getUserRole: () => 1,
    getSheetElementWrapper: () => root,
    vitalResourceInputSelector: ".vital-inputs",
    characteristicBaseInputSelector: ".characteristic-base-inputs"
  });
}

function run() {
  const basicRoot = new FakeRoot();
  const basicController = createController({
    basicPlayer: true,
    canEditCharacteristics: false,
    root: basicRoot
  });

  assert.equal(
    basicController.applyInteractivePermissions({ actor: { type: "personnage" }, _characteristicsEditEnabled: false }),
    true
  );
  assert.equal(basicRoot.find("input, textarea, select, button").props.get("disabled"), false);
  assert.equal(basicRoot.find(".characteristic-base-inputs").props.get("readonly"), true);
  assert.equal(basicRoot.find(".characteristic-base-inputs").classes.get("is-locked"), true);
  assert.equal(basicRoot.find(".char-edit-toggle").classes.get("is-active"), false);

  const gmRoot = new FakeRoot();
  const gmController = createController({
    basicPlayer: false,
    canEditCharacteristics: true,
    root: gmRoot
  });

  assert.equal(
    gmController.applyInteractivePermissions({ actor: { type: "personnage" }, _characteristicsEditEnabled: true }),
    true
  );
  assert.equal(gmRoot.classes.get("characteristics-edit-active"), true);
  assert.equal(gmRoot.find(".char-edit-toggle").props.get("disabled"), false);
  assert.equal(gmRoot.find(".vital-inputs").props.get("disabled"), false);
  assert.equal(gmRoot.find(".vital-inputs").props.get("readonly"), false);
  assert.equal(gmRoot.find(".characteristic-base-inputs").props.get("disabled"), false);
  assert.equal(gmRoot.find(".characteristic-base-inputs").props.get("readonly"), false);
  assert.equal(gmRoot.find(".characteristic-base-inputs").classes.get("is-locked"), false);
  assert.equal(gmRoot.find(".char-edit-toggle").classes.get("is-active"), true);

  const missingRootController = createController({ root: { length: 0 } });
  assert.equal(missingRootController.applyInteractivePermissions({ actor: { type: "personnage" } }), false);
}

run();
console.log("actor-sheet-permissions.test.mjs: OK");
