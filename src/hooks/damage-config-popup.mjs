export function buildDamageConfigPopupHooks({
  toFiniteNumber,
  t,
  getCurrentUser,
  getUsersCollection,
  isAssistantOrHigherRole,
  escapeHtml,
  dialogClass,
  wasDamageConfigPopupRequestProcessed,
  rememberDamageConfigPopupRequest,
  logWarn
} = {}) {
  const activeDamageConfigPopups = new Map();
  const parseFiniteNumber = typeof toFiniteNumber === "function"
    ? toFiniteNumber
    : (value, fallback = 0) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
    };
  const translate = typeof t === "function" ? t : key => key;
  const resolveCurrentUser = typeof getCurrentUser === "function"
    ? getCurrentUser
    : () => globalThis.game?.user;
  const resolveUsersCollection = typeof getUsersCollection === "function"
    ? getUsersCollection
    : () => globalThis.game?.users;
  const canAssistantRole = typeof isAssistantOrHigherRole === "function"
    ? isAssistantOrHigherRole
    : () => false;
  const toSafeHtml = typeof escapeHtml === "function"
    ? escapeHtml
    : value => String(value || "");
  const popupDialogClass = dialogClass || globalThis.Dialog;
  const wasProcessed = typeof wasDamageConfigPopupRequestProcessed === "function"
    ? wasDamageConfigPopupRequestProcessed
    : () => false;
  const rememberProcessed = typeof rememberDamageConfigPopupRequest === "function"
    ? rememberDamageConfigPopupRequest
    : () => {};
  const warn = typeof logWarn === "function" ? logWarn : () => {};

  function buildDamageConfigObserverState(data) {
    const actorName = String(data?.actorName || "").trim();
    const sourceName = String(data?.sourceName || "").trim();
    const requesterUserId = String(data?.requesterUserId || "");
    const requesterName = String(resolveUsersCollection()?.get(requesterUserId)?.name || "").trim();
    const config = data?.config && typeof data.config === "object" ? data.config : {};
    const dialogVariant = String(data?.dialogVariant || config?.dialogVariant || "").trim().toLowerCase();
    const isSimpleAttackVariant = dialogVariant === "simple-attack";
    const formula = String(config.formula || "1d4").trim() || "1d4";
    const damageLabel = String(config.degats || "").trim().toUpperCase() || formula.toUpperCase();
    const bonusBrut = Math.max(0, Math.floor(parseFiniteNumber(config.bonusBrut, 0)));
    const penetration = Math.max(0, Math.floor(parseFiniteNumber(config.penetration, 0)));
    const keepHighest = config.rollKeepHighest === true;
    const yesLabel = translate("BLOODMAN.Common.Yes");
    const noLabel = translate("BLOODMAN.Common.No");
    const actorDisplay = actorName || requesterName || "Attaquant";
    const sourceDisplay = sourceName || "-";
    const keepHighestText = `2 jets, garder le plus haut: ${keepHighest ? yesLabel : noLabel}`;
    return {
      isSimpleAttackVariant,
      formula,
      damageLabel,
      bonusBrut,
      penetration,
      keepHighest,
      actorDisplay,
      sourceDisplay,
      keepHighestText,
      title: `Jet de degats - ${actorDisplay}`
    };
  }

  function getDamageConfigObserverContent(state) {
    const formVariantClass = state?.isSimpleAttackVariant ? " bm-damage-config--simple-attack" : "";
    return `<form class="bm-damage-config${formVariantClass}">
    <div class="bm-damage-config-shell">
      <div class="bm-damage-config-head">
        <div class="bm-damage-config-icon-wrap" aria-hidden="true">
          <div class="bm-damage-config-icon-ring"><i class="fa-solid fa-skull"></i></div>
        </div>
        <div class="bm-damage-config-head-copy">
          <p class="bm-damage-config-eyebrow">Suivi MJ</p>
          <p class="bm-damage-config-hint" data-bm-popup-field="hint">${toSafeHtml(state.actorDisplay)} - ${toSafeHtml(state.sourceDisplay)}</p>
        </div>
      </div>
      <div class="bm-damage-config-grid">
        <div class="bm-damage-config-row bm-damage-config-row-wide">
          <label>Degats</label>
          <input type="text" data-bm-popup-field="damage" value="${toSafeHtml(state.damageLabel)} (${toSafeHtml(state.formula)})" disabled />
        </div>
        <div class="bm-damage-config-row bm-damage-config-inline">
          <label>Degats bruts +</label>
          <input type="number" data-bm-popup-field="bonus" value="${state.bonusBrut}" disabled />
        </div>
        <div class="bm-damage-config-row bm-damage-config-inline">
          <label>Penetration +</label>
          <input type="number" data-bm-popup-field="penetration" value="${state.penetration}" disabled />
        </div>
      </div>
      <label class="bm-damage-config-toggle">
        <input type="checkbox" data-bm-popup-field="roll-keep-highest" disabled ${state.keepHighest ? "checked" : ""} />
        <span class="bm-damage-config-toggle-indicator" aria-hidden="true">2x</span>
        <span class="bm-damage-config-toggle-copy">
          <span class="bm-damage-config-toggle-title" data-bm-popup-field="keep-highest-text">${toSafeHtml(state.keepHighestText)}</span>
        </span>
      </label>
    </div>
  </form>`;
  }

  function updateDamageConfigObserverDialog(dialog, state) {
    const root = dialog?.element;
    if (!root?.length) return false;
    root.find("form.bm-damage-config").toggleClass("bm-damage-config--simple-attack", state?.isSimpleAttackVariant === true);
    root.closest(".window-app").toggleClass("bloodman-damage-dialog-simple-attack", state?.isSimpleAttackVariant === true);
    root.find("[data-bm-popup-field='hint']").text(`${state.actorDisplay} - ${state.sourceDisplay}`);
    root.find("[data-bm-popup-field='damage']").val(`${state.damageLabel} (${state.formula})`);
    root.find("[data-bm-popup-field='bonus']").val(String(state.bonusBrut));
    root.find("[data-bm-popup-field='penetration']").val(String(state.penetration));
    root.find("[data-bm-popup-field='roll-keep-highest']").prop("checked", state.keepHighest);
    root.find("[data-bm-popup-field='keep-highest-text']").text(state.keepHighestText);
    return true;
  }

  function closeDamageConfigObserverDialog(requestId) {
    const key = String(requestId || "").trim();
    if (!key) return false;
    const dialog = activeDamageConfigPopups.get(key);
    if (!dialog) return false;
    activeDamageConfigPopups.delete(key);
    try {
      dialog.close();
    } catch (_error) {
      // ignore
    }
    return true;
  }

  function canCurrentUserReceiveDamageConfigPopup(data) {
    const localUser = resolveCurrentUser();
    const localUserId = String(localUser?.id || "").trim();
    if (!localUserId) return false;
    const requesterUserId = String(data?.requesterUserId || "").trim();
    if (requesterUserId && requesterUserId === localUserId) return false;

    const viewerIds = Array.isArray(data?.viewerIds)
      ? data.viewerIds.map(id => String(id || "").trim()).filter(Boolean)
      : [];
    if (viewerIds.length && !viewerIds.includes(localUserId)) return false;

    if (localUser?.isGM) return true;
    return canAssistantRole(localUser?.role);
  }

  function showDamageConfigObserverPopup(data) {
    if (!data || typeof popupDialogClass !== "function") return false;
    const requestId = String(data.requestId || "").trim();
    const action = String(data.action || "open").trim().toLowerCase() || "open";
    if (action === "close") return closeDamageConfigObserverDialog(requestId);

    const state = buildDamageConfigObserverState(data);
    const existing = requestId ? activeDamageConfigPopups.get(requestId) : null;
    if (existing?.element?.length) {
      return updateDamageConfigObserverDialog(existing, state);
    }
    if (existing) activeDamageConfigPopups.delete(requestId);

    const content = getDamageConfigObserverContent(state);
    const dialog = new popupDialogClass(
      {
        title: state.title,
        content,
        buttons: {
          ok: { label: "OK" }
        },
        default: "ok",
        close: () => {
          if (!requestId) return;
          const current = activeDamageConfigPopups.get(requestId);
          if (current === dialog) activeDamageConfigPopups.delete(requestId);
        }
      },
      {
        classes: state?.isSimpleAttackVariant
          ? ["bloodman-damage-dialog", "bloodman-damage-dialog-simple-attack"]
          : ["bloodman-damage-dialog"],
        width: 500
      }
    );
    dialog.render(true);
    if (requestId) activeDamageConfigPopups.set(requestId, dialog);
    return true;
  }

  async function handleDamageConfigPopupMessage(data, source = "socket") {
    if (!data) return false;
    const eventId = String(data.eventId || "").trim();
    if (eventId && wasProcessed(eventId)) return false;
    if (eventId) rememberProcessed(eventId);
    if (!canCurrentUserReceiveDamageConfigPopup(data)) return false;
    const shown = showDamageConfigObserverPopup(data);
    if (!shown) warn("[bloodman] damage:config popup display failed", { source, eventId, payload: data });
    return shown;
  }

  return {
    canCurrentUserReceiveDamageConfigPopup,
    showDamageConfigObserverPopup,
    handleDamageConfigPopupMessage
  };
}
