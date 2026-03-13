export function buildItemDerivedSyncHooks({
  applyItemResourceBonuses,
  syncActorDerivedCharacteristicsResources,
  characteristicBonusItemTypes,
  bmLog,
  shouldProcessItemMutation
} = {}) {
  const shouldProcessMutation = typeof shouldProcessItemMutation === "function"
    ? shouldProcessItemMutation
    : () => true;

  async function syncActorDerivedFromItemMutation(item) {
    if (!item?.actor) return;
    const type = String(item.type || "").trim().toLowerCase();
    if (type === "aptitude" || type === "pouvoir") {
      await applyItemResourceBonuses(item.actor);
      await syncActorDerivedCharacteristicsResources(item.actor);
      return;
    }
    if (characteristicBonusItemTypes?.has(type)) {
      await syncActorDerivedCharacteristicsResources(item.actor);
    }
  }

  async function handleItemDerivedSyncHook(item, sourceHook = "itemMutation", context = {}) {
    if (!shouldProcessMutation(item, context)) return;
    try {
      await syncActorDerivedFromItemMutation(item);
    } catch (error) {
      bmLog.warn(`item:${sourceHook} derived sync skipped`, {
        itemId: item?.id,
        itemType: item?.type,
        actorId: item?.actor?.id,
        error
      });
    }
  }

  return {
    syncActorDerivedFromItemMutation,
    handleItemDerivedSyncHook
  };
}
