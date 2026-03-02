function isCharacterLikeActor(actor) {
  return actor?.type === "personnage" || actor?.type === "personnage-non-joueur";
}

export function buildActorSocketRequestHandlers({
  canUserRoleEditCharacteristics,
  vitalResourcePaths,
  resolveActorForVitalResourceUpdate,
  resolveActorForSheetRequest,
  normalizeVitalResourceValue,
  sanitizeActorUpdateForRole,
  hasActorUpdatePayload,
  flattenObject,
  toFiniteNumber
} = {}) {
  async function handleVitalResourceUpdateRequest(data) {
    const currentGame = globalThis.game;
    if (!data || !currentGame?.user?.isGM) return;
    const requesterId = String(data.requesterId || "");
    const requester = currentGame.users?.get(requesterId);
    if (!requester) return;
    const requesterRole = requester?.role ?? 0;
    if (typeof canUserRoleEditCharacteristics === "function") {
      if (!canUserRoleEditCharacteristics(requesterRole)) return;
    } else {
      return;
    }

    const path = String(data.path || "");
    if (!vitalResourcePaths?.has(path)) return;

    const actor = await resolveActorForVitalResourceUpdate(data);
    if (!isCharacterLikeActor(actor)) return;

    const normalizedValue = typeof normalizeVitalResourceValue === "function"
      ? normalizeVitalResourceValue({
        path,
        value: data.value,
        pvMax: actor.system?.resources?.pv?.max,
        ppMax: actor.system?.resources?.pp?.max
      })
      : data.value;
    await actor.update({ [path]: normalizedValue });
  }

  async function handleActorSheetUpdateRequest(data) {
    const currentGame = globalThis.game;
    if (!data || !currentGame?.user?.isGM) return;
    const requesterId = String(data.requesterId || "");
    const requester = currentGame.users?.get(requesterId);
    if (!requester) return;
    const requesterRole = requester?.role ?? 0;
    const actor = await resolveActorForSheetRequest(data);
    if (!isCharacterLikeActor(actor)) return;

    const allowCharacteristicBase = Boolean(data?.options?.allowCharacteristicBase);
    const allowVitalResourceUpdate = Boolean(data?.options?.allowVitalResourceUpdate);
    const allowAmmoUpdate = Boolean(data?.options?.allowAmmoUpdate);
    const sanitized = typeof sanitizeActorUpdateForRole === "function"
      ? sanitizeActorUpdateForRole(data.updateData || {}, requesterRole, {
        actor,
        allowCharacteristicBase,
        allowVitalResourceUpdate,
        allowAmmoUpdate,
        enforceCharacteristicBaseRange: actor.type === "personnage"
      })
      : (data.updateData || {});

    const hasPayload = typeof hasActorUpdatePayload === "function"
      ? hasActorUpdatePayload(sanitized, flattenObject)
      : Boolean(sanitized && typeof sanitized === "object" && Object.keys(sanitized).length > 0);
    if (!hasPayload) return;

    await actor.update(sanitized, {
      bloodmanAllowCharacteristicBase: allowCharacteristicBase,
      bloodmanAllowVitalResourceUpdate: allowVitalResourceUpdate,
      bloodmanAllowAmmoUpdate: allowAmmoUpdate
    });
  }

  async function handleDeleteItemRequest(data) {
    const currentGame = globalThis.game;
    if (!data || !currentGame?.user?.isGM) return;
    const requesterId = String(data.requesterId || "");
    const requester = currentGame.users?.get(requesterId);
    if (!requester) return;
    const initialActor = await resolveActorForSheetRequest(data);
    if (!initialActor) return;

    const extractItemIdFromUuid = uuid => {
      const raw = String(uuid || "");
      const match = raw.match(/Item\.([^\.]+)$/);
      return match?.[1] || "";
    };

    const actorCandidates = [];
    const addActor = candidate => {
      if (!candidate) return;
      if (actorCandidates.some(existing => existing?.id === candidate?.id && existing?.uuid === candidate?.uuid)) return;
      actorCandidates.push(candidate);
    };

    addActor(initialActor);
    const worldActorId = String(data.actorBaseId || data.actorId || "");
    if (worldActorId) addActor(currentGame.actors?.get(worldActorId) || null);
    if (initialActor?.isToken && initialActor?.token?.actorId) {
      addActor(currentGame.actors?.get(initialActor.token.actorId) || null);
    }

    const requestedItemId = String(data.itemId || "") || extractItemIdFromUuid(data.itemUuid);
    const candidateItemIds = [];
    if (requestedItemId) candidateItemIds.push(requestedItemId);
    const uuidItemId = extractItemIdFromUuid(data.itemUuid);
    if (uuidItemId && !candidateItemIds.includes(uuidItemId)) candidateItemIds.push(uuidItemId);

    const deleteFromActorById = async (actor, itemId) => {
      if (!actor || !itemId) return false;
      if (!actor.items?.has(itemId)) return false;
      try {
        await actor.deleteEmbeddedDocuments("Item", [itemId], { render: false });
        return true;
      } catch (_error) {
        const item = actor.items?.get(itemId);
        if (!item) return false;
        try {
          await item.delete();
          return true;
        } catch (_fallbackError) {
          return false;
        }
      }
    };

    for (const actor of actorCandidates) {
      for (const itemId of candidateItemIds) {
        if (await deleteFromActorById(actor, itemId)) return;
      }
    }

    const itemName = String(data.itemName || "").trim().toLowerCase();
    const itemType = String(data.itemType || "").trim().toLowerCase();
    if (itemName) {
      for (const actor of actorCandidates) {
        const match = actor?.items?.find(item => {
          if (!item) return false;
          if (String(item.name || "").trim().toLowerCase() !== itemName) return false;
          if (itemType && String(item.type || "").trim().toLowerCase() !== itemType) return false;
          return true;
        });
        if (match && await deleteFromActorById(actor, match.id)) return;
      }
    }
  }

  async function handleReorderActorItemsRequest(data) {
    const currentGame = globalThis.game;
    if (!data || !currentGame?.user?.isGM) return;
    const requesterId = String(data.requesterId || "");
    const requester = currentGame.users?.get(requesterId);
    if (!requester) return;
    const actor = await resolveActorForSheetRequest(data);
    if (!isCharacterLikeActor(actor)) return;
    const ownerLevel = Number(globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3);
    const hasOwnerAccess = typeof actor.testUserPermission === "function"
      ? actor.testUserPermission(requester, ownerLevel, { exact: false })
      : false;
    if (!hasOwnerAccess) return;

    const requestedUpdates = Array.isArray(data.updates) ? data.updates : [];
    if (!requestedUpdates.length) return;

    const normalizeNumber = typeof toFiniteNumber === "function"
      ? toFiniteNumber
      : (value, fallback = 0) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
      };
    const safeUpdates = requestedUpdates
      .map(entry => {
        const itemId = String(entry?._id || entry?.id || "").trim();
        if (!itemId || !actor.items?.has(itemId)) return null;
        const fallbackSort = normalizeNumber(actor.items.get(itemId)?.sort, 0);
        const sortValue = Math.max(0, Math.floor(normalizeNumber(entry?.sort, fallbackSort)));
        return { _id: itemId, sort: sortValue };
      })
      .filter(Boolean);
    if (!safeUpdates.length) return;

    await actor.updateEmbeddedDocuments("Item", safeUpdates);
  }

  return {
    handleVitalResourceUpdateRequest,
    handleActorSheetUpdateRequest,
    handleDeleteItemRequest,
    handleReorderActorItemsRequest
  };
}
