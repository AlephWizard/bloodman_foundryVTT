function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeLabelMap(labels = {}) {
  return labels && typeof labels === "object" ? labels : {};
}

export function buildDropDecisionDialogContent({
  preview,
  labels = {},
  formatCurrencyValue = value => String(value ?? "")
} = {}) {
  if (!preview || typeof preview !== "object") return "";
  const text = normalizeLabelMap(labels);
  const specificsMarkup = (Array.isArray(preview.specificities) ? preview.specificities : [])
    .map(line => `<li>${escapeHtml(line)}</li>`)
    .join("");
  const formattedCost = typeof formatCurrencyValue === "function"
    ? formatCurrencyValue(preview.totalCost)
    : String(preview.totalCost ?? "");
  const warningMarkup = preview.hasInvalidPrice
    ? `<p class="bm-drop-insufficient-warning bm-transfer-warning"><strong>${escapeHtml(text.warningLabel)}:</strong> ${escapeHtml(text.warningText)}</p>`
    : "";

  return `<form class="bm-drop-insufficient-funds bm-transfer-dialog">
      <div class="bm-drop-insufficient-shell bm-transfer-shell">
        <div class="bm-drop-insufficient-head bm-transfer-hero">
          <div class="bm-transfer-alert" aria-hidden="true">
            <div class="bm-transfer-alert-ring"><i class="fa-solid fa-right-left"></i></div>
          </div>
          <div class="bm-drop-insufficient-head-copy bm-transfer-hero-copy">
            <p class="bm-drop-insufficient-eyebrow bm-transfer-kicker">${escapeHtml(text.eyebrow)}</p>
            <p class="bm-drop-insufficient-intro bm-transfer-intro">${escapeHtml(preview.intro)}</p>
          </div>
        </div>
        <div class="bm-drop-transfer-summary bm-transfer-grid" role="group" aria-label="${escapeHtml(text.title)}">
          <div class="bm-drop-transfer-card bm-drop-transfer-card-item bm-transfer-card bm-transfer-card-item">
            <i class="fa-solid fa-box-open bm-transfer-card-icon" aria-hidden="true"></i>
            <div class="bm-transfer-card-copy">
              <p class="bm-drop-transfer-card-label bm-transfer-card-label">${escapeHtml(text.itemLabel)}</p>
              <p class="bm-drop-transfer-card-value bm-transfer-card-value">${escapeHtml(preview.firstItemName)}</p>
            </div>
          </div>
          <div class="bm-drop-transfer-card bm-transfer-card">
            <i class="fa-solid fa-crosshairs bm-transfer-card-icon" aria-hidden="true"></i>
            <div class="bm-transfer-card-copy">
              <p class="bm-drop-transfer-card-label bm-transfer-card-label">${escapeHtml(text.destinationLabel)}</p>
              <p class="bm-drop-transfer-card-value bm-transfer-card-value">${escapeHtml(preview.targetName)}</p>
            </div>
          </div>
        </div>
        <div class="bm-transfer-lower">
          <section class="bm-transfer-cost-card" aria-label="${escapeHtml(preview.costLabel)}">
            <span class="bm-transfer-cost-label">${escapeHtml(preview.costLabel)}</span>
            <strong class="bm-transfer-cost-value">${escapeHtml(formattedCost)}</strong>
          </section>
          <section class="bm-transfer-specifics-panel">
            <p class="bm-drop-insufficient-specificities-title bm-transfer-section-title">${escapeHtml(preview.specificsLabel)}</p>
            <ul class="bm-drop-insufficient-specificities bm-transfer-specifics">${specificsMarkup}</ul>
          </section>
        </div>
        ${warningMarkup}
      </div>
    </form>`;
}
