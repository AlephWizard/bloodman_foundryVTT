const DEFAULT_ITEM_ROLL_FORMULA_FIELDS = Object.freeze({
  arme: ["damageDie", "healDie"],
  aptitude: ["damageDie", "healDie"],
  pouvoir: ["damageDie", "healDie"],
  soin: ["damageDie", "healDie"],
  objet: ["damageDie", "healDie"],
  ration: ["damageDie", "healDie"],
  protection: ["damageDie", "healDie"]
});

export const ITEM_SINGLE_USE_ENABLED_PATH = "system.singleUseEnabled";
export const ITEM_SINGLE_USE_COUNT_PATH = "system.singleUseCount";
export const ITEM_INVENTORY_SLOTS_PATH = "system.inventorySlots";

function defaultNormalizeNonNegativeInteger(value, fallback = 0) {
  const numeric = Number(value);
  return Math.max(0, Math.floor(Number.isFinite(numeric) ? numeric : Number(fallback) || 0));
}

function defaultBooleanFlag(value, fallback = false) {
  if (value === true || value === false) return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "on" || normalized === "yes") return true;
    if (normalized === "false" || normalized === "0" || normalized === "off" || normalized === "no" || normalized === "") return false;
  }
  return Boolean(fallback);
}

function defaultGetUpdatedPathValue(updateData, path, fallback) {
  if (Object.prototype.hasOwnProperty.call(updateData || {}, path)) return updateData[path];
  return fallback;
}

export function createItemNormalizationRules({
  itemRollFormulaFields = DEFAULT_ITEM_ROLL_FORMULA_FIELDS,
  normalizeNonNegativeInteger = defaultNormalizeNonNegativeInteger,
  toCheckboxBoolean = defaultBooleanFlag,
  toBooleanFlag = toCheckboxBoolean,
  normalizeCarriedItemInventorySlots = (value, fallback = 1) => Math.max(1, normalizeNonNegativeInteger(value, fallback)),
  hasUpdatePath = (updateData, path) => Object.prototype.hasOwnProperty.call(updateData || {}, path),
  getUpdatedPathValue = defaultGetUpdatedPathValue,
  setProperty = (object, path, value) => {
    if (object && path) object[path] = value;
  },
  validateRollFormula = value => ({ valid: true, normalized: String(value || "") }),
  normalizeRollDieFormula = (value, fallback = "d4") => String(value || fallback || "d4"),
  translate = key => key,
  translateWithFallback = (_key, fallback) => fallback,
  notifyError = () => {}
} = {}) {
  function normalizeSingleUseCountValue(value, { enabled = false, fallbackEnabled = 1 } = {}) {
    const fallback = Math.max(1, normalizeNonNegativeInteger(fallbackEnabled, 1));
    let normalized = normalizeNonNegativeInteger(value, fallback);
    if (enabled && normalized < 1) normalized = 1;
    return normalized;
  }

  function formatSingleUseCountLabel(remainingCount) {
    const normalizedCount = normalizeNonNegativeInteger(remainingCount, 0);
    if (normalizedCount <= 0) return "";
    const rawLabel = String(translateWithFallback("BLOODMAN.Items.SingleUseCountLabel", "NB USAGES :"))
      .replace(/\s*:\s*$/u, "")
      .trim();
    return rawLabel ? `${rawLabel} ${normalizedCount}` : String(normalizedCount);
  }

  function resolveItemSingleUseDisplayData(systemData = null) {
    const enabled = toBooleanFlag(systemData?.singleUseEnabled, false);
    const rawCount = systemData?.singleUseCount;
    const hasCount = rawCount != null && String(rawCount).trim() !== "";
    if (!enabled || !hasCount) {
      return {
        show: false,
        count: 0,
        label: ""
      };
    }

    const count = normalizeSingleUseCountValue(rawCount, {
      enabled: true,
      fallbackEnabled: 1
    });
    if (count <= 1) {
      return {
        show: false,
        count: 0,
        label: ""
      };
    }

    return {
      show: true,
      count,
      label: formatSingleUseCountLabel(count)
    };
  }

  function normalizeItemSingleUseUpdate(item, updateData = null, options = {}) {
    const includeSourceWhenMissing = options.includeSourceWhenMissing === true;
    const hasEnabledUpdate = updateData ? hasUpdatePath(updateData, ITEM_SINGLE_USE_ENABLED_PATH) : false;
    const hasCountUpdate = updateData ? hasUpdatePath(updateData, ITEM_SINGLE_USE_COUNT_PATH) : false;
    const shouldNormalize = includeSourceWhenMissing || hasEnabledUpdate || hasCountUpdate;
    if (!shouldNormalize) return { changed: false };

    const rawEnabled = hasEnabledUpdate
      ? getUpdatedPathValue(updateData, ITEM_SINGLE_USE_ENABLED_PATH, undefined)
      : item?.system?.singleUseEnabled;
    const normalizedEnabled = toCheckboxBoolean(rawEnabled, false);
    const rawCount = hasCountUpdate
      ? getUpdatedPathValue(updateData, ITEM_SINGLE_USE_COUNT_PATH, undefined)
      : item?.system?.singleUseCount;
    const normalizedCount = normalizeSingleUseCountValue(rawCount, { enabled: normalizedEnabled, fallbackEnabled: 1 });

    let changed = false;
    if (updateData) {
      if (hasEnabledUpdate && rawEnabled !== normalizedEnabled) {
        setProperty(updateData, ITEM_SINGLE_USE_ENABLED_PATH, normalizedEnabled);
        changed = true;
      }
      if (!hasCountUpdate || Number(rawCount) !== normalizedCount) {
        setProperty(updateData, ITEM_SINGLE_USE_COUNT_PATH, normalizedCount);
        changed = true;
      }
    } else if (item?.updateSource) {
      const sourceEnabled = toCheckboxBoolean(item?.system?.singleUseEnabled, false);
      const sourceCount = normalizeSingleUseCountValue(item?.system?.singleUseCount, { enabled: sourceEnabled, fallbackEnabled: 1 });
      if (sourceEnabled !== normalizedEnabled || sourceCount !== normalizedCount) {
        item.updateSource({
          [ITEM_SINGLE_USE_ENABLED_PATH]: normalizedEnabled,
          [ITEM_SINGLE_USE_COUNT_PATH]: normalizedCount
        });
        changed = true;
      }
    }

    return {
      changed,
      enabled: normalizedEnabled,
      count: normalizedCount
    };
  }

  function normalizeItemInventorySlotsUpdate(item, updateData = null, options = {}) {
    const includeSourceWhenMissing = options.includeSourceWhenMissing === true;
    const hasInventorySlotsUpdate = updateData ? hasUpdatePath(updateData, ITEM_INVENTORY_SLOTS_PATH) : false;
    if (!includeSourceWhenMissing && !hasInventorySlotsUpdate) return { changed: false };

    const rawInventorySlots = hasInventorySlotsUpdate
      ? getUpdatedPathValue(updateData, ITEM_INVENTORY_SLOTS_PATH, undefined)
      : item?.system?.inventorySlots;
    const normalizedInventorySlots = normalizeCarriedItemInventorySlots(rawInventorySlots, 1);

    let changed = false;
    if (updateData) {
      if (!hasInventorySlotsUpdate || Number(rawInventorySlots) !== normalizedInventorySlots) {
        setProperty(updateData, ITEM_INVENTORY_SLOTS_PATH, normalizedInventorySlots);
        changed = true;
      }
    } else if (item?.updateSource) {
      const sourceInventorySlots = normalizeCarriedItemInventorySlots(item?.system?.inventorySlots, 1);
      if (sourceInventorySlots !== normalizedInventorySlots) {
        item.updateSource({
          [ITEM_INVENTORY_SLOTS_PATH]: normalizedInventorySlots
        });
        changed = true;
      }
    }

    return {
      changed,
      inventorySlots: normalizedInventorySlots
    };
  }

  function getItemRollFormulaFieldLabels(fields = []) {
    return fields.map(field => {
      if (field === "damageDie") return translateWithFallback("BLOODMAN.Items.DamageDieLabel", "de de degat");
      if (field === "healDie") return translateWithFallback("BLOODMAN.Items.HealDieLabel", "de de soin");
      return String(field || "").trim();
    });
  }

  function notifyInvalidItemRollFormula(item, invalidFields = [], invalidFieldErrors = {}) {
    const itemName = String(item?.name || "").trim()
      || translate(`TYPES.Item.${String(item?.type || "").trim().toLowerCase()}`)
      || translateWithFallback("BLOODMAN.Common.Name", "Item");
    const labelsByField = new Map(
      invalidFields.map((field, index) => [field, getItemRollFormulaFieldLabels([field])[index] || field])
    );
    const detailsList = invalidFields.map(field => {
      const label = String(labelsByField.get(field) || field).replace(/\s*:\s*$/, "").trim();
      const rawError = String(invalidFieldErrors?.[field] || "").trim();
      const compactError = rawError ? rawError.split(/\r?\n/u)[0].trim() : "";
      return compactError ? `${label}: ${compactError}` : label;
    }).filter(Boolean);
    const details = detailsList.length ? ` (${detailsList.join(" ; ")})` : "";
    const localizedMessage = translate("BLOODMAN.Notifications.ItemRollFormulaInvalid", {
      itemName,
      details
    });
    const fallbackMessage = `Formule de des invalide pour ${itemName}${details}.`;
    const errorMessage = localizedMessage && localizedMessage !== "BLOODMAN.Notifications.ItemRollFormulaInvalid"
      ? localizedMessage
      : fallbackMessage;
    notifyError(errorMessage);
  }

  function normalizeItemRollFormulaFields(item, updateData = null, options = {}) {
    const type = String(item?.type || "").trim().toLowerCase();
    const fields = itemRollFormulaFields[type] || [];
    if (!fields.length) return { invalid: false, changed: false, invalidFields: [] };
    const includeSourceWhenMissing = options.includeSourceWhenMissing === true;
    const invalidFields = [];
    const invalidFieldErrors = {};
    let changed = false;

    for (const field of fields) {
      const path = `system.${field}`;
      const hasPathUpdate = updateData ? hasUpdatePath(updateData, path) : false;
      if (!hasPathUpdate && !includeSourceWhenMissing) continue;

      const rawValue = hasPathUpdate
        ? getUpdatedPathValue(updateData, path, undefined)
        : item?.system?.[field];
      if (rawValue == null) continue;

      const textValue = String(rawValue).trim();
      if (!textValue) {
        if (hasPathUpdate && rawValue !== "") {
          setProperty(updateData, path, "");
          changed = true;
        }
        continue;
      }

      const validation = validateRollFormula(textValue, "d4", { useFallbackOnEmpty: false });
      if (!validation.valid) {
        invalidFields.push(field);
        invalidFieldErrors[field] = validation.error;
        continue;
      }

      const normalized = validation.normalized || normalizeRollDieFormula(textValue, "d4");
      if (hasPathUpdate) {
        if (String(rawValue) !== normalized) {
          setProperty(updateData, path, normalized);
          changed = true;
        }
      } else if (String(rawValue) !== normalized) {
        item.updateSource({ [path]: normalized });
        changed = true;
      }
    }

    return {
      invalid: invalidFields.length > 0,
      changed,
      invalidFields,
      invalidFieldErrors
    };
  }

  return {
    formatSingleUseCountLabel,
    getItemRollFormulaFieldLabels,
    normalizeItemInventorySlotsUpdate,
    normalizeItemRollFormulaFields,
    normalizeItemSingleUseUpdate,
    normalizeSingleUseCountValue,
    notifyInvalidItemRollFormula,
    resolveItemSingleUseDisplayData
  };
}
