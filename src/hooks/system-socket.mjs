export function buildSystemSocketHooks({
  systemSocket,
  hasSocket,
  socketOn,
  socketOff,
  isCurrentUserPrimaryPrivilegedOperator,
  handleDamageConfigPopupMessage,
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
  function registerDamageSocketHandlers() {
    if (typeof hasSocket !== "function" || !hasSocket()) return;
    const previousHandler = globalThis.__bmDamageSocketHandler;
    if (previousHandler) socketOff(systemSocket, previousHandler);

    const handler = async data => {
      if (!data) return;
      const canHandlePrivilegedRequests = isCurrentUserPrimaryPrivilegedOperator();
      if (data.type === "damageConfigPopup") {
        await handleDamageConfigPopupMessage(data, "socket");
        return;
      }
      if (data.type === "powerUsePopup") {
        await handlePowerUsePopupMessage(data, "socket");
        return;
      }
      if (data.type === "damageApplied") {
        await handleDamageAppliedMessage(data);
        return;
      }
      if (data.type === "rerollDamage") {
        if (canHandlePrivilegedRequests) await handleDamageRerollRequest(data);
        return;
      }
      if (data.type === "updateVitalResources") {
        if (canHandlePrivilegedRequests) await handleVitalResourceUpdateRequest(data);
        return;
      }
      if (data.type === "updateActorSheetData") {
        if (canHandlePrivilegedRequests) await handleActorSheetUpdateRequest(data);
        return;
      }
      if (data.type === "deleteActorItem") {
        if (canHandlePrivilegedRequests) await handleDeleteItemRequest(data);
        return;
      }
      if (data.type === "reorderActorItems") {
        if (canHandlePrivilegedRequests) await handleReorderActorItemsRequest(data);
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
      await handleIncomingDamageRequest(data, "socket");
    };

    if (!socketOn(systemSocket, handler)) return;
    globalThis.__bmDamageSocketHandler = handler;
    globalThis.__bmDamageSocketReady = true;
  }

  return {
    registerDamageSocketHandlers
  };
}
