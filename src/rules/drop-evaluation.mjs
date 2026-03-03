export function createDropEvaluationRules({
  fromDropData,
  roundCurrencyValue,
  getDropItemQuantity,
  getDroppedItemUnitPrice,
  carriedItemTypes,
  shouldCountCarriedItem
} = {}) {
  const resolveDropData = typeof fromDropData === "function"
    ? fromDropData
    : async () => null;
  const roundCurrency = typeof roundCurrencyValue === "function"
    ? roundCurrencyValue
    : value => Number(value) || 0;
  const getQuantity = typeof getDropItemQuantity === "function"
    ? getDropItemQuantity
    : () => 1;
  const getUnitPrice = typeof getDroppedItemUnitPrice === "function"
    ? getDroppedItemUnitPrice
    : () => ({ ok: true, value: 0 });
  const carriedTypes = carriedItemTypes instanceof Set
    ? carriedItemTypes
    : new Set(Array.isArray(carriedItemTypes) ? carriedItemTypes : []);
  const shouldCountCarried = typeof shouldCountCarriedItem === "function"
    ? shouldCountCarriedItem
    : () => true;

  async function resolveActorTransferEntries({
    entries = [],
    targetActorId = ""
  } = {}) {
    const transfers = [];
    for (const entry of entries) {
      const droppedItem = await resolveDropData(entry).catch(() => null);
      if (!droppedItem) continue;
      const sourceActor = droppedItem.actor;
      if (!sourceActor || sourceActor?.id === targetActorId) continue;
      transfers.push({ entry, droppedItem, sourceActor });
    }
    return transfers;
  }

  async function resolveDropPermissionState({
    entries = [],
    targetActorId = "",
    currentUser = null,
    isGM = false,
    canDropMenuItems = false,
    limitedLevel = 1
  } = {}) {
    if (isGM) return { allowed: true };

    for (const entry of entries) {
      const droppedItem = await resolveDropData(entry).catch(() => null);
      if (!droppedItem) continue;
      const sourceActor = droppedItem.actor;
      if (sourceActor?.id === targetActorId) continue;
      const isMenuSource = !sourceActor;
      if (isMenuSource && !canDropMenuItems) return { allowed: false, reason: "role" };
      if (sourceActor) continue;
      if (String(droppedItem.pack || "").trim()) continue;

      const hasLimitedAccess = typeof droppedItem.testUserPermission === "function"
        ? droppedItem.testUserPermission(currentUser, limitedLevel, { exact: false })
        : Number(droppedItem.permission ?? 0) >= limitedLevel;
      if (!hasLimitedAccess) return { allowed: false, reason: "permission" };
    }

    return { allowed: true };
  }

  async function resolveDropPurchaseSummary({
    entries = [],
    targetActorId = ""
  } = {}) {
    let totalCost = 0;
    let hasInvalidPrice = false;

    for (const entry of entries) {
      const droppedItem = await resolveDropData(entry).catch(() => null);
      if (!droppedItem) continue;
      const sourceActor = droppedItem.actor;
      if (sourceActor?.id === targetActorId) continue;
      if (sourceActor) continue;
      const priceState = getUnitPrice(droppedItem);
      if (!priceState.ok) {
        hasInvalidPrice = true;
        continue;
      }
      if (!(priceState.value > 0)) continue;
      const quantity = getQuantity(entry, droppedItem);
      totalCost += priceState.value * quantity;
    }

    return {
      hasInvalidPrice,
      totalCost: roundCurrency(totalCost)
    };
  }

  async function computeIncomingCarriedItemCount({
    entries = [],
    targetActorId = ""
  } = {}) {
    let incomingCarriedItemCount = 0;
    for (const entry of entries) {
      const droppedItem = await resolveDropData(entry).catch(() => null);
      if (!droppedItem || !carriedTypes.has(droppedItem.type)) continue;
      if (!shouldCountCarried(droppedItem)) continue;
      const sourceActor = droppedItem.actor;
      if (sourceActor?.id === targetActorId) continue;
      incomingCarriedItemCount += 1;
    }
    return incomingCarriedItemCount;
  }

  return {
    resolveActorTransferEntries,
    resolveDropPermissionState,
    resolveDropPurchaseSummary,
    computeIncomingCarriedItemCount
  };
}
