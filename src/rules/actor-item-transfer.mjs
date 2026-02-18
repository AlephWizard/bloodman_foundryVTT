export function createActorItemTransferRules({
  translate,
  warn,
  deepClone,
  logWarn
} = {}) {
  const t = typeof translate === "function"
    ? translate
    : key => key;
  const notifyWarn = typeof warn === "function"
    ? warn
    : () => {};
  const clone = typeof deepClone === "function"
    ? deepClone
    : value => value;
  const warnLog = typeof logWarn === "function"
    ? logWarn
    : () => {};

  async function applyActorToActorItemTransfer({
    targetActor,
    transferEntries = [],
    currentUser,
    ownerLevel = 3,
    isGM = false,
    renderTarget,
    createItemOptions
  } = {}) {
    if (!Array.isArray(transferEntries) || !transferEntries.length) return null;
    if (!targetActor) return null;

    const canManageTarget = isGM
      || targetActor?.isOwner
      || (
        typeof targetActor?.testUserPermission === "function"
        && targetActor.testUserPermission(currentUser, ownerLevel, { exact: false })
      );
    if (!canManageTarget) {
      notifyWarn(t("BLOODMAN.Notifications.DropRequiresLimitedPermission"));
      return null;
    }

    const createdItems = [];
    const itemCreateOptions = createItemOptions && typeof createItemOptions === "object"
      ? createItemOptions
      : undefined;
    for (const transfer of transferEntries) {
      const droppedItem = transfer?.droppedItem;
      const sourceActor = transfer?.sourceActor;
      if (!droppedItem || !sourceActor) continue;
      if (sourceActor?.id === targetActor?.id) continue;

      const canManageSource = isGM
        || sourceActor?.isOwner
        || droppedItem?.isOwner
        || (
          typeof sourceActor?.testUserPermission === "function"
          && sourceActor.testUserPermission(currentUser, ownerLevel, { exact: false })
        );
      if (!canManageSource) {
        notifyWarn(t("BLOODMAN.Notifications.DropRequiresLimitedPermission"));
        continue;
      }

      const sourceData = clone(droppedItem.toObject());
      delete sourceData._id;

      let createdItem = null;
      try {
        const created = await targetActor.createEmbeddedDocuments("Item", [sourceData], itemCreateOptions);
        createdItem = created?.[0] || null;
      } catch (error) {
        warnLog("[bloodman] actor transfer:create failed", {
          sourceActorId: sourceActor?.id,
          targetActorId: targetActor?.id,
          itemId: droppedItem?.id,
          error
        });
        continue;
      }
      if (!createdItem) continue;

      try {
        await sourceActor.deleteEmbeddedDocuments("Item", [droppedItem.id]);
      } catch (error) {
        warnLog("[bloodman] actor transfer:delete source failed", {
          sourceActorId: sourceActor?.id,
          targetActorId: targetActor?.id,
          itemId: droppedItem?.id,
          error
        });
        try {
          await targetActor.deleteEmbeddedDocuments("Item", [createdItem.id]);
        } catch (_rollbackError) {
          // Best-effort rollback to avoid accidental duplication when source deletion fails.
        }
        continue;
      }

      createdItems.push(createdItem);
    }

    if (!createdItems.length) return null;
    if (typeof renderTarget === "function") renderTarget();
    return createdItems.length === 1 ? createdItems[0] : createdItems;
  }

  return {
    applyActorToActorItemTransfer
  };
}
