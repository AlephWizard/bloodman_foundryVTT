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

  function normalizeItemLinkData(itemData = null) {
    const system = itemData?.system && typeof itemData.system === "object"
      ? itemData.system
      : {};
    const link = system.link && typeof system.link === "object"
      ? system.link
      : {};
    const parentItemId = String(link.parentItemId || "").trim();
    const equiperAvecEnabled = link.equiperAvecEnabled === true
      || String(link.equiperAvecEnabled || "").trim().toLowerCase() === "true";
    const equiperAvec = Array.isArray(link.equiperAvec)
      ? link.equiperAvec
      : [];
    const ordered = [];
    const seen = new Set();
    for (const entry of equiperAvec) {
      const itemId = String(entry || "").trim();
      if (!itemId || seen.has(itemId)) continue;
      seen.add(itemId);
      ordered.push(itemId);
    }
    return {
      parentItemId,
      equiperAvecEnabled,
      equiperAvec: ordered
    };
  }

  function sanitizeItemCreateData(sourceData = null) {
    const payload = clone(sourceData || {});
    if (!payload || typeof payload !== "object") return {};
    delete payload._id;
    delete payload.folder;
    delete payload.sort;
    delete payload._stats;
    delete payload._templateSourceUuid;
    delete payload._templateSourceId;

    if (payload.flags?.core && typeof payload.flags.core === "object") {
      delete payload.flags.core.sourceId;
      if (!Object.keys(payload.flags.core).length) delete payload.flags.core;
      if (payload.flags && !Object.keys(payload.flags).length) delete payload.flags;
    }

    const linkData = payload.system?.link;
    if (linkData && typeof linkData === "object" && Array.isArray(linkData.equiperAvecTemplates)) {
      linkData.equiperAvecTemplates = linkData.equiperAvecTemplates
        .map(entry => {
          if (!entry || typeof entry !== "object") return null;
          const templateEntry = clone(entry);
          delete templateEntry._templateSourceUuid;
          delete templateEntry._templateSourceId;
          if (templateEntry.flags?.core && typeof templateEntry.flags.core === "object") {
            delete templateEntry.flags.core.sourceId;
            if (!Object.keys(templateEntry.flags.core).length) delete templateEntry.flags.core;
            if (templateEntry.flags && !Object.keys(templateEntry.flags).length) delete templateEntry.flags;
          }
          return templateEntry;
        })
        .filter(Boolean);
    }
    return payload;
  }

  function ensureLinkStructure(payload = null) {
    const data = payload && typeof payload === "object"
      ? payload
      : {};
    data.system = data.system && typeof data.system === "object"
      ? data.system
      : {};
    data.system.link = data.system.link && typeof data.system.link === "object"
      ? data.system.link
      : {};
    return data.system.link;
  }

  function collectLinkedChildrenForTransfer(sourceActor, parentItem) {
    if (!sourceActor?.items || !parentItem) return [];
    const parentId = String(parentItem?.id || "").trim();
    if (!parentId) return [];
    const parentData = typeof parentItem?.toObject === "function"
      ? parentItem.toObject()
      : parentItem;
    const parentLink = normalizeItemLinkData(parentData);
    if (!parentLink.equiperAvecEnabled) return [];

    const children = [];
    for (const childId of parentLink.equiperAvec) {
      const child = sourceActor.items?.get?.(childId) || null;
      if (!child) continue;
      const childData = typeof child?.toObject === "function"
        ? child.toObject()
        : child;
      const childLink = normalizeItemLinkData(childData);
      if (childLink.parentItemId !== parentId) continue;
      children.push(child);
    }
    return children;
  }

  async function createTransferredParentWithChildren({
    targetActor,
    sourceActor,
    droppedItem,
    itemCreateOptions
  } = {}) {
    if (!targetActor || !sourceActor || !droppedItem) return null;

    const sourceParentData = sanitizeItemCreateData(
      typeof droppedItem?.toObject === "function"
        ? droppedItem.toObject()
        : droppedItem
    );
    const sourceParentLink = normalizeItemLinkData(sourceParentData);
    const linkedChildren = collectLinkedChildrenForTransfer(sourceActor, droppedItem);
    const sourceDeleteIds = [String(droppedItem?.id || "").trim(), ...linkedChildren.map(child => String(child?.id || "").trim())]
      .filter(Boolean);

    const parentLink = ensureLinkStructure(sourceParentData);
    parentLink.parentItemId = "";
    parentLink.equiperAvec = [];

    const createdParentDocs = await targetActor.createEmbeddedDocuments("Item", [sourceParentData], itemCreateOptions);
    const createdParent = createdParentDocs?.[0] || null;
    if (!createdParent) return null;

    const createdItems = [createdParent];
    const createdItemIds = [String(createdParent?.id || "").trim()].filter(Boolean);
    let createdChildIds = [];

    if (linkedChildren.length) {
      const childPayloads = linkedChildren
        .map(child => sanitizeItemCreateData(
          typeof child?.toObject === "function"
            ? child.toObject()
            : child
        ))
        .map(payload => {
          const link = ensureLinkStructure(payload);
          link.parentItemId = String(createdParent.id || "").trim();
          link.equiperAvecEnabled = false;
          link.equiperAvec = [];
          return payload;
        });

      if (childPayloads.length) {
        const createdChildDocs = await targetActor.createEmbeddedDocuments("Item", childPayloads, itemCreateOptions);
        const normalizedChildren = Array.isArray(createdChildDocs) ? createdChildDocs : [];
        createdItems.push(...normalizedChildren);
        createdChildIds = normalizedChildren
          .map(child => String(child?.id || "").trim())
          .filter(Boolean);
        createdItemIds.push(...createdChildIds);
      }
    }

    const shouldEnableEquiperAvec = sourceParentLink.equiperAvecEnabled || createdChildIds.length > 0;
    const parentUpdateData = {
      "system.link.equiperAvecEnabled": shouldEnableEquiperAvec,
      "system.link.equiperAvec": createdChildIds
    };
    if (typeof createdParent?.update === "function") {
      await createdParent.update(parentUpdateData);
    } else if (typeof targetActor?.updateEmbeddedDocuments === "function") {
      await targetActor.updateEmbeddedDocuments("Item", [{ _id: String(createdParent.id || ""), ...parentUpdateData }]);
    }

    try {
      await sourceActor.deleteEmbeddedDocuments("Item", sourceDeleteIds);
    } catch (error) {
      warnLog("[bloodman] actor transfer:delete source failed", {
        sourceActorId: sourceActor?.id,
        targetActorId: targetActor?.id,
        itemId: droppedItem?.id,
        sourceDeleteIds,
        error
      });
      try {
        await targetActor.deleteEmbeddedDocuments("Item", createdItemIds);
      } catch (_rollbackError) {
        // Best-effort rollback to avoid accidental duplication when source deletion fails.
      }
      return null;
    }

    return createdItems;
  }

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

      try {
        const transferredBundle = await createTransferredParentWithChildren({
          targetActor,
          sourceActor,
          droppedItem,
          itemCreateOptions
        });
        if (!Array.isArray(transferredBundle) || !transferredBundle.length) continue;
        createdItems.push(...transferredBundle);
      } catch (error) {
        warnLog("[bloodman] actor transfer:create failed", {
          sourceActorId: sourceActor?.id,
          targetActorId: targetActor?.id,
          itemId: droppedItem?.id,
          error
        });
        continue;
      }
    }

    if (!createdItems.length) return null;
    if (typeof renderTarget === "function") renderTarget();
    return createdItems.length === 1 ? createdItems[0] : createdItems;
  }

  return {
    applyActorToActorItemTransfer
  };
}
