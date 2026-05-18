function getSheetRoot(sheet, htmlLike = null) {
  return htmlLike?.find ? htmlLike : sheet?.element;
}

export function createItemSheetControlsController({
  getFilePickerClass = () => null,
  renderFilePickerSafely = () => false,
  warn = () => {},
  isPriceManagedItemType = () => false,
  normalizeNonNegativeInteger = (value, fallback = 0) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : fallback;
  },
  resolveSaleManualFlag = () => false,
  resolveItemPricePreviewUiState = () => ({
    invalid: false,
    errorMessage: "",
    nextSaleValue: "",
    ariaInvalid: "false"
  }),
  playItemAudio = null,
  resolveDeferredRoot = (_previous, next) => next,
  queueUiMicrotask = callback => {
    callback?.();
    return null;
  },
  clearUiMicrotask = () => {}
} = {}) {
  function openItemAudioFilePicker(sheet) {
    if (!sheet?.item) return false;
    const FilePickerClass = getFilePickerClass();
    if (typeof FilePickerClass !== "function") {
      warn("Selection audio impossible: FilePicker indisponible.");
      return false;
    }

    const current = String(sheet.item.system?.audioFile || "").trim();
    const picker = new FilePickerClass({
      type: "audio",
      current,
      callback: async path => {
        const nextPath = String(path || "").trim();
        if (!nextPath || nextPath === current) return;
        await sheet.item.update({ "system.audioFile": nextPath });
      }
    });
    return renderFilePickerSafely(picker, "item-audio-file-picker");
  }

  async function playItemAudioPreview(sheet) {
    if (!sheet?.item || typeof playItemAudio !== "function") return false;
    return playItemAudio(sheet.item, { delayMs: 0, broadcast: false });
  }

  function activateAudioFilePickerListeners(sheet, html) {
    const audioPreviewButtons = html?.find?.(".bm-item-audio-field .bm-item-audio-preview");
    const audioPickerButtons = html?.find?.(".bm-item-audio-field .file-picker");
    if (!audioPreviewButtons && !audioPickerButtons) return false;
    audioPreviewButtons?.off?.("click");
    audioPreviewButtons?.on?.("click", ev => {
      ev.preventDefault?.();
      ev.stopPropagation?.();
      void playItemAudioPreview(sheet);
    });
    audioPickerButtons?.off?.("click");
    audioPickerButtons?.on?.("click", ev => {
      ev.preventDefault?.();
      ev.stopPropagation?.();
      openItemAudioFilePicker(sheet);
    });
    return true;
  }

  function clearQueuedPricePreviewRefresh(sheet) {
    clearUiMicrotask(sheet?._pricePreviewRefreshTaskId);
    sheet._pricePreviewRefreshTaskId = null;
    sheet._queuedPricePreviewRoot = null;
  }

  function queuePricePreviewRefresh(sheet, rootLike = null) {
    sheet._queuedPricePreviewRoot = resolveDeferredRoot(sheet._queuedPricePreviewRoot, rootLike);
    if (sheet._pricePreviewRefreshTaskId != null) return;
    sheet._pricePreviewRefreshTaskId = queueUiMicrotask(() => {
      sheet._pricePreviewRefreshTaskId = null;
      const root = sheet._queuedPricePreviewRoot?.find ? sheet._queuedPricePreviewRoot : sheet.element;
      sheet._queuedPricePreviewRoot = null;
      refreshPricePreview(sheet, root);
    });
  }

  function syncPricePreviewSaleManualState(sheet, htmlLike = null) {
    if (!isPriceManagedItemType(sheet?.item?.type)) return false;
    const root = getSheetRoot(sheet, htmlLike);
    if (!root?.length) return false;
    const priceInput = root.find("input[name='system.price']").first();
    const saleInput = root.find("input[name='system.salePrice']").first();
    if (!priceInput.length || !saleInput.length) return false;
    const manual = resolveSaleManualFlag(priceInput.val(), saleInput.val());
    saleInput.attr("data-sale-manual", manual ? "true" : "false");
    return manual;
  }

  function refreshPricePreview(sheet, htmlLike = null) {
    if (!isPriceManagedItemType(sheet?.item?.type)) return;
    const root = getSheetRoot(sheet, htmlLike);
    if (!root?.length) return;
    const priceInput = root.find("input[name='system.price']").first();
    const saleInput = root.find("input[name='system.salePrice']").first();
    const errorNode = root.find("[data-price-error]").first();
    if (!priceInput.length || !saleInput.length || !errorNode.length) return;
    const saleManual = saleInput.attr("data-sale-manual") === "true";
    const uiState = resolveItemPricePreviewUiState({
      priceValue: priceInput.val(),
      saleValue: saleInput.val(),
      saleManual
    });
    if (!saleManual && String(saleInput.val() ?? "") !== uiState.nextSaleValue) {
      saleInput.val(uiState.nextSaleValue);
    }
    errorNode.text(uiState.errorMessage || "");
    priceInput.toggleClass("is-invalid", uiState.invalid);
    priceInput.attr("aria-invalid", uiState.ariaInvalid);
  }

  function activatePricePreviewListeners(sheet, html) {
    if (!isPriceManagedItemType(sheet?.item?.type)) return;
    const refresh = () => queuePricePreviewRefresh(sheet, html);
    html.on("input change blur", "input[name='system.price']", () => {
      refresh();
    });
    html.on("input change blur", "input[name='system.salePrice']", () => {
      syncPricePreviewSaleManualState(sheet, html);
      refresh();
    });
    syncPricePreviewSaleManualState(sheet, html);
    refreshPricePreview(sheet, html);
  }

  function syncSwitchDependentUi(sheet, changedField = "", nextValue = false, htmlLike = null) {
    const root = getSheetRoot(sheet, htmlLike);
    if (!root?.length) return false;
    const setDisabled = (selector, disabled) => {
      root.find(selector).prop("disabled", Boolean(disabled));
    };
    const toggleClass = (selector, className, enabled) => {
      root.find(selector).toggleClass(className, Boolean(enabled));
    };

    switch (String(changedField || "").trim()) {
      case "system.singleUseEnabled":
        setDisabled("input[name='system.singleUseCount']", !nextValue);
        break;
      case "system.powerCostEnabled":
        setDisabled("input[name='system.powerCost']", !nextValue);
        break;
      case "system.damageEnabled":
        setDisabled("input[name='system.damageDie']", !nextValue);
        break;
      case "system.protectionEnabled":
        setDisabled("input[name='system.pa']", !nextValue);
        break;
      case "system.healEnabled":
        setDisabled("input[name='system.healDie']", !nextValue);
        break;
      case "system.characteristicBonusEnabled":
        setDisabled("input[name^='system.characteristicBonuses.']", !nextValue);
        toggleClass(".bonus-grid-characteristics", "is-disabled", !nextValue);
        break;
      case "system.rawBonusEnabled":
        setDisabled("input[name^='system.rawBonuses.']", !nextValue);
        toggleClass(".bonus-grid-compact", "is-disabled", !nextValue);
        break;
      case "system.infiniteAmmo": {
        const weaponType = String(root.find("input[name='system.weaponType']:checked").val() || "").trim().toLowerCase();
        const magazineCapacity = normalizeNonNegativeInteger(root.find("input[name='system.magazineCapacity']").val(), 0);
        const usesMagazine = weaponType === "distance" && !nextValue && magazineCapacity > 0;
        setDisabled("input[name='system.loadedAmmo']", !usesMagazine);
        break;
      }
      case "system.link.equiperAvecEnabled":
        toggleClass(".bm-item-equiper-avec-builder", "is-disabled", !nextValue);
        break;
      default:
        break;
    }
    return true;
  }

  return {
    openItemAudioFilePicker,
    playItemAudioPreview,
    activateAudioFilePickerListeners,
    clearQueuedPricePreviewRefresh,
    queuePricePreviewRefresh,
    syncPricePreviewSaleManualState,
    refreshPricePreview,
    activatePricePreviewListeners,
    syncSwitchDependentUi
  };
}
