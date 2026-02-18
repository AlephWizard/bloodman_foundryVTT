function defaultToFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
}

function defaultNormalizeRollDieFormula(value, fallback = "d4") {
  const raw = String(value || fallback).trim();
  if (!raw) return "1d4";
  if (/^\d/.test(raw)) return raw;
  return `1${raw}`;
}

export function createItemUseFlowRules({
  toFiniteNumber,
  normalizeRollDieFormula
} = {}) {
  const toFinite = typeof toFiniteNumber === "function"
    ? toFiniteNumber
    : defaultToFiniteNumber;
  const normalizeFormula = typeof normalizeRollDieFormula === "function"
    ? normalizeRollDieFormula
    : defaultNormalizeRollDieFormula;

  function resolveAbilityDamageRollPlan({
    item = null,
    powerUsableEnabled = false,
    powerActivated = false
  } = {}) {
    if (!item) return { allowed: false, reason: "missing-item" };
    const itemType = String(item.type || "").trim().toLowerCase();
    const isUsablePower = itemType === "pouvoir" && Boolean(powerUsableEnabled);
    if (isUsablePower && !powerActivated) {
      return {
        allowed: false,
        reason: "power-not-activated",
        isUsablePower,
        formula: normalizeFormula(item.system?.damageDie, "d4")
      };
    }
    return {
      allowed: true,
      reason: "",
      isUsablePower,
      formula: normalizeFormula(item.system?.damageDie, "d4")
    };
  }

  function resolveItemRerollRollPlan({
    item = null
  } = {}) {
    if (!item) return { mode: "none", formula: "", reason: "missing-item" };
    const itemType = String(item.type || "").trim().toLowerCase();
    if (itemType === "arme") {
      return {
        mode: "damage",
        formula: normalizeFormula(item.system?.damageDie, "d4"),
        reason: ""
      };
    }
    if (itemType === "aptitude" || itemType === "pouvoir") {
      if (!item.system?.damageEnabled || !item.system?.damageDie) {
        return {
          mode: "none",
          formula: "",
          reason: "damage-disabled"
        };
      }
      return {
        mode: "damage",
        formula: normalizeFormula(item.system?.damageDie, "d4"),
        reason: ""
      };
    }
    if (itemType === "soin") {
      return {
        mode: "heal",
        formula: normalizeFormula(item.system?.healDie, "d4"),
        reason: ""
      };
    }
    return { mode: "none", formula: "", reason: "unsupported-item-type" };
  }

  function resolveItemUsePlan({
    item = null,
    objectUseEnabled = false
  } = {}) {
    if (!item) return { kind: "none" };
    const itemType = String(item.type || "").trim().toLowerCase();
    if (itemType === "pouvoir") return { kind: "power" };
    if (itemType === "soin") return { kind: "heal" };
    if (itemType === "ration") return { kind: "ration" };
    if (itemType === "objet") return { kind: objectUseEnabled ? "object" : "none" };
    return { kind: "none" };
  }

  function resolveHealUseMode({
    actorIsOwner = false,
    isGM = false
  } = {}) {
    return actorIsOwner || isGM ? "owner-roll" : "manual-roll";
  }

  function resolveManualHealNextValue({
    current = 0,
    max = 0,
    rollTotal = 0
  } = {}) {
    const currentValue = toFinite(current, 0);
    const maxValue = toFinite(max, currentValue);
    const healValue = toFinite(rollTotal, 0);
    const nextRaw = currentValue + healValue;
    const nextValue = maxValue > 0 ? Math.min(nextRaw, maxValue) : nextRaw;
    return {
      current: currentValue,
      max: maxValue,
      heal: healValue,
      next: nextValue
    };
  }

  function isObjectUseEnabled(value) {
    return Boolean(value);
  }

  function buildHealAudioReference(item) {
    if (!item) return null;
    return {
      id: item.id,
      type: item.type,
      name: item.name,
      system: { audioFile: item.system?.audioFile }
    };
  }

  return {
    resolveAbilityDamageRollPlan,
    resolveItemRerollRollPlan,
    resolveItemUsePlan,
    resolveHealUseMode,
    resolveManualHealNextValue,
    isObjectUseEnabled,
    buildHealAudioReference
  };
}
