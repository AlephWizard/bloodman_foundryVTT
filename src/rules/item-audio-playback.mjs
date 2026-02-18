export function createItemAudioPlaybackRules({
  isAudioEnabledItemType,
  normalizeItemAudioFile,
  getItemAudioName,
  waitMs,
  translate,
  notifyError,
  playAudio,
  getPlayAudio,
  logError,
  defaultDelayMs = 450
} = {}) {
  const isAudioEnabledType = typeof isAudioEnabledItemType === "function"
    ? isAudioEnabledItemType
    : () => false;
  const normalizeAudioFile = typeof normalizeItemAudioFile === "function"
    ? normalizeItemAudioFile
    : value => String(value || "").trim();
  const getAudioName = typeof getItemAudioName === "function"
    ? getItemAudioName
    : item => String(item?.name || "").trim();
  const waitDelay = typeof waitMs === "function"
    ? waitMs
    : () => Promise.resolve();
  const t = typeof translate === "function"
    ? translate
    : key => key;
  const notify = typeof notifyError === "function"
    ? notifyError
    : () => {};
  const resolvePlayAudio = typeof getPlayAudio === "function"
    ? getPlayAudio
    : () => (typeof playAudio === "function" ? playAudio : null);
  const loggerError = typeof logError === "function"
    ? logError
    : () => {};

  async function playItemAudio(item, options = {}) {
    if (!item || !isAudioEnabledType(item.type)) return false;
    const requestedDelay = Number(options?.delayMs);
    const delayMs = Number.isFinite(requestedDelay)
      ? Math.max(0, Math.floor(requestedDelay))
      : Math.max(0, Math.floor(Number(defaultDelayMs) || 0));
    const broadcast = options?.broadcast !== false;
    const rawAudioFile = String(item.system?.audioFile || "").trim();
    if (!rawAudioFile) return false;
    const audioFile = normalizeAudioFile(rawAudioFile);
    const itemName = getAudioName(item);

    if (delayMs > 0) await waitDelay(delayMs);

    if (!audioFile) {
      notify(t("BLOODMAN.Notifications.ItemAudioInvalid", { item: itemName }));
      return false;
    }

    const play = resolvePlayAudio();
    if (typeof play !== "function") {
      notify(t("BLOODMAN.Notifications.ItemAudioInvalid", { item: itemName }));
      return false;
    }

    try {
      await play({ src: audioFile, volume: 0.9, autoplay: true, loop: false }, broadcast);
      return true;
    } catch (error) {
      loggerError("[bloodman] audio:play failed", { itemType: item.type, itemId: item.id, audioFile, error });
      notify(t("BLOODMAN.Notifications.ItemAudioInvalid", { item: itemName }));
      return false;
    }
  }

  return {
    playItemAudio
  };
}
