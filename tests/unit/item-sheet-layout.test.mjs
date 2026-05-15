import assert from "node:assert/strict";
import { createItemSheetLayoutController } from "../../src/ui/item-sheet-layout.mjs";

class FakeElement {
  constructor({ className = "", width = 920, height = 600 } = {}) {
    this.className = className;
    this.clientWidth = width;
    this.clientHeight = height;
    this.dataset = {};
    this.children = new Map();
    this.parent = null;
    this.styleValues = new Map();
    this.style = {
      setProperty: (key, value) => {
        this.styleValues.set(key, value);
      }
    };
  }

  matches(selector) {
    return selector.startsWith(".") && this.className.split(/\s+/).includes(selector.slice(1));
  }

  querySelector(selector) {
    return this.children.get(selector) || null;
  }

  closest() {
    return this.parent || this;
  }

  getBoundingClientRect() {
    return { width: this.clientWidth, height: this.clientHeight };
  }
}

class FakeTextArea extends FakeElement {
  constructor(options = {}) {
    super(options);
    this.tagName = "TEXTAREA";
    this.scrollHeight = options.scrollHeight ?? 120;
    this.attributes = new Map([["rows", String(options.rows ?? 2)]]);
    this.style = {
      height: "",
      maxHeight: "",
      overflowY: "",
      setProperty() {}
    };
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }
}

function jqueryRoot(fields = []) {
  return {
    length: 1,
    find() {
      return {
        length: fields.length,
        each(callback) {
          fields.forEach((field, index) => callback(index, field));
        }
      };
    }
  };
}

function buildController() {
  const queued = [];
  const cleared = [];
  const listeners = [];
  const windowRef = {
    innerWidth: 1600,
    innerHeight: 1000,
    getComputedStyle: () => ({
      fontSize: "14px",
      lineHeight: "20px",
      paddingTop: "2px",
      paddingBottom: "2px",
      borderTopWidth: "1px",
      borderBottomWidth: "1px"
    }),
    addEventListener: (eventName, handler) => listeners.push({ eventName, handler }),
    removeEventListener: (eventName, handler) => listeners.push({ eventName: `remove:${eventName}`, handler })
  };
  class FakeResizeObserver {
    constructor(callback) {
      this.callback = callback;
      this.observed = null;
      this.disconnected = false;
    }

    observe(target) {
      this.observed = target;
    }

    disconnect() {
      this.disconnected = true;
    }
  }

  const controller = createItemSheetLayoutController({
    resolveTextareaAutoGrowState: ({ scrollHeight }) => ({
      minHeight: 46,
      contentHeight: Math.max(46, Number(scrollHeight) || 0),
      nextHeight: Math.min(Math.max(46, Number(scrollHeight) || 0), 126),
      overflowY: Number(scrollHeight) > 126 ? "auto" : "hidden"
    }),
    resolveDeferredRoot: (_previous, next) => next,
    queueUiMicrotask: callback => {
      queued.push(callback);
      return queued.length;
    },
    clearUiMicrotask: taskId => cleared.push(taskId),
    getWindow: () => windowRef,
    getDocument: () => ({ documentElement: { clientWidth: 1500, clientHeight: 900 } }),
    getHTMLElementClass: () => FakeElement,
    getHTMLTextAreaElementClass: () => FakeTextArea,
    getResizeObserverClass: () => FakeResizeObserver
  });
  return { controller, queued, cleared, listeners };
}

async function run() {
  const { controller, queued, cleared, listeners } = buildController();

  assert.deepEqual(controller.getResponsiveSheetSize(), { width: 920, height: 560 });
  assert.deepEqual(
    controller.resolvePositionOptions(
      { position: { width: 1200, height: 700, left: 1500, top: 980 }, options: {} },
      {}
    ),
    { width: 1200, height: 700, left: 388, top: 288 }
  );
  assert.deepEqual(controller.resolveResponsiveItemSheetLayoutState(620, 480), {
    layoutMode: "stacked",
    heightMode: "short",
    useNoteScroll: true,
    noteMaxHeight: 163
  });

  const sheetRoot = new FakeElement({ className: "bm-item-unified", width: 1180, height: 760 });
  const textarea = new FakeTextArea({ scrollHeight: 180 });
  sheetRoot.children.set(".bm-item-note-textarea", textarea);
  const sheet = {
    element: [sheetRoot],
    position: { width: 1180, height: 800 }
  };

  assert.equal(controller.getResponsiveSheetScaleTarget(sheet, sheetRoot), sheetRoot);
  assert.equal(controller.getResponsiveSheetObserverTarget(sheet, sheetRoot), sheetRoot);
  const state = controller.applyResponsiveItemSheetLayoutState(sheet, sheetRoot, { width: 620, height: 480 });
  assert.equal(state.layoutMode, "stacked");
  assert.equal(sheetRoot.dataset.bmLayout, "stacked");
  assert.equal(textarea.dataset.autogrowMaxHeightPx, "163");

  const scale = controller.updateResponsiveSheetScale(sheet, sheetRoot);
  assert.equal(scale >= 0.9, true);
  assert.equal(sheetRoot.styleValues.get("--bm-sheet-width"), "1180px");
  assert.equal(sheetRoot.styleValues.get("--bm-sheet-height"), "760px");
  assert.equal(queued.length, 1);

  textarea.dataset.autogrowMinRows = "2";
  textarea.dataset.autogrowMaxRows = "5";
  textarea.dataset.autogrowMaxHeightPx = "90";
  controller.resizeItemSheetAutoGrowTextarea(sheet, textarea);
  assert.equal(textarea.style.height, "90px");
  assert.equal(textarea.style.maxHeight, "90px");
  assert.equal(textarea.style.overflowY, "auto");

  sheet.element = jqueryRoot([textarea]);
  controller.refreshItemSheetAutoGrowTextareas(sheet);
  assert.equal(textarea.style.height, "90px");

  controller.queueItemSheetAutoGrowTextareaRefresh(sheet, sheet.element);
  assert.equal(sheet._itemSheetAutoGrowRefreshTaskId, 1);
  queued[0]();
  assert.equal(sheet._itemSheetAutoGrowRefreshTaskId, null);

  controller.connectResponsiveSheetScaleObserver(sheet, sheetRoot);
  assert.equal(listeners[0].eventName, "resize");
  assert.equal(sheet._responsiveItemSheetScaleObserver.observed, sheetRoot);
  controller.disconnectResponsiveSheetScaleObserver(sheet);
  assert.equal(sheet._responsiveItemSheetScaleObserver, null);
  assert.equal(listeners.at(-1).eventName, "remove:resize");

  sheet._itemSheetAutoGrowRefreshTaskId = 42;
  controller.clearQueuedItemSheetAutoGrowRefresh(sheet);
  assert.deepEqual(cleared, [42]);
}

run()
  .then(() => {
    console.log("item-sheet-layout.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
