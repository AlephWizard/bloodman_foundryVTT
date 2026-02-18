function defaultNormalizeFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
}

export function buildActorSocketRequestClient({
  systemSocket,
  hasSocket,
  socketEmit,
  toFiniteNumber,
  vitalResourcePaths,
  hasActorUpdatePayload,
  flattenObject
} = {}) {
  const normalizeNumber = typeof toFiniteNumber === "function"
    ? toFiniteNumber
    : defaultNormalizeFiniteNumber;

  function getSocketActorBaseId(actor) {
    return String(actor?.token?.actorId || actor?.parent?.actorId || actor?.baseActor?.id || actor?.id || "");
  }

  function requestVitalResourceUpdate(actor, path, value) {
    if (!actor || typeof hasSocket !== "function" || !hasSocket()) return;
    if (!vitalResourcePaths?.has(String(path || ""))) return;
    socketEmit(systemSocket, {
      type: "updateVitalResources",
      requesterId: String(game.user?.id || ""),
      actorUuid: String(actor.uuid || ""),
      actorId: String(actor.id || ""),
      actorBaseId: getSocketActorBaseId(actor),
      path: String(path),
      value: Math.max(0, Math.floor(normalizeNumber(value, 0)))
    });
  }

  function requestActorSheetUpdate(actor, updateData, options = {}) {
    const hasPayload = typeof hasActorUpdatePayload === "function"
      ? hasActorUpdatePayload(updateData, flattenObject)
      : Boolean(updateData && typeof updateData === "object" && Object.keys(updateData).length > 0);
    if (!actor || typeof hasSocket !== "function" || !hasSocket() || !hasPayload) return false;
    return socketEmit(systemSocket, {
      type: "updateActorSheetData",
      requesterId: String(game.user?.id || ""),
      actorUuid: String(actor.uuid || ""),
      actorId: String(actor.id || ""),
      actorBaseId: getSocketActorBaseId(actor),
      updateData,
      options: {
        allowCharacteristicBase: Boolean(options.allowCharacteristicBase),
        allowVitalResourceUpdate: Boolean(options.allowVitalResourceUpdate),
        allowAmmoUpdate: Boolean(options.allowAmmoUpdate)
      }
    });
  }

  function requestDeleteActorItem(actor, item) {
    if (!actor || !item || typeof hasSocket !== "function" || !hasSocket()) return false;
    return socketEmit(systemSocket, {
      type: "deleteActorItem",
      requesterId: String(game.user?.id || ""),
      actorUuid: String(actor.uuid || ""),
      actorId: String(actor.id || ""),
      actorBaseId: getSocketActorBaseId(actor),
      itemId: String(item.id || ""),
      itemUuid: String(item.uuid || ""),
      itemType: String(item.type || ""),
      itemName: String(item.name || "")
    });
  }

  function requestReorderActorItems(actor, updates = []) {
    if (!actor || typeof hasSocket !== "function" || !hasSocket() || !Array.isArray(updates)) return false;
    const sanitizedUpdates = updates
      .map(entry => {
        const itemId = String(entry?._id || entry?.id || "").trim();
        if (!itemId) return null;
        const sortValue = Math.max(0, Math.floor(normalizeNumber(entry?.sort, 0)));
        return { _id: itemId, sort: sortValue };
      })
      .filter(Boolean);
    if (!sanitizedUpdates.length) return false;

    return socketEmit(systemSocket, {
      type: "reorderActorItems",
      requesterId: String(game.user?.id || ""),
      actorUuid: String(actor.uuid || ""),
      actorId: String(actor.id || ""),
      actorBaseId: getSocketActorBaseId(actor),
      updates: sanitizedUpdates
    });
  }

  return {
    getSocketActorBaseId,
    requestVitalResourceUpdate,
    requestActorSheetUpdate,
    requestDeleteActorItem,
    requestReorderActorItems
  };
}
