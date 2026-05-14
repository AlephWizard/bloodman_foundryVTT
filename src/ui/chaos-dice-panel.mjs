import {
  CHAOS_DICE_ICON_FALLBACK_SRC,
  CHAOS_DICE_ICON_SRC,
  SYSTEM_ID,
  SYSTEM_SOCKET
} from "../core/constants.mjs";

export function clampChaosValue(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getVisibleRect(element) {
  if (!element) return null;
  const rect = element.getBoundingClientRect?.();
  if (!rect || rect.width === 0 || rect.height === 0) return null;
  return rect;
}

function getElementClass(windowRef) {
  return windowRef?.Element || globalThis.Element || null;
}

function createRequestId(foundryRef) {
  return foundryRef?.utils?.randomID
    ? foundryRef.utils.randomID()
    : Math.random().toString(36).slice(2);
}

export function createChaosDicePanelController({
  systemId = SYSTEM_ID,
  systemSocket = SYSTEM_SOCKET,
  chaosDiceValueSetting = "chaosDice",
  chaosDicePanelPositionSetting = "chaosDicePanelPosition",
  chaosRequestChatMarkup = "<span style='display:none'>bloodman-chaos-request</span>",
  iconSrc = CHAOS_DICE_ICON_SRC,
  iconFallbackSrc = CHAOS_DICE_ICON_FALLBACK_SRC,
  isChatTransportFallbackEnabled = false,
  getActiveGMUserIds = () => [],
  hasSocket = () => false,
  socketEmit = () => {},
  translate = (_key, fallback = "") => fallback,
  escapeMarkup = value => String(value ?? ""),
  showVoyageXpGrantDialog = () => {},
  showFullPvRestoreConfirmDialog = () => {},
  showFullPpRestoreConfirmDialog = () => {},
  getGame = () => globalThis.game,
  getDocument = () => globalThis.document,
  getWindow = () => globalThis.window,
  getFoundry = () => globalThis.foundry,
  getChatMessage = () => globalThis.ChatMessage
} = {}) {
  function getChaosValue() {
    const gameRef = getGame();
    try {
      return clampChaosValue(Number(gameRef?.settings?.get?.(systemId, chaosDiceValueSetting)));
    } catch (_error) {
      return 0;
    }
  }

  async function setChaosValue(nextValue) {
    const gameRef = getGame();
    if (!gameRef?.user?.isGM) return;
    const clamped = clampChaosValue(nextValue);
    await gameRef.settings?.set?.(systemId, chaosDiceValueSetting, clamped);
    updateChaosDiceUI(clamped);
  }

  async function requestChaosDelta(delta) {
    const numeric = Number(delta);
    if (!Number.isFinite(numeric) || numeric === 0) return;

    const gameRef = getGame();
    if (gameRef?.user?.isGM) {
      await setChaosValue(getChaosValue() + numeric);
      return;
    }

    const requestId = createRequestId(getFoundry());
    if (hasSocket()) socketEmit(systemSocket, { type: "adjustChaosDice", delta: numeric, requestId });

    const gmIds = getActiveGMUserIds();
    if (!isChatTransportFallbackEnabled || !gmIds.length) return;

    await getChatMessage()?.create?.({
      content: chaosRequestChatMarkup,
      whisper: gmIds,
      flags: { [systemId]: { chaosDeltaRequest: { requestId, delta: numeric } } }
    }).catch(() => null);
  }

  function updateChaosDiceUI(value) {
    const documentRef = getDocument();
    const root = documentRef?.getElementById?.("bm-chaos-dice");
    if (!root) return;
    const chaosValue = clampChaosValue(value);
    const display = root.querySelector?.(".bm-chaos-value");
    if (display) display.textContent = String(chaosValue);
    root.classList?.toggle?.("is-active", chaosValue > 0);
  }

  function clampChaosDicePanelPosition(position, root) {
    const windowRef = getWindow();
    const documentRef = getDocument();
    const rect = root?.getBoundingClientRect?.();
    const width = Math.max(1, Number(rect?.width) || 150);
    const height = Math.max(1, Number(rect?.height) || 106);
    const margin = 8;
    const viewportWidth = windowRef?.innerWidth || documentRef?.documentElement?.clientWidth || width + margin * 2;
    const viewportHeight = windowRef?.innerHeight || documentRef?.documentElement?.clientHeight || height + margin * 2;
    const maxLeft = Math.max(margin, viewportWidth - width - margin);
    const maxTop = Math.max(margin, viewportHeight - height - margin);
    return {
      left: Math.round(Math.max(margin, Math.min(maxLeft, Number(position?.left) || 0))),
      top: Math.round(Math.max(margin, Math.min(maxTop, Number(position?.top) || 0)))
    };
  }

  function getDefaultChaosDicePanelPosition(root) {
    const documentRef = getDocument();
    const windowRef = getWindow();
    const rect = root?.getBoundingClientRect?.();
    const width = Math.max(1, Number(rect?.width) || 150);
    const height = Math.max(1, Number(rect?.height) || 106);
    const viewportHeight = windowRef?.innerHeight || documentRef?.documentElement?.clientHeight || 720;
    const macroStripRect = getVisibleRect(
      documentRef?.querySelector?.("#hotbar #macro-list")
      || documentRef?.querySelector?.("#hotbar ol#macro-list")
      || documentRef?.querySelector?.("#hotbar #action-bar")
      || documentRef?.querySelector?.("#hotbar ol#action-bar")
      || documentRef?.querySelector?.("#hotbar .macro-list")
      || documentRef?.querySelector?.("#hotbar .action-bar")
    );
    const hotbarRect = getVisibleRect(documentRef?.getElementById?.("hotbar"));
    const anchorRect = macroStripRect || hotbarRect || null;
    const oldPanelGap = 72;
    const left = anchorRect ? anchorRect.left - oldPanelGap - width : 18;
    const top = viewportHeight - height - 30;
    return clampChaosDicePanelPosition({ left, top }, root);
  }

  function getSavedChaosDicePanelPosition(root) {
    const gameRef = getGame();
    let saved = {};
    try {
      saved = gameRef?.settings?.get?.(systemId, chaosDicePanelPositionSetting) || {};
    } catch (_error) {
      saved = {};
    }
    const left = Number(saved.left);
    const top = Number(saved.top);
    if (Number.isFinite(left) && Number.isFinite(top)) return clampChaosDicePanelPosition({ left, top }, root);
    return getDefaultChaosDicePanelPosition(root);
  }

  function applyChaosDicePanelPosition(root, position) {
    const next = clampChaosDicePanelPosition(position, root);
    root.style.left = `${next.left}px`;
    root.style.top = `${next.top}px`;
    root.style.right = "auto";
    root.style.bottom = "auto";
    root.style.transform = "none";
    return next;
  }

  function positionChaosDiceUI(position = null) {
    const documentRef = getDocument();
    const root = documentRef?.getElementById?.("bm-chaos-dice");
    if (!root) return undefined;
    if (documentRef?.body && root.parentElement !== documentRef.body) {
      documentRef.body.appendChild(root);
    }
    return applyChaosDicePanelPosition(root, position || getSavedChaosDicePanelPosition(root));
  }

  function installChaosDicePanelDrag(root) {
    const windowRef = getWindow();
    const gameRef = getGame();
    if (!root || !windowRef || root.dataset?.bmChaosDragInstalled === "true") return;
    root.dataset.bmChaosDragInstalled = "true";

    let dragState = null;
    const savePosition = async position => {
      await gameRef?.settings?.set?.(systemId, chaosDicePanelPositionSetting, {
        top: Math.round(position.top),
        left: Math.round(position.left)
      });
    };

    const onPointerMove = event => {
      if (!dragState) return;
      event.preventDefault?.();
      root.classList?.add?.("is-dragging");
      const next = applyChaosDicePanelPosition(root, {
        left: dragState.left + event.clientX - dragState.x,
        top: dragState.top + event.clientY - dragState.y
      });
      dragState.lastPosition = next;
      dragState.moved = true;
    };

    const onPointerUp = event => {
      if (!dragState) return;
      event.preventDefault?.();
      windowRef.removeEventListener?.("pointermove", onPointerMove);
      windowRef.removeEventListener?.("pointerup", onPointerUp);
      root.classList?.remove?.("is-dragging");
      const lastPosition = dragState.lastPosition || positionChaosDiceUI();
      const moved = dragState.moved;
      dragState = null;
      if (moved && lastPosition) void savePosition(lastPosition);
    };

    const onPointerDown = event => {
      if (event.button !== 0) return;
      const ElementClass = getElementClass(windowRef);
      const target = ElementClass && event.target instanceof ElementClass ? event.target : null;
      if (target?.closest?.("button, input, select, textarea")) return;
      event.preventDefault?.();
      const rect = root.getBoundingClientRect?.();
      dragState = {
        left: rect?.left || 0,
        top: rect?.top || 0,
        x: event.clientX,
        y: event.clientY,
        moved: false,
        lastPosition: { left: rect?.left || 0, top: rect?.top || 0 }
      };
      windowRef.addEventListener?.("pointermove", onPointerMove);
      windowRef.addEventListener?.("pointerup", onPointerUp);
    };

    root.addEventListener?.("pointerdown", onPointerDown);
    windowRef.__bmChaosDiceDrag = {
      dispose: () => {
        root.removeEventListener?.("pointerdown", onPointerDown);
        windowRef.removeEventListener?.("pointermove", onPointerMove);
        windowRef.removeEventListener?.("pointerup", onPointerUp);
        root.dataset.bmChaosDragInstalled = "";
      }
    };
  }

  function ensureChaosDiceUI() {
    const gameRef = getGame();
    const documentRef = getDocument();
    const windowRef = getWindow();
    if (!gameRef?.user?.isGM) return null;
    if (!documentRef?.body) return null;
    const existing = documentRef.getElementById?.("bm-chaos-dice");
    if (existing) return existing;

    const container = documentRef.createElement?.("div");
    if (!container) return null;
    container.id = "bm-chaos-dice";
    container.className = "bm-chaos-dice";
    container.title = translate("BLOODMAN.Settings.ChaosDiceName", "Des du chaos");
    const xpAriaLabel = escapeMarkup(translate("BLOODMAN.Dialogs.VoyageXPGrant.Title", "Attribution XP voyage"));
    const fullPvAriaLabel = escapeMarkup(translate("BLOODMAN.Dialogs.FullPVRestore.Title", "Restauration PV"));
    const fullPpAriaLabel = escapeMarkup(translate("BLOODMAN.Dialogs.FullPPRestore.Title", "Restauration PP"));
    const plusAriaLabel = escapeMarkup("Augmenter les des du chaos");
    const minusAriaLabel = escapeMarkup("Diminuer les des du chaos");
    const panelTitle = "Bloodman";
    container.innerHTML = `
    <div class="bm-chaos-panel-header" title="${panelTitle}">
      <span>${panelTitle}</span>
    </div>
    <div class="bm-chaos-panel-body">
      <button type="button" class="bm-chaos-xp-btn" aria-label="${xpAriaLabel}">XP</button>
      <div class="bm-chaos-row">
        <button type="button" class="bm-chaos-btn bm-chaos-plus" aria-label="${plusAriaLabel}">+</button>
        <div class="bm-chaos-icon" aria-hidden="true">
          <img src="${iconSrc}" data-fallback-src="${iconFallbackSrc}" alt="" />
          <span class="bm-chaos-value">0</span>
        </div>
        <button type="button" class="bm-chaos-btn bm-chaos-minus" aria-label="${minusAriaLabel}">-</button>
      </div>
      <div class="bm-chaos-full-row">
        <button type="button" class="bm-chaos-full-pv-btn" aria-label="${fullPvAriaLabel}">FULL PV</button>
        <button type="button" class="bm-chaos-full-pp-btn" aria-label="${fullPpAriaLabel}">FULL PP</button>
      </div>
    </div>
  `;

    documentRef.body.appendChild(container);

    const xp = container.querySelector?.(".bm-chaos-xp-btn");
    const fullPv = container.querySelector?.(".bm-chaos-full-pv-btn");
    const fullPp = container.querySelector?.(".bm-chaos-full-pp-btn");
    const minus = container.querySelector?.(".bm-chaos-minus");
    const plus = container.querySelector?.(".bm-chaos-plus");
    const chaosIconImage = container.querySelector?.(".bm-chaos-icon img");

    chaosIconImage?.addEventListener?.("error", () => {
      if (chaosIconImage.dataset.fallbackApplied === "true") return;
      const fallbackSrc = String(chaosIconImage.dataset.fallbackSrc || "").trim();
      if (!fallbackSrc) return;
      chaosIconImage.dataset.fallbackApplied = "true";
      chaosIconImage.src = fallbackSrc;
    });

    minus?.addEventListener?.("click", async () => {
      await setChaosValue(getChaosValue() - 1);
    });

    plus?.addEventListener?.("click", async () => {
      await setChaosValue(getChaosValue() + 1);
    });

    xp?.addEventListener?.("click", () => {
      showVoyageXpGrantDialog();
    });

    fullPv?.addEventListener?.("click", () => {
      showFullPvRestoreConfirmDialog();
    });

    fullPp?.addEventListener?.("click", () => {
      showFullPpRestoreConfirmDialog();
    });

    updateChaosDiceUI(getChaosValue());
    positionChaosDiceUI();
    installChaosDicePanelDrag(container);

    if (windowRef && !windowRef.__bmChaosDiceResizeHandler) {
      windowRef.__bmChaosDiceResizeHandler = () => positionChaosDiceUI();
      windowRef.addEventListener?.("resize", windowRef.__bmChaosDiceResizeHandler);
    }

    return container;
  }

  return {
    clampChaosValue,
    getChaosValue,
    setChaosValue,
    requestChaosDelta,
    updateChaosDiceUI,
    positionChaosDiceUI,
    ensureChaosDiceUI
  };
}
