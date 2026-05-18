export function createItemLifecycleHooks({
  getCurrentUserId = () => "",
  notifyInvalidAudioSelection = () => {},
  normalizeItemAudioUpdate = () => ({ invalid: false }),
  normalizeItemLinkUpdate = () => {},
  normalizeItemPriceUpdate = () => {},
  normalizeWeaponMagazineCapacityUpdate = () => true,
  normalizeItemSingleUseUpdate = () => {},
  normalizeItemInventorySlotsUpdate = () => {},
  normalizeCharacteristicBonusItemUpdate = () => {},
  normalizeItemRollFormulaFields = () => ({ invalid: false, invalidFields: [], invalidFieldErrors: {} }),
  notifyInvalidItemRollFormula = () => {},
  normalizeVoyageXpCostOnCreate = () => true,
  normalizeVoyageXpCostOnUpdate = () => {},
  applyVoyageXPCostOnCreate = async () => {},
  handleItemDerivedSyncHook = async () => {},
  cleanupItemLinksAfterDeletion = async () => false,
  renderOpenActorSheetsForActor = () => {}
} = {}) {
  function getSourceUserId(options = {}, userId = "") {
    return String(userId || options?.userId || "");
  }

  function isMutationFromDifferentUser(options = {}, userId = "") {
    const sourceUserId = getSourceUserId(options, userId);
    return Boolean(sourceUserId && sourceUserId !== String(getCurrentUserId?.() || ""));
  }

  function normalizeCommonItemUpdate(item, updateData, { includeSourceWhenMissing = false } = {}) {
    const normalizedAudio = normalizeItemAudioUpdate(item, updateData);
    if (normalizedAudio?.invalid) notifyInvalidAudioSelection(item);

    normalizeItemLinkUpdate(item, updateData, { includeSourceWhenMissing });
    normalizeItemPriceUpdate(item, updateData);
    normalizeWeaponMagazineCapacityUpdate(item, updateData);
    normalizeItemSingleUseUpdate(item, updateData, { includeSourceWhenMissing });
    normalizeItemInventorySlotsUpdate(item, updateData, { includeSourceWhenMissing });
    normalizeCharacteristicBonusItemUpdate(item, updateData);

    const normalizedRollFormula = normalizeItemRollFormulaFields(item, updateData, { includeSourceWhenMissing });
    if (normalizedRollFormula?.invalid) {
      notifyInvalidItemRollFormula(
        item,
        normalizedRollFormula.invalidFields,
        normalizedRollFormula.invalidFieldErrors
      );
      return false;
    }
    return true;
  }

  async function onCreateItem(item, options = {}, userId = "") {
    if (!item?.actor) return;
    if (isMutationFromDifferentUser(options, userId)) return;

    await applyVoyageXPCostOnCreate(item.actor, item, options);
    await handleItemDerivedSyncHook(item, "createItem", { options, userId });
  }

  function onPreCreateItem(item, createData = {}, options = {}) {
    const normalized = normalizeItemAudioUpdate(item, createData);
    if (normalized?.invalid) notifyInvalidAudioSelection(item);

    normalizeItemLinkUpdate(item, createData, { includeSourceWhenMissing: true });
    normalizeItemPriceUpdate(item, createData);
    const normalizedWeaponAmmo = normalizeWeaponMagazineCapacityUpdate(item, createData);
    if (!normalizedWeaponAmmo) normalizeWeaponMagazineCapacityUpdate(item);
    normalizeItemSingleUseUpdate(item, createData, { includeSourceWhenMissing: true });
    normalizeItemInventorySlotsUpdate(item, createData, { includeSourceWhenMissing: true });
    normalizeCharacteristicBonusItemUpdate(item, createData);

    const normalizedRollFormula = normalizeItemRollFormulaFields(item, createData, { includeSourceWhenMissing: true });
    if (normalizedRollFormula?.invalid) {
      notifyInvalidItemRollFormula(item, normalizedRollFormula.invalidFields, normalizedRollFormula.invalidFieldErrors);
      return false;
    }

    return normalizeVoyageXpCostOnCreate(item, createData, options);
  }

  function onPreUpdateItem(item, updateData = {}) {
    if (!normalizeCommonItemUpdate(item, updateData, { includeSourceWhenMissing: false })) return false;
    normalizeVoyageXpCostOnUpdate(item, updateData);
    return undefined;
  }

  function onUpdateItem(item, _changes = {}, options = {}, userId = "") {
    void handleItemDerivedSyncHook(item, "updateItem", { options, userId });
  }

  function onDeleteItem(item, options = {}, userId = "") {
    const actor = item?.actor || item?.parent || item?._parent || null;
    if (isMutationFromDifferentUser(options, userId)) {
      renderOpenActorSheetsForActor(actor);
      return;
    }
    void cleanupItemLinksAfterDeletion(item).then(changed => {
      if (changed) renderOpenActorSheetsForActor(actor);
    });
    void handleItemDerivedSyncHook(item, "deleteItem", { options, userId });
  }

  return {
    onCreateItem,
    onPreCreateItem,
    onPreUpdateItem,
    onUpdateItem,
    onDeleteItem
  };
}
