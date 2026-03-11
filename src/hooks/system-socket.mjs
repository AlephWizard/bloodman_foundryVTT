export function buildSystemSocketHooks({
  systemSocket,
  hasSocket,
  socketOn,
  socketOff,
  isCurrentUserPrimaryPrivilegedOperator,
  handleDamageConfigPopupMessage,
  handleDamageSplitPopupMessage,
  handlePowerUsePopupMessage,
  handleDamageAppliedMessage,
  handleDamageRerollRequest,
  handleVitalResourceUpdateRequest,
  handleActorSheetUpdateRequest,
  handleDeleteItemRequest,
  handleReorderActorItemsRequest,
  wasChaosRequestProcessed,
  rememberChaosRequest,
  setChaosValue,
  getChaosValue,
  handleIncomingDamageRequest
} = {}) {
  const onDamageConfigPopup = typeof handleDamageConfigPopupMessage === "function"
    ? handleDamageConfigPopupMessage
    : async () => {};
  const onDamageSplitPopup = typeof handleDamageSplitPopupMessage === "function"
    ? handleDamageSplitPopupMessage
    : async () => {};
  const onPowerUsePopup = typeof handlePowerUsePopupMessage === "function"
    ? handlePowerUsePopupMessage
    : async () => {};
  const onDamageApplied = typeof handleDamageAppliedMessage === "function"
    ? handleDamageAppliedMessage
    : async () => {};
  const onDamageReroll = typeof handleDamageRerollRequest === "function"
    ? handleDamageRerollRequest
    : async () => {};
  const onVitalResourceUpdate = typeof handleVitalResourceUpdateRequest === "function"
    ? handleVitalResourceUpdateRequest
    : async () => {};
  const onActorSheetUpdate = typeof handleActorSheetUpdateRequest === "function"
    ? handleActorSheetUpdateRequest
    : async () => {};
  const onDeleteItem = typeof handleDeleteItemRequest === "function"
    ? handleDeleteItemRequest
    : async () => {};
  const onReorderActorItems = typeof handleReorderActorItemsRequest === "function"
    ? handleReorderActorItemsRequest
    : async () => {};
  const onIncomingDamage = typeof handleIncomingDamageRequest === "function"
    ? handleIncomingDamageRequest
    : async () => {};

  function registerDamageSocketHandlers() {
    if (typeof hasSocket !== "function" || !hasSocket()) return;
    const previousHandler = globalThis.__bmDamageSocketHandler;
    if (previousHandler) socketOff(systemSocket, previousHandler);

    const handler = async data => {
      if (!data) return;
      const canHandlePrivilegedRequests = isCurrentUserPrimaryPrivilegedOperator();
      if (data.type === "damageConfigPopup") {
        await onDamageConfigPopup(data, "socket");
        return;
      }
      if (data.type === "damageSplitPopup") {
        await onDamageSplitPopup(data, "socket");
        return;
      }
      if (data.type === "powerUsePopup") {
        await onPowerUsePopup(data, "socket");
        return;
      }
      if (data.type === "damageApplied") {
        await onDamageApplied(data);
        return;
      }
      if (data.type === "rerollDamage") {
        if (canHandlePrivilegedRequests) await onDamageReroll(data);
        return;
      }
      if (data.type === "updateVitalResources") {
        if (canHandlePrivilegedRequests) await onVitalResourceUpdate(data);
        return;
      }
      if (data.type === "updateActorSheetData") {
        if (canHandlePrivilegedRequests) await onActorSheetUpdate(data);
        return;
      }
      if (data.type === "deleteActorItem") {
        if (canHandlePrivilegedRequests) await onDeleteItem(data);
        return;
      }
      if (data.type === "reorderActorItems") {
        if (canHandlePrivilegedRequests) await onReorderActorItems(data);
        return;
      }
      if (data.type === "adjustChaosDice") {
        if (!canHandlePrivilegedRequests) return;
        const delta = Number(data.delta);
        if (!Number.isFinite(delta) || delta === 0) return;
        const requestId = String(data.requestId || "");
        if (requestId && wasChaosRequestProcessed(requestId)) return;
        if (requestId) rememberChaosRequest(requestId);
        await setChaosValue(getChaosValue() + delta);
        return;
      }
      if (data.type !== "applyDamage") return;
      if (!canHandlePrivilegedRequests) return;
      await onIncomingDamage(data, "socket");
    };

    if (!socketOn(systemSocket, handler)) return;
    globalThis.__bmDamageSocketHandler = handler;
    globalThis.__bmDamageSocketReady = true;
  }

  return {
    registerDamageSocketHandlers
  };
}
