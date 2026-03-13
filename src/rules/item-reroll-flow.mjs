function defaultToFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
}

export function createItemRerollFlowRules({
  toFiniteNumber,
  normalizeRerollTargets,
  buildFallbackRerollTargets,
  isDamageRerollItemType
} = {}) {
  const toFinite = typeof toFiniteNumber === "function"
    ? toFiniteNumber
    : defaultToFiniteNumber;
  const normalizeTargets = typeof normalizeRerollTargets === "function"
    ? normalizeRerollTargets
    : value => (Array.isArray(value) ? value : []);
  const buildFallbackTargets = typeof buildFallbackRerollTargets === "function"
    ? buildFallbackRerollTargets
    : () => [];
  const isDamageType = typeof isDamageRerollItemType === "function"
    ? isDamageRerollItemType
    : () => false;

  function normalizeItemRerollContext(context, fallbackItemType = "") {
    if (!context || typeof context !== "object") return null;
    context.kind = String(context.kind || "item-damage");
    context.itemType = String(context.itemType || fallbackItemType || "").toLowerCase();
    return context;
  }

  function isItemRerollContextValid(context) {
    if (!context || typeof context !== "object") return false;
    if (String(context.kind || "") !== "item-damage") return false;
    return isDamageType(context.itemType);
  }

  function shouldBlockByRerollWindow(actorType, isWindowActive) {
    return String(actorType || "") !== "personnage" && !isWindowActive;
  }

  function resolveItemRerollTargets({
    contextTargets = [],
    selectedTargets = [],
    requestedTotalDamage = 0
  } = {}) {
    const targets = normalizeTargets(contextTargets).filter(Boolean);
    if (targets.length) return { targets, fallbackUsed: false };
    const selected = Array.isArray(selectedTargets) ? selectedTargets : [];
    if (!selected.length) return { targets: [], fallbackUsed: false };
    const requestedTotal = Math.max(0, Math.floor(toFinite(requestedTotalDamage, 0)));
    return {
      targets: buildFallbackTargets(selected, requestedTotal),
      fallbackUsed: true
    };
  }

  function resolveItemRerollSource({
    itemId = "",
    actorItems = null,
    simpleAttackItemId = "",
    simpleAttackName = "",
    resolveItemType = null
  } = {}) {
    const normalizedItemId = String(itemId || "").trim();
    if (!normalizedItemId) return null;

    const normalizedSimpleAttackId = String(simpleAttackItemId || "").trim();
    if (normalizedSimpleAttackId && normalizedItemId === normalizedSimpleAttackId) {
      return {
        itemId: normalizedItemId,
        item: null,
        itemType: "arme",
        itemName: String(simpleAttackName || "").trim()
      };
    }

    const item = actorItems?.get?.(normalizedItemId) || null;
    if (!item) return null;

    const itemTypeResolver = typeof resolveItemType === "function"
      ? resolveItemType
      : candidate => String(candidate?.type || "").trim().toLowerCase();
    const resolvedItemType = String(itemTypeResolver(item) || item?.type || "").trim().toLowerCase();

    return {
      itemId: normalizedItemId,
      item,
      itemType: resolvedItemType,
      itemName: String(item?.name || "").trim()
    };
  }

  function resolveItemRerollActorMode(actorType) {
    const normalized = String(actorType || "").trim().toLowerCase();
    if (normalized === "personnage") return "player";
    if (normalized === "personnage-non-joueur") return "npc";
    return "";
  }

  function resolveItemRerollResourcePlan({
    actorType = "",
    isGM = false,
    currentPP = 0,
    currentChaos = 0,
    ppCost = 0,
    npcChaosCost = 0
  } = {}) {
    const mode = resolveItemRerollActorMode(actorType);
    const normalizedPPCost = Math.max(0, toFinite(ppCost, 0));
    const normalizedNpcChaosCost = Math.max(0, toFinite(npcChaosCost, 0));

    if (mode === "player") {
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

    if (mode === "npc") {
      if (!isGM) return { mode: "", allowed: false, reason: "gm-required" };
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

    return { mode: "", allowed: false, reason: "unsupported-actor-type" };
  }

  return {
    normalizeItemRerollContext,
    isItemRerollContextValid,
    shouldBlockByRerollWindow,
    resolveItemRerollTargets,
    resolveItemRerollSource,
    resolveItemRerollActorMode,
    resolveItemRerollResourcePlan
  };
}
