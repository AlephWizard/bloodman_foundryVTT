export function createActorLifecycleHooks({
  clearResolvedActorDocumentCaches = () => {},
  onUpdateActorCore = async () => {},
  getProperty = () => undefined,
  getCurrentUser = () => null,
  isCurrentUserPrimaryPrivilegedOperator = () => false,
  socketEmit = () => {},
  systemSocket = "",
  resolveActorBackpackEnabled = () => ({ enabled: false }),
  updateOpenActorSheetsBackpackState = () => {}
} = {}) {
  function getActorItemsArray(actor) {
    try {
      return Array.from(actor?.items || []);
    } catch (_error) {
      return [];
    }
  }

  function buildBackpackStatePayload(actor, userId = "") {
    const currentUser = getCurrentUser?.() || null;
    const backpackState = resolveActorBackpackEnabled(actor, { items: getActorItemsArray(actor) });
    return {
      type: "actorBackpackStateChanged",
      requesterId: String(currentUser?.id || userId || ""),
      actorUuid: String(actor?.uuid || ""),
      actorId: String(actor?.id || ""),
      actorBaseId: String(actor?.token?.actorId || actor?.baseActor?.id || actor?.id || ""),
      enabled: Boolean(backpackState?.enabled)
    };
  }

  function canBroadcastBackpackState() {
    const currentUser = getCurrentUser?.() || null;
    return Boolean(currentUser?.isGM || isCurrentUserPrimaryPrivilegedOperator?.());
  }

  function syncBackpackStateAfterActorUpdate(actor, changes = {}, userId = "") {
    if (getProperty(changes, "system.equipment.bagSlotsEnabled") == null) return false;
    const payload = buildBackpackStatePayload(actor, userId);
    if (canBroadcastBackpackState()) socketEmit(systemSocket, payload);
    updateOpenActorSheetsBackpackState(actor, payload.enabled);
    return true;
  }

  async function onUpdateActor(actor, changes = {}, options = {}, userId = "") {
    clearResolvedActorDocumentCaches();
    await onUpdateActorCore(actor, changes, options, userId);
    syncBackpackStateAfterActorUpdate(actor, changes, userId);
  }

  function onActorDocumentCacheInvalidated() {
    clearResolvedActorDocumentCaches();
  }

  return {
    buildBackpackStatePayload,
    syncBackpackStateAfterActorUpdate,
    onUpdateActor,
    onActorDocumentCacheInvalidated
  };
}
