import assert from "node:assert/strict";
import { createItemSheetControlsController } from "../../src/ui/item-sheet-controls.mjs";

class FakeSelection {
  constructor({ value = "", length = 1 } = {}) {
    this.length = length;
    this._value = value;
    this.attrs = new Map();
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
  const audioButton = new FakeSelection();
  const priceInput = new FakeSelection({ value: "20" });
  const saleInput = new FakeSelection({ value: "" });
  const errorNode = new FakeSelection();
  const root = {
    length: 1,
    handlers: new Map(),
    find(selector) {
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
  return { root, audioButton, priceInput, saleInput, errorNode };
}

async function run() {
  const warnings = [];
  const renderedPickers = [];
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

  const { root, audioButton, priceInput, saleInput, errorNode } = createRoot();
  sheet.element = root;
  assert.equal(controller.activateAudioFilePickerListeners(sheet, root), true);
  assert.deepEqual(audioButton.offCalls, ["click"]);
  let prevented = false;
  let stopped = false;
  audioButton.handlers.get("click")({
    preventDefault: () => { prevented = true; },
    stopPropagation: () => { stopped = true; }
  });
  assert.equal(prevented, true);
  assert.equal(stopped, true);

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
}

run()
  .then(() => {
    console.log("item-sheet-controls.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
