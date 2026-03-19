function normalizeStatusEffectId(value) {
  return String(value || "").trim().toLowerCase();
}

function getStatusEffectIds(effectDef) {
  if (!effectDef || typeof effectDef !== "object") return [];
  const ids = [effectDef.id, ...(Array.isArray(effectDef.statuses) ? effectDef.statuses : [])];
  const seen = new Set();
  const output = [];
  for (const raw of ids) {
    const id = String(raw || "").trim();
    const normalized = normalizeStatusEffectId(id);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(id);
  }
  return output;
}

const BLOODMAN_SUPPLEMENTAL_STATUS_EFFECTS = Object.freeze([
  Object.freeze({
    id: "rage",
    name: "Rage",
    iconFile: "rage.svg"
  }),
  Object.freeze({
    id: "support",
    name: "Support",
    iconFile: "support.svg"
  }),
  Object.freeze({
    id: "hide",
    name: "Hide",
    iconFile: "hide.svg"
  })
]);

export function buildBloodmanSupplementalStatusEffects({ systemRootPath = "systems/bloodman" } = {}) {
  const basePath = String(systemRootPath || "systems/bloodman").trim().replace(/\/+$/, "");
  return BLOODMAN_SUPPLEMENTAL_STATUS_EFFECTS.map(definition => ({
    id: definition.id,
    statuses: [definition.id],
    name: definition.name,
    img: `${basePath}/images/${definition.iconFile}`
  }));
}

export function registerBloodmanSupplementalStatusEffects(statusEffects, definitions = []) {
  if (!Array.isArray(statusEffects)) return [];
  const effectDefinitions = Array.isArray(definitions) ? definitions : [];
  const added = [];

  for (const definition of effectDefinitions) {
    const targetIds = new Set(getStatusEffectIds(definition).map(normalizeStatusEffectId).filter(Boolean));
    if (!targetIds.size) continue;

    const exists = statusEffects.some(effect => (
      getStatusEffectIds(effect).some(effectId => targetIds.has(normalizeStatusEffectId(effectId)))
    ));
    if (exists) continue;

    statusEffects.push(definition);
    added.push(definition);
  }

  return added;
}

