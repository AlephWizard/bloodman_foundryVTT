import {
  buildDamageSplitDialogContent,
  computeDamageSplitAllocatedTotal,
  normalizeDamageSplitAllocations,
  resolveDamageSplitAllocatedState
} from "../ui/damage-split-dialog.mjs";

export function buildDamageSplitPopupHooks({
  toFiniteNumber,
  t,
  tl,
  getCurrentUser,
  getUsersCollection,
  isAssistantOrHigherRole,
  escapeHtml,
  dialogClass,
  wasDamageSplitPopupRequestProcessed,
  rememberDamageSplitPopupRequest,
  logWarn
} = {}) {
  const activeDamageSplitPopups = new Map();
  const parseFiniteNumber = typeof toFiniteNumber === "function"
    ? toFiniteNumber
    : (value, fallback = 0) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
    };
  const translate = typeof t === "function" ? t : key => key;
  const translateWithFallback = typeof tl === "function" ? tl : (_key, fallback) => fallback;
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
  const popupDialogClass = dialogClass || globalThis.foundry?.appv1?.api?.Dialog || globalThis.Dialog;
  const wasProcessed = typeof wasDamageSplitPopupRequestProcessed === "function"
    ? wasDamageSplitPopupRequestProcessed
    : () => false;
  const rememberProcessed = typeof rememberDamageSplitPopupRequest === "function"
    ? rememberDamageSplitPopupRequest
    : () => {};
  const warn = typeof logWarn === "function" ? logWarn : () => {};

  function buildDamageSplitObserverState(data) {
    const actorName = String(data?.actorName || "").trim();
    const sourceName = String(data?.sourceName || "").trim();
    const requesterUserId = String(data?.requesterUserId || "");
    const requesterName = String(resolveUsersCollection()?.get(requesterUserId)?.name || "").trim();
    const allocations = normalizeDamageSplitAllocations(data?.allocations, {
      fallbackName: translateWithFallback("BLOODMAN.Common.Target", "Cible"),
      toFiniteNumber: parseFiniteNumber
    });
    const totalDamage = Math.max(0, Math.floor(parseFiniteNumber(data?.totalDamage, 0)));
    const actorDisplay = actorName || requesterName || translateWithFallback("BLOODMAN.Common.Name", "Attaquant");
    const sourceDisplay = sourceName || translateWithFallback("BLOODMAN.Common.SimpleAttack", "Attaque");
    const titleLabel = toSafeHtml(translateWithFallback("BLOODMAN.Dialogs.DamageSplit.Title", "Repartition des degats"));
    const actorTitleLabel = toSafeHtml(actorDisplay);
    return {
      allocations,
      totalDamage,
      allocatedTotal: computeDamageSplitAllocatedTotal(allocations, { toFiniteNumber: parseFiniteNumber }),
      targetCount: allocations.length,
      actorDisplay,
      sourceDisplay,
      title: `${titleLabel} - ${actorTitleLabel}`
    };
  }

  function getDamageSplitObserverContent(state) {
    return buildDamageSplitDialogContent({
      actorDisplay: state.actorDisplay,
      sourceDisplay: state.sourceDisplay,
      totalDamage: state.totalDamage,
      allocations: state.allocations,
      labels: {
        eyebrow: translateWithFallback("BLOODMAN.Dialogs.DamageSplit.ObserverEyebrow", "Suivi MJ"),
        title: translateWithFallback("BLOODMAN.Dialogs.DamageSplit.Title", "Repartition des degats"),
        rolledTotal: translateWithFallback("BLOODMAN.Dialogs.DamageSplit.RolledTotal", "Jet"),
        allocatedTotal: translateWithFallback("BLOODMAN.Dialogs.DamageSplit.AllocatedTotal", "Total attribue"),
        targetCount: translateWithFallback("BLOODMAN.Dialogs.DamageSplit.TargetCount", "Cibles"),
        freeHint: translateWithFallback("BLOODMAN.Dialogs.DamageSplit.FreeHint", "Le total attribue peut etre libre et depasser le jet.")
      },
      editable: false,
      escapeHtml: toSafeHtml
    });
  }

  function updateDamageSplitObserverDialog(dialog, state) {
    const root = dialog?.element;
    if (!root?.length) return false;
    if (typeof root.html === "function") {
      root.html(getDamageSplitObserverContent(state));
    } else {
      root.find("[data-bm-split-field='hint']").text?.(`${state.actorDisplay} - ${state.sourceDisplay}`);
      root.find("[data-bm-damage-split-field='rolled']").text?.(String(state.totalDamage));
      root.find("[data-bm-damage-split-field='allocated']").text?.(String(state.allocatedTotal));
      root.find("[data-bm-damage-split-field='count']").text?.(String(state.targetCount));
      root.find("[data-bm-damage-split-field='rows']").html?.(buildDamageSplitDialogContent({
        actorDisplay: state.actorDisplay,
        sourceDisplay: state.sourceDisplay,
        totalDamage: state.totalDamage,
        allocations: state.allocations,
        labels: {
          eyebrow: translateWithFallback("BLOODMAN.Dialogs.DamageSplit.ObserverEyebrow", "Suivi MJ"),
          title: translateWithFallback("BLOODMAN.Dialogs.DamageSplit.Title", "Repartition des degats"),
          rolledTotal: translateWithFallback("BLOODMAN.Dialogs.DamageSplit.RolledTotal", "Jet"),
          allocatedTotal: translateWithFallback("BLOODMAN.Dialogs.DamageSplit.AllocatedTotal", "Total attribue"),
          targetCount: translateWithFallback("BLOODMAN.Dialogs.DamageSplit.TargetCount", "Cibles"),
          freeHint: translateWithFallback("BLOODMAN.Dialogs.DamageSplit.FreeHint", "Le total attribue peut etre libre et depasser le jet.")
        },
        editable: false,
        escapeHtml: toSafeHtml
      }));
    }
    const allocatedCard = root.find("[data-bm-damage-split-field='allocated-card'], [data-bm-split-field='allocated-card']");
    allocatedCard.removeClass?.("is-over is-under is-match");
    allocatedCard.addClass?.(resolveDamageSplitAllocatedState(state.totalDamage, state.allocatedTotal, { toFiniteNumber: parseFiniteNumber }));
    return true;
  }

  function closeDamageSplitObserverDialog(requestId) {
    const key = String(requestId || "").trim();
    if (!key) return false;
    const dialog = activeDamageSplitPopups.get(key);
    if (!dialog) return false;
    activeDamageSplitPopups.delete(key);
    try {
      dialog.close();
    } catch (_error) {
      // ignore
    }
    return true;
  }

  function canCurrentUserReceiveDamageSplitPopup(data) {
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

  function showDamageSplitObserverPopup(data) {
    if (!data || typeof popupDialogClass !== "function") return false;
    const requestId = String(data.requestId || "").trim();
    const action = String(data.action || "open").trim().toLowerCase() || "open";
    if (action === "close") return closeDamageSplitObserverDialog(requestId);

    const state = buildDamageSplitObserverState(data);
    const existing = requestId ? activeDamageSplitPopups.get(requestId) : null;
    if (existing?.element?.length) {
      return updateDamageSplitObserverDialog(existing, state);
    }
    if (existing) activeDamageSplitPopups.delete(requestId);

    const dialog = new popupDialogClass(
      {
        title: state.title,
        content: getDamageSplitObserverContent(state),
        buttons: {
          ok: { label: translate("BLOODMAN.Common.OK") }
        },
        default: "ok",
        close: () => {
          if (!requestId) return;
          const current = activeDamageSplitPopups.get(requestId);
          if (current === dialog) activeDamageSplitPopups.delete(requestId);
        }
      },
      {
        classes: ["bloodman-damage-dialog", "bloodman-damage-split-dialog"],
        width: 540
      }
    );
    dialog.render(true);
    if (requestId) activeDamageSplitPopups.set(requestId, dialog);
    return true;
  }

  async function handleDamageSplitPopupMessage(data, source = "socket") {
    if (!data) return false;
    const eventId = String(data.eventId || "").trim();
    if (eventId && wasProcessed(eventId)) return false;
    if (eventId) rememberProcessed(eventId);
    if (!canCurrentUserReceiveDamageSplitPopup(data)) return false;
    const shown = showDamageSplitObserverPopup(data);
    if (!shown) warn("[bloodman] damage:split popup display failed", { source, eventId, payload: data });
    return shown;
  }

  return {
    canCurrentUserReceiveDamageSplitPopup,
    showDamageSplitObserverPopup,
    handleDamageSplitPopupMessage
  };
}
