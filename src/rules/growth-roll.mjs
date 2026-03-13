function defaultToFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
}

export function createGrowthRollRules({
  toFiniteNumber
} = {}) {
  const toFinite = typeof toFiniteNumber === "function"
    ? toFiniteNumber
    : defaultToFiniteNumber;

  function computeGrowthEffectiveScore({
    base = 0,
    modifierAll = 0,
    modifierKey = 0,
    itemBonus = 0,
    archetypeBonus = 0
  } = {}) {
    // Experience rolls must use the raw characteristic only.
    return toFinite(base, 0);
  }

  function resolveGrowthOutcome({
    rollTotal = 0,
    effectiveScore = 0
  } = {}) {
    const normalizedRollTotal = toFinite(rollTotal, 0);
    const normalizedEffective = toFinite(effectiveScore, 0);
    return {
      rollTotal: normalizedRollTotal,
      effectiveScore: normalizedEffective,
      success: normalizedRollTotal > normalizedEffective
    };
  }

  function buildGrowthUpdateData({
    base = 0,
    success = false,
    xpSlots = 3
  } = {}) {
    const normalizedBase = toFinite(base, 0);
    const normalizedSlots = Math.max(1, Math.floor(toFinite(xpSlots, 3)));
    return {
      nextBase: normalizedBase + (success ? 1 : 0),
      nextXp: Array.from({ length: normalizedSlots }, () => false)
    };
  }

  return {
    computeGrowthEffectiveScore,
    resolveGrowthOutcome,
    buildGrowthUpdateData
  };
}
