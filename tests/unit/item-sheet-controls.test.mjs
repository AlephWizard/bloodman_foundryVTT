import assert from "node:assert/strict";
import { createItemSheetControlsController } from "../../src/ui/item-sheet-controls.mjs";

class FakeSelection {
  constructor({ value = "", length = 1 } = {}) {
    this.length = length;
    this._value = value;
    this.attrs = new Map();
    this.props = new Map();
    this.classes = new Map();
    this.textValue = "";
    this.handlers = new Map();
    this.offCalls = [];
  }

  first() {
    return this;
  }

  val(value) {
    if (value === undefined) return this._value;
    this._value = value;
    return this;
  }

  attr(name, value) {
    if (value === undefined) return this.attrs.get(name);
    this.attrs.set(name, value);
    return this;
  }

  prop(name, value) {
    if (value === undefined) return this.props.get(name);
    this.props.set(name, value);
    return this;
  }

  text(value) {
    if (value === undefined) return this.textValue;
    this.textValue = value;
    return this;
  }

  toggleClass(name, value) {
    this.classes.set(name, value);
    return this;
  }

  off(eventName) {
    this.offCalls.push(eventName);
    return this;
  }

  on(eventName, selectorOrHandler, maybeHandler) {
    const key = typeof selectorOrHandler === "string" ? `${eventName}|${selectorOrHandler}` : eventName;
    this.handlers.set(key, typeof selectorOrHandler === "function" ? selectorOrHandler : maybeHandler);
    return this;
  }
}

function createRoot() {
  const audioPreviewButton = new FakeSelection();
  const audioButton = new FakeSelection();
  const priceInput = new FakeSelection({ value: "20" });
  const saleInput = new FakeSelection({ value: "" });
  const errorNode = new FakeSelection();
  const root = {
    length: 1,
    handlers: new Map(),
    find(selector) {
      if (selector === ".bm-item-audio-field .bm-item-audio-preview") return audioPreviewButton;
      if (selector === ".bm-item-audio-field .file-picker") return audioButton;
      if (selector === "input[name='system.price']") return priceInput;
      if (selector === "input[name='system.salePrice']") return saleInput;
      if (selector === "[data-price-error]") return errorNode;
      return new FakeSelection({ length: 0 });
    },
    on(eventName, selector, handler) {
      this.handlers.set(`${eventName}|${selector}`, handler);
      return this;
    }
  };
  return { root, audioPreviewButton, audioButton, priceInput, saleInput, errorNode };
}

async function run() {
  const warnings = [];
  const renderedPickers = [];
  const audioPreviewCalls = [];
  const queued = [];
  const cleared = [];
  let pickerOptions = null;
  class FakeFilePicker {
    constructor(options) {
      pickerOptions = options;
    }
  }

  const controller = createItemSheetControlsController({
    getFilePickerClass: () => FakeFilePicker,
    renderFilePickerSafely: (picker, label) => {
      renderedPickers.push({ picker, label });
      return true;
    },
    warn: message => warnings.push(message),
    isPriceManagedItemType: type => type === "arme",
    playItemAudio: async (item, options) => {
      audioPreviewCalls.push({ item, options });
      return true;
    },
    resolveSaleManualFlag: (_price, sale) => String(sale || "") === "manual",
    resolveItemPricePreviewUiState: ({ priceValue, saleValue, saleManual }) => {
      if (String(priceValue) === "bad") {
        return { invalid: true, errorMessage: "Prix invalide", nextSaleValue: saleManual ? saleValue : "", ariaInvalid: "true" };
      }
      return { invalid: false, errorMessage: "", nextSaleValue: saleManual ? saleValue : "10", ariaInvalid: "false" };
    },
    resolveDeferredRoot: (_previous, next) => next,
    queueUiMicrotask: callback => {
      queued.push(callback);
      return queued.length;
    },
    clearUiMicrotask: taskId => cleared.push(taskId)
  });

  const itemUpdates = [];
  const sheet = {
    item: {
      type: "arme",
      system: { audioFile: "old.mp3" },
      async update(updateData) {
        itemUpdates.push(updateData);
      }
    },
    element: null
  };

  assert.equal(controller.openItemAudioFilePicker(sheet), true);
  assert.equal(renderedPickers[0].label, "item-audio-file-picker");
  assert.equal(pickerOptions.type, "audio");
  assert.equal(pickerOptions.current, "old.mp3");
  await pickerOptions.callback("old.mp3");
  await pickerOptions.callback("new.mp3");
  assert.deepEqual(itemUpdates, [{ "system.audioFile": "new.mp3" }]);

  const missingPickerController = createItemSheetControlsController({
    getFilePickerClass: () => null,
    warn: message => warnings.push(message)
  });
  assert.equal(missingPickerController.openItemAudioFilePicker(sheet), false);
  assert.equal(warnings.at(-1), "Selection audio impossible: FilePicker indisponible.");

  assert.equal(await controller.playItemAudioPreview(sheet), true);
  assert.deepEqual(audioPreviewCalls.at(-1), {
    item: sheet.item,
    options: { delayMs: 0, broadcast: false }
  });

  const missingPreviewController = createItemSheetControlsController();
  assert.equal(await missingPreviewController.playItemAudioPreview(sheet), false);

  const { root, audioPreviewButton, audioButton, priceInput, saleInput, errorNode } = createRoot();
  sheet.element = root;
  assert.equal(controller.activateAudioFilePickerListeners(sheet, root), true);
  assert.deepEqual(audioPreviewButton.offCalls, ["click"]);
  assert.deepEqual(audioButton.offCalls, ["click"]);
  let previewPrevented = false;
  let previewStopped = false;
  audioPreviewButton.handlers.get("click")({
    preventDefault: () => { previewPrevented = true; },
    stopPropagation: () => { previewStopped = true; }
  });
  assert.equal(previewPrevented, true);
  assert.equal(previewStopped, true);
  assert.equal(audioPreviewCalls.length, 2);

  let pickerPrevented = false;
  let pickerStopped = false;
  audioButton.handlers.get("click")({
    preventDefault: () => { pickerPrevented = true; },
    stopPropagation: () => { pickerStopped = true; }
  });
  assert.equal(pickerPrevented, true);
  assert.equal(pickerStopped, true);

  assert.equal(controller.syncPricePreviewSaleManualState(sheet, root), false);
  assert.equal(saleInput.attrs.get("data-sale-manual"), "false");
  controller.refreshPricePreview(sheet, root);
  assert.equal(saleInput.val(), "10");
  assert.equal(errorNode.text(), "");
  assert.equal(priceInput.classes.get("is-invalid"), false);
  assert.equal(priceInput.attrs.get("aria-invalid"), "false");

  saleInput.val("manual");
  assert.equal(controller.syncPricePreviewSaleManualState(sheet, root), true);
  priceInput.val("bad");
  controller.refreshPricePreview(sheet, root);
  assert.equal(saleInput.val(), "manual");
  assert.equal(errorNode.text(), "Prix invalide");
  assert.equal(priceInput.classes.get("is-invalid"), true);

  controller.queuePricePreviewRefresh(sheet, root);
  assert.equal(sheet._pricePreviewRefreshTaskId, 1);
  queued[0]();
  assert.equal(sheet._pricePreviewRefreshTaskId, null);

  sheet._pricePreviewRefreshTaskId = 42;
  controller.clearQueuedPricePreviewRefresh(sheet);
  assert.deepEqual(cleared, [42]);
  assert.equal(sheet._queuedPricePreviewRoot, null);

  const { root: listenerRoot } = createRoot();
  controller.activatePricePreviewListeners(sheet, listenerRoot);
  assert.ok(listenerRoot.handlers.has("input change blur|input[name='system.price']"));
  assert.ok(listenerRoot.handlers.has("input change blur|input[name='system.salePrice']"));

  const switchSelections = new Map([
    ["input[name='system.singleUseCount']", new FakeSelection()],
    ["input[name='system.powerCost']", new FakeSelection()],
    ["input[name='system.damageDie']", new FakeSelection()],
    ["input[name='system.pa']", new FakeSelection()],
    ["input[name='system.healDie']", new FakeSelection()],
    ["input[name^='system.characteristicBonuses.']", new FakeSelection()],
    [".bonus-grid-characteristics", new FakeSelection()],
    ["input[name^='system.rawBonuses.']", new FakeSelection()],
    [".bonus-grid-compact", new FakeSelection()],
    ["input[name='system.weaponType']:checked", new FakeSelection({ value: "distance" })],
    ["input[name='system.magazineCapacity']", new FakeSelection({ value: "3" })],
    ["input[name='system.loadedAmmo']", new FakeSelection()],
    [".bm-item-equiper-avec-builder", new FakeSelection()]
  ]);
  const switchRoot = {
    length: 1,
    find(selector) {
      return switchSelections.get(selector) || new FakeSelection({ length: 0 });
    }
  };
  const switchSheet = { element: switchRoot };

  assert.equal(controller.syncSwitchDependentUi(switchSheet, "system.singleUseEnabled", true), true);
  assert.equal(switchSelections.get("input[name='system.singleUseCount']").props.get("disabled"), false);
  controller.syncSwitchDependentUi(switchSheet, "system.damageEnabled", false);
  assert.equal(switchSelections.get("input[name='system.damageDie']").props.get("disabled"), true);
  controller.syncSwitchDependentUi(switchSheet, "system.characteristicBonusEnabled", false);
  assert.equal(switchSelections.get("input[name^='system.characteristicBonuses.']").props.get("disabled"), true);
  assert.equal(switchSelections.get(".bonus-grid-characteristics").classes.get("is-disabled"), true);
  controller.syncSwitchDependentUi(switchSheet, "system.rawBonusEnabled", true);
  assert.equal(switchSelections.get("input[name^='system.rawBonuses.']").props.get("disabled"), false);
  assert.equal(switchSelections.get(".bonus-grid-compact").classes.get("is-disabled"), false);
  controller.syncSwitchDependentUi(switchSheet, "system.infiniteAmmo", false);
  assert.equal(switchSelections.get("input[name='system.loadedAmmo']").props.get("disabled"), false);
  controller.syncSwitchDependentUi(switchSheet, "system.infiniteAmmo", true);
  assert.equal(switchSelections.get("input[name='system.loadedAmmo']").props.get("disabled"), true);
  controller.syncSwitchDependentUi(switchSheet, "system.link.equiperAvecEnabled", false);
  assert.equal(switchSelections.get(".bm-item-equiper-avec-builder").classes.get("is-disabled"), true);
  assert.equal(controller.syncSwitchDependentUi({ element: { length: 0 } }, "system.damageEnabled", true), false);
}

run()
  .then(() => {
    console.log("item-sheet-controls.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
