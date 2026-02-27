export function buildPowerUsePopupHooks({
  hasSocket,
  socketEmit,
  systemSocket,
  getCurrentUser,
  getActivePrivilegedOperatorIds,
  getActorPlayerViewerIds,
  normalizeRollDieFormula,
  toBooleanFlag,
  toFiniteNumber,
  enableChatTransportFallback,
  createChatMessage,
  powerUsePopupChatMarkup,
  isAssistantOrHigherRole,
  formatMultilineTextToHtml,
  escapeHtml,
  dialogClass,
  wasPowerUsePopupRequestProcessed,
  rememberPowerUsePopupRequest,
  logWarn,
  logError
} = {}) {
  const canUseSocket = typeof hasSocket === "function" ? hasSocket : () => false;
  const emitSocket = typeof socketEmit === "function" ? socketEmit : () => false;
  const resolveCurrentUser = typeof getCurrentUser === "function"
    ? getCurrentUser
    : () => globalThis.game?.user;
  const getPrivilegedIds = typeof getActivePrivilegedOperatorIds === "function"
    ? getActivePrivilegedOperatorIds
    : () => [];
  const getActorPlayers = typeof getActorPlayerViewerIds === "function"
    ? getActorPlayerViewerIds
    : () => [];
  const normalizeFormula = typeof normalizeRollDieFormula === "function"
    ? normalizeRollDieFormula
    : (value, fallback = "d4") => String(value || fallback || "d4");
  const parseBooleanFlag = typeof toBooleanFlag === "function"
    ? toBooleanFlag
    : value => value === true || String(value).trim().toLowerCase() === "true";
  const parseFiniteNumber = typeof toFiniteNumber === "function"
    ? toFiniteNumber
    : (value, fallback = 0) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
    };
  const writeChatMessage = typeof createChatMessage === "function"
    ? createChatMessage
    : async _data => null;
  const isFallbackEnabled = enableChatTransportFallback === true;
  const toSafeHtml = typeof escapeHtml === "function"
    ? escapeHtml
    : value => String(value || "");
  const renderDialogClass = dialogClass || globalThis.Dialog;
  const canAssistantRole = typeof isAssistantOrHigherRole === "function"
    ? isAssistantOrHigherRole
    : () => false;
  const formatDescription = typeof formatMultilineTextToHtml === "function"
    ? formatMultilineTextToHtml
    : value => String(value || "");
  const wasProcessed = typeof wasPowerUsePopupRequestProcessed === "function"
    ? wasPowerUsePopupRequestProcessed
    : () => false;
  const rememberProcessed = typeof rememberPowerUsePopupRequest === "function"
    ? rememberPowerUsePopupRequest
    : () => {};
  const warn = typeof logWarn === "function" ? logWarn : () => {};
  const errorLog = typeof logError === "function" ? logError : () => {};

  function getPopupItemLabel(itemType) {
    return String(itemType || "").trim().toLowerCase() === "aptitude" ? "Aptitude" : "Pouvoir";
  }

  function getPowerUsePopupViewerIds(requesterUserId = "", options = {}) {
    const requesterId = String(requesterUserId || "").trim();
    const includeRequesterUser = options?.includeRequesterUser === true;
    const actor = options?.actor || null;
    const ids = new Set(
      getPrivilegedIds()
        .map(userId => String(userId || "").trim())
        .filter(Boolean)
    );
    for (const userId of getActorPlayers(actor)) {
      const normalized = String(userId || "").trim();
      if (normalized) ids.add(normalized);
    }
    if (includeRequesterUser && requesterId) ids.add(requesterId);
    if (!includeRequesterUser && requesterId) ids.delete(requesterId);
    return [...ids];
  }

  function emitPowerUsePopup(actor, item, options = {}) {
    if (!canUseSocket() || !actor || !item) return false;
    const popupItemType = String(item.type || "").trim().toLowerCase();
    if (popupItemType !== "pouvoir" && popupItemType !== "aptitude") return false;
    const currentUser = resolveCurrentUser();
    const requesterUserId = String(currentUser?.id || "").trim();
    const includeRequesterUser = options?.includeRequesterUser === true;
    const viewerIds = getPowerUsePopupViewerIds(requesterUserId, {
      includeRequesterUser,
      actor
    });
    if (!viewerIds.length) return false;
    const randomId = () => (globalThis.foundry?.utils?.randomID ? globalThis.foundry.utils.randomID() : Math.random().toString(36).slice(2));
    const powerDamageFormula = item.system?.damageEnabled ? normalizeFormula(item.system?.damageDie, "d4") : "";
    const popupItemLabel = getPopupItemLabel(popupItemType);
    const hasPowerCost = popupItemType === "pouvoir" && parseBooleanFlag(item.system?.powerCostEnabled);
    const payload = {
      type: "powerUsePopup",
      eventId: randomId(),
      requestId: String(options.requestId || randomId()),
      requesterUserId,
      requesterUserName: String(currentUser?.name || "").trim(),
      viewerIds,
      actorId: String(actor.id || ""),
      actorName: String(actor.name || "").trim(),
      itemId: String(item.id || ""),
      itemType: popupItemType,
      itemLabel: popupItemLabel,
      itemName: String(item.name || "").trim() || popupItemLabel,
      powerId: String(item.id || ""),
      powerName: String(item.name || "").trim() || popupItemLabel,
      powerDescription: String(item.system?.note || item.system?.notes || "").trim(),
      powerCostEnabled: hasPowerCost,
      powerCost: hasPowerCost ? Math.max(0, Math.floor(parseFiniteNumber(item.system?.powerCost, 0))) : 0,
      damageEnabled: parseBooleanFlag(item.system?.damageEnabled),
      damageFormula: String(powerDamageFormula || "").trim(),
      context: {
        fromUseButton: options.fromUseButton === true
      }
    };
    if (!emitSocket(systemSocket, payload)) {
      errorLog("[bloodman] power:popup socket emit failed", { payloadType: payload?.type });
    }
    if (isFallbackEnabled) {
      void Promise.resolve(writeChatMessage({
        content: String(powerUsePopupChatMarkup || ""),
        whisper: viewerIds,
        flags: { bloodman: { powerUsePopup: payload } }
      })).catch(err => {
        errorLog("[bloodman] power:popup chat fallback failed", err);
      });
    }
    return true;
  }

  function canCurrentUserReceivePowerUsePopup(data) {
    const localUser = resolveCurrentUser();
    const localUserId = String(localUser?.id || "").trim();
    if (!localUserId) return false;
    if (localUser?.isGM) return true;
    const requesterUserId = String(data?.requesterUserId || "").trim();
    const isRequester = requesterUserId && requesterUserId === localUserId;
    const viewerIds = Array.isArray(data?.viewerIds)
      ? data.viewerIds.map(id => String(id || "").trim()).filter(Boolean)
      : [];
    if (viewerIds.length) return viewerIds.includes(localUserId);
    if (isRequester) return true;
    return canAssistantRole(localUser?.role);
  }

  function showPowerUsePopup(data) {
    if (!data || typeof renderDialogClass !== "function") return false;
    const actorName = String(data.actorName || "").trim();
    const requesterUserName = String(data.requesterUserName || "").trim();
    const popupItemType = String(data.itemType || "").trim().toLowerCase();
    const popupItemLabel = getPopupItemLabel(popupItemType);
    const powerName = String(data.itemName || data.powerName || "").trim() || popupItemLabel;
    const descriptionHtml = formatDescription(data.powerDescription);
    const noDescriptionText = toSafeHtml("Aucune description.");
    const damageEnabled = data.damageEnabled === true;
    const damageFormula = String(data.damageFormula || "").trim().toUpperCase();
    const damageText = damageEnabled && damageFormula ? damageFormula : "Aucun";
    const powerCostEnabled = data.powerCostEnabled === true;
    const powerCost = Math.max(0, Math.floor(parseFiniteNumber(data.powerCost, 0)));
    const costText = powerCostEnabled ? `${powerCost} PP` : "Aucun";
    const actorLabel = toSafeHtml(actorName || "Joueur");
    const requesterLabel = toSafeHtml(requesterUserName || actorName || "Joueur");
    const powerLabel = toSafeHtml(powerName);
    const itemLabel = toSafeHtml(popupItemLabel);
    const damageLabel = toSafeHtml(damageText);
    const costLabel = toSafeHtml(costText);
    const title = `${popupItemLabel} utilise - ${actorName || requesterUserName || "Joueur"}`;
    const content = `<div class="bm-power-use-popup">
    <p><strong>Joueur :</strong> ${requesterLabel}</p>
    <p><strong>Personnage :</strong> ${actorLabel}</p>
    <p><strong>${itemLabel} :</strong> ${powerLabel}</p>
    <p><strong>Cout :</strong> ${costLabel}</p>
    <p><strong>Degats :</strong> ${damageLabel}</p>
    <p><strong>Description :</strong></p>
    <p>${descriptionHtml || noDescriptionText}</p>
  </div>`;
    const dialog = new renderDialogClass(
      {
        title,
        content,
        buttons: {
          ok: { label: "OK" }
        },
        default: "ok"
      },
      {
        classes: ["bloodman-damage-dialog", "bloodman-power-use-dialog"],
        width: 480
      }
    );
    dialog.render(true);
    return true;
  }

  async function handlePowerUsePopupMessage(data, source = "socket") {
    if (!data) return false;
    const eventId = String(data.eventId || data.requestId || "").trim();
    if (eventId && wasProcessed(eventId)) return false;
    if (eventId) rememberProcessed(eventId);
    if (!canCurrentUserReceivePowerUsePopup(data)) return false;
    const shown = showPowerUsePopup(data);
    if (!shown) warn("[bloodman] power:popup display failed", { source, eventId, payload: data });
    return shown;
  }

  return {
    getPopupItemLabel,
    getPowerUsePopupViewerIds,
    emitPowerUsePopup,
    canCurrentUserReceivePowerUsePopup,
    showPowerUsePopup,
    handlePowerUsePopupMessage
  };
}
