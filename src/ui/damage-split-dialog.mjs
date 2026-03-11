function defaultToFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
}

export function normalizeDamageSplitAllocations(allocations, {
  fallbackName = "Cible",
  toFiniteNumber
} = {}) {
  const parseFiniteNumber = typeof toFiniteNumber === "function"
    ? toFiniteNumber
    : defaultToFiniteNumber;
  if (!Array.isArray(allocations)) return [];
  return allocations.map((entry, index) => ({
    id: String(entry?.id || entry?.targetId || entry?._id || `target-${index + 1}`),
    name: String(entry?.name || entry?.targetName || "").trim() || fallbackName,
    value: Math.max(0, Math.floor(parseFiniteNumber(entry?.value, 0)))
  }));
}

export function computeDamageSplitAllocatedTotal(allocations, {
  toFiniteNumber
} = {}) {
  const parseFiniteNumber = typeof toFiniteNumber === "function"
    ? toFiniteNumber
    : defaultToFiniteNumber;
  return normalizeDamageSplitAllocations(allocations, { toFiniteNumber: parseFiniteNumber })
    .reduce((sum, entry) => sum + Math.max(0, Math.floor(parseFiniteNumber(entry.value, 0))), 0);
}

export function resolveDamageSplitAllocatedState(totalDamage, allocatedTotal, {
  toFiniteNumber
} = {}) {
  const parseFiniteNumber = typeof toFiniteNumber === "function"
    ? toFiniteNumber
    : defaultToFiniteNumber;
  const normalizedTotal = Math.max(0, Math.floor(parseFiniteNumber(totalDamage, 0)));
  const normalizedAllocated = Math.max(0, Math.floor(parseFiniteNumber(allocatedTotal, 0)));
  if (normalizedAllocated > normalizedTotal) return "is-over";
  if (normalizedAllocated < normalizedTotal) return "is-under";
  return "is-match";
}

export function buildDamageSplitDialogContent({
  actorDisplay = "",
  sourceDisplay = "",
  totalDamage = 0,
  allocations = [],
  labels = {},
  editable = false,
  escapeHtml
} = {}) {
  const toSafeHtml = typeof escapeHtml === "function"
    ? escapeHtml
    : value => String(value || "");
  const normalizedAllocations = normalizeDamageSplitAllocations(allocations);
  const normalizedTotalDamage = Math.max(0, Math.floor(defaultToFiniteNumber(totalDamage, 0)));
  const allocatedTotal = computeDamageSplitAllocatedTotal(normalizedAllocations);
  const allocatedStateClass = resolveDamageSplitAllocatedState(normalizedTotalDamage, allocatedTotal);
  const inputAttributes = editable ? "" : " disabled";
  const targetCount = normalizedAllocations.length;
  const rows = normalizedAllocations
    .map(entry => `<div class="bm-damage-split-row" data-target-id="${toSafeHtml(entry.id)}">
      <div class="bm-damage-split-target">
        <span class="bm-damage-split-target-name">${toSafeHtml(entry.name)}</span>
      </div>
      <input type="number" min="0" step="1" data-target-id="${toSafeHtml(entry.id)}" data-target-name="${toSafeHtml(entry.name)}" value="${entry.value}"${inputAttributes} />
    </div>`)
    .join("");

  return `<form class="bm-damage-config bm-damage-split">
    <div class="bm-damage-config-shell">
      <div class="bm-damage-config-head">
        <div class="bm-damage-config-icon-wrap" aria-hidden="true">
          <div class="bm-damage-config-icon-ring"><i class="fa-solid fa-crosshairs"></i></div>
        </div>
        <div class="bm-damage-config-head-copy">
          <p class="bm-damage-config-eyebrow">${toSafeHtml(labels.eyebrow || "Repartition")}</p>
          <p class="bm-damage-config-title">${toSafeHtml(labels.title || "Repartition des degats")}</p>
          <p class="bm-damage-config-hint">${toSafeHtml(actorDisplay)} - ${toSafeHtml(sourceDisplay)}</p>
        </div>
      </div>
      <div class="bm-damage-split-summary">
        <div class="bm-damage-split-summary-card">
          <span class="bm-damage-split-summary-label">${toSafeHtml(labels.rolledTotal || "Jet")}</span>
          <strong data-bm-damage-split-field="rolled">${normalizedTotalDamage}</strong>
        </div>
        <div class="bm-damage-split-summary-card bm-damage-split-total ${allocatedStateClass}" data-bm-damage-split-field="allocated-card">
          <span class="bm-damage-split-summary-label">${toSafeHtml(labels.allocatedTotal || "Total attribue")}</span>
          <strong data-bm-damage-split-field="allocated">${allocatedTotal}</strong>
        </div>
        <div class="bm-damage-split-summary-card">
          <span class="bm-damage-split-summary-label">${toSafeHtml(labels.targetCount || "Cibles")}</span>
          <strong data-bm-damage-split-field="count">${targetCount}</strong>
        </div>
      </div>
      <p class="bm-damage-config-hint bm-damage-split-free-hint">${toSafeHtml(labels.freeHint || "Le total attribue peut etre libre et depasser le jet.")}</p>
      <div class="bm-damage-split-list" data-bm-damage-split-field="rows">${rows}</div>
    </div>
  </form>`;
}
