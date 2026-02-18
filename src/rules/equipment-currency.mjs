function defaultToFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
}

function defaultParseSimpleArithmeticInput(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: true, empty: true, value: 0 };
  const numeric = Number(raw.replace(",", "."));
  if (!Number.isFinite(numeric)) return { ok: false, empty: false, value: Number.NaN };
  return { ok: true, empty: false, value: numeric };
}

function defaultHasUpdatePath(updateData, path) {
  if (!updateData || !path) return false;
  return Object.prototype.hasOwnProperty.call(updateData, path);
}

function defaultGetUpdatedPathValue(updateData, path, fallback) {
  if (Object.prototype.hasOwnProperty.call(updateData, path)) return updateData[path];
  return fallback;
}

function defaultBuildDefaultEquipment() {
  return { monnaies: "", monnaiesActuel: 0 };
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

export function createEquipmentCurrencyRules({
  parseSimpleArithmeticInput,
  toFiniteNumber,
  currencyCurrentMax = 1_000_000,
  hasUpdatePath,
  getUpdatedPathValue,
  buildDefaultEquipment,
  mergeObject,
  setProperty,
  translate
} = {}) {
  const parseArithmetic = typeof parseSimpleArithmeticInput === "function"
    ? parseSimpleArithmeticInput
    : defaultParseSimpleArithmeticInput;
  const toFinite = typeof toFiniteNumber === "function"
    ? toFiniteNumber
    : defaultToFiniteNumber;
  const hasUpdate = typeof hasUpdatePath === "function"
    ? hasUpdatePath
    : defaultHasUpdatePath;
  const readUpdatedValue = typeof getUpdatedPathValue === "function"
    ? getUpdatedPathValue
    : defaultGetUpdatedPathValue;
  const buildDefaultEquipmentData = typeof buildDefaultEquipment === "function"
    ? buildDefaultEquipment
    : defaultBuildDefaultEquipment;
  const mergeData = typeof mergeObject === "function"
    ? mergeObject
    : defaultMergeObject;
  const writeProperty = typeof setProperty === "function"
    ? setProperty
    : defaultSetProperty;
  const t = typeof translate === "function"
    ? translate
    : key => key;

  function roundCurrencyValue(value) {
    const rounded = Math.round((Number(value) || 0) * 100) / 100;
    const whole = Math.round(rounded);
    if (Math.abs(rounded - whole) <= 0.000001) return whole;
    return rounded;
  }

  function normalizeCurrencyCurrentValue(value, fallback = 0) {
    const parsed = parseArithmetic(value);
    if (!parsed.ok) {
      return { ok: false, value: roundCurrencyValue(Math.max(0, toFinite(fallback, 0))) };
    }
    const numeric = parsed.empty ? 0 : parsed.value;
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > currencyCurrentMax) {
      return { ok: false, value: roundCurrencyValue(Math.max(0, toFinite(fallback, 0))) };
    }
    return { ok: true, value: roundCurrencyValue(numeric) };
  }

  function formatCurrencyValue(value) {
    const normalized = roundCurrencyValue(Math.max(0, toFinite(value, 0)));
    if (Number.isInteger(normalized)) return String(normalized);
    return normalized.toFixed(2).replace(/\.?0+$/, "");
  }

  function buildInvalidCurrencyCurrentMessage() {
    const localized = t("BLOODMAN.Notifications.InvalidCurrencyCurrent");
    if (localized && localized !== "BLOODMAN.Notifications.InvalidCurrencyCurrent") return localized;
    return "La valeur Actuel doit etre un nombre entre 0 et 1000000.";
  }

  function normalizeActorEquipmentCurrencyUpdateData(actor, updateData) {
    if (!updateData || typeof updateData !== "object") return { changed: false, invalid: false };
    const equipmentPath = "system.equipment";
    const currencyTypePath = "system.equipment.monnaies";
    const currencyCurrentPath = "system.equipment.monnaiesActuel";
    const hasEquipmentRootUpdate = hasUpdate(updateData, equipmentPath);
    const hasCurrencyTypeUpdate = hasUpdate(updateData, currencyTypePath);
    const hasCurrencyCurrentUpdate = hasUpdate(updateData, currencyCurrentPath);
    if (!hasEquipmentRootUpdate && !hasCurrencyTypeUpdate && !hasCurrencyCurrentUpdate) {
      return { changed: false, invalid: false };
    }

    const currentEquipment = mergeData(buildDefaultEquipmentData(), actor?.system?.equipment || {}, {
      inplace: false
    });

    const rootUpdate = hasEquipmentRootUpdate ? readUpdatedValue(updateData, equipmentPath, {}) : {};
    const rootSource = rootUpdate && typeof rootUpdate === "object" ? rootUpdate : {};
    const nextEquipment = mergeData(currentEquipment, rootSource, { inplace: false });
    if (hasCurrencyTypeUpdate) {
      nextEquipment.monnaies = readUpdatedValue(updateData, currencyTypePath, nextEquipment.monnaies);
    }
    if (hasCurrencyCurrentUpdate) {
      nextEquipment.monnaiesActuel = readUpdatedValue(updateData, currencyCurrentPath, nextEquipment.monnaiesActuel);
    }

    const normalizedType = String(nextEquipment.monnaies ?? "").trim();
    const normalizedCurrent = normalizeCurrencyCurrentValue(
      nextEquipment.monnaiesActuel,
      currentEquipment.monnaiesActuel ?? 0
    );
    if (!normalizedCurrent.ok) {
      return {
        changed: false,
        invalid: true,
        message: buildInvalidCurrencyCurrentMessage()
      };
    }

    nextEquipment.monnaies = normalizedType;
    nextEquipment.monnaiesActuel = normalizedCurrent.value;

    if (hasEquipmentRootUpdate) {
      writeProperty(updateData, equipmentPath, nextEquipment);
    } else {
      writeProperty(updateData, currencyTypePath, nextEquipment.monnaies);
      writeProperty(updateData, currencyCurrentPath, nextEquipment.monnaiesActuel);
    }

    return {
      changed: true,
      invalid: false,
      currencyCurrent: nextEquipment.monnaiesActuel
    };
  }

  return {
    roundCurrencyValue,
    normalizeCurrencyCurrentValue,
    formatCurrencyValue,
    buildInvalidCurrencyCurrentMessage,
    normalizeActorEquipmentCurrencyUpdateData
  };
}
