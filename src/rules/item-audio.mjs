const DEFAULT_AUDIO_FILE_EXTENSION_PATTERN = /\.(mp3|ogg|oga|wav|flac|m4a|aac|webm)$/i;

function defaultGetProperty(object, path) {
  return String(path || "")
    .split(".")
    .reduce((current, key) => (current == null ? undefined : current[key]), object);
}

function defaultSetProperty(object, path, value) {
  if (!object || !path) return;
  const keys = String(path).split(".");
  let current = object;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    if (!key) continue;
    const child = current[key];
    if (!child || typeof child !== "object") current[key] = {};
    current = current[key];
  }
  const finalKey = keys[keys.length - 1];
  if (!finalKey) return;
  current[finalKey] = value;
}

export function createItemAudioRules({
  audioEnabledItemTypes,
  audioFileExtensionPattern,
  getProperty,
  setProperty,
  translate
} = {}) {
  const enabledItemTypes = audioEnabledItemTypes instanceof Set
    ? audioEnabledItemTypes
    : new Set(Array.isArray(audioEnabledItemTypes) ? audioEnabledItemTypes : []);
  const extensionPattern = audioFileExtensionPattern instanceof RegExp
    ? audioFileExtensionPattern
    : DEFAULT_AUDIO_FILE_EXTENSION_PATTERN;
  const readProperty = typeof getProperty === "function"
    ? getProperty
    : defaultGetProperty;
  const writeProperty = typeof setProperty === "function"
    ? setProperty
    : defaultSetProperty;
  const t = typeof translate === "function"
    ? translate
    : key => key;

  function isAudioEnabledItemType(itemType) {
    const type = String(itemType || "").trim().toLowerCase();
    return enabledItemTypes.has(type);
  }

  function normalizeItemAudioFile(value) {
    const path = String(value || "").trim();
    if (!path) return "";
    const cleanPath = path.split("#")[0].split("?")[0].trim();
    if (!cleanPath || !extensionPattern.test(cleanPath)) return "";
    return path;
  }

  function getItemAudioName(item) {
    const fallbackType = String(item?.type || "").trim();
    const fallbackName = fallbackType ? t(`TYPES.Item.${fallbackType}`) : t("BLOODMAN.Common.Name");
    return String(item?.name || fallbackName || "").trim() || t("BLOODMAN.Common.Name");
  }

  function normalizeItemAudioUpdate(item, updateData = null) {
    if (!item || !isAudioEnabledItemType(item.type)) return { changed: false, invalid: false };
    const path = "system.audioFile";
    if (updateData) {
      const hasUpdateData = Object.prototype.hasOwnProperty.call(updateData, path)
        || readProperty(updateData, path) !== undefined;
      if (!hasUpdateData) return { changed: false, invalid: false };
      const rawValue = readProperty(updateData, path);
      const wasProvided = String(rawValue || "").trim().length > 0;
      const normalized = normalizeItemAudioFile(rawValue);
      writeProperty(updateData, path, normalized);
      const current = String(rawValue || "").trim();
      return {
        changed: current !== normalized,
        invalid: wasProvided && !normalized
      };
    }

    const rawValue = item.system?.audioFile;
    const wasProvided = String(rawValue || "").trim().length > 0;
    const normalized = normalizeItemAudioFile(rawValue);
    item.updateSource({ [path]: normalized });
    const current = String(item.system?.audioFile || "").trim();
    return {
      changed: current !== normalized,
      invalid: wasProvided && !normalized
    };
  }

  return {
    isAudioEnabledItemType,
    normalizeItemAudioFile,
    getItemAudioName,
    normalizeItemAudioUpdate
  };
}
