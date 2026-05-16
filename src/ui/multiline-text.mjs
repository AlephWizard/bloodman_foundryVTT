function defaultEscapeMarkup(value) {
  return String(value ?? "");
}

export function createMultilineTextHtmlFormatter({
  escapeMarkup = defaultEscapeMarkup,
  cacheMax = 400
} = {}) {
  const cache = new Map();
  const maxEntries = Math.max(0, Math.floor(Number(cacheMax) || 0));

  return function formatMultilineTextToHtml(value) {
    const raw = String(value || "");
    if (!raw.trim()) return "";

    const cached = cache.get(raw);
    if (typeof cached === "string") return cached;

    const html = escapeMarkup(raw).replace(/\r\n|\r|\n/g, "<br>");
    if (maxEntries > 0 && cache.size >= maxEntries) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey !== undefined) cache.delete(oldestKey);
    }
    if (maxEntries !== 0) cache.set(raw, html);
    return html;
  };
}
