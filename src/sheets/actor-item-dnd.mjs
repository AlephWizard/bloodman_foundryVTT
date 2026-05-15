function isHTMLElementLike(value, HTMLElementClass) {
  if (!value) return false;
  if (typeof HTMLElementClass === "function" && value instanceof HTMLElementClass) return true;
  return typeof value.matches === "function" || typeof value.closest === "function";
}

function toItemArray(items) {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  if (Array.isArray(items.contents)) return items.contents;
  return Array.from(items);
}

export function createActorItemDndController({
  getHTMLElementClass = () => globalThis.HTMLElement,
  getSheetElementWrapper = () => null,
  getGame = () => globalThis.game,
  getUi = () => globalThis.ui,
  getFoundryGeneration = () => 14,
  getDragEventData = () => ({}),
  toFiniteNumber = (value, fallback = 0) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
  },
  startPerfTimer = () => 0,
  endPerfTimer = () => 0,
  logSheetPerformance = () => {},
  requestReorderActorItems = () => false,
  safeWarn = () => {},
  translateWithFallback = (_key, fallback) => fallback,
  getCarriedItemInventorySlots = () => 1,
  sumCarriedItemInventorySlots = items => toItemArray(items).length,
  carriedItemTypes = new Set(),
  carryColumnSet = new Set(),
  carryColumnCapacity = {},
  carryColumnEquipment = "equipment",
  carryColumnObjectsOne = "objects-1",
  carryColumnObjectsTwo = "objects-2",
  carryColumnBag = "bag",
  carryColumnFullReason = "colonne pleine"
} = {}) {
  function getListElement(element) {
    return element?.matches?.(".item-list")
      ? element
      : element?.closest?.(".item-list");
  }

  function getItemListColumnCountFromElement(_sheet, element) {
    const list = getListElement(element);
    if (!list) return 1;
    if (list.classList?.contains("item-list-three-columns")) return 3;
    if (list.classList?.contains("item-list-two-columns")) return 2;
    const rawColumns = Number(list.dataset?.gridColumns || list.getAttribute?.("data-grid-columns") || 1);
    if (!Number.isFinite(rawColumns)) return 1;
    return Math.max(1, Math.floor(rawColumns));
  }

  function getItemListDropTargetFromEvent(_sheet, eventLike) {
    const HTMLElementClass = getHTMLElementClass();
    const nativeEvent = eventLike?.originalEvent || eventLike;
    const currentTarget = isHTMLElementLike(eventLike?.currentTarget, HTMLElementClass)
      ? eventLike.currentTarget
      : null;
    if (currentTarget?.matches?.("ol.item-list")) return currentTarget;
    const currentList = currentTarget?.querySelector?.("ol.item-list");
    if (isHTMLElementLike(currentList, HTMLElementClass)) return currentList;
    const target = isHTMLElementLike(nativeEvent?.target, HTMLElementClass) ? nativeEvent.target : null;
    const targetList = target?.closest?.("ol.item-list");
    if (isHTMLElementLike(targetList, HTMLElementClass)) return targetList;
    const dropContainer = target?.closest?.("[data-item-list-drop-target='true']");
    const containerList = dropContainer?.querySelector?.("ol.item-list");
    return isHTMLElementLike(containerList, HTMLElementClass) ? containerList : null;
  }

  function shouldSkipItemListContainerDelegate(_sheet, eventLike) {
    const HTMLElementClass = getHTMLElementClass();
    const currentTarget = eventLike?.currentTarget;
    if (!isHTMLElementLike(currentTarget, HTMLElementClass)) return false;
    if (!currentTarget.matches?.("[data-item-list-drop-target='true']")) return false;
    const nativeEvent = eventLike?.originalEvent || eventLike;
    const eventTarget = isHTMLElementLike(nativeEvent?.target, HTMLElementClass) ? nativeEvent.target : null;
    if (!eventTarget) return false;
    const nestedItemList = eventTarget.closest?.("ol.item-list");
    return isHTMLElementLike(nestedItemList, HTMLElementClass) && currentTarget.contains?.(nestedItemList);
  }

  function getItemListBagZoneFromElement(_sheet, element) {
    const list = getListElement(element);
    if (!list) return "";
    const bagZone = String(list.dataset?.bagZone || list.getAttribute?.("data-bag-zone") || "").trim().toLowerCase();
    return bagZone === "yes" || bagZone === "no" ? bagZone : "";
  }

  function getItemListReorderScopeFromElement(_sheet, element) {
    const list = getListElement(element);
    if (!list) return "";
    return String(list.dataset?.reorderScope || list.getAttribute?.("data-reorder-scope") || "").trim().toLowerCase();
  }

  function getItemListAcceptedTypesFromElement(_sheet, element) {
    const list = getListElement(element);
    if (!list) return null;
    const raw = String(list.dataset?.acceptedTypes || list.getAttribute?.("data-accepted-types") || "").trim().toLowerCase();
    if (!raw) return null;
    const types = raw.split(",").map(entry => String(entry || "").trim().toLowerCase()).filter(Boolean);
    return types.length ? new Set(types) : null;
  }

  function normalizeCarryColumn(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return carryColumnSet.has(normalized) ? normalized : "";
  }

  function isCarryColumnAllowedForItemType(sheet, column, itemType, options = {}) {
    const normalizedColumn = normalizeCarryColumn(column);
    const normalizedType = String(itemType || "").trim().toLowerCase();
    if (!normalizedColumn || !normalizedType || !carriedItemTypes.has(normalizedType)) return false;
    if (normalizedColumn === carryColumnEquipment) {
      return normalizedType === "arme" || normalizedType === "protection";
    }
    if (normalizedColumn === carryColumnBag) {
      const bagEnabled = options?.bagEnabledOverride == null
        ? sheet.isActorBagSlotsEnabled()
        : Boolean(options.bagEnabledOverride);
      return bagEnabled;
    }
    return normalizedColumn === carryColumnObjectsOne || normalizedColumn === carryColumnObjectsTwo;
  }

  function getItemListCarryColumnFromElement(_sheet, element) {
    const list = getListElement(element);
    if (!list) return "";
    return normalizeCarryColumn(list.dataset?.carryColumn || list.getAttribute?.("data-carry-column") || "");
  }

  function getCarryColumnCapacity(sheet, column, options = {}) {
    const normalizedColumn = normalizeCarryColumn(column);
    if (!normalizedColumn) return Number.POSITIVE_INFINITY;
    if (normalizedColumn === carryColumnBag) {
      const bagEnabled = options?.bagEnabledOverride == null
        ? sheet.isActorBagSlotsEnabled()
        : Boolean(options.bagEnabledOverride);
      return bagEnabled ? carryColumnCapacity[carryColumnBag] : 0;
    }
    if (Object.prototype.hasOwnProperty.call(carryColumnCapacity, normalizedColumn)) {
      return carryColumnCapacity[normalizedColumn];
    }
    return Number.POSITIVE_INFINITY;
  }

  function getItemListColumnCapacityFromElement(sheet, element) {
    const list = getListElement(element);
    const carryColumn = getItemListCarryColumnFromElement(sheet, list);
    const raw = Number(list?.dataset?.columnCapacity || list?.getAttribute?.("data-column-capacity"));
    if (Number.isFinite(raw) && raw > 0) return Math.max(1, Math.floor(raw));
    if (!carryColumn) return Number.POSITIVE_INFINITY;
    return getCarryColumnCapacity(sheet, carryColumn);
  }

  function normalizeItemReorderPayload(_sheet, payloadLike) {
    const actorId = String(payloadLike?.actorId || "").trim();
    const actorUuid = String(payloadLike?.actorUuid || "").trim();
    const itemId = String(payloadLike?.itemId || "").trim();
    const itemType = String(payloadLike?.itemType || "").trim().toLowerCase();
    if (!actorId || !itemId || !itemType) return null;
    return { actorId, actorUuid, itemId, itemType };
  }

  function buildItemReorderPayloadFromDocumentDragData(sheet, dataLike) {
    const rawData = dataLike && typeof dataLike === "object" ? dataLike : null;
    if (!rawData) return null;
    const rawUuid = String(rawData.uuid || rawData.documentUuid || "").trim();
    let itemId = String(rawData.itemId || rawData._id || "").trim();
    if (!itemId && rawUuid) {
      const itemMatch = rawUuid.match(/Item\.([^\.]+)/);
      itemId = String(itemMatch?.[1] || "").trim();
    }
    if (!itemId) return null;

    const actorItem = sheet.actor?.items?.get?.(itemId) || null;
    let actorId = String(rawData.actorId || "").trim();
    if (!actorId && rawUuid) {
      const tokenActorMatch = rawUuid.match(/Token\.[^\.]+\.Actor\.([^\.]+)/);
      if (tokenActorMatch?.[1]) actorId = String(tokenActorMatch[1]).trim();
      if (!actorId) {
        const actorMatch = rawUuid.match(/Actor\.([^\.]+)/);
        if (actorMatch?.[1]) actorId = String(actorMatch[1]).trim();
      }
    }
    if (!actorId && actorItem) actorId = String(sheet.actor?.id || "").trim();

    let itemType = String(rawData.itemType || rawData.type || "").trim().toLowerCase();
    if (itemType === "item" || !itemType) itemType = String(actorItem?.type || "").trim().toLowerCase();
    if (!itemType) return null;
    return normalizeItemReorderPayload(sheet, {
      actorId,
      actorUuid: String(rawData.actorUuid || "").trim(),
      itemId,
      itemType
    });
  }

  function isItemReorderPayloadForCurrentActor(sheet, payloadLike) {
    const payload = payloadLike && typeof payloadLike === "object" ? payloadLike : null;
    if (!payload || !sheet.actor) return false;
    const actorId = String(sheet.actor?.id || "").trim();
    const payloadActorId = String(payload.actorId || "").trim();
    const payloadItemId = String(payload.itemId || "").trim();
    if (payloadActorId && actorId && payloadActorId === actorId) return true;
    if (payloadItemId && sheet.actor.items?.has?.(payloadItemId)) return true;
    return false;
  }

  function getActiveItemReorderPayloadFromDom(sheet) {
    const root = getSheetElementWrapper(sheet);
    if (!root?.length) return null;
    const draggingNode = root.find("li.item[data-item-id].is-reorder-dragging").first();
    if (!draggingNode.length) return null;
    const li = draggingNode.get(0);
    const item = sheet.getItemFromListElement(li);
    if (!item) return null;
    return normalizeItemReorderPayload(sheet, {
      actorId: String(sheet.actor?.id || "").trim(),
      actorUuid: String(sheet.actor?.uuid || "").trim(),
      itemId: String(item.id || "").trim(),
      itemType: String(item.type || "").trim().toLowerCase()
    });
  }

  function getGlobalItemReorderPayload(sheet) {
    const payload = globalThis.__bloodmanActiveItemDragPayload || null;
    const normalized = normalizeItemReorderPayload(sheet, payload);
    if (!normalized) return null;
    if ((Date.now() - Number(payload?.startedAt || 0)) > 10_000) return null;
    return normalized;
  }

  function getItemReorderPayloadFromEvent(sheet, eventLike) {
    const event = eventLike?.originalEvent || eventLike;
    const transfer = event?.dataTransfer;
    if (transfer) {
      let rawPayload = "";
      try {
        rawPayload = transfer.getData("application/x-bloodman-item-reorder");
      } catch (_error) {
        rawPayload = "";
      }
      if (rawPayload) {
        try {
          const normalized = normalizeItemReorderPayload(sheet, JSON.parse(rawPayload));
          if (normalized) return normalized;
        } catch (_error) {
          // Fall back below.
        }
      }

      for (const type of ["text/plain", "text"]) {
        let rawText = "";
        try {
          rawText = transfer.getData(type);
        } catch (_error) {
          rawText = "";
        }
        if (!rawText) continue;
        try {
          const normalized = buildItemReorderPayloadFromDocumentDragData(sheet, JSON.parse(rawText));
          if (normalized) return normalized;
        } catch (_error) {
          // Not JSON or not a Foundry item payload.
        }
      }
    }
    return normalizeItemReorderPayload(sheet, sheet._activeItemReorderPayload)
      || getGlobalItemReorderPayload(sheet)
      || getActiveItemReorderPayloadFromDom(sheet);
  }

  function buildFoundryItemDragPayload(sheet, item) {
    if (!item) return null;
    const uuid = String(item.uuid || "").trim();
    const itemId = String(item.id || item._id || "").trim();
    if (!uuid && !itemId) return null;
    return {
      type: "Item",
      uuid,
      id: itemId,
      itemId,
      itemType: String(item.type || ""),
      actorId: String(sheet.actor?.id || ""),
      actorUuid: String(sheet.actor?.uuid || "")
    };
  }

  function setDragTransferData(_sheet, dataTransfer, mimeType, payload) {
    if (!dataTransfer || !payload) return false;
    try {
      dataTransfer.setData(mimeType, JSON.stringify(payload));
      return true;
    } catch (_error) {
      return false;
    }
  }

  function getExternalItemDragTypeFromData(_sheet, data) {
    for (const candidate of [data?.itemType, data?.item?.type, data?.data?.type, data?.document?.type, data?.type]) {
      const normalized = String(candidate || "").trim().toLowerCase();
      if (!normalized || normalized === "item") continue;
      return normalized;
    }
    return "";
  }

  function getItemDropInFlightKeys(sheet) {
    if (!(sheet._itemDropInFlightKeys instanceof Set)) sheet._itemDropInFlightKeys = new Set();
    return sheet._itemDropInFlightKeys;
  }

  function buildExternalItemDropKey(sheet, data, list = null) {
    const HTMLElementClass = getHTMLElementClass();
    const itemRef = String(data?.uuid || data?.documentUuid || data?.itemId || data?.id || data?._id || "").trim();
    const targetRef = [
      String(sheet.actor?.uuid || sheet.actor?.id || "").trim(),
      isHTMLElementLike(list, HTMLElementClass) ? String(list.dataset?.carryColumn || "") : "",
      isHTMLElementLike(list, HTMLElementClass) ? String(list.dataset?.bagZone || "") : "",
      isHTMLElementLike(list, HTMLElementClass) ? String(list.dataset?.reorderScope || "") : ""
    ].join("|");
    return `${targetRef}|${itemRef || JSON.stringify(data || {})}`;
  }

  function clearItemReorderVisualState(sheet, rootLike = null) {
    const root = rootLike?.find ? rootLike : getSheetElementWrapper(sheet);
    if (!root?.length) return;
    root.find(".item-list.is-reorder-target").removeClass("is-reorder-target");
    root.find(".item.is-reorder-drop-before").removeClass("is-reorder-drop-before");
    root.find(".item.is-reorder-drop-after").removeClass("is-reorder-drop-after");
    root.find(".item.is-reorder-dragging").removeClass("is-reorder-dragging");
  }

  function getItemReorderSortBefore(_sheet, eventLike, targetLi, columns = 1) {
    const HTMLElementClass = getHTMLElementClass();
    const event = eventLike?.originalEvent || eventLike;
    const target = isHTMLElementLike(targetLi, HTMLElementClass) ? targetLi : null;
    if (!target) return true;
    const rect = target.getBoundingClientRect?.();
    if (!rect || !(rect.width > 0) || !(rect.height > 0)) return true;
    const pointerX = Number(event?.clientX);
    const pointerY = Number(event?.clientY);
    if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY)) return true;
    const midX = rect.left + (rect.width / 2);
    const midY = rect.top + (rect.height / 2);
    if (columns <= 1) return pointerY < midY;
    const distanceX = Math.abs(pointerX - midX) / rect.width;
    const distanceY = Math.abs(pointerY - midY) / rect.height;
    return distanceX >= distanceY ? pointerX < midX : pointerY < midY;
  }

  function buildItemReorderUpdates(sheet, sourceItem, targetItem, options = {}) {
    if (!sourceItem || !targetItem || !sheet.actor) return [];
    const sourceId = String(sourceItem.id || "");
    const targetId = String(targetItem.id || "");
    if (!sourceId || !targetId || sourceId === targetId) return [];
    const sortBefore = options.sortBefore !== false;
    const sourceType = String(sourceItem.type || "").trim().toLowerCase();
    const targetType = String(targetItem.type || "").trim().toLowerCase();
    const restrictToItemType = options.restrictToItemType !== false;
    const scopeFilter = typeof options.scopeFilter === "function" ? options.scopeFilter : null;
    if (!sourceType || !targetType) return [];
    if (restrictToItemType && sourceType !== targetType) return [];
    if (scopeFilter && (!scopeFilter(sourceItem) || !scopeFilter(targetItem))) return [];

    const scopedSiblings = toItemArray(sheet.actor.items).filter(entry => {
      if (!entry) return false;
      if (String(entry.id || "") === sourceId) return false;
      if (restrictToItemType && String(entry.type || "").trim().toLowerCase() !== sourceType) return false;
      if (scopeFilter && !scopeFilter(entry)) return false;
      return true;
    });

    const performIntegerSort = globalThis.foundry?.utils?.performIntegerSort
      || globalThis.foundry?.utils?.SortingHelpers?.performIntegerSort
      || (getFoundryGeneration() < 13 ? globalThis.SortingHelpers?.performIntegerSort : null);
    if (typeof performIntegerSort === "function") {
      try {
        return performIntegerSort(sourceItem, {
          target: targetItem,
          siblings: scopedSiblings.map(entry => entry.toObject()),
          sortBefore,
          sortKey: "sort"
        });
      } catch (_error) {
        // Fallback below if Foundry helper fails in synthetic contexts.
      }
    }

    const ordered = [...scopedSiblings].sort((left, right) => {
      const leftSort = toFiniteNumber(left?.sort, 0);
      const rightSort = toFiniteNumber(right?.sort, 0);
      if (leftSort !== rightSort) return leftSort - rightSort;
      return String(left?.id || "").localeCompare(String(right?.id || ""));
    });
    if (!ordered.length) return [];

    let insertIndex = ordered.findIndex(entry => String(entry?.id || "") === targetId);
    if (insertIndex < 0) insertIndex = ordered.length - 1;
    if (!sortBefore) insertIndex += 1;
    insertIndex = Math.max(0, Math.min(insertIndex, ordered.length));
    ordered.splice(insertIndex, 0, sourceItem);

    return ordered
      .map((entry, index) => {
        const normalizedSort = (index + 1) * 1000;
        const currentSort = Math.floor(toFiniteNumber(entry?.sort, 0));
        if (currentSort === normalizedSort) return null;
        return { _id: String(entry?.id || ""), sort: normalizedSort };
      })
      .filter(Boolean);
  }

  async function applyActorItemOrderUpdates(sheet, updates = []) {
    const startedAt = startPerfTimer();
    if (!sheet.actor || !Array.isArray(updates) || !updates.length) return false;
    const sanitizedUpdates = updates
      .map(entry => {
        const itemId = String(entry?._id || entry?.id || "").trim();
        if (!itemId) return null;
        return { _id: itemId, sort: Math.max(0, Math.floor(toFiniteNumber(entry?.sort, 0))) };
      })
      .filter(Boolean);
    if (!sanitizedUpdates.length) return false;

    const game = getGame();
    if (sheet.actor?.isOwner || game?.user?.isGM) {
      await sheet.actor.updateEmbeddedDocuments("Item", sanitizedUpdates);
      logSheetPerformance("actor-sheet.update.item-order", {
        actorId: sheet.actor?.id || "",
        updateCount: sanitizedUpdates.length,
        mode: "owner",
        durationMs: Number(endPerfTimer(startedAt).toFixed(2))
      });
      return true;
    }
    const sent = requestReorderActorItems(sheet.actor, sanitizedUpdates);
    if (!sent) safeWarn(translateWithFallback("BLOODMAN.Notifications.ActorUpdateRequiresGM", "Mise a jour impossible: aucun MJ ou assistant actif."));
    logSheetPerformance("actor-sheet.update.item-order", {
      actorId: sheet.actor?.id || "",
      updateCount: sanitizedUpdates.length,
      mode: sent ? "socket" : "socket-failed",
      durationMs: Number(endPerfTimer(startedAt).toFixed(2))
    });
    return sent;
  }

  function shouldManuallyRenderAfterUpdate(sheet) {
    return !(sheet.actor?.isOwner || getGame()?.user?.isGM);
  }

  async function handleCarryColumnDrop(sheet, {
    eventLike,
    nativeEvent,
    sourceItem,
    list,
    targetColumn
  } = {}) {
    const HTMLElementClass = getHTMLElementClass();
    if (!sourceItem || !isHTMLElementLike(list, HTMLElementClass)) return sheet.buildCarryDropErrorResult("operation invalide");
    if (typeof eventLike?.preventDefault === "function") eventLike.preventDefault();
    else nativeEvent?.preventDefault?.();
    if (typeof eventLike?.stopPropagation === "function") eventLike.stopPropagation();
    else nativeEvent?.stopPropagation?.();

    const itemType = String(sourceItem.type || "").trim().toLowerCase();
    if (!carriedItemTypes.has(itemType)) return sheet.buildCarryDropErrorResult("operation invalide");
    const acceptedTypes = getItemListAcceptedTypesFromElement(sheet, list);
    if (acceptedTypes && !acceptedTypes.has(itemType)) {
      clearItemReorderVisualState(sheet);
      return sheet.buildCarryDropErrorResult("type non autorise");
    }

    const bagEnabled = sheet.isActorBagSlotsEnabled();
    const destinationColumn = normalizeCarryColumn(targetColumn);
    if (!destinationColumn) return sheet.buildCarryDropErrorResult("operation invalide");
    if (!isCarryColumnAllowedForItemType(sheet, destinationColumn, itemType, { bagEnabledOverride: bagEnabled })) {
      clearItemReorderVisualState(sheet);
      return sheet.buildCarryDropErrorResult("type non autorise");
    }
    if (destinationColumn === carryColumnBag && !bagEnabled) {
      getUi()?.notifications?.warn("Le sac n'est pas actif.");
      clearItemReorderVisualState(sheet);
      return sheet.buildCarryDropErrorResult(carryColumnFullReason);
    }

    const stateBefore = sheet.getCarriedColumnState({ bagEnabledOverride: bagEnabled });
    const sourceId = String(sourceItem.id || "").trim();
    const sourceColumn = sheet.getItemCarryColumn(sourceItem, { fallbackById: stateBefore.byId });
    const destinationCapacity = getItemListColumnCapacityFromElement(sheet, list);
    if (destinationColumn !== sourceColumn && Number.isFinite(destinationCapacity) && destinationCapacity > 0) {
      const destinationCount = sumCarriedItemInventorySlots(
        (stateBefore.columns[destinationColumn] || [])
          .filter(entry => String(entry?.id || "").trim() !== sourceId)
      );
      if ((destinationCount + getCarriedItemInventorySlots(sourceItem)) > destinationCapacity) {
        getUi()?.notifications?.warn("Colonne pleine.");
        clearItemReorderVisualState(sheet);
        return sheet.buildCarryDropErrorResult(carryColumnFullReason);
      }
    }

    let movedAcrossColumns = false;
    if (destinationColumn !== sourceColumn) {
      const moved = await sheet.setItemCarryColumn(sourceItem, destinationColumn, { bagEnabledOverride: bagEnabled });
      if (!moved) {
        clearItemReorderVisualState(sheet);
        return sheet.buildCarryDropErrorResult("deplacement impossible");
      }
      movedAcrossColumns = true;
    }

    const latestSourceItem = sheet.actor?.items?.get?.(sourceId) || sourceItem;
    const stateAfterMove = sheet.getCarriedColumnState({ bagEnabledOverride: bagEnabled });
    let targetLi = nativeEvent?.target?.closest?.("li.item[data-item-id]");
    if (!targetLi || !list.contains?.(targetLi)) targetLi = null;
    let targetItem = targetLi ? sheet.getItemFromListElement(targetLi) : null;
    const targetType = String(targetItem?.type || "").trim().toLowerCase();
    if (targetItem && !carriedItemTypes.has(targetType)) targetItem = null;

    let sortBefore = false;
    if (!targetItem || String(targetItem.id || "") === sourceId) {
      targetItem = toItemArray(sheet.actor?.items)
        .filter(entry => (
          entry
          && carriedItemTypes.has(String(entry.type || "").trim().toLowerCase())
          && String(entry.id || "") !== sourceId
          && (!acceptedTypes || acceptedTypes.has(String(entry.type || "").trim().toLowerCase()))
          && sheet.getItemCarryColumn(entry, { fallbackById: stateAfterMove.byId }) === destinationColumn
        ))
        .sort((left, right) => {
          const leftSort = toFiniteNumber(left?.sort, 0);
          const rightSort = toFiniteNumber(right?.sort, 0);
          if (leftSort !== rightSort) return leftSort - rightSort;
          return String(left?.id || "").localeCompare(String(right?.id || ""));
        })
        .slice(-1)[0] || null;
      sortBefore = false;
    } else {
      sortBefore = getItemReorderSortBefore(sheet, nativeEvent, targetLi, getItemListColumnCountFromElement(sheet, list));
    }

    if (!targetItem || String(targetItem.id || "") === sourceId) {
      clearItemReorderVisualState(sheet);
      if (movedAcrossColumns && shouldManuallyRenderAfterUpdate(sheet)) sheet.render(false);
      return sheet.buildCarryDropSuccessResult({ bagEnabledOverride: bagEnabled });
    }

    const updates = buildItemReorderUpdates(sheet, latestSourceItem, targetItem, {
      sortBefore,
      restrictToItemType: false,
      scopeFilter: entry => {
        if (!entry) return false;
        const entryType = String(entry.type || "").trim().toLowerCase();
        if (!carriedItemTypes.has(entryType)) return false;
        if (acceptedTypes && !acceptedTypes.has(entryType)) return false;
        return sheet.getItemCarryColumn(entry, { fallbackById: stateAfterMove.byId }) === destinationColumn;
      }
    });
    if (!updates.length) {
      clearItemReorderVisualState(sheet);
      if (movedAcrossColumns && shouldManuallyRenderAfterUpdate(sheet)) sheet.render(false);
      return sheet.buildCarryDropSuccessResult({ bagEnabledOverride: bagEnabled });
    }

    const applied = await applyActorItemOrderUpdates(sheet, updates);
    clearItemReorderVisualState(sheet);
    if ((applied || movedAcrossColumns) && shouldManuallyRenderAfterUpdate(sheet)) sheet.render(false);
    return sheet.buildCarryDropSuccessResult({ bagEnabledOverride: bagEnabled });
  }

  function onItemReorderDragStart(sheet, eventLike) {
    const startedAt = startPerfTimer();
    const nativeEvent = eventLike?.originalEvent || eventLike;
    const li = eventLike?.currentTarget?.closest?.("li.item[data-item-id]")
      || nativeEvent?.target?.closest?.("li.item[data-item-id]");
    const item = sheet.getItemFromListElement(li);
    if (!li || !item || !nativeEvent?.dataTransfer) return;
    const payload = {
      actorId: String(sheet.actor?.id || ""),
      actorUuid: String(sheet.actor?.uuid || ""),
      itemId: String(item.id || ""),
      itemType: String(item.type || "").trim().toLowerCase()
    };
    if (!payload.actorId || !payload.itemId || !payload.itemType) return;

    if (sheet._itemReorderPayloadClearTimer) {
      clearTimeout(sheet._itemReorderPayloadClearTimer);
      sheet._itemReorderPayloadClearTimer = null;
    }
    sheet._activeItemReorderPayload = payload;
    globalThis.__bloodmanActiveItemDragPayload = { ...payload, startedAt: Date.now() };
    setDragTransferData(sheet, nativeEvent.dataTransfer, "application/x-bloodman-item-reorder", payload);
    const foundryPayload = buildFoundryItemDragPayload(sheet, item);
    setDragTransferData(sheet, nativeEvent.dataTransfer, "text/plain", foundryPayload);
    setDragTransferData(sheet, nativeEvent.dataTransfer, "application/json", foundryPayload);
    try {
      nativeEvent.dataTransfer.effectAllowed = "move";
    } catch (_error) {
      // Browser may reject drag metadata changes.
    }
    li.classList?.add?.("is-reorder-dragging");
    logSheetPerformance("actor-sheet.drag.start", {
      actorId: sheet.actor?.id || "",
      itemId: String(item.id || ""),
      itemType: String(item.type || ""),
      durationMs: Number(endPerfTimer(startedAt).toFixed(2))
    });
  }

  function onItemReorderDragOver(sheet, eventLike) {
    const nativeEvent = eventLike?.originalEvent || eventLike;
    const HTMLElementClass = getHTMLElementClass();
    if (sheet.getEquiperAvecDropContainerFromEvent(eventLike)) {
      clearItemReorderVisualState(sheet);
      return sheet.onEquiperAvecDragOver(eventLike);
    }
    const payload = getItemReorderPayloadFromEvent(sheet, eventLike);
    if (!payload) return onExternalItemListDragOver(sheet, eventLike);
    if (!isItemReorderPayloadForCurrentActor(sheet, payload)) return onExternalItemListDragOver(sheet, eventLike, payload);

    const list = getItemListDropTargetFromEvent(sheet, eventLike);
    if (!isHTMLElementLike(list, HTMLElementClass)) return;
    const equiperAvecParent = sheet.rememberEquiperAvecDropTargetFromEvent(eventLike);
    if (equiperAvecParent && String(equiperAvecParent.id || "") !== String(payload.itemId || "")) {
      eventLike?.preventDefault?.();
      nativeEvent?.preventDefault?.();
      if (nativeEvent?.dataTransfer) nativeEvent.dataTransfer.dropEffect = "move";
      clearItemReorderVisualState(sheet);
      sheet.highlightEquiperAvecDropTarget(equiperAvecParent);
      return;
    }

    const bagZone = getItemListBagZoneFromElement(sheet, list);
    const carryColumn = getItemListCarryColumnFromElement(sheet, list);
    const acceptedTypes = getItemListAcceptedTypesFromElement(sheet, list);
    const isCarryMixedScope = getItemListReorderScopeFromElement(sheet, list) === "carry-mixed";
    if (carryColumn) {
      if (!carriedItemTypes.has(payload.itemType)) {
        clearItemReorderVisualState(sheet);
        return;
      }
      if (carryColumn === carryColumnBag && !sheet.isActorBagSlotsEnabled()) {
        clearItemReorderVisualState(sheet);
        return;
      }
      const sourceItem = sheet.actor?.items?.get?.(String(payload.itemId || "").trim()) || null;
      const state = sheet.getCarriedColumnState();
      const sourceColumn = sourceItem ? sheet.getItemCarryColumn(sourceItem, { fallbackById: state.byId }) : "";
      const capacity = getItemListColumnCapacityFromElement(sheet, list);
      if (sourceColumn !== carryColumn && Number.isFinite(capacity) && capacity > 0) {
        const currentCount = sumCarriedItemInventorySlots(
          (state.columns[carryColumn] || [])
            .filter(entry => String(entry?.id || "").trim() !== String(payload.itemId || "").trim())
        );
        const sourceSlots = sourceItem ? getCarriedItemInventorySlots(sourceItem) : 1;
        if ((currentCount + sourceSlots) > capacity) {
          clearItemReorderVisualState(sheet);
          return;
        }
      }
    }
    if (acceptedTypes && !acceptedTypes.has(payload.itemType)) {
      clearItemReorderVisualState(sheet);
      return;
    }
    if (bagZone && !sheet.isBagZoneSupportedItemType(payload.itemType)) {
      clearItemReorderVisualState(sheet);
      return;
    }
    eventLike?.preventDefault?.();
    nativeEvent?.preventDefault?.();
    if (nativeEvent?.dataTransfer) nativeEvent.dataTransfer.dropEffect = "move";

    clearItemReorderVisualState(sheet);
    list.classList?.add?.("is-reorder-target");
    const targetLi = nativeEvent?.target?.closest?.("li.item[data-item-id]");
    if (!targetLi || !list.contains?.(targetLi)) return;
    const targetItem = sheet.getItemFromListElement(targetLi);
    const targetType = String(targetItem?.type || "").trim().toLowerCase();
    if (!targetItem) return;
    if (acceptedTypes && !acceptedTypes.has(targetType)) return;
    if (carryColumn) {
      if (!carriedItemTypes.has(targetType)) return;
    } else if (isCarryMixedScope) {
      if (!sheet.isBagZoneSupportedItemType(targetType)) return;
    } else if (targetType !== payload.itemType) {
      return;
    }
    const sortBefore = getItemReorderSortBefore(sheet, nativeEvent, targetLi, getItemListColumnCountFromElement(sheet, list));
    targetLi.classList?.add?.(sortBefore ? "is-reorder-drop-before" : "is-reorder-drop-after");
  }

  function onExternalItemListDragOver(sheet, eventLike, payloadOverride = null) {
    const nativeEvent = eventLike?.originalEvent || eventLike;
    const HTMLElementClass = getHTMLElementClass();
    const data = getDragEventData(nativeEvent);
    const override = payloadOverride && typeof payloadOverride === "object" ? payloadOverride : null;
    const list = getItemListDropTargetFromEvent(sheet, eventLike);
    if (!isHTMLElementLike(list, HTMLElementClass)) return;

    const dataType = String(data?.type || (override ? "Item" : "")).trim().toLowerCase();
    const itemType = String(override?.itemType || getExternalItemDragTypeFromData(sheet, data)).trim().toLowerCase();
    const carryColumn = getItemListCarryColumnFromElement(sheet, list);
    const bagZone = getItemListBagZoneFromElement(sheet, list);
    const acceptedTypes = getItemListAcceptedTypesFromElement(sheet, list);

    if (dataType && dataType !== "item") return;
    const equiperAvecParent = sheet.rememberEquiperAvecDropTargetFromEvent(eventLike);
    if (equiperAvecParent) {
      eventLike?.preventDefault?.();
      nativeEvent?.preventDefault?.();
      if (nativeEvent?.dataTransfer) {
        nativeEvent.dataTransfer.dropEffect = String(override?.actorId || data?.actorId || data?.uuid || "").includes("Actor.") ? "move" : "copy";
      }
      clearItemReorderVisualState(sheet);
      sheet.highlightEquiperAvecDropTarget(equiperAvecParent);
      return;
    }
    if (acceptedTypes && itemType && !acceptedTypes.has(itemType)) {
      clearItemReorderVisualState(sheet);
      return;
    }
    if (carryColumn) {
      if (itemType && !carriedItemTypes.has(itemType)) {
        clearItemReorderVisualState(sheet);
        return;
      }
      if (carryColumn === carryColumnBag && !sheet.isActorBagSlotsEnabled()) {
        clearItemReorderVisualState(sheet);
        return;
      }
    }
    if (bagZone && itemType && !sheet.isBagZoneSupportedItemType(itemType)) {
      clearItemReorderVisualState(sheet);
      return;
    }

    eventLike?.preventDefault?.();
    nativeEvent?.preventDefault?.();
    if (nativeEvent?.dataTransfer) {
      nativeEvent.dataTransfer.dropEffect = String(override?.actorId || data?.actorId || data?.uuid || "").includes("Actor.") ? "move" : "copy";
    }
    clearItemReorderVisualState(sheet);
    list.classList?.add?.("is-reorder-target");
  }

  function onItemReorderDragEnd(sheet) {
    const endingPayload = normalizeItemReorderPayload(sheet, sheet._activeItemReorderPayload);
    if (sheet._itemReorderPayloadClearTimer) clearTimeout(sheet._itemReorderPayloadClearTimer);
    sheet._itemReorderPayloadClearTimer = setTimeout(() => {
      sheet._activeItemReorderPayload = null;
      sheet._itemReorderPayloadClearTimer = null;
    }, 200);
    setTimeout(() => {
      const active = globalThis.__bloodmanActiveItemDragPayload || null;
      if (
        active
        && String(active.actorId || "") === String(sheet.actor?.id || "")
        && String(active.itemId || "") === String(endingPayload?.itemId || "")
      ) {
        globalThis.__bloodmanActiveItemDragPayload = null;
      }
    }, 250);
    sheet.clearRememberedEquiperAvecDropTarget();
    clearItemReorderVisualState(sheet);
  }

  function onItemReorderDragLeave(sheet, eventLike) {
    const HTMLElementClass = getHTMLElementClass();
    const nativeEvent = eventLike?.originalEvent || eventLike;
    const list = getItemListDropTargetFromEvent(sheet, eventLike);
    if (!isHTMLElementLike(list, HTMLElementClass)) return;
    const relatedTarget = nativeEvent?.relatedTarget;
    if (isHTMLElementLike(relatedTarget, HTMLElementClass) && list.contains?.(relatedTarget)) return;
    sheet.clearRememberedEquiperAvecDropTarget();
    list.classList?.remove?.("is-reorder-target");
    list.querySelectorAll?.(".is-reorder-drop-before").forEach(node => node.classList.remove("is-reorder-drop-before"));
    list.querySelectorAll?.(".is-reorder-drop-after").forEach(node => node.classList.remove("is-reorder-drop-after"));
  }

  function activateActorItemDndListeners(sheet, html) {
    html.find("li.item[data-item-id]").attr("draggable", true);
    html.off("dragstart.bloodmanDnd", "li.item[data-item-id]");
    html.off("dragover.bloodmanDnd", "ol.item-list, [data-item-list-drop-target='true']");
    html.off("dragleave.bloodmanDnd", "ol.item-list, [data-item-list-drop-target='true']");
    html.off("dragend.bloodmanDnd", "li.item[data-item-id]");
    html.off("drop.bloodmanDnd", "ol.item-list, [data-item-list-drop-target='true']");
    html.off("dragover.bloodmanDnd", "[data-equiper-avec-drop='true']");
    html.off("dragleave.bloodmanDnd", "[data-equiper-avec-drop='true']");
    html.off("drop.bloodmanDnd", "[data-equiper-avec-drop='true']");

    html.on("dragstart.bloodmanDnd", "li.item[data-item-id]", ev => sheet.onItemReorderDragStart(ev));
    html.on("dragover.bloodmanDnd", "ol.item-list, [data-item-list-drop-target='true']", ev => {
      if (sheet.shouldSkipItemListContainerDelegate(ev)) return;
      sheet.onItemReorderDragOver(ev);
    });
    html.on("dragleave.bloodmanDnd", "ol.item-list, [data-item-list-drop-target='true']", ev => {
      if (sheet.shouldSkipItemListContainerDelegate(ev)) return;
      sheet.onItemReorderDragLeave(ev);
    });
    html.on("dragend.bloodmanDnd", "li.item[data-item-id]", () => sheet.onItemReorderDragEnd());
    html.on("drop.bloodmanDnd", "ol.item-list, [data-item-list-drop-target='true']", async ev => {
      if (sheet.shouldSkipItemListContainerDelegate(ev)) return;
      await sheet.onItemReorderDrop(ev);
    });
    html.on("dragover.bloodmanDnd", "[data-equiper-avec-drop='true']", ev => sheet.onEquiperAvecDragOver(ev));
    html.on("dragleave.bloodmanDnd", "[data-equiper-avec-drop='true']", ev => sheet.onEquiperAvecDragLeave(ev));
    html.on("drop.bloodmanDnd", "[data-equiper-avec-drop='true']", async ev => {
      await sheet.onEquiperAvecDrop(ev);
    });
  }

  return {
    getItemListColumnCountFromElement,
    getItemListDropTargetFromEvent,
    shouldSkipItemListContainerDelegate,
    getItemListBagZoneFromElement,
    getItemListReorderScopeFromElement,
    getItemListAcceptedTypesFromElement,
    normalizeCarryColumn,
    isCarryColumnAllowedForItemType,
    getItemListCarryColumnFromElement,
    getItemListColumnCapacityFromElement,
    getCarryColumnCapacity,
    normalizeItemReorderPayload,
    buildItemReorderPayloadFromDocumentDragData,
    isItemReorderPayloadForCurrentActor,
    getActiveItemReorderPayloadFromDom,
    getGlobalItemReorderPayload,
    getItemReorderPayloadFromEvent,
    buildFoundryItemDragPayload,
    setDragTransferData,
    getExternalItemDragTypeFromData,
    getItemDropInFlightKeys,
    buildExternalItemDropKey,
    clearItemReorderVisualState,
    getItemReorderSortBefore,
    buildItemReorderUpdates,
    applyActorItemOrderUpdates,
    shouldManuallyRenderAfterUpdate,
    handleCarryColumnDrop,
    onItemReorderDragStart,
    onItemReorderDragOver,
    onExternalItemListDragOver,
    onItemReorderDragEnd,
    onItemReorderDragLeave,
    activateActorItemDndListeners
  };
}
