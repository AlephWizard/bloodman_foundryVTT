function defaultEscapeHtml(value) {
  const raw = String(value ?? "");
  if (typeof globalThis.foundry?.utils?.escapeHTML === "function") {
    return globalThis.foundry.utils.escapeHTML(raw);
  }
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
}

function toNonNegativeInt(value, fallback = 0) {
  return Math.max(0, Math.floor(toFiniteNumber(value, fallback)));
}

function normalizeLabel(value, fallback = "") {
  const label = String(value ?? "").trim();
  return label || fallback;
}

function buildCards(cards = [], escapeHtml = defaultEscapeHtml) {
  return cards
    .filter(card => card && normalizeLabel(card.value, "") !== "")
    .map(card => {
      const modifierClass = normalizeLabel(card.modifierClass, "");
      const valueClass = normalizeLabel(card.valueClass, "");
      const cardClasses = modifierClass ? ` bm-damage-chat-card ${modifierClass}` : " bm-damage-chat-card";
      const valueClasses = valueClass ? `bm-damage-chat-value ${valueClass}` : "bm-damage-chat-value";
      return `<div class="${cardClasses.trim()}">
        <span class="bm-damage-chat-label">${escapeHtml(card.label)}</span>
        <strong class="${valueClasses.trim()}">${escapeHtml(card.value)}</strong>
      </div>`;
    })
    .join("");
}

function buildMetaPills(entries = [], escapeHtml = defaultEscapeHtml) {
  const pills = entries
    .filter(entry => normalizeLabel(entry, "") !== "")
    .map(entry => `<span class="bm-damage-chat-pill">${escapeHtml(entry)}</span>`)
    .join("");
  if (!pills) return "";
  return `<div class="bm-damage-chat-meta">${pills}</div>`;
}

export function formatDamageRollResults(rollResults = []) {
  if (!Array.isArray(rollResults)) return "";
  const values = rollResults
    .map(value => Number(value))
    .filter(value => Number.isFinite(value))
    .map(value => String(value));
  return values.join(" + ");
}

export function summarizeDamageTargets(targetNames = [], fallback = "Cible") {
  const names = Array.isArray(targetNames)
    ? targetNames
      .map(name => normalizeLabel(name, ""))
      .filter(Boolean)
    : [];
  if (!names.length) {
    return {
      count: 0,
      label: fallback
    };
  }
  if (names.length === 1) {
    return {
      count: 1,
      label: names[0]
    };
  }
  if (names.length === 2) {
    return {
      count: 2,
      label: `${names[0]} / ${names[1]}`
    };
  }
  return {
    count: names.length,
    label: `${names[0]} +${names.length - 1}`
  };
}

export function buildDamageRollFlavorMarkup({
  attackerName = "Attaquant",
  targetNames = [],
  bonusBrut = 0,
  penetration = 0,
  totalDamage = 0,
  modeTag = "",
  escapeHtml = defaultEscapeHtml
} = {}) {
  const safeAttacker = normalizeLabel(attackerName, "Attaquant");
  const targetSummary = summarizeDamageTargets(targetNames, "Cible");
  const safeBonusBrut = toNonNegativeInt(bonusBrut, 0);
  const safePenetration = toNonNegativeInt(penetration, 0);
  const safeTotalDamage = toNonNegativeInt(totalDamage, 0);
  const safeModeTag = normalizeLabel(modeTag, "");
  const cards = [
    safeBonusBrut > 0 ? { label: "Degats bruts", value: `+${safeBonusBrut}` } : null,
    safePenetration > 0 ? { label: "Penetration", value: String(safePenetration) } : null,
    { label: "Resultat final", value: String(safeTotalDamage), modifierClass: "bm-damage-chat-card--result" }
  ];
  const metaEntries = [];
  if (safeModeTag) metaEntries.push(safeModeTag);
  return `<section class="bm-damage-chat bm-damage-chat--public">
    <div class="bm-damage-chat-head">
      <p class="bm-damage-chat-eyebrow">Attaque</p>
      <p class="bm-damage-chat-title"><strong>${escapeHtml(safeAttacker)}</strong> inflige <strong>${safeTotalDamage}</strong> degats a <strong>${escapeHtml(targetSummary.label)}</strong></p>
    </div>
    <div class="bm-damage-chat-grid">${buildCards(cards, escapeHtml)}</div>
    ${buildMetaPills(metaEntries, escapeHtml)}
  </section>`;
}

export function buildGmDamageSummaryMarkup({
  attackerName = "Attaquant",
  targetName = "Cible",
  bonusBrut = 0,
  penetration = 0,
  rolledTotalDamage = 0,
  assignedDamage = 0,
  paInitial = 0,
  paEffective = 0,
  finalDamage = 0,
  hpAfter = Number.NaN,
  escapeHtml = defaultEscapeHtml
} = {}) {
  const safeAttacker = normalizeLabel(attackerName, "Attaquant");
  const safeTarget = normalizeLabel(targetName, "Cible");
  const safeBonusBrut = toNonNegativeInt(bonusBrut, 0);
  const safePenetration = toNonNegativeInt(penetration, 0);
  const safeRolledTotal = toNonNegativeInt(rolledTotalDamage, 0);
  const safeAssignedDamage = toNonNegativeInt(assignedDamage, safeRolledTotal || finalDamage);
  const safePaInitial = toNonNegativeInt(paInitial, 0);
  const safePaEffective = toNonNegativeInt(paEffective, 0);
  const safeFinalDamage = toNonNegativeInt(finalDamage, 0);
  const safeHpAfter = Number(hpAfter);
  const armorValue = safePaInitial !== safePaEffective
    ? `${safePaInitial} -> ${safePaEffective}`
    : String(safePaEffective || safePaInitial);
  const cards = [
    safeBonusBrut > 0 ? { label: "Degats bruts", value: `+${safeBonusBrut}` } : null,
    safePenetration > 0 ? { label: "Penetration", value: String(safePenetration) } : null,
    { label: "Resultat final", value: String(safeRolledTotal || safeAssignedDamage || safeFinalDamage) },
    { label: "Total avant armure", value: String(safeAssignedDamage || safeRolledTotal || safeFinalDamage) },
    { label: "Armure", value: armorValue },
    { label: "Perte reelle", value: String(safeFinalDamage), modifierClass: "bm-damage-chat-card--result" },
    Number.isFinite(safeHpAfter) ? { label: "PV actuels", value: String(toNonNegativeInt(safeHpAfter, 0)) } : null
  ];

  const metaEntries = [];
  return `<section class="bm-damage-chat bm-damage-chat--gm">
    <div class="bm-damage-chat-head">
      <p class="bm-damage-chat-eyebrow">Suivi MJ</p>
      <p class="bm-damage-chat-title"><strong>${escapeHtml(safeAttacker)}</strong> inflige <strong>${safeFinalDamage}</strong> degats a <strong>${escapeHtml(safeTarget)}</strong></p>
    </div>
    <div class="bm-damage-chat-grid">${buildCards(cards, escapeHtml)}</div>
    ${buildMetaPills(metaEntries, escapeHtml)}
  </section>`;
}
