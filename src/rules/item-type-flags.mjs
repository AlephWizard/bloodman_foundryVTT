export function createItemTypeFlagRules({
  damageRerollAllowedItemTypes,
  voyageXpCostItemTypes,
  carriedItemLimitActorTypes,
  carriedItemLimitBase = 10,
  carriedItemLimitWithBag = 15
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

  function isBagSlotsEnabled(actor) {
    return Boolean(actor?.system?.equipment?.bagSlotsEnabled);
  }

  function getActorCarriedItemsLimit(actor) {
    return isBagSlotsEnabled(actor)
      ? Math.max(0, Math.floor(Number(carriedItemLimitWithBag) || 0))
      : Math.max(0, Math.floor(Number(carriedItemLimitBase) || 0));
  }

  return {
    isDamageRerollItemType,
    isVoyageXPCostItemType,
    isCarriedItemLimitedActorType,
    isBagSlotsEnabled,
    getActorCarriedItemsLimit
  };
}
