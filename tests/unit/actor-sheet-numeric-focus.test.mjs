import assert from "node:assert/strict";
import {
  ACTOR_SHEET_NUMERIC_FOCUS_SELECTOR,
  createActorSheetNumericFocusController
} from "../../src/ui/actor-sheet-numeric-focus.mjs";

class FakeElement {
  constructor(children = []) {
    this.children = children;
  }

  contains(element) {
    return this === element || this.children.includes(element);
  }

  querySelectorAll(selector) {
    return selector === ACTOR_SHEET_NUMERIC_FOCUS_SELECTOR ? this.children : [];
  }
}

class FakeInput extends FakeElement {
  constructor({
    type = "number",
    name = "system.resources.pv.current",
    value = "7",
    selectionStart = 0,
    selectionEnd = 0,
    disabled = false,
    readOnly = false
  } = {}) {
    super();
    this.type = type;
    this.name = name;
    this.value = value;
    this.selectionStart = selectionStart;
    this.selectionEnd = selectionEnd;
    this.disabled = disabled;
    this.readOnly = readOnly;
    this.focusCalls = [];
    this.selectionRange = null;
  }

  focus(options = undefined) {
    this.focusCalls.push(options);
  }

  setSelectionRange(start, end) {
    this.selectionRange = [start, end];
  }
}

function createWrapper(matches) {
  return {
    find(selector) {
      assert.equal(selector, ACTOR_SHEET_NUMERIC_FOCUS_SELECTOR);
      return {
        get(index = undefined) {
          return Number.isInteger(index) ? matches[index] : matches;
        },
        toArray() {
          return matches;
        }
      };
    }
  };
}

function createController({
  sheetRoot,
  wrapper = null,
  documentRef = { activeElement: null },
  focusMaxAgeMs = 5000,
  queueUiMicrotask = callback => {
    callback();
    return 1;
  },
  clearUiMicrotask = () => {}
} = {}) {
  return createActorSheetNumericFocusController({
    getSheetHTMLElement: () => sheetRoot,
    getSheetElementWrapper: () => wrapper,
    getDocument: () => documentRef,
    getHtmlInputElementClass: () => FakeInput,
    getHtmlElementClass: () => FakeElement,
    queueUiMicrotask,
    clearUiMicrotask,
    focusMaxAgeMs
  });
}

async function run() {
  const capturedInput = new FakeInput({
    value: "12",
    selectionStart: 1,
    selectionEnd: 2
  });
  const captureRoot = new FakeElement([capturedInput]);
  const captureSheet = {};
  const captureController = createController({
    sheetRoot: captureRoot,
    documentRef: { activeElement: capturedInput }
  });

  assert.equal(captureController.isNumericFocusInput(captureSheet, capturedInput), true);
  assert.equal(captureController.captureNumericFocus(captureSheet, { currentTarget: capturedInput }), true);
  assert.deepEqual(captureSheet._actorSheetNumericFocusState, {
    name: "system.resources.pv.current",
    value: "12",
    selectionStart: 1,
    selectionEnd: 2,
    capturedAt: captureSheet._actorSheetNumericFocusState.capturedAt
  });

  const restoredInput = new FakeInput({
    name: "system.resources.pp.current",
    selectionStart: 0,
    selectionEnd: 0
  });
  const ignoredInput = new FakeInput({ name: "system.resources.pv.current" });
  const restoreRoot = new FakeElement([ignoredInput, restoredInput]);
  const restoreSheet = {
    _actorSheetNumericFocusState: {
      name: "system.resources.pp.current",
      value: "5",
      selectionStart: 0,
      selectionEnd: 1,
      capturedAt: Date.now()
    }
  };
  const restoreController = createController({
    sheetRoot: restoreRoot,
    wrapper: createWrapper([ignoredInput, restoredInput]),
    documentRef: { activeElement: null }
  });

  assert.equal(restoreController.restoreNumericFocus(restoreSheet, null), true);
  assert.deepEqual(restoredInput.focusCalls, [{ preventScroll: true }]);
  assert.deepEqual(restoredInput.selectionRange, [0, 1]);

  const blockedInput = new FakeInput({ name: "system.resources.pv.max" });
  const activeInput = new FakeInput({ name: "system.resources.pp.max" });
  const blockedRoot = new FakeElement([blockedInput, activeInput]);
  const blockedSheet = {
    _actorSheetNumericFocusState: {
      name: "system.resources.pv.max",
      capturedAt: Date.now()
    }
  };
  const blockedController = createController({
    sheetRoot: blockedRoot,
    wrapper: createWrapper([blockedInput]),
    documentRef: { activeElement: activeInput }
  });

  assert.equal(blockedController.restoreNumericFocus(blockedSheet), false);
  assert.equal(blockedInput.focusCalls.length, 0);

  const staleSheet = {
    _actorSheetNumericFocusState: {
      name: "system.resources.pv.current",
      capturedAt: Date.now() - 100
    }
  };
  const staleController = createController({
    sheetRoot: captureRoot,
    focusMaxAgeMs: 1
  });

  assert.equal(staleController.restoreNumericFocus(staleSheet), false);
  assert.equal(staleSheet._actorSheetNumericFocusState, null);

  const queuedInput = new FakeInput({ name: "system.resources.pv.current" });
  const queuedSheet = {
    _numericFocusRestoreTaskId: 77,
    _actorSheetNumericFocusState: {
      name: "system.resources.pv.current",
      capturedAt: Date.now()
    }
  };
  const queuedCallbacks = new Map();
  const clearedTaskIds = [];
  let nextTaskId = 1;
  const queueController = createController({
    sheetRoot: new FakeElement([queuedInput]),
    wrapper: createWrapper([queuedInput]),
    documentRef: { activeElement: null },
    queueUiMicrotask: callback => {
      const taskId = nextTaskId;
      nextTaskId += 1;
      queuedCallbacks.set(taskId, callback);
      return taskId;
    },
    clearUiMicrotask: taskId => {
      clearedTaskIds.push(taskId);
    }
  });

  queueController.queueNumericFocusRestore(queuedSheet);
  assert.deepEqual(clearedTaskIds, [77]);
  assert.equal(queuedSheet._numericFocusRestoreTaskId, 1);
  queuedCallbacks.get(1)();
  assert.equal(queuedSheet._numericFocusRestoreTaskId, null);
  assert.equal(queuedInput.focusCalls.length, 1);
}

run()
  .then(() => {
    console.log("actor-sheet-numeric-focus.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
