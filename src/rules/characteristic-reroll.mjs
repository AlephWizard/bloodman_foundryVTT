function defaultToFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
}

export function createCharacteristicRerollRules({
  toFiniteNumber
} = {}) {
  const toFinite = typeof toFiniteNumber === "function"
    ? toFiniteNumber
    : defaultToFiniteNumber;

  function resolveCharacteristicRerollPlan({
    actorType = "",
    requestedKey = "",
    lastRollKey = "",
    isRerollWindowActive = false,
    isGM = false,
    currentPP = 0,
    currentChaos = 0,
    ppCost = 0,
    npcChaosCost = 0
  } = {}) {
    const key = String(requestedKey || "").trim();
    if (!key) return { mode: "", allowed: false, reason: "missing-key" };

    const normalizedActorType = String(actorType || "").trim().toLowerCase();
    const previousKey = String(lastRollKey || "").trim();
    const normalizedPPCost = Math.max(0, toFinite(ppCost, 0));
    const normalizedNpcChaosCost = Math.max(0, toFinite(npcChaosCost, 0));

    if (normalizedActorType === "personnage") {
      if (previousKey !== key) return { mode: "", allowed: false, reason: "stale-key" };
      const ppValue = toFinite(currentPP, 0);
      if (ppValue < normalizedPPCost) {
        return {
          mode: "player",
          allowed: false,
          reason: "not-enough-pp",
          currentPP: ppValue,
          nextPP: Math.max(0, ppValue - normalizedPPCost),
          cost: normalizedPPCost
        };
      }
      return {
        mode: "player",
        allowed: true,
        reason: "",
        currentPP: ppValue,
        nextPP: Math.max(0, ppValue - normalizedPPCost),
        cost: normalizedPPCost
      };
    }

    if (normalizedActorType !== "personnage-non-joueur") {
      return { mode: "", allowed: false, reason: "unsupported-actor-type" };
    }
    if (!isGM) return { mode: "", allowed: false, reason: "gm-required" };
    if (previousKey !== key) return { mode: "", allowed: false, reason: "stale-key" };
    if (!isRerollWindowActive) return { mode: "", allowed: false, reason: "window-expired" };

    const chaosValue = toFinite(currentChaos, 0);
    if (chaosValue < normalizedNpcChaosCost) {
      return {
        mode: "npc",
        allowed: false,
        reason: "not-enough-chaos",
        currentChaos: chaosValue,
        nextChaos: Math.max(0, chaosValue - normalizedNpcChaosCost),
        cost: normalizedNpcChaosCost
      };
    }
    return {
      mode: "npc",
      allowed: true,
      reason: "",
      currentChaos: chaosValue,
      nextChaos: Math.max(0, chaosValue - normalizedNpcChaosCost),
      cost: normalizedNpcChaosCost
    };
  }

  function resolveCharacteristicXpProgress({
    xpValue = null,
    defaultSlots = 3
  } = {}) {
    const fallbackSlots = Math.max(1, Math.floor(toFinite(defaultSlots, 3)));
    const xp = Array.isArray(xpValue)
      ? [...xpValue]
      : Array.from({ length: fallbackSlots }, () => false);
    const index = xp.findIndex(value => !value);
    if (index === -1) {
      return {
        updated: false,
        xp,
        shouldPromptGrowth: xp.length === fallbackSlots && xp.every(Boolean)
      };
    }
    xp[index] = true;
    return {
      updated: true,
      xp,
      shouldPromptGrowth: xp.length === fallbackSlots && xp.every(Boolean)
    };
  }

  return {
    resolveCharacteristicRerollPlan,
    resolveCharacteristicXpProgress
  };
}
