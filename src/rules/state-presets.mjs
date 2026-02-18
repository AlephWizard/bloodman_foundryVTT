function defaultToFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
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

export function createStatePresetRules({
  statePresets = [],
  statePresetById,
  statePresetOrder,
  characteristics = [],
  toFiniteNumber,
  setProperty,
  translate,
  translateWithFallback
} = {}) {
  const presets = Array.isArray(statePresets) ? statePresets : [];
  const presetById = statePresetById instanceof Map
    ? statePresetById
    : new Map(presets.map(preset => [String(preset?.id || ""), preset]));
  const presetOrder = Array.isArray(statePresetOrder)
    ? statePresetOrder
    : presets.map(preset => String(preset?.id || "")).filter(Boolean);
  const characteristicList = Array.isArray(characteristics) ? characteristics : [];
  const toFinite = typeof toFiniteNumber === "function"
    ? toFiniteNumber
    : defaultToFiniteNumber;
  const writeProperty = typeof setProperty === "function"
    ? setProperty
    : defaultSetProperty;
  const t = typeof translate === "function"
    ? translate
    : key => key;
  const tl = typeof translateWithFallback === "function"
    ? translateWithFallback
    : (_key, fallback) => fallback;

  function normalizeStatePresetToken(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    return raw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, " ")
      .trim();
  }

  function splitStatePresetLabel(rawValue) {
    const raw = String(rawValue ?? "");
    if (!raw.trim()) return [];
    return raw
      .split(/[\n\r,;|]+/)
      .map(token => String(token || "").trim())
      .filter(Boolean);
  }

  function buildStatePresetAliasMap() {
    const aliasMap = new Map();
    const registerAlias = (token, stateId) => {
      const normalized = normalizeStatePresetToken(token);
      if (!normalized || aliasMap.has(normalized)) return;
      aliasMap.set(normalized, stateId);
    };

    for (const preset of presets) {
      registerAlias(preset.id, preset.id);
      registerAlias(preset.name, preset.id);
      registerAlias(preset.shortName, preset.id);
      const levelMatch = String(preset.name || "").match(/^NIV\s*(\d+)/i);
      if (levelMatch?.[1]) registerAlias(`NIV ${levelMatch[1]}`, preset.id);
    }

    return aliasMap;
  }

  const statePresetAliasMap = buildStatePresetAliasMap();

  function resolveStatePresetIdFromToken(token) {
    const normalized = normalizeStatePresetToken(token);
    if (!normalized) return "";
    const direct = statePresetAliasMap.get(normalized);
    if (direct) return direct;
    for (const preset of presets) {
      const shortToken = normalizeStatePresetToken(preset.shortName);
      if (!shortToken) continue;
      if (normalized.includes(shortToken)) return preset.id;
    }
    return "";
  }

  function buildStatePresetLabelFromIds(stateIds = []) {
    if (!Array.isArray(stateIds) || !stateIds.length) return "";
    const selected = new Set(stateIds.map(id => String(id || "").trim()).filter(Boolean));
    const names = [];
    for (const presetId of presetOrder) {
      if (!selected.has(presetId)) continue;
      const preset = presetById.get(presetId);
      if (!preset) continue;
      names.push(preset.name);
    }
    return names.join(" ; ");
  }

  function resolveStatePresetSelection(rawLabel) {
    const tokens = splitStatePresetLabel(rawLabel);
    const seen = new Set();
    const invalidTokens = [];

    for (const token of tokens) {
      const stateId = resolveStatePresetIdFromToken(token);
      if (!stateId) {
        invalidTokens.push(token);
        continue;
      }
      if (seen.has(stateId)) continue;
      seen.add(stateId);
    }

    const orderedIds = presetOrder.filter(stateId => seen.has(stateId));
    return {
      ids: orderedIds,
      invalidTokens,
      label: buildStatePresetLabelFromIds(orderedIds)
    };
  }

  function buildStatePresetModifierTotals(stateIds = []) {
    const totals = { all: 0 };
    for (const characteristic of characteristicList) totals[characteristic.key] = 0;

    for (const stateId of stateIds) {
      const preset = presetById.get(String(stateId || "").trim());
      if (!preset) continue;
      totals.all += toFinite(preset.modifierAll, 0);
      const modifierByKey = preset.modifierByKey || {};
      for (const characteristic of characteristicList) {
        totals[characteristic.key] += toFinite(modifierByKey[characteristic.key], 0);
      }
    }

    return totals;
  }

  function buildStateModifierUpdateFromLabel(rawLabel) {
    const selection = resolveStatePresetSelection(rawLabel);
    if (selection.invalidTokens.length) {
      return {
        ok: false,
        invalidTokens: selection.invalidTokens,
        ids: selection.ids,
        label: selection.label,
        totals: buildStatePresetModifierTotals(selection.ids)
      };
    }
    return {
      ok: true,
      invalidTokens: [],
      ids: selection.ids,
      label: selection.label,
      totals: buildStatePresetModifierTotals(selection.ids)
    };
  }

  function applyStateModifierUpdateToData(updateData, label, totals) {
    if (!updateData || typeof updateData !== "object") return;
    writeProperty(updateData, "system.modifiers.label", String(label || "").trim());
    writeProperty(updateData, "system.modifiers.all", toFinite(totals?.all, 0));
    for (const characteristic of characteristicList) {
      const key = characteristic.key;
      writeProperty(updateData, `system.modifiers.${key}`, toFinite(totals?.[key], 0));
    }
  }

  function buildStatePresetModifierLabel(preset) {
    if (!preset) return tl("BLOODMAN.StateBar.NoModifier", "Aucun modificateur");
    const parts = [];
    const allValue = toFinite(preset.modifierAll, 0);
    if (allValue !== 0) {
      parts.push(`${allValue > 0 ? "+" : ""}${allValue}% ALL CARACS`);
    }
    const grouped = new Map();
    for (const characteristic of characteristicList) {
      const value = toFinite(preset.modifierByKey?.[characteristic.key], 0);
      if (value === 0) continue;
      const group = grouped.get(value) || [];
      group.push(characteristic.key);
      grouped.set(value, group);
    }
    for (const [value, keys] of grouped.entries()) {
      parts.push(`${value > 0 ? "+" : ""}${value}% ${keys.join(" / ")}`);
    }
    if (!parts.length) return tl("BLOODMAN.StateBar.NoModifier", "Aucun modificateur");
    return parts.join(" ; ");
  }

  function buildStatePresetTooltip(preset) {
    if (!preset) return "";
    const categoryLabel = preset.category === "psychic"
      ? tl("BLOODMAN.StateBar.PsychicStates", "Etats psychiques")
      : tl("BLOODMAN.StateBar.BodyStates", "Etats corporels");
    const durationLabel = preset.duration
      ? `${tl("BLOODMAN.StateBar.DurationLabel", "Duree")} : ${preset.duration}`
      : "";
    const descriptionLabel = preset.description
      ? `${tl("BLOODMAN.StateBar.DescriptionLabel", "Description")} : ${preset.description}`
      : "";
    return [preset.name, categoryLabel, buildStatePresetModifierLabel(preset), durationLabel, descriptionLabel]
      .filter(Boolean)
      .join("\n");
  }

  function buildStatePresetDisplayData(rawLabel) {
    const selection = resolveStatePresetSelection(rawLabel);
    const selected = new Set(selection.ids);
    const psychic = [];
    const body = [];
    for (const preset of presets) {
      const entry = {
        id: preset.id,
        name: preset.name,
        category: preset.category,
        duration: preset.duration || "",
        description: preset.description || "",
        modifierLabel: buildStatePresetModifierLabel(preset),
        tooltip: buildStatePresetTooltip(preset),
        selected: selected.has(preset.id)
      };
      if (preset.category === "psychic") psychic.push(entry);
      else body.push(entry);
    }
    return {
      ids: selection.ids,
      invalidTokens: selection.invalidTokens,
      psychic,
      body
    };
  }

  function buildInvalidStatePresetMessage(invalidTokens = []) {
    const states = invalidTokens
      .map(token => String(token || "").trim())
      .filter(Boolean)
      .join(", ");
    const localized = t("BLOODMAN.Notifications.InvalidStateName", { states: states || "?" });
    if (localized && localized !== "BLOODMAN.Notifications.InvalidStateName") return localized;
    return `Etat inconnu: ${states || "?"}.`;
  }

  return {
    normalizeStatePresetToken,
    splitStatePresetLabel,
    buildStatePresetAliasMap,
    resolveStatePresetIdFromToken,
    buildStatePresetLabelFromIds,
    resolveStatePresetSelection,
    buildStatePresetModifierTotals,
    buildStateModifierUpdateFromLabel,
    applyStateModifierUpdateToData,
    buildStatePresetModifierLabel,
    buildStatePresetTooltip,
    buildStatePresetDisplayData,
    buildInvalidStatePresetMessage
  };
}
