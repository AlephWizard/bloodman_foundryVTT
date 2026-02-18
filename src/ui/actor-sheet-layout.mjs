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

  return {
    parseCssMetric,
    resolveAutoResizeKey,
    resolveTextareaAutoGrowState,
    resolveSheetWindowTargetHeight
  };
}
