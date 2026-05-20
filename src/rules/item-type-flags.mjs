export function createItemTypeFlagRules({
  damageRerollAllowedItemTypes,
  voyageXpCostItemTypes,
  carriedItemLimitActorTypes,
  carriedItemLimitDefault = 10
} = {}) {
  const damageRerollTypes = damageRerollAllowedItemTypes instanceof Set
    ? damageRerollAllowedItemTypes
    : new Set(Array.isArray(damageRerollAllowedItemTypes) ? damageRerollAllowedItemTypes : []);
  const voyageXpTypes = voyageXpCostItemTypes instanceof Set
    ? voyageXpCostItemTypes
    : new Set(Array.isArray(voyageXpCostItemTypes) ? voyageXpCostItemTypes : []);
  const carriedActorTypes = carriedItemLimitActorTypes instanceof Set
    ? carriedItemLimitActorTypes
    : new Set(Array.isArray(carriedItemLimitActorTypes) ? carriedItemLimitActorTypes : []);

  function isDamageRerollItemType(itemType) {
    const type = String(itemType || "").trim().toLowerCase();
    return damageRerollTypes.has(type);
  }

  function isVoyageXPCostItemType(itemType) {
    const type = String(itemType || "").trim().toLowerCase();
    return voyageXpTypes.has(type);
  }

  function isCarriedItemLimitedActorType(actorType) {
    const type = String(actorType || "").trim().toLowerCase();
    return carriedActorTypes.has(type);
  }

  function getActorCarriedItemsLimit(actor) {
    const fallback = Math.max(0, Math.floor(Number(carriedItemLimitDefault) || 0));
    const raw = actor?.system?.equipment?.carriedItemsMax;
    if (raw == null || raw === "") return fallback;
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : fallback;
  }

  return {
    isDamageRerollItemType,
    isVoyageXPCostItemType,
    isCarriedItemLimitedActorType,
    getActorCarriedItemsLimit
  };
}
