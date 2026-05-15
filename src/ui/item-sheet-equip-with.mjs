function defaultTranslateWithFallback(_key, fallback) {
  return fallback;
}

function isHTMLElementLike(value, HTMLElementClass) {
  if (!value) return false;
  if (typeof HTMLElementClass === "function" && value instanceof HTMLElementClass) return true;
  return typeof value.matches === "function" || typeof value.closest === "function";
}

export function createItemSheetEquipWithController({
  normalizeItemLinkTemplateEntries = value => (Array.isArray(value) ? value : []),
  buildItemLinkTemplateEntryFromItemDocument = () => null,
  isItemLinkSupportedType = () => false,
  resolveDroppedItemFromDropData = async () => null,
  getDragEventData = () => null,
  fromUuid = async () => null,
  warn = () => {},
  translateWithFallback = defaultTranslateWithFallback,
  getHTMLElementClass = () => globalThis.HTMLElement
} = {}) {
  function buildItemSheetDragPayload(sheet) {
    const item = sheet?.item;
    if (!item) return null;
    const uuid = String(item.uuid || "").trim();
    const itemId = String(item.id || item._id || "").trim();
    if (!uuid && !itemId) return null;
    return {
      type: "Item",
      uuid,
      id: itemId,
      itemType: String(item.type || "").trim().toLowerCase(),
      actorId: String(item.actor?.id || ""),
      actorUuid: String(item.actor?.uuid || "")
    };
  }

  function setItemSheetDragTransferData(dataTransfer, mimeType, payload) {
    if (!dataTransfer || !payload) return false;
    try {
      dataTransfer.setData(mimeType, JSON.stringify(payload));
      return true;
    } catch (_error) {
      return false;
    }
  }

  function onItemSheetDragStart(sheet, eventLike) {
    const nativeEvent = eventLike?.originalEvent || eventLike;
    const target = nativeEvent?.target;
    if (target?.closest?.("input, textarea, select, button, a")) return;
    const payload = buildItemSheetDragPayload(sheet);
    if (!payload || !nativeEvent?.dataTransfer) return;
    setItemSheetDragTransferData(nativeEvent.dataTransfer, "text/plain", payload);
    setItemSheetDragTransferData(nativeEvent.dataTransfer, "application/json", payload);
    try {
      nativeEvent.dataTransfer.effectAllowed = "copyMove";
    } catch (_error) {
      // Some browsers can reject drag metadata changes.
    }
  }

  function getItemSheetEquiperAvecDropContainerFromEvent(eventLike) {
    const HTMLElementClass = getHTMLElementClass();
    const nativeEvent = eventLike?.originalEvent || eventLike;
    const currentTarget = isHTMLElementLike(eventLike?.currentTarget, HTMLElementClass)
      ? eventLike.currentTarget
      : null;
    if (currentTarget?.matches?.("[data-item-equiper-avec-drop='true']")) return currentTarget;
    const target = isHTMLElementLike(nativeEvent?.target, HTMLElementClass) ? nativeEvent.target : null;
    const container = target?.closest?.("[data-item-equiper-avec-drop='true']");
    return isHTMLElementLike(container, HTMLElementClass) ? container : null;
  }

  function getItemSheetEquiperAvecAcceptedTypes(container) {
    const HTMLElementClass = getHTMLElementClass();
    if (!isHTMLElementLike(container, HTMLElementClass)) return null;
    const raw = String(container.dataset?.acceptedTypes || "").trim().toLowerCase();
    if (!raw) return null;
    return new Set(raw.split(",").map(entry => entry.trim()).filter(Boolean));
  }

  function getItemSheetEquiperAvecTemplateEntries(sheet) {
    return normalizeItemLinkTemplateEntries(sheet?.item?.system?.link?.equiperAvecTemplates, {
      keepSourceReference: !sheet?.item?.actor
    });
  }

  function getItemSheetEquiperAvecTemplateIndexFromEvent(eventLike) {
    const nativeEvent = eventLike?.originalEvent || eventLike;
    const trigger = eventLike?.currentTarget || nativeEvent?.target || null;
    const row = trigger?.closest?.("[data-template-index]") || null;
    const value = Number(row?.dataset?.templateIndex);
    if (!Number.isInteger(value) || value < 0) return -1;
    return value;
  }

  async function resolveDroppedItemDocument(data) {
    return resolveDroppedItemFromDropData(data);
  }

  function isItemSheetEquiperAvecTypeAccepted(itemType, acceptedTypes = null) {
    const normalized = String(itemType || "").trim().toLowerCase();
    if (!isItemLinkSupportedType(normalized)) return false;
    if (acceptedTypes && acceptedTypes.size && !acceptedTypes.has(normalized)) return false;
    return true;
  }

  async function updateItemSheetEquiperAvecTemplates(sheet, nextTemplates, options = {}) {
    if (!sheet?.item?.update) return false;
    const normalizedTemplates = normalizeItemLinkTemplateEntries(nextTemplates, {
      keepSourceReference: !sheet.item?.actor
    });
    const updateData = {
      "system.link.equiperAvecTemplates": normalizedTemplates
    };
    if (options.forceEnable === true) {
      updateData["system.link.equiperAvecEnabled"] = true;
    } else if (options.forceEnable === false) {
      updateData["system.link.equiperAvecEnabled"] = false;
    }
    try {
      await sheet.item.update(updateData);
      return true;
    } catch (_error) {
      warn(translateWithFallback("BLOODMAN.Notifications.ItemLinkUpdateFailed", "Mise a jour impossible des objets equipes."));
      return false;
    }
  }

  function isSameItem(sheet, itemDocument, templateEntry) {
    const currentItemUuid = String(sheet?.item?.uuid || "").trim();
    const sourceUuid = String(templateEntry?._templateSourceUuid || "").trim();
    const isSameUuid = currentItemUuid && sourceUuid && currentItemUuid === sourceUuid;
    const isSameWorldItem = !sheet?.item?.actor
      && !itemDocument?.actor
      && String(sheet?.item?.id || "").trim()
      && String(itemDocument?.id || "").trim()
      && String(sheet.item.id).trim() === String(itemDocument.id).trim();
    const isSameActorItem = sheet?.item?.actor
      && itemDocument?.actor
      && String(sheet.item.actor?.id || "").trim()
      && String(sheet.item.actor?.id || "").trim() === String(itemDocument.actor?.id || "").trim()
      && String(sheet.item?.id || "").trim()
      && String(sheet.item?.id || "").trim() === String(itemDocument?.id || "").trim();
    return Boolean(isSameUuid || isSameWorldItem || isSameActorItem);
  }

  async function addItemSheetEquiperAvecTemplateFromDocument(sheet, itemDocument, acceptedTypes = null) {
    const templateEntry = buildItemLinkTemplateEntryFromItemDocument(itemDocument, {
      keepSourceReference: !sheet?.item?.actor
    });
    if (!templateEntry) {
      warn(translateWithFallback("BLOODMAN.Notifications.ItemLinkTypeIncompatible", "Type incompatible avec Equiper avec."));
      return false;
    }
    if (!isItemSheetEquiperAvecTypeAccepted(templateEntry.type, acceptedTypes)) {
      warn(translateWithFallback("BLOODMAN.Notifications.ItemLinkTypeIncompatible", "Type incompatible avec Equiper avec."));
      return false;
    }

    if (isSameItem(sheet, itemDocument, templateEntry)) {
      warn(translateWithFallback("BLOODMAN.Notifications.ItemLinkSelfForbidden", "Un objet ne peut pas s'equiper avec lui-meme."));
      return false;
    }

    const nextTemplates = getItemSheetEquiperAvecTemplateEntries(sheet);
    nextTemplates.push(templateEntry);
    const updated = await updateItemSheetEquiperAvecTemplates(sheet, nextTemplates, { forceEnable: true });
    if (updated) sheet?.render?.(false);
    return updated;
  }

  async function removeItemSheetEquiperAvecTemplateByIndex(sheet, index) {
    const entries = getItemSheetEquiperAvecTemplateEntries(sheet);
    if (!entries.length) return false;
    if (!Number.isInteger(index) || index < 0 || index >= entries.length) return false;
    entries.splice(index, 1);
    const updated = await updateItemSheetEquiperAvecTemplates(sheet, entries, {});
    if (updated) sheet?.render?.(false);
    return updated;
  }

  function onItemSheetEquiperAvecDragOver(sheet, eventLike) {
    const nativeEvent = eventLike?.originalEvent || eventLike;
    if (typeof eventLike?.preventDefault === "function") eventLike.preventDefault();
    else nativeEvent?.preventDefault?.();
    const container = getItemSheetEquiperAvecDropContainerFromEvent(eventLike);
    container?.classList?.add?.("is-drop-target");
    if (nativeEvent?.dataTransfer) nativeEvent.dataTransfer.dropEffect = "copy";
  }

  function onItemSheetEquiperAvecDragLeave(sheet, eventLike) {
    const HTMLElementClass = getHTMLElementClass();
    const nativeEvent = eventLike?.originalEvent || eventLike;
    const container = getItemSheetEquiperAvecDropContainerFromEvent(eventLike);
    if (!container) return;
    const relatedTarget = nativeEvent?.relatedTarget;
    if (isHTMLElementLike(relatedTarget, HTMLElementClass) && container.contains?.(relatedTarget)) return;
    container.classList?.remove?.("is-drop-target");
  }

  async function onItemSheetEquiperAvecDrop(sheet, eventLike) {
    const nativeEvent = eventLike?.originalEvent || eventLike;
    const container = getItemSheetEquiperAvecDropContainerFromEvent(eventLike);
    if (!container) return false;

    if (typeof eventLike?.preventDefault === "function") eventLike.preventDefault();
    else nativeEvent?.preventDefault?.();
    if (typeof eventLike?.stopPropagation === "function") eventLike.stopPropagation();
    else nativeEvent?.stopPropagation?.();
    container.classList?.remove?.("is-drop-target");

    const acceptedTypes = getItemSheetEquiperAvecAcceptedTypes(container);
    const data = getDragEventData(nativeEvent);
    if (!data) return false;
    const dataType = String(data?.type || "").trim().toLowerCase();
    if (dataType !== "item") return false;

    const droppedItem = await resolveDroppedItemDocument(data);
    if (!droppedItem) return false;
    return addItemSheetEquiperAvecTemplateFromDocument(sheet, droppedItem, acceptedTypes);
  }

  function activateItemSheetEquiperAvecListeners(sheet, html) {
    html.find(".bm-item-top, .bm-item-img-el").attr("draggable", true);

    html.on("dragstart", ".bm-item-top, .bm-item-img-el", ev => {
      onItemSheetDragStart(sheet, ev);
    });

    html.on("dragover", "[data-item-equiper-avec-drop='true']", ev => {
      onItemSheetEquiperAvecDragOver(sheet, ev);
    });

    html.on("dragleave", "[data-item-equiper-avec-drop='true']", ev => {
      onItemSheetEquiperAvecDragLeave(sheet, ev);
    });

    html.on("drop", "[data-item-equiper-avec-drop='true']", async ev => {
      await onItemSheetEquiperAvecDrop(sheet, ev);
    });

    html.find(".bm-item-equiper-avec-remove").click(async ev => {
      ev.preventDefault?.();
      ev.stopPropagation?.();
      const index = getItemSheetEquiperAvecTemplateIndexFromEvent(ev);
      if (index < 0) return;
      await removeItemSheetEquiperAvecTemplateByIndex(sheet, index);
    });

    html.find(".bm-item-equiper-avec-open").click(async ev => {
      ev.preventDefault?.();
      ev.stopPropagation?.();
      const sourceUuid = String(ev.currentTarget?.dataset?.sourceUuid || "").trim();
      if (!sourceUuid) return;
      const sourceItem = await Promise.resolve(fromUuid(sourceUuid)).catch(() => null);
      sourceItem?.sheet?.render?.(true);
    });
  }

  return {
    buildItemSheetDragPayload,
    setItemSheetDragTransferData,
    onItemSheetDragStart,
    getItemSheetEquiperAvecDropContainerFromEvent,
    getItemSheetEquiperAvecAcceptedTypes,
    getItemSheetEquiperAvecTemplateEntries,
    getItemSheetEquiperAvecTemplateIndexFromEvent,
    resolveDroppedItemDocument,
    isItemSheetEquiperAvecTypeAccepted,
    updateItemSheetEquiperAvecTemplates,
    addItemSheetEquiperAvecTemplateFromDocument,
    removeItemSheetEquiperAvecTemplateByIndex,
    onItemSheetEquiperAvecDragOver,
    onItemSheetEquiperAvecDragLeave,
    onItemSheetEquiperAvecDrop,
    activateItemSheetEquiperAvecListeners
  };
}
