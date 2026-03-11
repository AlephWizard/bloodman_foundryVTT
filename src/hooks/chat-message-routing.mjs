function defaultGetProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path).split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), object);
}

export function buildChatMessageRoutingHooks({
  getProperty,
  handleDamageConfigPopupMessage,
  handleDamageSplitPopupMessage,
  handlePowerUsePopupMessage,
  isCurrentUserPrimaryPrivilegedOperator,
  isInitiativeRollMessage,
  queueInitiativeRollMessage,
  wasChaosRequestProcessed,
  rememberChaosRequest,
  setChaosValue,
  getChaosValue,
  handleIncomingDamageRequest,
  handleDamageRerollRequest,
  scheduleTransientChatMessageDeletion,
  isTransportRelayChatMessage,
  hideTransientRelayChatMessage,
  decorateBloodmanChatRollMessage,
  logWarn
} = {}) {
  const readProperty = typeof getProperty === "function" ? getProperty : defaultGetProperty;
  const onDamageConfigPopup = typeof handleDamageConfigPopupMessage === "function"
    ? handleDamageConfigPopupMessage
    : async () => false;
  const onDamageSplitPopup = typeof handleDamageSplitPopupMessage === "function"
    ? handleDamageSplitPopupMessage
    : async () => false;
  const onPowerUsePopup = typeof handlePowerUsePopupMessage === "function"
    ? handlePowerUsePopupMessage
    : async () => false;
  const canHandlePrivilegedRequests = typeof isCurrentUserPrimaryPrivilegedOperator === "function"
    ? isCurrentUserPrimaryPrivilegedOperator
    : () => false;
  const isInitiativeMessage = typeof isInitiativeRollMessage === "function"
    ? isInitiativeRollMessage
    : () => false;
  const queueInitiativeMessage = typeof queueInitiativeRollMessage === "function"
    ? queueInitiativeRollMessage
    : () => {};
  const wasChaosProcessed = typeof wasChaosRequestProcessed === "function"
    ? wasChaosRequestProcessed
    : () => false;
  const rememberChaos = typeof rememberChaosRequest === "function"
    ? rememberChaosRequest
    : () => {};
  const applyChaosValue = typeof setChaosValue === "function"
    ? setChaosValue
    : async () => {};
  const readChaosValue = typeof getChaosValue === "function"
    ? getChaosValue
    : () => 0;
  const applyIncomingDamage = typeof handleIncomingDamageRequest === "function"
    ? handleIncomingDamageRequest
    : async () => {};
  const applyRerollDamage = typeof handleDamageRerollRequest === "function"
    ? handleDamageRerollRequest
    : async () => {};
  const scheduleDeletion = typeof scheduleTransientChatMessageDeletion === "function"
    ? scheduleTransientChatMessageDeletion
    : () => {};
  const isTransportRelay = typeof isTransportRelayChatMessage === "function"
    ? isTransportRelayChatMessage
    : () => false;
  const hideRelayMessage = typeof hideTransientRelayChatMessage === "function"
    ? hideTransientRelayChatMessage
    : () => {};
  const decorateChatRollMessage = typeof decorateBloodmanChatRollMessage === "function"
    ? decorateBloodmanChatRollMessage
    : () => {};
  const warn = typeof logWarn === "function" ? logWarn : () => {};

  async function onCreateChatMessage(message) {
    const damageConfigPopupPayload = readProperty(message, "flags.bloodman.damageConfigPopup");
    if (damageConfigPopupPayload) {
      await onDamageConfigPopup(damageConfigPopupPayload, "chat");
      scheduleDeletion(message, 250);
      return;
    }

    const damageSplitPopupPayload = readProperty(message, "flags.bloodman.damageSplitPopup");
    if (damageSplitPopupPayload) {
      await onDamageSplitPopup(damageSplitPopupPayload, "chat");
      scheduleDeletion(message, 250);
      return;
    }

    const powerUsePopupPayload = readProperty(message, "flags.bloodman.powerUsePopup");
    if (powerUsePopupPayload) {
      await onPowerUsePopup(powerUsePopupPayload, "chat");
      scheduleDeletion(message, 250);
      return;
    }

    if (!canHandlePrivilegedRequests()) return;
    if (isInitiativeMessage(message)) {
      queueInitiativeMessage(message);
      return;
    }
    const chaosPayload = readProperty(message, "flags.bloodman.chaosDeltaRequest");
    if (chaosPayload) {
      const delta = Number(chaosPayload.delta);
      const requestId = String(chaosPayload.requestId || "");
      if (Number.isFinite(delta) && delta !== 0) {
        if (!requestId || !wasChaosProcessed(requestId)) {
          if (requestId) rememberChaos(requestId);
          await applyChaosValue(readChaosValue() + delta);
        }
      }
      scheduleDeletion(message, 250);
      return;
    }
    const damagePayload = readProperty(message, "flags.bloodman.damageRequest");
    if (damagePayload) {
      await applyIncomingDamage(damagePayload, "chat");
      scheduleDeletion(message, 250);
      return;
    }

    const rerollPayload = readProperty(message, "flags.bloodman.rerollDamageRequest");
    if (!rerollPayload) return;
    await applyRerollDamage(rerollPayload);
    scheduleDeletion(message, 250);
  }

  function handleChatMessageRenderHook(message, htmlLike, sourceHook = "renderChatMessage") {
    if (isTransportRelay(message)) {
      hideRelayMessage(htmlLike);
      return;
    }
    try {
      decorateChatRollMessage(message, htmlLike);
    } catch (error) {
      warn(`chat:roll decorate skipped (${sourceHook})`, { error });
    }
  }

  function onRenderChatMessage(message, htmlLike) {
    handleChatMessageRenderHook(message, htmlLike, "renderChatMessage");
  }

  function onRenderChatMessageHTML(message, htmlLike) {
    handleChatMessageRenderHook(message, htmlLike, "renderChatMessageHTML");
  }

  return {
    onCreateChatMessage,
    onRenderChatMessage,
    onRenderChatMessageHTML,
    handleChatMessageRenderHook
  };
}
