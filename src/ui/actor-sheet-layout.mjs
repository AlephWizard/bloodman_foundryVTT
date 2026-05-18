function defaultToFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
}

export function createActorSheetLayoutRules({
  toFiniteNumber
} = {}) {
  const toFinite = typeof toFiniteNumber === "function"
    ? toFiniteNumber
    : defaultToFiniteNumber;

  function parseCssMetric(value) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function resolveAutoResizeKey({
    activeTab = "",
    itemCounts = null,
    transportCount = 0
  } = {}) {
    const counts = itemCounts && typeof itemCounts === "object" ? itemCounts : {};
    return `${String(activeTab || "").trim()}|${Number(counts.total || 0)}|${Number(counts.aptitudes || 0)}|${Number(counts.pouvoirs || 0)}|${Number(counts.carried || 0)}|${Math.max(0, Math.floor(toFinite(transportCount, 0)))}`;
  }

  function resolveTextareaAutoGrowState({
    style = null,
    rows = 2,
    minRows = null,
    maxRows = null,
    scrollHeight = 0
  } = {}) {
    const fontSize = parseCssMetric(style?.fontSize) || 14;
    const computedLineHeight = parseCssMetric(style?.lineHeight);
    const lineHeight = computedLineHeight > 0 ? computedLineHeight : Math.ceil(fontSize * 1.35);
    const verticalChrome = parseCssMetric(style?.paddingTop)
      + parseCssMetric(style?.paddingBottom)
      + parseCssMetric(style?.borderTopWidth)
      + parseCssMetric(style?.borderBottomWidth);

    const defaultRows = Math.max(1, Math.round(toFinite(rows, 2)));
    const resolvedMinRows = Math.max(1, Math.round(toFinite(minRows, defaultRows)));
    const resolvedMaxRows = Math.max(
      resolvedMinRows,
      Math.round(toFinite(maxRows, Math.max(resolvedMinRows + 2, 10)))
    );
    const minHeight = Math.ceil((resolvedMinRows * lineHeight) + verticalChrome);
    const maxHeight = Math.ceil((resolvedMaxRows * lineHeight) + verticalChrome);
    const contentHeight = Math.max(minHeight, Math.ceil(Number(scrollHeight) || 0));
    const nextHeight = Math.min(contentHeight, maxHeight);

    return {
      lineHeight,
      minHeight,
      maxHeight,
      contentHeight,
      nextHeight,
      overflowY: contentHeight > maxHeight ? "auto" : "hidden"
    };
  }

  function resolveSheetWindowTargetHeight({
    configuredMinHeight = Number.NaN,
    formNaturalHeight = 0,
    headerHeight = 0
  } = {}) {
    const minHeight = Number.isFinite(Number(configuredMinHeight))
      ? Math.max(420, Number(configuredMinHeight))
      : 820;
    return Math.max(minHeight, Math.ceil(Number(headerHeight) || 0) + Math.ceil(Number(formNaturalHeight) || 0) + 4);
  }

  function resolveSheetWindowPosition({
    requestedPosition = {},
    currentPosition = {},
    defaultOptions = {},
    viewportWidth = 0,
    viewportHeight = 0
  } = {}) {
    const safeViewportWidth = Math.max(0, Number(viewportWidth) || 0);
    const safeViewportHeight = Math.max(0, Number(viewportHeight) || 0);
    const minWidth = 320;
    const minHeight = 420;
    const maxWidth = Math.max(minWidth, safeViewportWidth - 24);
    const maxHeight = Math.max(minHeight, safeViewportHeight - 32);
    const nextPosition = { ...(requestedPosition || {}) };
    const candidateWidth = Number(nextPosition.width ?? currentPosition?.width ?? defaultOptions?.width);
    const candidateHeight = Number(nextPosition.height ?? currentPosition?.height ?? defaultOptions?.height);
    const candidateLeft = Number(nextPosition.left ?? currentPosition?.left);
    const candidateTop = Number(nextPosition.top ?? currentPosition?.top);

    if (Number.isFinite(candidateWidth)) {
      nextPosition.width = Math.min(Math.max(candidateWidth, minWidth), maxWidth);
    }
    if (Number.isFinite(candidateHeight)) {
      nextPosition.height = Math.min(Math.max(candidateHeight, minHeight), maxHeight);
    }
    if (Number.isFinite(candidateLeft) && Number.isFinite(nextPosition.width)) {
      nextPosition.left = Math.max(12, Math.min(candidateLeft, safeViewportWidth - nextPosition.width - 12));
    }
    if (Number.isFinite(candidateTop) && Number.isFinite(nextPosition.height)) {
      nextPosition.top = Math.max(12, Math.min(candidateTop, safeViewportHeight - nextPosition.height - 12));
    }

    return nextPosition;
  }

  function resolveResponsiveLayoutMode({
    width = 0,
    height = 0,
    activeTab = ""
  } = {}) {
    const safeWidth = Math.max(0, Math.round(Number(width) || 0));
    const safeHeight = Math.max(0, Math.round(Number(height) || 0));
    const tab = String(activeTab || "").trim().toLowerCase();
    if (safeWidth < 980) return "narrow";
    if (safeWidth < 1260 || safeHeight < 680) return "compact";
    if ((tab === "pouvoirs" || tab === "equipement") && safeWidth < 1420) return "compact";
    return "wide";
  }

  return {
    parseCssMetric,
    resolveAutoResizeKey,
    resolveTextareaAutoGrowState,
    resolveSheetWindowTargetHeight,
    resolveSheetWindowPosition,
    resolveResponsiveLayoutMode
  };
}
