function defaultGetWindow() {
  return globalThis;
}

function defaultGetDocument() {
  return globalThis.document;
}

function defaultResolveTextareaAutoGrowState() {
  return {
    minHeight: 40,
    contentHeight: 40,
    nextHeight: 40,
    overflowY: "hidden"
  };
}

function isElementLike(value, ElementClass) {
  if (!value) return false;
  if (typeof ElementClass === "function" && value instanceof ElementClass) return true;
  return typeof value.querySelector === "function" || typeof value.matches === "function";
}

function isTextareaLike(value, TextAreaClass) {
  if (!value) return false;
  if (typeof TextAreaClass === "function" && value instanceof TextAreaClass) return true;
  return String(value.tagName || "").toUpperCase() === "TEXTAREA";
}

export function createItemSheetLayoutController({
  resolveTextareaAutoGrowState = defaultResolveTextareaAutoGrowState,
  resolveDeferredRoot = (_previous, next) => next,
  queueUiMicrotask = callback => {
    callback?.();
    return null;
  },
  clearUiMicrotask = () => {},
  getWindow = defaultGetWindow,
  getDocument = defaultGetDocument,
  getHTMLElementClass = () => globalThis.HTMLElement,
  getHTMLTextAreaElementClass = () => globalThis.HTMLTextAreaElement,
  getResizeObserverClass = () => globalThis.ResizeObserver
} = {}) {
  function getViewportMetric(name, documentMetric, fallback = 0) {
    const windowRef = getWindow();
    const documentRef = getDocument();
    return Math.max(
      Number(windowRef?.[name]) || 0,
      Number(documentRef?.documentElement?.[documentMetric]) || 0,
      fallback
    );
  }

  function getResponsiveSheetSize() {
    const viewportWidth = getViewportMetric("innerWidth", "clientWidth", 0);
    const viewportHeight = getViewportMetric("innerHeight", "clientHeight", 0);
    const safeWidth = viewportWidth > 0 ? viewportWidth : 1280;
    const safeHeight = viewportHeight > 0 ? viewportHeight : 900;
    return {
      width: Math.round(Math.min(safeWidth - 40, Math.max(920, Math.min(1200, safeWidth * 0.52)))),
      height: Math.round(Math.min(safeHeight - 56, Math.max(560, Math.min(800, safeHeight * 0.56))))
    };
  }

  function resolvePositionOptions(sheet, options = {}) {
    const viewportWidth = getViewportMetric("innerWidth", "clientWidth", 0);
    const viewportHeight = getViewportMetric("innerHeight", "clientHeight", 0);
    const maxWidth = Math.max(320, viewportWidth - 24);
    const maxHeight = Math.max(320, viewportHeight - 32);
    const nextPosition = { ...options };
    const candidateWidth = Number(nextPosition.width ?? sheet?.position?.width ?? sheet?.options?.width);
    const candidateHeight = Number(nextPosition.height ?? sheet?.position?.height ?? sheet?.options?.height);
    const candidateLeft = Number(nextPosition.left ?? sheet?.position?.left);
    const candidateTop = Number(nextPosition.top ?? sheet?.position?.top);

    if (Number.isFinite(candidateWidth)) nextPosition.width = Math.min(candidateWidth, maxWidth);
    if (Number.isFinite(candidateHeight)) nextPosition.height = Math.min(candidateHeight, maxHeight);
    if (Number.isFinite(candidateLeft) && Number.isFinite(nextPosition.width)) {
      nextPosition.left = Math.max(12, Math.min(candidateLeft, viewportWidth - nextPosition.width - 12));
    }
    if (Number.isFinite(candidateTop) && Number.isFinite(nextPosition.height)) {
      nextPosition.top = Math.max(12, Math.min(candidateTop, viewportHeight - nextPosition.height - 12));
    }
    return nextPosition;
  }

  function getRootElement(sheet, rootLike = null) {
    const ElementClass = getHTMLElementClass();
    const root = rootLike?.find ? rootLike[0] : rootLike;
    if (isElementLike(root, ElementClass)) return root;
    const sheetElement = sheet?.element?.[0];
    return isElementLike(sheetElement, ElementClass) ? sheetElement : null;
  }

  function getResponsiveSheetScaleTarget(sheet, rootLike = null) {
    const ElementClass = getHTMLElementClass();
    const elementRoot = getRootElement(sheet, rootLike);
    if (!elementRoot) return null;
    const sheetRoot = elementRoot.matches?.(".bm-item-unified")
      ? elementRoot
      : elementRoot.querySelector?.(".bm-item-unified");
    return isElementLike(sheetRoot, ElementClass) ? sheetRoot : null;
  }

  function getResponsiveSheetObserverTarget(sheet, rootLike = null) {
    const elementRoot = getRootElement(sheet, rootLike);
    if (!elementRoot) return null;
    return elementRoot.closest?.(".app.window-app") || elementRoot;
  }

  function resolveResponsiveItemSheetLayoutState(width = 0, height = 0) {
    const safeWidth = Math.max(320, Math.round(Number(width) || 0));
    const safeHeight = Math.max(320, Math.round(Number(height) || 0));
    let layoutMode = "wide";
    if (safeWidth < 640) layoutMode = "stacked";
    else if (safeWidth < 860) layoutMode = "narrow";
    else if (safeWidth < 1080) layoutMode = "compact";

    let heightMode = "tall";
    if (safeHeight < 520) heightMode = "short";
    else if (safeHeight < 680) heightMode = "medium";

    const useNoteScroll = layoutMode === "stacked" || heightMode === "short";
    const noteMaxHeight = useNoteScroll
      ? Math.max(120, Math.min(260, Math.round(safeHeight * 0.34)))
      : 0;

    return {
      layoutMode,
      heightMode,
      useNoteScroll,
      noteMaxHeight
    };
  }

  function applyResponsiveItemSheetLayoutState(sheet, rootLike = null, metrics = {}) {
    const TextAreaClass = getHTMLTextAreaElementClass();
    const sheetRoot = getResponsiveSheetScaleTarget(sheet, rootLike);
    if (!sheetRoot) return null;
    const width = Math.max(320, Math.round(Number(metrics?.width) || 0));
    const height = Math.max(320, Math.round(Number(metrics?.height) || 0));
    const state = resolveResponsiveItemSheetLayoutState(width, height);
    sheetRoot.dataset.bmLayout = state.layoutMode;
    sheetRoot.dataset.bmHeight = state.heightMode;
    sheetRoot.dataset.bmNoteScroll = state.useNoteScroll ? "true" : "false";

    const noteField = sheetRoot.querySelector(".bm-item-note-textarea");
    if (isTextareaLike(noteField, TextAreaClass)) {
      if (state.noteMaxHeight > 0) {
        noteField.dataset.autogrowMaxHeightPx = String(state.noteMaxHeight);
      } else {
        delete noteField.dataset.autogrowMaxHeightPx;
      }
    }
    return state;
  }

  function updateResponsiveSheetScale(sheet, rootLike = null) {
    const sheetRoot = getResponsiveSheetScaleTarget(sheet, rootLike);
    if (!sheetRoot) return 1;
    const rect = sheetRoot.getBoundingClientRect?.() || {};
    const positionWidth = Number(sheet?.position?.width);
    const positionHeight = Number(sheet?.position?.height);
    const width = Number.isFinite(positionWidth) && positionWidth > 0
      ? Math.max(positionWidth, 320)
      : Math.max(Number(sheetRoot.clientWidth) || rect.width || 0, 320);
    const height = Number.isFinite(positionHeight) && positionHeight > 0
      ? Math.max(positionHeight - 40, 320)
      : Math.max(Number(sheetRoot.clientHeight) || rect.height || 0, 320);
    const viewportWidth = getViewportMetric("innerWidth", "clientWidth", 1280);
    const viewportHeight = getViewportMetric("innerHeight", "clientHeight", 720);
    const widthScale = width / 1180;
    const heightScale = height / 760;
    const viewportScaleBoost = Math.min(
      1.16,
      Math.max(1, Math.sqrt((viewportWidth / 1920) * (viewportHeight / 1080)))
    );
    const baseScale = Math.sqrt(widthScale * heightScale);
    const scale = Math.min(1.7, Math.max(0.9, baseScale * viewportScaleBoost));
    sheetRoot.style.setProperty("--bm-sheet-scale", scale.toFixed(3));
    sheetRoot.style.setProperty("--bm-sheet-width", `${Math.round(width)}px`);
    sheetRoot.style.setProperty("--bm-sheet-height", `${Math.round(height)}px`);
    const responsiveState = applyResponsiveItemSheetLayoutState(sheet, sheetRoot, { width, height });
    const layoutKey = [
      Math.round(width),
      Math.round(height),
      responsiveState?.layoutMode || "",
      responsiveState?.heightMode || "",
      responsiveState?.noteMaxHeight || 0,
      scale.toFixed(3)
    ].join("|");
    if (layoutKey !== sheet?._lastResponsiveItemSheetLayoutKey) {
      sheet._lastResponsiveItemSheetLayoutKey = layoutKey;
      queueItemSheetAutoGrowTextareaRefresh(sheet, sheetRoot);
    }
    return scale;
  }

  function connectResponsiveSheetScaleObserver(sheet, html) {
    disconnectResponsiveSheetScaleObserver(sheet);
    const observerTarget = getResponsiveSheetObserverTarget(sheet, html);
    if (!observerTarget) return;
    updateResponsiveSheetScale(sheet, observerTarget);
    const windowRef = getWindow();
    const windowResizeHandler = () => {
      updateResponsiveSheetScale(sheet, observerTarget);
    };
    sheet._responsiveItemSheetScaleWindowResize = windowResizeHandler;
    windowRef?.addEventListener?.("resize", windowResizeHandler);
    const ResizeObserverClass = getResizeObserverClass();
    if (typeof ResizeObserverClass !== "function") return;
    sheet._responsiveItemSheetScaleObserver = new ResizeObserverClass(() => {
      updateResponsiveSheetScale(sheet, observerTarget);
    });
    sheet._responsiveItemSheetScaleObserver.observe(observerTarget);
  }

  function disconnectResponsiveSheetScaleObserver(sheet) {
    sheet?._responsiveItemSheetScaleObserver?.disconnect?.();
    sheet._responsiveItemSheetScaleObserver = null;
    if (sheet?._responsiveItemSheetScaleWindowResize) {
      getWindow()?.removeEventListener?.("resize", sheet._responsiveItemSheetScaleWindowResize);
      sheet._responsiveItemSheetScaleWindowResize = null;
    }
  }

  function clearQueuedItemSheetAutoGrowRefresh(sheet) {
    clearUiMicrotask(sheet?._itemSheetAutoGrowRefreshTaskId);
    sheet._itemSheetAutoGrowRefreshTaskId = null;
    sheet._queuedItemSheetAutoGrowRoot = null;
  }

  function resizeItemSheetAutoGrowTextarea(_sheet, textarea) {
    const TextAreaClass = getHTMLTextAreaElementClass();
    if (!isTextareaLike(textarea, TextAreaClass)) return;
    textarea.style.maxHeight = "";
    textarea.style.height = "auto";
    const windowRef = getWindow();
    const computedStyle = windowRef?.getComputedStyle ? windowRef.getComputedStyle(textarea) : null;
    const layout = resolveTextareaAutoGrowState({
      style: computedStyle,
      rows: textarea.getAttribute?.("rows"),
      minRows: textarea.dataset?.autogrowMinRows,
      maxRows: textarea.dataset?.autogrowMaxRows,
      scrollHeight: textarea.scrollHeight
    });
    const requestedMaxHeight = Number(textarea.dataset?.autogrowMaxHeightPx);
    const maxHeightPx = Number.isFinite(requestedMaxHeight) && requestedMaxHeight > 0
      ? Math.max(layout.minHeight, Math.round(requestedMaxHeight))
      : 0;
    const nextHeight = maxHeightPx > 0
      ? Math.min(layout.nextHeight, maxHeightPx)
      : layout.nextHeight;
    const overflowY = maxHeightPx > 0 && layout.contentHeight > nextHeight
      ? "auto"
      : layout.overflowY;
    textarea.style.height = `${nextHeight}px`;
    textarea.style.maxHeight = maxHeightPx > 0 ? `${maxHeightPx}px` : "";
    textarea.style.overflowY = overflowY;
  }

  function refreshItemSheetAutoGrowTextareas(sheet, htmlLike = null) {
    const root = htmlLike?.find ? htmlLike : sheet?.element;
    if (!root?.length) return;
    const fields = root.find("textarea[data-autogrow='true']");
    if (!fields.length) return;
    fields.each((_index, textarea) => {
      resizeItemSheetAutoGrowTextarea(sheet, textarea);
    });
  }

  function queueItemSheetAutoGrowTextareaRefresh(sheet, rootLike = null) {
    sheet._queuedItemSheetAutoGrowRoot = resolveDeferredRoot(sheet._queuedItemSheetAutoGrowRoot, rootLike);
    if (sheet._itemSheetAutoGrowRefreshTaskId != null) return;
    sheet._itemSheetAutoGrowRefreshTaskId = queueUiMicrotask(() => {
      sheet._itemSheetAutoGrowRefreshTaskId = null;
      const root = sheet._queuedItemSheetAutoGrowRoot?.find ? sheet._queuedItemSheetAutoGrowRoot : sheet.element;
      sheet._queuedItemSheetAutoGrowRoot = null;
      refreshItemSheetAutoGrowTextareas(sheet, root);
    });
  }

  return {
    getResponsiveSheetSize,
    resolvePositionOptions,
    getResponsiveSheetScaleTarget,
    getResponsiveSheetObserverTarget,
    resolveResponsiveItemSheetLayoutState,
    applyResponsiveItemSheetLayoutState,
    updateResponsiveSheetScale,
    connectResponsiveSheetScaleObserver,
    disconnectResponsiveSheetScaleObserver,
    clearQueuedItemSheetAutoGrowRefresh,
    resizeItemSheetAutoGrowTextarea,
    refreshItemSheetAutoGrowTextareas,
    queueItemSheetAutoGrowTextareaRefresh
  };
}
