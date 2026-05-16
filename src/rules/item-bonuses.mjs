export function createItemBonusRules({
  characteristics = [],
  characteristicBonusItemTypes = new Set(),
  resourceBonusItemTypes = new Set(),
  isActorItemLinkedChild = () => false,
  computeItemCharacteristicBonusTotals = () => ({}),
  computeItemResourceBonusTotals = () => ({ pv: 0, pp: 0 }),
  toCheckboxBoolean = value => Boolean(value)
} = {}) {
  function getVisibleActorItems(actor) {
    return (actor?.items || []).filter(item => {
      if (!item) return false;
      if (isActorItemLinkedChild(item, actor)) return false;
      return true;
    });
  }

  function getItemBonusTotals(actor, options = {}) {
    const filteredItems = Array.isArray(options?.items)
      ? options.items.filter(Boolean)
      : getVisibleActorItems(actor);
    return computeItemCharacteristicBonusTotals({
      items: filteredItems,
      characteristics,
      characteristicBonusItemTypes,
      isBonusEnabled: value => toCheckboxBoolean(value, false)
    });
  }

  function getItemResourceBonusTotals(actor, options = {}) {
    const filteredItems = Array.isArray(options?.items)
      ? options.items.filter(Boolean)
      : getVisibleActorItems(actor);
    return computeItemResourceBonusTotals({
      items: filteredItems,
      resourceBonusItemTypes
    });
  }

  return {
    getVisibleActorItems,
    getItemBonusTotals,
    getItemResourceBonusTotals
  };
}
