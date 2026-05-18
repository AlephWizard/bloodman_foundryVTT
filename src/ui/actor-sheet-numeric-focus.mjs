export const ACTOR_SHEET_NUMERIC_FOCUS_SELECTOR = "input[type='number'][name]";

function getDefaultHtmlInputElementClass() {
  return globalThis.HTMLInputElement;
}

function getDefaultHtmlElementClass() {
  return globalThis.HTMLElement;
}

function isInstanceOfClass(value, ClassReference) {
  return typeof ClassReference === "function" && value instanceof ClassReference;
}

function getCollectionArray(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  const fromToArray = collection.toArray?.();
  if (Array.isArray(fromToArray)) return fromToArray;
  const fromGet = collection.get?.();
  if (Array.isArray(fromGet)) return fromGet;
  const first = collection.get?.(0);
  return first ? [first] : [];
}

export function createActorSheetNumericFocusController({
  getSheetHTMLElement,
  getSheetElementWrapper,
  queueUiMicrotask,
  clearUiMicrotask,
  getDocument = () => globalThis.document,
  getHtmlInputElementClass = getDefaultHtmlInputElementClass,
  getHtmlElementClass = getDefaultHtmlElementClass,
  focusMaxAgeMs = 5000
} = {}) {
  function isNumericFocusInput(sheet, element) {
    const HtmlInputElement = getHtmlInputElementClass();
    if (!isInstanceOfClass(element, HtmlInputElement)) return false;
    if (String(element.type || "").toLowerCase() !== "number") return false;
    if (!String(element.name || "").trim()) return false;
    const sheetRoot = getSheetHTMLElement?.(sheet) || null;
    return !sheetRoot || sheetRoot.contains?.(element);
  }

  function captureNumericFocus(sheet, eventOrElement = null) {
    const candidate = eventOrElement?.currentTarget || eventOrElement || null;
    const documentRef = getDocument?.() || null;
    const element = isNumericFocusInput(sheet, candidate)
      ? candidate
      : (documentRef?.activeElement || null);
    if (!isNumericFocusInput(sheet, element)) return false;

    let selectionStart = null;
    let selectionEnd = null;
    try {
      selectionStart = element.selectionStart;
      selectionEnd = element.selectionEnd;
    } catch (_error) {
      selectionStart = null;
      selectionEnd = null;
    }

    sheet._actorSheetNumericFocusState = {
      name: String(element.name || ""),
      value: String(element.value ?? ""),
      selectionStart,
      selectionEnd,
      capturedAt: Date.now()
    };
    return true;
  }

  function findNumericInputByName(sheet, htmlLike, name) {
    const root = htmlLike?.find ? htmlLike : getSheetElementWrapper?.(sheet);
    const wrapperMatches = getCollectionArray(root?.find?.(ACTOR_SHEET_NUMERIC_FOCUS_SELECTOR));
    for (const field of wrapperMatches) {
      if (isNumericFocusInput(sheet, field) && String(field.name || "") === name) return field;
    }

    const sheetRoot = getSheetHTMLElement?.(sheet) || null;
    const domMatches = Array.from(sheetRoot?.querySelectorAll?.(ACTOR_SHEET_NUMERIC_FOCUS_SELECTOR) || []);
    for (const field of domMatches) {
      if (isNumericFocusInput(sheet, field) && String(field.name || "") === name) return field;
    }
    return null;
  }

  function restoreNumericFocus(sheet, htmlLike = null) {
    const state = sheet._actorSheetNumericFocusState;
    if (!state?.name) return false;
    if (Date.now() - Number(state.capturedAt || 0) > focusMaxAgeMs) {
      sheet._actorSheetNumericFocusState = null;
      return false;
    }

    const field = findNumericInputByName(sheet, htmlLike, String(state.name || ""));
    if (!isNumericFocusInput(sheet, field) || field.disabled || field.readOnly) return false;

    const documentRef = getDocument?.() || null;
    const active = documentRef?.activeElement || null;
    const sheetRoot = getSheetHTMLElement?.(sheet) || null;
    const HtmlElement = getHtmlElementClass();
    if (isInstanceOfClass(active, HtmlElement) && sheetRoot?.contains?.(active) && active !== field) return false;

    try {
      field.focus({ preventScroll: true });
      if (Number.isInteger(state.selectionStart) && Number.isInteger(state.selectionEnd)) {
        field.setSelectionRange(state.selectionStart, state.selectionEnd);
      }
    } catch (_error) {
      try {
        field.focus();
      } catch (_focusError) {
        return false;
      }
    }
    return true;
  }

  function queueNumericFocusRestore(sheet, htmlLike = null) {
    clearUiMicrotask?.(sheet._numericFocusRestoreTaskId);
    sheet._numericFocusRestoreTaskId = queueUiMicrotask?.(() => {
      sheet._numericFocusRestoreTaskId = null;
      restoreNumericFocus(sheet, htmlLike);
    }) ?? null;
  }

  return {
    isNumericFocusInput,
    captureNumericFocus,
    restoreNumericFocus,
    queueNumericFocusRestore
  };
}
