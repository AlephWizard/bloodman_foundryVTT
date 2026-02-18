function defaultDeepClone(value) {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_error) {
    return value;
  }
}

function defaultExpandObject(value) {
  return value && typeof value === "object" ? value : {};
}

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

function defaultMergeObject(target = {}, source = {}, { inplace = false } = {}) {
  const base = inplace ? target : { ...(target || {}) };
  for (const [key, value] of Object.entries(source || {})) {
    if (
      value
      && typeof value === "object"
      && !Array.isArray(value)
      && base[key]
      && typeof base[key] === "object"
      && !Array.isArray(base[key])
    ) {
      base[key] = defaultMergeObject(base[key], value, { inplace: false });
      continue;
    }
    base[key] = value;
  }
  return base;
}

export function createItemModifierRules({
  characteristicBonusItemTypes,
  paBonusItemTypes,
  characteristics,
  toCheckboxBoolean,
  normalizeSignedModifierInput,
  buildItemModifierErrorMessage,
  deepClone,
  expandObject,
  mergeObject,
  getProperty,
  setProperty
} = {}) {
  const characteristicBonusTypes = characteristicBonusItemTypes instanceof Set
    ? characteristicBonusItemTypes
    : new Set(Array.isArray(characteristicBonusItemTypes) ? characteristicBonusItemTypes : []);
  const paBonusTypes = paBonusItemTypes instanceof Set
    ? paBonusItemTypes
    : new Set(Array.isArray(paBonusItemTypes) ? paBonusItemTypes : []);
  const characteristicList = Array.isArray(characteristics) ? characteristics : [];
  const toCheckbox = typeof toCheckboxBoolean === "function"
    ? toCheckboxBoolean
    : value => value === true;
  const normalizeModifier = typeof normalizeSignedModifierInput === "function"
    ? normalizeSignedModifierInput
    : (rawValue, fallback = 0) => ({ value: Number(rawValue ?? fallback) || 0, invalid: false });
  const buildModifierErrorMessage = typeof buildItemModifierErrorMessage === "function"
    ? buildItemModifierErrorMessage
    : () => null;
  const cloneObject = typeof deepClone === "function"
    ? deepClone
    : defaultDeepClone;
  const expandObjectPath = typeof expandObject === "function"
    ? expandObject
    : defaultExpandObject;
  const mergeData = typeof mergeObject === "function"
    ? mergeObject
    : defaultMergeObject;
  const readProperty = typeof getProperty === "function"
    ? getProperty
    : defaultGetProperty;
  const writeProperty = typeof setProperty === "function"
    ? setProperty
    : defaultSetProperty;

  function normalizeCharacteristicBonusItemUpdate(item, updateData = null) {
    const type = String(item?.type || "").trim().toLowerCase();
    const supportsCharacteristicBonuses = characteristicBonusTypes.has(type);
    const supportsPaBonus = paBonusTypes.has(type);
    if (!supportsCharacteristicBonuses && !supportsPaBonus) return false;
    const supportsUseEnabled = type === "objet" || type === "protection";
    const defaultUseEnabled = type === "protection";
    const updateSystemData = updateData
      ? (readProperty(
        expandObjectPath(cloneObject(updateData || {})),
        "system"
      ) || {})
      : {};
    const sourceSystem = updateData
      ? mergeData(
        cloneObject(item?.system || {}),
        updateSystemData,
        { inplace: false }
      )
      : (item?.system || {});

    const invalidFields = [];
    const useEnabled = supportsUseEnabled
      ? toCheckbox(sourceSystem?.useEnabled, defaultUseEnabled)
      : false;
    const characteristicBonusEnabled = supportsCharacteristicBonuses
      ? toCheckbox(sourceSystem?.characteristicBonusEnabled, false)
      : false;
    const characteristicBonuses = {};
    if (supportsCharacteristicBonuses) {
      for (const characteristic of characteristicList) {
        const key = characteristic.key;
        const normalizedValue = normalizeModifier(
          sourceSystem?.characteristicBonuses?.[key],
          item?.system?.characteristicBonuses?.[key] ?? 0
        );
        characteristicBonuses[key] = normalizedValue.value;
        if (normalizedValue.invalid) invalidFields.push(key);
      }
    }
    const paNormalized = supportsPaBonus
      ? normalizeModifier(sourceSystem?.pa, item?.system?.pa ?? 0)
      : { value: 0, invalid: false };
    if (supportsPaBonus && paNormalized.invalid) invalidFields.push("PA");
    const modifierError = buildModifierErrorMessage(invalidFields);

    if (updateData) {
      if (supportsUseEnabled) {
        writeProperty(updateData, "system.useEnabled", useEnabled);
      }
      if (supportsCharacteristicBonuses) {
        writeProperty(updateData, "system.characteristicBonusEnabled", characteristicBonusEnabled);
        for (const characteristic of characteristicList) {
          const key = characteristic.key;
          writeProperty(updateData, `system.characteristicBonuses.${key}`, characteristicBonuses[key]);
        }
      }
      if (supportsPaBonus) {
        writeProperty(updateData, "system.pa", paNormalized.value);
      }
      writeProperty(updateData, "system.erreur", modifierError);
      return true;
    }

    const sourceUpdate = {};
    if (supportsUseEnabled) {
      sourceUpdate["system.useEnabled"] = useEnabled;
    }
    if (supportsCharacteristicBonuses) {
      sourceUpdate["system.characteristicBonusEnabled"] = characteristicBonusEnabled;
      for (const characteristic of characteristicList) {
        const key = characteristic.key;
        sourceUpdate[`system.characteristicBonuses.${key}`] = characteristicBonuses[key];
      }
    }
    if (supportsPaBonus) {
      sourceUpdate["system.pa"] = paNormalized.value;
    }
    sourceUpdate["system.erreur"] = modifierError;
    item.updateSource(sourceUpdate);
    return true;
  }

  return {
    normalizeCharacteristicBonusItemUpdate
  };
}
