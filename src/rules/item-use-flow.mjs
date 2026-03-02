function defaultToFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
}

function defaultNormalizeRollDieFormula(value, fallback = "d4") {
  const source = value ?? fallback ?? "d4";
  const stripped = String(source).trim().replace(/^\/(?:r|roll)\b\s*/i, "").trim();
  if (!stripped) return "1d4";
  const explicitDiceCount = stripped.replace(/(^|[+\-*/(])\s*d(\d+)/ig, "$11d$2");
  return explicitDiceCount.replace(/\s+/g, "");
}

function defaultToBooleanFlag(value, fallback = false) {
  if (value === true || value === false) return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "on" || normalized === "yes") return true;
    if (normalized === "false" || normalized === "0" || normalized === "off" || normalized === "no" || normalized === "") return false;
  }
  return Boolean(fallback);
}

export function createItemUseFlowRules({
  toFiniteNumber,
  normalizeRollDieFormula,
  toBooleanFlag
} = {}) {
  const toFinite = typeof toFiniteNumber === "function"
    ? toFiniteNumber
    : defaultToFiniteNumber;
  const normalizeFormula = typeof normalizeRollDieFormula === "function"
    ? normalizeRollDieFormula
    : defaultNormalizeRollDieFormula;
  const parseBooleanFlag = typeof toBooleanFlag === "function"
    ? toBooleanFlag
    : defaultToBooleanFlag;

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

  function resolvePowerRollPlan({
    item = null,
    powerUsableEnabled = false,
    powerActivated = false
  } = {}) {
    if (!item) return { allowed: false, reason: "missing-item", mode: "none", formula: "" };
    const itemType = String(item.type || "").trim().toLowerCase();
    if (itemType !== "pouvoir") return { allowed: false, reason: "unsupported-item-type", mode: "none", formula: "" };
    const isUsablePower = Boolean(powerUsableEnabled);
    const healEnabled = parseBooleanFlag(item.system?.healEnabled, false) && Boolean(item.system?.healDie);
    // Legacy powers can have a die set without explicit damageEnabled.
    const damageEnabled = (parseBooleanFlag(item.system?.damageEnabled, item.system?.damageDie != null) && Boolean(item.system?.damageDie));
    const mode = healEnabled ? "heal" : (damageEnabled ? "damage" : "none");
    const formula = mode === "heal"
      ? normalizeFormula(item.system?.healDie, "d4")
      : (mode === "damage" ? normalizeFormula(item.system?.damageDie, "d4") : "");
    if (isUsablePower && !powerActivated) {
      return {
        allowed: false,
        reason: "power-not-activated",
        isUsablePower,
        mode,
        formula
      };
    }
    if (mode === "none") {
      return {
        allowed: false,
        reason: "roll-disabled",
        isUsablePower,
        mode,
        formula: ""
      };
    }
    return {
      allowed: true,
      reason: "",
      isUsablePower,
      mode,
      formula
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
    resolvePowerRollPlan,
    resolveItemRerollRollPlan,
    resolveItemUsePlan,
    resolveHealUseMode,
    resolveManualHealNextValue,
    isObjectUseEnabled,
    buildHealAudioReference
  };
}
