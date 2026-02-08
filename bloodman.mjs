import { applyDamageToActor, doCharacteristicRoll, doDamageRoll, doDirectDamageRoll, doGrowthRoll, doHealRoll, getWeaponCategory, normalizeWeaponType } from "./rollHelpers.mjs";

const BaseActorSheet = foundry?.appv1?.sheets?.ActorSheet ?? ActorSheet;
const BaseItemSheet = foundry?.appv1?.sheets?.ItemSheet ?? ItemSheet;
const ActorsCollection = foundry?.documents?.collections?.Actors ?? Actors;
const ItemsCollection = foundry?.documents?.collections?.Items ?? Items;

function t(key, data = null) {
  if (!globalThis.game?.i18n) return key;
  return data ? game.i18n.format(key, data) : game.i18n.localize(key);
}

function safeWarn(message) {
  try {
    ui.notifications?.warn(message);
  } catch (error) {
    console.warn("[bloodman] notify.warn failed", message, error);
  }
}

const ACTOR_CREATE_TYPE_ICONS = {
  "personnage": "fa-masks-theater",
  "personnage-non-joueur": "fa-mask"
};

const ITEM_CREATE_TYPE_ICONS = {
  "arme": "fa-gun",
  "objet": "fa-box-open",
  "ration": "fa-utensils",
  "soin": "fa-kit-medical",
  "protection": "fa-shield-halved",
  "aptitude": "fa-hand-fist",
  "pouvoir": "fa-bolt"
};
const CREATE_TYPE_PICKER_ROOT_CLASS = "bm-doc-type-picker";
const CREATE_TYPE_EMOJI_BY_ICON = {
  "fa-masks-theater": "\u{1F3AD}",
  "fa-mask": "\u{1F479}",
  "fa-gun": "\u{1F52B}",
  "fa-box-open": "\u{1F4E6}",
  "fa-utensils": "\u{1F37D}\u{FE0F}",
  "fa-kit-medical": "\u{1F489}",
  "fa-shield-halved": "\u{1F6E1}\u{FE0F}",
  "fa-hand-fist": "\u{270A}",
  "fa-bolt": "\u{26A1}"
};

function normalizeCreateTypeLabel(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getCreateTypeIconByTypeKey(typeKey) {
  const key = String(typeKey || "").trim().toLowerCase();
  return ACTOR_CREATE_TYPE_ICONS[key] || ITEM_CREATE_TYPE_ICONS[key] || "";
}

function getCreateTypeIconByLabelText(labelText) {
  const normalized = normalizeCreateTypeLabel(labelText);
  if (!normalized) return "";
  if (normalized.includes("non joueur")) return "fa-mask";
  if (normalized.includes("joueur")) return "fa-masks-theater";
  if (normalized.includes("arme")) return "fa-gun";
  if (normalized.includes("protection")) return "fa-shield-halved";
  if (normalized.includes("aptitude")) return "fa-hand-fist";
  if (normalized.includes("pouvoir")) return "fa-bolt";
  if (normalized.includes("ration")) return "fa-utensils";
  if (normalized.includes("soin")) return "fa-kit-medical";
  if (normalized.includes("objet")) return "fa-box-open";
  return "";
}

function cleanCreateTypeLabelText(labelText) {
  return String(labelText || "")
    .replace(/^[\s\u25A1\u25A0\u2610\u2611\u2612\uF000-\uF8FF]+/g, "")
    .trim();
}

function getCreateTypeEmoji(iconClass) {
  return CREATE_TYPE_EMOJI_BY_ICON[String(iconClass || "").trim()] || "";
}

function isDocumentTypeSelect(selectEl) {
  if (!(selectEl instanceof HTMLSelectElement)) return false;
  if ((selectEl.name || "").toLowerCase() === "type") return true;
  const keywords = ["joueur", "non joueur", "arme", "aptitude", "objet", "pouvoir", "protection", "ration", "soin"];
  const options = Array.from(selectEl.options || []);
  return options.some(option => {
    const label = normalizeCreateTypeLabel(option?.dataset?.bmTypeLabel || option?.textContent || "");
    return keywords.some(keyword => label.includes(keyword));
  });
}

function findCreateTypeLabelHost(optionRow, input) {
  const direct = optionRow?.querySelector(".label, .name, .title, .option-name, .document-name");
  if (direct) return direct;
  const textCandidates = optionRow?.querySelectorAll("span, div, p, strong, h4") || [];
  for (const candidate of textCandidates) {
    if (!candidate) continue;
    if (candidate.classList?.contains("bm-doc-type-label-with-icon")) return candidate;
    const text = String(candidate.textContent || "").trim();
    if (text) return candidate;
  }
  if (input?.parentElement && input.parentElement !== optionRow) return input.parentElement;
  return optionRow;
}

function appendCreateTypeIcon(optionRow, input, iconClass) {
  if (!optionRow || !iconClass) return;
  if (optionRow.querySelector(".bm-doc-type-icon")) return;
  const host = findCreateTypeLabelHost(optionRow, input);
  if (!host) return;
  host.classList?.add("bm-doc-type-label-with-icon");
  const icon = document.createElement("i");
  icon.className = `bm-doc-type-icon fa-solid ${iconClass}`;
  if (host.firstChild) host.insertBefore(icon, host.firstChild);
  else host.appendChild(icon);
}

function buildCreateTypeEntries(selectEl) {
  const entries = [];
  for (const option of Array.from(selectEl?.options || [])) {
    const rawLabel = option.dataset?.bmTypeLabel || String(option.textContent || "");
    const label = cleanCreateTypeLabelText(rawLabel);
    if (!label) continue;
    if (!option.dataset.bmTypeLabel) option.dataset.bmTypeLabel = label;
    const iconClass = getCreateTypeIconByTypeKey(option.value) || getCreateTypeIconByLabelText(label) || "fa-circle-dot";
    entries.push({ value: option.value, label, iconClass });
  }
  return entries;
}

function resolveSelectedCreateTypeEntry(entries, currentValue) {
  if (!Array.isArray(entries) || !entries.length) return null;
  return entries.find(entry => entry.value === currentValue) || entries[0];
}

function setCreateTypeToggleContent(toggle, entry) {
  if (!toggle || !entry) return;
  toggle.replaceChildren();
  const value = document.createElement("span");
  value.className = "bm-doc-type-picker-value";
  const icon = document.createElement("i");
  icon.className = `fa-solid ${entry.iconClass}`;
  const label = document.createElement("span");
  label.textContent = entry.label;
  value.append(icon, label);
  const caret = document.createElement("i");
  caret.className = "fa-solid fa-chevron-down bm-doc-type-picker-caret";
  toggle.append(value, caret);
}

function syncCreateTypePicker(selectEl, picker, entries) {
  if (!selectEl || !picker || !Array.isArray(entries) || !entries.length) return;
  const toggle = picker.querySelector(".bm-doc-type-picker-toggle");
  const menu = picker.querySelector(".bm-doc-type-picker-menu");
  if (!toggle || !menu) return;
  const selected = resolveSelectedCreateTypeEntry(entries, selectEl.value);
  if (!selected) return;
  setCreateTypeToggleContent(toggle, selected);
  for (const button of menu.querySelectorAll(".bm-doc-type-picker-option")) {
    const isActive = button.dataset.value === selected.value;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  }
}

function closeAllCreateTypePickers(except = null) {
  for (const picker of document.querySelectorAll(`.${CREATE_TYPE_PICKER_ROOT_CLASS}.open`)) {
    if (except && picker === except) continue;
    picker.classList.remove("open");
    const toggle = picker.querySelector(".bm-doc-type-picker-toggle");
    toggle?.setAttribute("aria-expanded", "false");
  }
}

function ensureCreateTypePickerGlobalHandlers() {
  if (window.__bmCreateTypePickerHandlersInstalled) return;
  document.addEventListener("pointerdown", event => {
    try {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest(`.${CREATE_TYPE_PICKER_ROOT_CLASS}`)) return;
      closeAllCreateTypePickers();
    } catch (_error) {
      // non-fatal UI helper
    }
  });
  document.addEventListener("keydown", event => {
    try {
      if (event.key !== "Escape") return;
      closeAllCreateTypePickers();
    } catch (_error) {
      // non-fatal UI helper
    }
  });
  window.__bmCreateTypePickerHandlersInstalled = true;
}

function decorateCreateTypeSelect(selectEl) {
  try {
    if (!(selectEl instanceof HTMLSelectElement) || !selectEl.options?.length) return;
    if (!isDocumentTypeSelect(selectEl)) return;
    selectEl.classList.remove("bm-doc-type-select-native");
    delete selectEl.dataset.bmTypeEnhanced;
    const existingPicker = selectEl.parentElement?.querySelector(`.${CREATE_TYPE_PICKER_ROOT_CLASS}`);
    existingPicker?.remove();

    for (const option of Array.from(selectEl.options || [])) {
      const rawLabel = option.dataset?.bmTypeLabel || String(option.textContent || "");
      const baseLabel = cleanCreateTypeLabelText(rawLabel);
      if (!baseLabel) continue;
      if (!option.dataset.bmTypeLabel) option.dataset.bmTypeLabel = baseLabel;
      const iconClass = getCreateTypeIconByTypeKey(option.value) || getCreateTypeIconByLabelText(baseLabel);
      const emoji = getCreateTypeEmoji(iconClass);
      option.textContent = emoji ? `${emoji} ${baseLabel}` : baseLabel;
    }
  } catch (error) {
    try {
      if (selectEl?.classList) selectEl.classList.remove("bm-doc-type-select-native");
      if (selectEl?.dataset) delete selectEl.dataset.bmTypeEnhanced;
      const picker = selectEl?.parentElement?.querySelector(`.${CREATE_TYPE_PICKER_ROOT_CLASS}`);
      picker?.remove();
    } catch (_cleanupError) {
      // non-fatal cleanup
    }
    console.warn("[bloodman] create type icon picker disabled for this select", error);
    return;
  }
}

function injectDocumentCreateTypeIcons(htmlLike) {
  try {
    const root = htmlLike?.[0] || htmlLike;
    if (root instanceof HTMLElement) {
      const typeSelects = root.querySelectorAll("select");
      for (const selectEl of typeSelects) decorateCreateTypeSelect(selectEl);

      const typeInputs = root.querySelectorAll("input[name='type']");
      for (const input of typeInputs) {
        const optionRow = input.closest("label, li, .form-group, .option, [data-value]");
        if (!optionRow) continue;
        const typeKey = input.value || optionRow.dataset?.value || "";
        const rowText = String(optionRow.textContent || "");
        const iconClass = getCreateTypeIconByTypeKey(typeKey) || getCreateTypeIconByLabelText(rowText);
        appendCreateTypeIcon(optionRow, input, iconClass);
      }
      return;
    }

    const fallbackSelects = document.querySelectorAll(
      ".window-app select, .application select, dialog select"
    );
    for (const selectEl of fallbackSelects) decorateCreateTypeSelect(selectEl);
  } catch (error) {
    console.warn("[bloodman] create type icon injection skipped", error);
  }
}

function refreshAllCreateTypeIcons() {
  const selectNodes = document.querySelectorAll(
    ".window-app select, .application select, dialog select"
  );
  for (const selectEl of selectNodes) decorateCreateTypeSelect(selectEl);
}

function canUserRoleEditCharacteristics(role) {
  const minRole = Number(CONST?.USER_ROLES?.TRUSTED ?? 2);
  return Number(role ?? 0) >= minRole;
}

function canCurrentUserEditCharacteristics() {
  return canUserRoleEditCharacteristics(game.user?.role);
}

function isBasicPlayerRole(role) {
  const playerRole = Number(CONST?.USER_ROLES?.PLAYER ?? 1);
  return Number(role ?? 0) <= playerRole;
}

const CHARACTERISTIC_BASE_MIN = 30;
const CHARACTERISTIC_BASE_MAX = 95;

function isCharacteristicBaseRangeRestrictedRole(role) {
  const assistantRole = Number(CONST?.USER_ROLES?.ASSISTANT ?? 3);
  return Number(role ?? 0) < assistantRole;
}

function clampCharacteristicBaseForRole(role, value, fallback = CHARACTERISTIC_BASE_MIN) {
  const numeric = toFiniteNumber(value, fallback);
  if (!isCharacteristicBaseRangeRestrictedRole(role)) return numeric;
  return Math.max(CHARACTERISTIC_BASE_MIN, Math.min(CHARACTERISTIC_BASE_MAX, numeric));
}

function normalizeCharacteristicBaseUpdatesForRole(updateData, role, actor = null) {
  if (!updateData || typeof updateData !== "object") return false;
  let changed = false;

  const normalizeForCharacteristic = (characteristicKey, rawValue) => {
    const fallback = toFiniteNumber(actor?.system?.characteristics?.[characteristicKey]?.base, CHARACTERISTIC_BASE_MIN);
    return clampCharacteristicBaseForRole(role, rawValue, fallback);
  };

  for (const path of Object.keys(updateData)) {
    const match = path.match(/^system\.characteristics\.([^\.]+)\.base$/);
    if (!match) continue;
    const characteristicKey = match[1];
    const normalized = normalizeForCharacteristic(characteristicKey, updateData[path]);
    if (!validateNumericEquality(Number(updateData[path]), normalized)) {
      updateData[path] = normalized;
      changed = true;
    }
  }

  const nestedCharacteristics = foundry.utils.getProperty(updateData, "system.characteristics");
  if (!nestedCharacteristics || typeof nestedCharacteristics !== "object") return changed;
  for (const characteristicKey of Object.keys(nestedCharacteristics)) {
    const characteristicUpdate = nestedCharacteristics[characteristicKey];
    if (!characteristicUpdate || typeof characteristicUpdate !== "object") continue;
    if (!Object.prototype.hasOwnProperty.call(characteristicUpdate, "base")) continue;
    const normalized = normalizeForCharacteristic(characteristicKey, characteristicUpdate.base);
    if (!validateNumericEquality(Number(characteristicUpdate.base), normalized)) {
      characteristicUpdate.base = normalized;
      changed = true;
    }
  }
  return changed;
}

function toCheckboxBoolean(value, fallback = false) {
  if (value === true || value === false) return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "on" || normalized === "yes") return true;
    if (normalized === "false" || normalized === "0" || normalized === "off" || normalized === "no" || normalized === "") return false;
  }
  return Boolean(fallback);
}

function normalizeCharacteristicXpUpdates(updateData, actor = null) {
  if (!updateData || typeof updateData !== "object") return false;
  let changed = false;

  for (const characteristic of CHARACTERISTICS) {
    const key = String(characteristic?.key || "");
    if (!key) continue;
    const xpPath = `system.characteristics.${key}.xp`;
    const xpIndexPrefix = `${xpPath}.`;
    const actorCurrent = Array.isArray(actor?.system?.characteristics?.[key]?.xp)
      ? actor.system.characteristics[key].xp
      : [false, false, false];
    const nextXp = [
      toCheckboxBoolean(actorCurrent[0], false),
      toCheckboxBoolean(actorCurrent[1], false),
      toCheckboxBoolean(actorCurrent[2], false)
    ];
    let touched = false;

    let xpPayload;
    if (Object.prototype.hasOwnProperty.call(updateData, xpPath)) {
      xpPayload = updateData[xpPath];
      touched = true;
    } else {
      const nestedPayload = foundry.utils.getProperty(updateData, xpPath);
      if (nestedPayload !== undefined) {
        xpPayload = nestedPayload;
        touched = true;
      }
    }

    if (xpPayload !== undefined) {
      if (Array.isArray(xpPayload)) {
        for (let i = 0; i < 3; i += 1) {
          if (xpPayload[i] === undefined) continue;
          nextXp[i] = toCheckboxBoolean(xpPayload[i], nextXp[i]);
        }
      } else if (xpPayload && typeof xpPayload === "object") {
        for (const [rawIndex, rawValue] of Object.entries(xpPayload)) {
          const index = Number(rawIndex);
          if (!Number.isInteger(index) || index < 0 || index > 2) continue;
          nextXp[index] = toCheckboxBoolean(rawValue, nextXp[index]);
        }
      }
    }

    for (const path of Object.keys(updateData)) {
      if (!path.startsWith(xpIndexPrefix)) continue;
      const index = Number(path.slice(xpIndexPrefix.length));
      if (!Number.isInteger(index) || index < 0 || index > 2) continue;
      nextXp[index] = toCheckboxBoolean(updateData[path], nextXp[index]);
      delete updateData[path];
      touched = true;
      changed = true;
    }

    if (!touched) continue;
    foundry.utils.setProperty(updateData, xpPath, nextXp);
    changed = true;
  }

  return changed;
}

function stripUnauthorizedCharacteristicBaseUpdates(updateData) {
  if (!updateData || typeof updateData !== "object") return false;
  let blocked = false;

  for (const key of Object.keys(updateData)) {
    if (!key.startsWith("system.characteristics.") || !key.endsWith(".base")) continue;
    delete updateData[key];
    blocked = true;
  }

  const nestedCharacteristics = foundry.utils.getProperty(updateData, "system.characteristics");
  if (nestedCharacteristics && typeof nestedCharacteristics === "object") {
    for (const key of Object.keys(nestedCharacteristics)) {
      const characteristicUpdate = nestedCharacteristics[key];
      if (!characteristicUpdate || typeof characteristicUpdate !== "object") continue;
      if (Object.prototype.hasOwnProperty.call(characteristicUpdate, "base")) {
        delete characteristicUpdate.base;
        blocked = true;
      }
      if (!Object.keys(characteristicUpdate).length) delete nestedCharacteristics[key];
    }
    if (!Object.keys(nestedCharacteristics).length) {
      if (typeof foundry.utils.unsetProperty === "function") {
        foundry.utils.unsetProperty(updateData, "system.characteristics");
      } else if (updateData.system?.characteristics) {
        delete updateData.system.characteristics;
      }
    }
  }

  return blocked;
}

function unsetUpdatePath(updateData, path) {
  if (!updateData || !path) return false;
  let removed = false;
  if (Object.prototype.hasOwnProperty.call(updateData, path)) {
    delete updateData[path];
    removed = true;
  }
  const current = foundry.utils.getProperty(updateData, path);
  if (current !== undefined) {
    if (typeof foundry.utils.unsetProperty === "function") {
      foundry.utils.unsetProperty(updateData, path);
    } else {
      const segments = String(path).split(".");
      let node = updateData;
      for (let i = 0; i < segments.length - 1; i += 1) {
        if (!node || typeof node !== "object") break;
        node = node[segments[i]];
      }
      if (node && typeof node === "object") delete node[segments[segments.length - 1]];
    }
    removed = true;
  }
  return removed;
}

function stripUpdatePaths(updateData, paths = []) {
  let blocked = false;
  for (const path of paths) {
    if (unsetUpdatePath(updateData, path)) blocked = true;
  }
  return blocked;
}

function isGenericTokenName(name) {
  if (!name) return false;
  const raw = String(name).trim();
  if (/^(acteur|actor)\s*\(\d+\)$/i.test(raw)) return true;
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!normalized) return false;
  const genericNames = new Set([
    "acteur",
    "actor",
    "joueur",
    "player",
    "non joueur",
    "non player",
    "nonplayer",
    "pnj",
    "npc",
    "personnage",
    "personnage non joueur"
  ]);
  if (genericNames.has(normalized)) return true;
  const localizedPlayerType = String(game?.i18n?.localize?.("TYPES.Actor.personnage") || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const localizedNpcType = String(game?.i18n?.localize?.("TYPES.Actor.personnage-non-joueur") || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return normalized === localizedPlayerType || normalized === localizedNpcType;
}

function resolveCombatTargetName(tokenName, actorName, fallback = "Cible") {
  const tokenLabel = String(tokenName || "").trim();
  const actorLabel = String(actorName || "").trim();
  if (tokenLabel && !isGenericTokenName(tokenLabel)) return tokenLabel;
  if (actorLabel && !isGenericTokenName(actorLabel)) return actorLabel;
  if (tokenLabel) return tokenLabel;
  if (actorLabel) return actorLabel;
  return fallback;
}

function normalizeStatusValue(value) {
  return String(value || "").trim().toLowerCase();
}

function getStatusEffectIds(effectDef, { normalized = false } = {}) {
  if (!effectDef) return [];
  const ids = [effectDef.id, ...(Array.isArray(effectDef.statuses) ? effectDef.statuses : [])]
    .map(value => String(value || "").trim())
    .filter(Boolean);
  const output = [];
  const seen = new Set();
  for (const id of ids) {
    const key = normalized ? normalizeStatusValue(id) : id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(normalized ? key : id);
  }
  return output;
}

function getConfiguredStatusIdSet() {
  const configured = new Set();
  const effects = Array.isArray(CONFIG.statusEffects) ? CONFIG.statusEffects : [];
  for (const effect of effects) {
    for (const id of getStatusEffectIds(effect, { normalized: true })) configured.add(id);
  }
  return configured;
}

function getLocalizedStatusLabel(effect) {
  if (!effect) return "";
  const raw = effect.name ?? effect.label ?? "";
  if (!raw) return "";
  const hasI18nKey = Boolean(game.i18n?.has?.(raw));
  const localized = hasI18nKey ? game.i18n.localize(raw) : raw;
  return normalizeStatusValue(localized);
}

function findStatusEffect(candidates, labelKeywords = []) {
  const effects = Array.isArray(CONFIG.statusEffects) ? CONFIG.statusEffects : [];
  const wanted = new Set(candidates.map(normalizeStatusValue).filter(Boolean));
  for (const effect of effects) {
    const ids = getStatusEffectIds(effect, { normalized: true });
    if (ids.some(id => wanted.has(id))) return effect;
  }
  if (!labelKeywords.length) return null;
  const keywords = labelKeywords.map(normalizeStatusValue).filter(Boolean);
  for (const effect of effects) {
    const label = getLocalizedStatusLabel(effect);
    if (!label) continue;
    if (keywords.some(keyword => label.includes(keyword))) return effect;
  }
  return null;
}

function ensureStatusEffectDefinition(effectDef) {
  if (!effectDef) return null;
  if (!Array.isArray(CONFIG.statusEffects)) return effectDef;
  const targetIds = new Set(getStatusEffectIds(effectDef, { normalized: true }));
  if (!targetIds.size) return effectDef;
  for (const effect of CONFIG.statusEffects) {
    const existingIds = getStatusEffectIds(effect, { normalized: true });
    if (existingIds.some(id => targetIds.has(id))) return effect;
  }
  try {
    CONFIG.statusEffects.push(effectDef);
  } catch (_error) {
    // keep non-fatal if the status list is immutable
  }
  return effectDef;
}

function resolvePrimaryStatusId(effectDef) {
  const ids = getStatusEffectIds(effectDef);
  if (!ids.length) return "";
  const configured = getConfiguredStatusIdSet();
  return ids.find(id => configured.has(normalizeStatusValue(id))) || ids[0];
}

function buildBleedingFallbackStatusEffect() {
  return {
    id: "bleeding",
    statuses: ["bleeding"],
    name: "Bleeding",
    img: "icons/svg/blood.svg"
  };
}

function buildDeadFallbackStatusEffect() {
  const defeatedRaw = String(CONFIG.specialStatusEffects?.DEFEATED || "").trim();
  const id = defeatedRaw || "dead";
  const normalized = normalizeStatusValue(id);
  const statuses = normalized && normalized !== id ? [id, normalized] : [id];
  return {
    id,
    statuses,
    name: "Dead",
    img: "icons/svg/skull.svg"
  };
}

function getBleedingStatusEffect() {
  return findStatusEffect(PLAYER_ZERO_PV_STATUS_CANDIDATES, ["bleed", "saign"])
    || ensureStatusEffectDefinition(buildBleedingFallbackStatusEffect());
}

function getDeadStatusEffect() {
  const defeatedRaw = String(CONFIG.specialStatusEffects?.DEFEATED || "").trim();
  const defeated = normalizeStatusValue(defeatedRaw);
  const candidates = defeated ? [defeated, ...NPC_ZERO_PV_STATUS_CANDIDATES] : NPC_ZERO_PV_STATUS_CANDIDATES;
  return findStatusEffect(candidates, ["dead", "mort", "defeat"])
    || ensureStatusEffectDefinition(buildDeadFallbackStatusEffect());
}

function getTokenStatusesList(tokenDoc, { normalized = true } = {}) {
  const statuses = tokenDoc?.statuses;
  const list = Array.isArray(statuses)
    ? [...statuses]
    : statuses instanceof Set
      ? [...statuses]
      : [];
  const cleaned = list
    .map(value => String(value || "").trim())
    .filter(Boolean);
  if (!normalized) return cleaned;
  return cleaned.map(normalizeStatusValue).filter(Boolean);
}

async function removeTokenStatusOverrides(tokenDoc, familyIds = []) {
  const family = new Set(normalizeStatusIdList(familyIds));
  if (!tokenDoc || !family.size) return false;
  const currentStatuses = getTokenStatusesList(tokenDoc, { normalized: false });
  if (!currentStatuses.length) return false;
  const nextStatuses = currentStatuses.filter(id => !family.has(normalizeStatusValue(id)));
  if (nextStatuses.length === currentStatuses.length) return false;
  await tokenDoc.update({ statuses: nextStatuses }).catch(() => null);
  return true;
}

function getActiveEffectStatusIds(effectDoc, { normalized = true } = {}) {
  const statuses = effectDoc?.statuses;
  const list = Array.isArray(statuses)
    ? [...statuses]
    : statuses instanceof Set
      ? [...statuses]
      : [];
  const legacyStatusId = String(foundry.utils.getProperty(effectDoc, "flags.core.statusId") || "").trim();
  if (legacyStatusId) list.push(legacyStatusId);
  const cleaned = list
    .map(value => String(value || "").trim())
    .filter(Boolean);
  if (!normalized) return cleaned;
  return cleaned.map(normalizeStatusValue).filter(Boolean);
}

function getActorEffectDocuments(actor) {
  const effects = actor?.effects;
  if (!effects) return [];
  if (Array.isArray(effects)) return effects;
  if (Array.isArray(effects.contents)) return effects.contents;
  if (typeof effects.values === "function") return [...effects.values()];
  return [];
}

function normalizeStatusIdList(ids = []) {
  return [...new Set(
    (Array.isArray(ids) ? ids : [])
      .map(normalizeStatusValue)
      .filter(Boolean)
  )];
}

function buildStatusFamilyIds(effectDef, extraIds = []) {
  return normalizeStatusIdList([
    ...(Array.isArray(extraIds) ? extraIds : []),
    ...getStatusEffectIds(effectDef)
  ]);
}

function getActorStatusEffectDocumentsByFamily(actor, familyIds = []) {
  const family = new Set(normalizeStatusIdList(familyIds));
  if (!actor || !family.size) return [];
  const docs = [];
  for (const effectDoc of getActorEffectDocuments(actor)) {
    const ids = getActiveEffectStatusIds(effectDoc);
    if (ids.some(id => family.has(id))) docs.push(effectDoc);
  }
  return docs;
}

async function deleteStatusEffectDocuments(effectDocs = []) {
  if (!Array.isArray(effectDocs) || !effectDocs.length) return false;
  let changed = false;
  for (const effectDoc of effectDocs) {
    if (!effectDoc) continue;
    try {
      await effectDoc.delete();
      changed = true;
    } catch (_error) {
      // continue best-effort cleanup
    }
  }
  return changed;
}

function actorHasStatusInFamily(actor, familyIds = []) {
  const family = normalizeStatusIdList(familyIds);
  if (!actor || !family.length) return false;
  if (typeof actor.hasStatusEffect === "function") {
    for (const id of family) {
      try {
        if (actor.hasStatusEffect(id)) return true;
      } catch (_error) {
        // continue checks
      }
    }
  }
  return getActorStatusEffectDocumentsByFamily(actor, family).length > 0;
}

function tokenHasStatusInFamily(tokenDoc, familyIds = []) {
  const family = normalizeStatusIdList(familyIds);
  if (!tokenDoc || !family.length) return false;
  const actor = tokenDoc.actorLink === true
    ? (tokenDoc.actor || (tokenDoc.actorId ? game.actors?.get(tokenDoc.actorId) : null))
    : tokenDoc.actor || null;
  if (actorHasStatusInFamily(actor, family)) return true;
  const tokenStatuses = new Set(getTokenStatusesList(tokenDoc));
  if (family.some(id => tokenStatuses.has(id))) return true;

  if (typeof tokenDoc.hasStatusEffect === "function") {
    for (const id of family) {
      try {
        if (tokenDoc.hasStatusEffect(id)) return true;
      } catch (_error) {
        // continue checks
      }
    }
  }
  return false;
}

async function clearActorStatusFamily(actor, familyIds = []) {
  const family = normalizeStatusIdList(familyIds);
  if (!actor || !family.length) return false;
  const docs = getActorStatusEffectDocumentsByFamily(actor, family);
  if (docs.length) await deleteStatusEffectDocuments(docs);
  return !actorHasStatusInFamily(actor, family);
}

function tokenHasStatusEffect(tokenDoc, effectDef, familyIds = []) {
  return tokenHasStatusInFamily(tokenDoc, buildStatusFamilyIds(effectDef, familyIds));
}

async function setTokenStatusEffect(tokenDoc, effectDef, active, familyIds = []) {
  if (!tokenDoc || !effectDef) return false;
  const primaryId = resolvePrimaryStatusId(effectDef) || getStatusEffectIds(effectDef)[0] || "";
  const family = buildStatusFamilyIds(effectDef, familyIds);
  if (!primaryId || !family.length) return false;
  const actor = tokenDoc.actorLink === true
    ? (tokenDoc.actor || (tokenDoc.actorId ? game.actors?.get(tokenDoc.actorId) : null))
    : tokenDoc.actor || null;
  const currentStatuses = getTokenStatusesList(tokenDoc, { normalized: false });
  const familySet = new Set(family);
  const hasTokenOverrides = currentStatuses.some(id => familySet.has(normalizeStatusValue(id)));

  if (actor && !hasTokenOverrides) {
    const actorDocs = getActorStatusEffectDocumentsByFamily(actor, family);
    const actorHas = actorHasStatusInFamily(actor, family);
    if (actorHas === active && actorDocs.length <= 1) return true;
  }

  if (hasTokenOverrides) await removeTokenStatusOverrides(tokenDoc, family);

  if (actor && typeof actor.toggleStatusEffect === "function") {
    await clearActorStatusFamily(actor, family);
    if (active) {
      try {
        await actor.toggleStatusEffect(primaryId, { active: true, overlay: false });
      } catch (_error) {
        // fallback on token statuses below
      }
      const actorDocs = getActorStatusEffectDocumentsByFamily(actor, family);
      if (actorDocs.length > 1) await deleteStatusEffectDocuments(actorDocs.slice(1));
      if (!actorHasStatusInFamily(actor, family)) {
        const normalizedPrimary = normalizeStatusValue(primaryId);
        if (normalizedPrimary && normalizedPrimary !== primaryId) {
          try {
            await actor.toggleStatusEffect(normalizedPrimary, { active: true, overlay: false });
          } catch (_error) {
            // fallback on token statuses below
          }
        }
      }
    }
    const actorMatches = actorHasStatusInFamily(actor, family) === active;
    if (actorMatches) return true;
  }

  const nextStatuses = currentStatuses.filter(id => !familySet.has(normalizeStatusValue(id)));
  if (active) nextStatuses.push(primaryId);

  const deduped = [];
  const seen = new Set();
  for (const id of nextStatuses) {
    const normalized = normalizeStatusValue(id);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(id);
  }

  const hasChanged = deduped.length !== currentStatuses.length
    || deduped.some((id, index) => id !== currentStatuses[index]);
  if (hasChanged) await tokenDoc.update({ statuses: deduped }).catch(() => null);

  return tokenHasStatusInFamily(tokenDoc, family) === active;
}
function getTokenActorType(tokenDoc) {
  const actorType = tokenDoc?.actor?.type;
  if (actorType) return actorType;
  const worldActorType = tokenDoc?.actorId ? game.actors?.get(tokenDoc.actorId)?.type : "";
  return worldActorType || "";
}

function shouldUseRoundTokenMask(tokenLike) {
  const tokenDoc = tokenLike?.document || tokenLike;
  const actorType = getTokenActorType(tokenDoc);
  return actorType === "personnage" || actorType === "personnage-non-joueur";
}

function shouldNormalizeTokenVisual(tokenLike) {
  return shouldUseRoundTokenMask(tokenLike);
}

function shouldResetTokenScale(scaleValue) {
  const numeric = Number(scaleValue);
  if (!Number.isFinite(numeric) || numeric === 0) return true;
  return Math.abs(numeric) !== 1;
}

function shouldResetTokenOffset(offsetValue) {
  const numeric = Number(offsetValue);
  if (!Number.isFinite(numeric)) return true;
  return Math.abs(numeric) > 0.0001;
}

function shouldResetTokenFit(fitValue) {
  return String(fitValue || "").trim().toLowerCase() !== "cover";
}

function getTokenSpriteForRoundMask(token) {
  if (!token) return null;
  const mesh = token.mesh;
  if (!mesh || typeof mesh !== "object") return null;
  if (!mesh.texture) return null;
  return mesh;
}

function clearRoundTokenMask(token) {
  if (!token) return;
  const sprite = getTokenSpriteForRoundMask(token);
  const mask = token._bmRoundMask || null;
  if (sprite?.mask === mask) sprite.mask = null;
  if (mask) {
    if (mask.parent) {
      try {
        mask.parent.removeChild(mask);
      } catch (_error) {
        // non-fatal detach
      }
    }
    mask.visible = false;
    mask.renderable = false;
    try {
      mask.destroy({ children: true });
    } catch (_error) {
      // non-fatal cleanup
    }
  }
  token._bmRoundMask = null;
}

function applyRoundTokenMask(tokenLike) {
  const token = tokenLike?.object || tokenLike;
  if (!token) return;
  const sprite = getTokenSpriteForRoundMask(token);
  if (!sprite) {
    clearRoundTokenMask(token);
    return;
  }
  const shouldRound = shouldUseRoundTokenMask(tokenLike);
  if (!shouldRound) {
    clearRoundTokenMask(token);
    return;
  }

  const PIXI_NS = globalThis.PIXI;
  if (!PIXI_NS?.Graphics) return;

  const localBounds = sprite.getLocalBounds?.();
  const boundsX = Number(localBounds?.x);
  const boundsY = Number(localBounds?.y);
  const boundsW = Number(localBounds?.width);
  const boundsH = Number(localBounds?.height);
  if (!(Number.isFinite(boundsW) && Number.isFinite(boundsH) && boundsW > 0 && boundsH > 0)) {
    clearRoundTokenMask(token);
    return;
  }

  const centerX = boundsX + (boundsW / 2);
  const centerY = boundsY + (boundsH / 2);
  const radius = (Math.min(boundsW, boundsH) / 2) * 0.995;
  if (!(Number.isFinite(centerX) && Number.isFinite(centerY) && radius > 0)) {
    clearRoundTokenMask(token);
    return;
  }

  let mask = token._bmRoundMask || null;
  if (!mask || mask.destroyed) {
    mask = new PIXI_NS.Graphics();
    mask._bmRoundMaskGraphic = true;
    mask._bmOwnerToken = token;
    token._bmRoundMask = mask;
  }

  mask.clear();
  mask.beginFill(0xffffff, 1);
  mask.drawCircle(centerX, centerY, radius);
  mask.endFill();

  if (mask.parent !== sprite) sprite.addChild(mask);
  sprite.mask = mask;

  // Safety net: never keep a mask that would effectively hide the token.
  const hasValidRenderArea = Number.isFinite(Number(sprite.width))
    && Number.isFinite(Number(sprite.height))
    && Number(sprite.width) > 1
    && Number(sprite.height) > 1;
  if (!hasValidRenderArea || sprite.worldAlpha <= 0) {
    clearRoundTokenMask(token);
  }
}

function cleanupOrphanRoundMasks() {
  const root = canvas?.stage;
  if (!root?.children) return;

  const stack = [...root.children];
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    if (Array.isArray(node.children) && node.children.length) {
      stack.push(...node.children);
    }
    if (!node._bmRoundMaskGraphic) continue;
    const owner = node._bmOwnerToken;
    const ownerAlive = owner && !owner.destroyed;
    if (ownerAlive) continue;
    try {
      node.visible = false;
      node.renderable = false;
      node.destroy({ children: true });
    } catch (_error) {
      // non-fatal cleanup
    }
  }
}

const ROUND_MASK_RETRY_DELAYS_MS = [0, 120, 300];
const ROUND_MASK_SCHEDULE_TIMERS = new Map();

function getRoundMaskScheduleKey(tokenLike) {
  const tokenDoc = tokenLike?.document || tokenLike;
  const tokenId = String(tokenDoc?.id || tokenDoc?._id || "").trim();
  if (!tokenId) return "";
  const sceneId = String(
    tokenDoc?.parent?.id
    || tokenDoc?.parent?._id
    || tokenDoc?.scene?.id
    || canvas?.scene?.id
    || ""
  ).trim();
  return sceneId ? `${sceneId}:${tokenId}` : tokenId;
}

function clearScheduledRoundTokenMask(tokenLike) {
  const scheduleKey = getRoundMaskScheduleKey(tokenLike);
  if (!scheduleKey) return;
  const timers = ROUND_MASK_SCHEDULE_TIMERS.get(scheduleKey);
  if (!Array.isArray(timers) || !timers.length) return;
  for (const timerId of timers) clearTimeout(timerId);
  ROUND_MASK_SCHEDULE_TIMERS.delete(scheduleKey);
}

function scheduleRoundTokenMask(tokenLike) {
  const apply = () => applyRoundTokenMask(tokenLike?.object || tokenLike);
  const scheduleKey = getRoundMaskScheduleKey(tokenLike);
  if (scheduleKey) clearScheduledRoundTokenMask(tokenLike);
  apply();
  const timers = [];
  const lastIndex = ROUND_MASK_RETRY_DELAYS_MS.length - 1;
  ROUND_MASK_RETRY_DELAYS_MS.forEach((delay, index) => {
    const timerId = setTimeout(() => {
      apply();
      if (scheduleKey && index === lastIndex) {
        ROUND_MASK_SCHEDULE_TIMERS.delete(scheduleKey);
      }
    }, delay);
    timers.push(timerId);
  });
  if (scheduleKey) ROUND_MASK_SCHEDULE_TIMERS.set(scheduleKey, timers);
}

function getTokenScaleNormalizationUpdates(tokenLike) {
  if (!shouldNormalizeTokenVisual(tokenLike)) return {};
  const updates = {};
  const source = tokenLike?.document || tokenLike;
  const scaleX = foundry.utils.getProperty(source, "texture.scaleX");
  const scaleY = foundry.utils.getProperty(source, "texture.scaleY");
  const offsetX = foundry.utils.getProperty(source, "texture.offsetX");
  const offsetY = foundry.utils.getProperty(source, "texture.offsetY");
  const fit = foundry.utils.getProperty(source, "texture.fit");
  if (shouldResetTokenScale(scaleX)) updates["texture.scaleX"] = 1;
  if (shouldResetTokenScale(scaleY)) updates["texture.scaleY"] = 1;
  if (shouldResetTokenOffset(offsetX)) updates["texture.offsetX"] = 0;
  if (shouldResetTokenOffset(offsetY)) updates["texture.offsetY"] = 0;
  if (shouldResetTokenFit(fit)) updates["texture.fit"] = "cover";
  return updates;
}

function isPvBarAttribute(attribute) {
  if (!attribute) return false;
  return /(^|\\.)resources\\.pv(\\.|$)/.test(String(attribute));
}

function getTokenBarPvValue(tokenDoc) {
  const bar1Value = Number(foundry.utils.getProperty(tokenDoc, "bar1.value"));
  const bar1Attr = foundry.utils.getProperty(tokenDoc, "bar1.attribute");
  if (Number.isFinite(bar1Value) && isPvBarAttribute(bar1Attr)) return bar1Value;
  const bar2Value = Number(foundry.utils.getProperty(tokenDoc, "bar2.value"));
  const bar2Attr = foundry.utils.getProperty(tokenDoc, "bar2.attribute");
  if (Number.isFinite(bar2Value) && isPvBarAttribute(bar2Attr)) return bar2Value;
  return NaN;
}

function getTokenCurrentPv(tokenDoc) {
  const deltaCurrent = Number(foundry.utils.getProperty(tokenDoc, "delta.system.resources.pv.current"));
  const actorDataCurrent = Number(foundry.utils.getProperty(tokenDoc, "actorData.system.resources.pv.current"));
  const actorCurrent = Number(tokenDoc?.actor?.system?.resources?.pv?.current);
  const barCurrent = getTokenBarPvValue(tokenDoc);
  const isLinked = tokenDoc?.actorLink === true;
  if (isLinked) {
    if (Number.isFinite(actorCurrent)) return actorCurrent;
    if (Number.isFinite(deltaCurrent)) return deltaCurrent;
    if (Number.isFinite(actorDataCurrent)) return actorDataCurrent;
  } else {
    if (Number.isFinite(deltaCurrent)) return deltaCurrent;
    if (Number.isFinite(actorDataCurrent)) return actorDataCurrent;
    if (Number.isFinite(barCurrent)) return barCurrent;
    if (Number.isFinite(actorCurrent)) return actorCurrent;
  }
  if (Number.isFinite(barCurrent)) return barCurrent;
  const worldActorCurrent = Number(game.actors?.get(tokenDoc?.actorId)?.system?.resources?.pv?.current);
  return worldActorCurrent;
}

function getTokenPvFromUpdate(tokenDoc, changes) {
  const deltaCurrent = foundry.utils.getProperty(changes, "delta.system.resources.pv.current");
  if (deltaCurrent != null) return Number(deltaCurrent);
  const actorDataCurrent = foundry.utils.getProperty(changes, "actorData.system.resources.pv.current");
  if (actorDataCurrent != null) return Number(actorDataCurrent);
  const legacyCurrent = foundry.utils.getProperty(changes, "system.resources.pv.current");
  if (legacyCurrent != null) return Number(legacyCurrent);
  const bar1Value = foundry.utils.getProperty(changes, "bar1.value");
  const bar1Attr = foundry.utils.getProperty(tokenDoc, "bar1.attribute");
  if (bar1Value != null && isPvBarAttribute(bar1Attr)) return Number(bar1Value);
  const bar2Value = foundry.utils.getProperty(changes, "bar2.value");
  const bar2Attr = foundry.utils.getProperty(tokenDoc, "bar2.attribute");
  if (bar2Value != null && isPvBarAttribute(bar2Attr)) return Number(bar2Value);
  return null;
}

async function syncZeroPvStatusForToken(tokenDoc, actorType, pvCurrent) {
  if (!tokenDoc) return;
  if (actorType !== "personnage" && actorType !== "personnage-non-joueur") return;

  const isZeroOrLess = Number(pvCurrent) <= 0;
  const bleeding = getBleedingStatusEffect();
  const dead = getDeadStatusEffect();
  const defeatedRaw = String(CONFIG.specialStatusEffects?.DEFEATED || "").trim();

  const bleedingFamily = buildStatusFamilyIds(bleeding, PLAYER_ZERO_PV_STATUS_CANDIDATES);
  const deadCandidates = defeatedRaw
    ? [defeatedRaw, ...NPC_ZERO_PV_STATUS_CANDIDATES]
    : [...NPC_ZERO_PV_STATUS_CANDIDATES];
  const deadFamily = buildStatusFamilyIds(dead, deadCandidates);

  if (tokenDoc.actorLink === true) {
    await removeTokenStatusOverrides(tokenDoc, [...bleedingFamily, ...deadFamily]);
  }

  if (actorType === "personnage") {
    if (bleeding) {
      const okBleed = await setTokenStatusEffect(tokenDoc, bleeding, isZeroOrLess, bleedingFamily);
      if (!okBleed) console.warn("[bloodman] status:bleeding sync failed", { tokenId: tokenDoc.id, pvCurrent, actorType });
    }
    if (dead) {
      const okDeadClear = await setTokenStatusEffect(tokenDoc, dead, false, deadFamily);
      if (!okDeadClear) console.warn("[bloodman] status:dead clear failed", { tokenId: tokenDoc.id, pvCurrent, actorType });
    }
  } else {
    if (dead) {
      const okDead = await setTokenStatusEffect(tokenDoc, dead, isZeroOrLess, deadFamily);
      if (!okDead) console.warn("[bloodman] status:dead sync failed", { tokenId: tokenDoc.id, pvCurrent, actorType });
    }
    if (bleeding) {
      const okBleedClear = await setTokenStatusEffect(tokenDoc, bleeding, false, bleedingFamily);
      if (!okBleedClear) console.warn("[bloodman] status:bleeding clear failed", { tokenId: tokenDoc.id, pvCurrent, actorType });
    }
  }

  if (typeof tokenDoc?.object?.drawEffects === "function") {
    tokenDoc.object.drawEffects();
  }
}
if (!globalThis.__bmSyncZeroPvStatusForToken) {
  globalThis.__bmSyncZeroPvStatusForToken = syncZeroPvStatusForToken;
}

function getTokenDocumentsForActor(actor) {
  const actorId = actor?.id;
  if (!actorId) return [];
  const docs = [];
  for (const scene of game.scenes || []) {
    for (const tokenDoc of scene.tokens || []) {
      if (tokenDoc.actorId === actorId) docs.push(tokenDoc);
    }
  }
  return docs;
}

function getActorInstancesById(actorId) {
  const id = String(actorId || "");
  if (!id) return [];
  const instances = [];
  const seen = new Set();
  const addInstance = actorDoc => {
    if (!actorDoc) return;
    const key = String(actorDoc.uuid || `${actorDoc.id}:${actorDoc.parent?.uuid || actorDoc.parent?.id || "world"}`);
    if (seen.has(key)) return;
    seen.add(key);
    instances.push(actorDoc);
  };

  addInstance(game.actors?.get(id));
  for (const scene of game.scenes || []) {
    for (const tokenDoc of scene.tokens || []) {
      if (String(tokenDoc.actorId || "") !== id) continue;
      addInstance(tokenDoc.actor || null);
    }
  }
  return instances;
}

function getOwnedCharacterActorInstances() {
  const instances = [];
  const seen = new Set();
  const addInstance = actorDoc => {
    if (!actorDoc || !actorDoc.isOwner) return;
    const type = String(actorDoc.type || "");
    if (type !== "personnage" && type !== "personnage-non-joueur") return;
    const key = String(actorDoc.uuid || `${actorDoc.id}:${actorDoc.parent?.uuid || actorDoc.parent?.id || "world"}`);
    if (seen.has(key)) return;
    seen.add(key);
    instances.push(actorDoc);
  };

  for (const actor of game.actors || []) addInstance(actor);
  for (const scene of game.scenes || []) {
    for (const tokenDoc of scene.tokens || []) addInstance(tokenDoc.actor || null);
  }
  return instances;
}

function getOpenSheetActorInstances() {
  const instances = [];
  const seen = new Set();
  for (const app of Object.values(ui.windows || {})) {
    const actorDoc = app?.actor || null;
    if (!actorDoc) continue;
    const type = String(actorDoc.type || "");
    if (type !== "personnage" && type !== "personnage-non-joueur") continue;
    const key = String(actorDoc.uuid || `${actorDoc.id}:${actorDoc.parent?.uuid || actorDoc.parent?.id || "world"}`);
    if (seen.has(key)) continue;
    seen.add(key);
    instances.push(actorDoc);
  }
  return instances;
}

function resolveAttackerActorInstancesForDamageApplied(data) {
  const attackerId = String(data?.attackerId || data?.attaquant_id || "");
  let instances = getActorInstancesById(attackerId);
  if (instances.length) return instances;

  const itemId = String(data?.itemId || "");
  const candidates = [...getOwnedCharacterActorInstances(), ...getOpenSheetActorInstances()];
  const deduped = [];
  const seen = new Set();
  for (const actor of candidates) {
    const key = String(actor.uuid || `${actor.id}:${actor.parent?.uuid || actor.parent?.id || "world"}`);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(actor);
  }
  if (!itemId) return deduped;
  const withItem = deduped.filter(actor => actor.items?.get(itemId));
  return withItem.length ? withItem : deduped;
}

async function syncZeroPvStatusForActor(actor) {
  const actorType = actor?.type || "";
  if (actorType !== "personnage" && actorType !== "personnage-non-joueur") return;
  const pvCurrent = Number(actor.system?.resources?.pv?.current);
  if (!Number.isFinite(pvCurrent)) return;
  for (const tokenDoc of getTokenDocumentsForActor(actor)) {
    if (!tokenDoc?.actorLink) continue;
    await syncZeroPvStatusForToken(tokenDoc, actorType, pvCurrent);
  }
}

const CHARACTERISTICS = [
  { key: "MEL", labelKey: "BLOODMAN.Characteristics.Keys.MEL", icon: "fa-hand-fist" },
  { key: "VIS", labelKey: "BLOODMAN.Characteristics.Keys.VIS", icon: "fa-crosshairs" },
  { key: "ESP", labelKey: "BLOODMAN.Characteristics.Keys.ESP", icon: "fa-brain" },
  { key: "PHY", labelKey: "BLOODMAN.Characteristics.Keys.PHY", icon: "fa-heart-pulse" },
  { key: "MOU", labelKey: "BLOODMAN.Characteristics.Keys.MOU", icon: "fa-person-running" },
  { key: "ADR", labelKey: "BLOODMAN.Characteristics.Keys.ADR", icon: "fa-hand" },
  { key: "PER", labelKey: "BLOODMAN.Characteristics.Keys.PER", icon: "fa-eye" },
  { key: "SOC", labelKey: "BLOODMAN.Characteristics.Keys.SOC", icon: "fa-users" },
  { key: "SAV", labelKey: "BLOODMAN.Characteristics.Keys.SAV", icon: "fa-book-open" }
];
const CHARACTERISTIC_KEYS = new Set(CHARACTERISTICS.map(characteristic => characteristic.key));
const STATE_MODIFIER_PATHS = [
  "system.modifiers.all",
  "system.modifiers.label",
  ...CHARACTERISTICS.map(char => `system.modifiers.${char.key}`)
];

const SYSTEM_SOCKET = "system.bloodman";
const CARRIED_ITEM_LIMIT = 10;
const CARRIED_ITEM_TYPES = new Set(["objet", "ration", "soin"]);
const CHARACTERISTIC_REROLL_PP_COST = 4;
const CHAOS_PER_PLAYER_REROLL = 1;
const CHAOS_COST_NPC_REROLL = 1;
const REROLL_VISIBILITY_MS = 5 * 60 * 1000;
const DAMAGE_REROLL_ALLOWED_ITEM_TYPES = new Set(["arme", "aptitude", "pouvoir"]);
const AUDIO_ENABLED_ITEM_TYPES = new Set(["arme", "aptitude", "pouvoir", "soin"]);
const AUDIO_FILE_EXTENSION_PATTERN = /\.(mp3|ogg|oga|wav|flac|m4a|aac|webm)$/i;
const ITEM_AUDIO_POST_ROLL_DELAY_MS = 450;
const VITAL_RESOURCE_PATHS = new Set([
  "system.resources.pv.current",
  "system.resources.pv.max",
  "system.resources.pp.current",
  "system.resources.pp.max"
]);

function isDamageRerollItemType(itemType) {
  const type = String(itemType || "").trim().toLowerCase();
  return DAMAGE_REROLL_ALLOWED_ITEM_TYPES.has(type);
}

function validateNumericEquality(a, b) {
  if (!Number.isFinite(Number(a)) || !Number.isFinite(Number(b))) return false;
  return Number(a) === Number(b);
}

function logDamageRerollValidation(scope, details = {}) {
  const payload = { scope, ...details };
  const allGood = Object.entries(payload)
    .filter(([key]) => key.startsWith("ok"))
    .every(([, value]) => value === true);
  if (allGood) {
    console.debug("[bloodman] reroll:validate", payload);
  } else {
    console.warn("[bloodman] reroll:validate", payload);
  }
}
const DAMAGE_REQUEST_RETENTION_MS = 2 * 60 * 1000;
const CHAOS_REQUEST_CHAT_MARKUP = "<span style='display:none'>bloodman-chaos-request</span>";
const REROLL_REQUEST_CHAT_MARKUP = "<span style='display:none'>bloodman-reroll-request</span>";
const INITIATIVE_GROUP_BUFFER_MS = 180;
const TOKEN_MOVE_LIMIT_EPSILON = 0.0001;
let LAST_COMBAT_MOVE_RESET_KEY = "";
const PLAYER_ZERO_PV_STATUS_CANDIDATES = ["bleeding", "bleed", "bloodied"];
const NPC_ZERO_PV_STATUS_CANDIDATES = ["dead", "defeated", "death", "mort"];

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
}

function normalizeNonNegativeInteger(value, fallback = 0) {
  return Math.max(0, Math.floor(toFiniteNumber(value, fallback)));
}

function normalizeRollDieFormula(value, fallback = "d4") {
  const raw = String(value ?? fallback ?? "d4").trim();
  if (!raw) return "1d4";
  return /^\d/.test(raw) ? raw : `1${raw}`;
}

function waitMs(ms) {
  const delay = Math.max(0, Math.floor(toFiniteNumber(ms, 0)));
  if (!delay) return Promise.resolve();
  return new Promise(resolve => setTimeout(resolve, delay));
}

function isAudioEnabledItemType(itemType) {
  const type = String(itemType || "").trim().toLowerCase();
  return AUDIO_ENABLED_ITEM_TYPES.has(type);
}

function normalizeItemAudioFile(value) {
  const path = String(value || "").trim();
  if (!path) return "";
  const cleanPath = path.split("#")[0].split("?")[0].trim();
  if (!cleanPath || !AUDIO_FILE_EXTENSION_PATTERN.test(cleanPath)) return "";
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
      || foundry.utils.getProperty(updateData, path) !== undefined;
    if (!hasUpdateData) return { changed: false, invalid: false };
    const rawValue = foundry.utils.getProperty(updateData, path);
    const wasProvided = String(rawValue || "").trim().length > 0;
    const normalized = normalizeItemAudioFile(rawValue);
    foundry.utils.setProperty(updateData, path, normalized);
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

async function playItemAudio(item, options = {}) {
  if (!item || !isAudioEnabledItemType(item.type)) return false;
  const requestedDelay = Number(options?.delayMs);
  const delayMs = Number.isFinite(requestedDelay)
    ? Math.max(0, Math.floor(requestedDelay))
    : ITEM_AUDIO_POST_ROLL_DELAY_MS;
  const rawAudioFile = String(item.system?.audioFile || "").trim();
  if (!rawAudioFile) return false;
  const audioFile = normalizeItemAudioFile(rawAudioFile);
  const itemName = getItemAudioName(item);

  if (delayMs > 0) await waitMs(delayMs);

  if (!audioFile) {
    ui.notifications?.error(t("BLOODMAN.Notifications.ItemAudioInvalid", { item: itemName }));
    return false;
  }

  if (typeof AudioHelper?.play !== "function") {
    ui.notifications?.error(t("BLOODMAN.Notifications.ItemAudioInvalid", { item: itemName }));
    return false;
  }

  try {
    await AudioHelper.play({ src: audioFile, volume: 0.9, autoplay: true, loop: false }, false);
    return true;
  } catch (error) {
    console.error("[bloodman] audio:play failed", { itemType: item.type, itemId: item.id, audioFile, error });
    ui.notifications?.error(t("BLOODMAN.Notifications.ItemAudioInvalid", { item: itemName }));
    return false;
  }
}

function buildDefaultCharacteristics() {
  const characteristics = {};
  for (const c of CHARACTERISTICS) characteristics[c.key] = { base: 50, xp: [false, false, false] };
  return characteristics;
}

function buildDefaultModifiers() {
  const modifiers = { label: "", all: 0 };
  for (const c of CHARACTERISTICS) modifiers[c.key] = 0;
  return modifiers;
}

function buildDefaultResources(options = {}) {
  const includeVoyage = options.includeVoyage !== false;
  const resources = {
    pv: { current: 0, max: 0, itemBonus: 0 },
    pp: { current: 0, max: 0, itemBonus: 0 },
    move: { value: 0, max: 0 }
  };
  if (includeVoyage) {
    resources.voyage = { current: 0, total: 0, max: 0 };
  }
  return resources;
}

function buildDefaultAmmo() {
  return { type: "", value: 0 };
}

function buildDefaultProfile() {
  return {
    archetype: "",
    archetypeBonusValue: 0,
    archetypeBonusCharacteristic: "",
    vice: "",
    poids: "",
    taille: "",
    age: "",
    origine: "",
    historique: "",
    notes: "",
    aptitudes: "",
    pouvoirs: ""
  };
}

function buildDefaultEquipment() {
  return {
    monnaies: "",
    transports: "",
    transportNpcs: []
  };
}

function isMissingTokenImage(src) {
  return !src || src === "icons/svg/mystery-man.svg";
}

function normalizeCharacteristicKey(value) {
  const key = String(value || "").trim().toUpperCase();
  return CHARACTERISTIC_KEYS.has(key) ? key : "";
}

function normalizeArchetypeBonusValue(value, fallback = 0) {
  if (value == null || value === "") return Math.trunc(toFiniteNumber(fallback, 0));
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return Number.NaN;
  return Math.trunc(numeric);
}

function getArchetypeCharacteristicBonus(profile, characteristicKey) {
  const key = normalizeCharacteristicKey(characteristicKey);
  if (!key) return 0;
  const selectedKey = normalizeCharacteristicKey(profile?.archetypeBonusCharacteristic);
  if (!selectedKey || selectedKey !== key) return 0;
  const value = normalizeArchetypeBonusValue(profile?.archetypeBonusValue, 0);
  return Number.isFinite(value) ? value : 0;
}

function getActorArchetypeBonus(actor, characteristicKey) {
  return getArchetypeCharacteristicBonus(actor?.system?.profile || {}, characteristicKey);
}

const TOKEN_TEXTURE_VALIDITY_CACHE = new Map();

async function canLoadTextureSource(src) {
  if (!src) return false;
  const key = String(src).trim();
  if (!key) return false;
  if (TOKEN_TEXTURE_VALIDITY_CACHE.has(key)) return TOKEN_TEXTURE_VALIDITY_CACHE.get(key);
  try {
    await loadTexture(key);
    TOKEN_TEXTURE_VALIDITY_CACHE.set(key, true);
    return true;
  } catch (_error) {
    TOKEN_TEXTURE_VALIDITY_CACHE.set(key, false);
    return false;
  }
}

async function needsTokenImageRepair(src) {
  if (isMissingTokenImage(src)) return true;
  return !(await canLoadTextureSource(src));
}

function getTokenActorImage(tokenDoc) {
  if (!tokenDoc) return "";
  const direct = tokenDoc.actor?.img;
  if (direct) return direct;
  const byId = tokenDoc.actorId ? game.actors?.get(tokenDoc.actorId)?.img : "";
  return byId || "";
}

function getSafeTokenTextureFallback(tokenDoc) {
  const actorImg = getTokenActorImage(tokenDoc);
  if (actorImg) return actorImg;
  return "icons/svg/mystery-man.svg";
}

async function repairTokenTextureSource(tokenLike) {
  if (!game.user?.isGM) return false;
  const tokenDoc = tokenLike?.document || tokenLike;
  if (!tokenDoc?.update) return false;
  const currentSrc = String(foundry.utils.getProperty(tokenDoc, "texture.src") || "");
  if (!(await needsTokenImageRepair(currentSrc))) return false;

  const actorSrc = getTokenActorImage(tokenDoc);
  const fallbackSrc = "icons/svg/mystery-man.svg";
  const actorSrcValid = actorSrc ? await canLoadTextureSource(actorSrc) : false;
  const nextSrc = actorSrcValid ? actorSrc : fallbackSrc;
  if (!nextSrc || nextSrc === currentSrc) return false;
  try {
    await tokenDoc.update({ "texture.src": nextSrc });
    return true;
  } catch (_error) {
    return false;
  }
}

function getActiveNonGMCount() {
  return game.users?.filter(user => user.active && !user.isGM).length || 0;
}

function getPlayerCountOnScene() {
  const scene = globalThis.canvas?.scene || game.scenes?.active;
  if (!scene) {
    const activePlayers = getActiveNonGMCount();
    return Math.max(1, activePlayers);
  }
  const tokens = scene.tokens?.contents || Array.from(scene.tokens || []);
  let count = 0;
  for (const token of tokens) {
    const actorType = token?.actor?.type
      || (token?.actorId ? game.actors?.get(token.actorId)?.type : "");
    if (actorType === "personnage") count += 1;
  }
  if (count > 0) return count;
  const activePlayers = getActiveNonGMCount();
  return Math.max(1, activePlayers);
}

function getProtectionPA(actor) {
  if (!actor?.items) return 0;
  let total = 0;
  for (const item of actor.items) {
    if (item.type !== "protection") continue;
    const pa = Number(item.system?.pa || 0);
    if (Number.isFinite(pa)) total += pa;
  }
  return total;
}

function getDerivedPvMax(actor, phyEffective, roleOverride) {
  if (actor?.type !== "personnage-non-joueur") return Math.round(phyEffective / 5);
  const role = ((roleOverride ?? actor.system?.npcRole) || "").toString();
  if (role === "sbire") return Math.round(phyEffective / 10);
  if (role === "sbire-fort") return Math.round(phyEffective / 5);
  if (role === "boss-seul") return Math.round(phyEffective / 5) * getPlayerCountOnScene();
  return Math.round(phyEffective / 5);
}

async function refreshBossSoloNpcPvMax() {
  if (!game.user.isGM) return;
  for (const actor of game.actors || []) {
    if (actor?.type !== "personnage-non-joueur") continue;
    if (String(actor.system?.npcRole || "") !== "boss-seul") continue;

    const itemBonuses = getItemBonusTotals(actor);
    const phyEffective = toFiniteNumber(actor.system.characteristics?.PHY?.base, 0)
      + toFiniteNumber(actor.system.modifiers?.all, 0)
      + toFiniteNumber(actor.system.modifiers?.PHY, 0)
      + toFiniteNumber(itemBonuses.PHY, 0)
      + getActorArchetypeBonus(actor, "PHY");
    const storedPvBonus = toFiniteNumber(actor.system.resources?.pv?.itemBonus, 0);
    const nextPvMax = Math.max(0, getDerivedPvMax(actor, phyEffective) + storedPvBonus);
    const currentPvMax = toFiniteNumber(actor.system.resources?.pv?.max, nextPvMax);
    const currentPv = toFiniteNumber(actor.system.resources?.pv?.current, 0);

    const updates = {};
    if (nextPvMax !== currentPvMax) updates["system.resources.pv.max"] = nextPvMax;
    if (currentPv > nextPvMax) updates["system.resources.pv.current"] = nextPvMax;
    if (Object.keys(updates).length) await actor.update(updates);
  }
}

const PROCESSED_DAMAGE_REQUESTS = new Map();
const PROCESSED_CHAOS_REQUESTS = new Map();
const PROCESSED_REROLL_REQUESTS = new Map();
const PROCESSED_VOYANCE_REQUESTS = new Map();
const INITIATIVE_GROUP_BUFFER = new Map();
const VOYANCE_OVERLAY_ID = "bm-voyance-overlay";
const VOYANCE_STYLE_ID = "bm-voyance-style";
const VOYANCE_AUTO_CLOSE_MS = 6500;
const VOYANCE_DEFAULT_BACKGROUND_SRC = "systems/bloodman/images/des_destin.png";
const VOYANCE_REQUEST_CHAT_MARKUP = "<span style='display:none'>bloodman-voyance-request</span>";

function rememberDamageRequest(requestId) {
  if (!requestId) return;
  const now = Date.now();
  PROCESSED_DAMAGE_REQUESTS.set(requestId, now);
  for (const [key, value] of PROCESSED_DAMAGE_REQUESTS.entries()) {
    if (now - value > DAMAGE_REQUEST_RETENTION_MS) PROCESSED_DAMAGE_REQUESTS.delete(key);
  }
}

function wasDamageRequestProcessed(requestId) {
  if (!requestId) return false;
  return PROCESSED_DAMAGE_REQUESTS.has(requestId);
}

function rememberChaosRequest(requestId) {
  if (!requestId) return;
  const now = Date.now();
  PROCESSED_CHAOS_REQUESTS.set(requestId, now);
  for (const [key, value] of PROCESSED_CHAOS_REQUESTS.entries()) {
    if (now - value > DAMAGE_REQUEST_RETENTION_MS) PROCESSED_CHAOS_REQUESTS.delete(key);
  }
}

function wasChaosRequestProcessed(requestId) {
  if (!requestId) return false;
  return PROCESSED_CHAOS_REQUESTS.has(requestId);
}

function rememberRerollRequest(requestId) {
  if (!requestId) return;
  const now = Date.now();
  PROCESSED_REROLL_REQUESTS.set(requestId, now);
  for (const [key, value] of PROCESSED_REROLL_REQUESTS.entries()) {
    if (now - value > DAMAGE_REQUEST_RETENTION_MS) PROCESSED_REROLL_REQUESTS.delete(key);
  }
}

function wasRerollRequestProcessed(requestId) {
  if (!requestId) return false;
  return PROCESSED_REROLL_REQUESTS.has(requestId);
}

function rememberVoyanceRequest(requestId) {
  if (!requestId) return;
  const now = Date.now();
  PROCESSED_VOYANCE_REQUESTS.set(requestId, now);
  for (const [key, value] of PROCESSED_VOYANCE_REQUESTS.entries()) {
    if (now - value > DAMAGE_REQUEST_RETENTION_MS) PROCESSED_VOYANCE_REQUESTS.delete(key);
  }
}

function wasVoyanceRequestProcessed(requestId) {
  if (!requestId) return false;
  return PROCESSED_VOYANCE_REQUESTS.has(requestId);
}

function normalizeVoyanceAnswer(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "oui" ? "oui" : "non";
}

function normalizeDelay(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return Math.floor(numeric);
}

async function canDisplayImageSource(src) {
  const candidate = String(src || "").trim();
  if (!candidate) return false;
  return new Promise(resolve => {
    const img = new Image();
    const done = ok => {
      img.onload = null;
      img.onerror = null;
      resolve(ok);
    };
    img.onload = () => done(true);
    img.onerror = () => done(false);
    img.src = candidate;
  });
}

function clearVoyanceOverlay() {
  document.getElementById(VOYANCE_OVERLAY_ID)?.remove();
}

function ensureVoyanceOverlayStyles() {
  if (document.getElementById(VOYANCE_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = VOYANCE_STYLE_ID;
  style.textContent = `
    #${VOYANCE_OVERLAY_ID} {
      position: fixed;
      inset: 0;
      z-index: 15000;
      display: grid;
      place-items: center;
    }
    #${VOYANCE_OVERLAY_ID} .bm-voyance-backdrop {
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at center, rgba(10, 8, 12, 0.45), rgba(0, 0, 0, 0.82));
      backdrop-filter: blur(2px);
    }
    #${VOYANCE_OVERLAY_ID} .bm-voyance-panel {
      position: relative;
      width: min(72vh, 52vw, 640px);
      max-width: 90vw;
      animation: bmFadeUp 320ms ease-out;
    }
    #${VOYANCE_OVERLAY_ID} .bm-voyance-bg {
      width: 100%;
      height: auto;
      display: block;
      filter: drop-shadow(0 18px 28px rgba(0, 0, 0, 0.55));
      user-select: none;
    }
    #${VOYANCE_OVERLAY_ID} .bm-voyance-crystal {
      position: absolute;
      left: 50%;
      top: 49.1%;
      width: 17.8%;
      aspect-ratio: 1;
      transform: translate(-50%, -50%);
      display: grid;
      place-items: center;
      pointer-events: none;
    }
    #${VOYANCE_OVERLAY_ID} .bm-voyance-answer-holder {
      width: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    #${VOYANCE_OVERLAY_ID} .bm-voyance-answer-image {
      width: 80%;
      height: auto;
      object-fit: contain;
    }
    #${VOYANCE_OVERLAY_ID} .bm-voyance-answer-text {
      position: relative;
      display: block;
      --bm-oracle-x: 0px;
      color: #1a1423;
      font-family: "Cinzel Decorative", "Georgia", serif;
      font-size: clamp(28px, 4.1vw, 50px);
      font-weight: 700;
      letter-spacing: 0.06em;
      line-height: 0.88;
      text-align: center;
      text-transform: uppercase;
      text-shadow:
        0 0 6px rgba(255, 255, 255, 0.95),
        0 0 14px rgba(255, 228, 150, 0.9),
        0 0 24px rgba(151, 224, 255, 0.6);
      filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.4));
    }
    #${VOYANCE_OVERLAY_ID} .bm-voyance-answer-text.is-oui {
      --bm-oracle-x: -1px;
    }
    #${VOYANCE_OVERLAY_ID} .bm-voyance-answer-text.is-non {
      --bm-oracle-x: -5px;
    }
    #${VOYANCE_OVERLAY_ID} .bm-voyance-oracle-text {
      animation: bmBounceIn 760ms cubic-bezier(.2,.8,.2,1) both, bmOracleFloat 2.5s ease-in-out 820ms infinite;
    }
    #${VOYANCE_OVERLAY_ID} .bm-voyance-oracle-text::before {
      content: "";
      position: absolute;
      inset: -0.34em -0.48em;
      border-radius: 999px;
      background:
        radial-gradient(circle, rgba(255, 251, 235, 0.92) 0%, rgba(255, 240, 187, 0.64) 42%, rgba(150, 222, 255, 0.12) 78%, rgba(150, 222, 255, 0) 100%);
      filter: blur(1.6px);
      z-index: -1;
      animation: bmOracleGlow 2.1s ease-in-out 880ms infinite;
    }
    #${VOYANCE_OVERLAY_ID} .bm-bounce-in {
      animation: bmBounceIn 760ms cubic-bezier(.2,.8,.2,1) both;
    }
    @keyframes bmFadeUp {
      from { opacity: 0; transform: translateY(12px) scale(0.99); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes bmBounceIn {
      0% { transform: translateX(var(--bm-oracle-x, 0px)) scale(0.2); opacity: 0; }
      45% { transform: translateX(var(--bm-oracle-x, 0px)) scale(1.18); opacity: 1; }
      72% { transform: translateX(var(--bm-oracle-x, 0px)) scale(0.88); }
      100% { transform: translateX(var(--bm-oracle-x, 0px)) scale(1); opacity: 1; }
    }
    @keyframes bmOracleFloat {
      0%, 100% { transform: translateX(var(--bm-oracle-x, 0px)) translateY(0) scale(1); }
      50% { transform: translateX(var(--bm-oracle-x, 0px)) translateY(-2px) scale(1.01); }
    }
    @keyframes bmOracleGlow {
      0%, 100% { opacity: 0.7; }
      50% { opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

async function showVoyanceOverlay(payload = {}) {
  const backgroundSrc = VOYANCE_DEFAULT_BACKGROUND_SRC;
  const hasBackground = await canDisplayImageSource(backgroundSrc);
  if (!hasBackground) {
    ui.notifications?.error(`Image de fond introuvable: ${backgroundSrc}`);
    return false;
  }

  clearVoyanceOverlay();
  ensureVoyanceOverlayStyles();

  const answer = normalizeVoyanceAnswer(payload.answer);
  const answerUpper = answer === "oui" ? "OUI" : "NON";

  const overlay = document.createElement("div");
  overlay.id = VOYANCE_OVERLAY_ID;
  overlay.innerHTML = `
    <div class="bm-voyance-backdrop"></div>
    <div class="bm-voyance-panel">
      <img class="bm-voyance-bg" src="${backgroundSrc}" alt="Automate de voyance" />
      <div class="bm-voyance-crystal" aria-live="polite"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const panelShown = Boolean(document.querySelector(`#${VOYANCE_OVERLAY_ID} .bm-voyance-panel`));
  if (!panelShown) {
    ui.notifications?.error("Affichage de l'automate echoue. Macro interrompue.");
    clearVoyanceOverlay();
    return false;
  }

  const answerDelayMs = normalizeDelay(payload.answerDelayMs, 240);
  await new Promise(resolve => setTimeout(resolve, answerDelayMs));
  const crystal = overlay.querySelector(".bm-voyance-crystal");
  if (!crystal) {
    ui.notifications?.error("Zone de boule de cristal introuvable.");
    clearVoyanceOverlay();
    return false;
  }

  const holder = document.createElement("div");
  holder.className = "bm-voyance-answer-holder";
  const text = document.createElement("div");
  text.className = `bm-voyance-answer-text bm-voyance-oracle-text ${answer === "non" ? "is-non" : "is-oui"}`;
  text.textContent = answerUpper;
  holder.appendChild(text);
  crystal.appendChild(holder);

  const answerShown = crystal.children.length > 0;
  if (!answerShown) {
    ui.notifications?.error("Affichage de la reponse echoue.");
    clearVoyanceOverlay();
    return false;
  }

  const close = () => clearVoyanceOverlay();
  overlay.addEventListener("click", close, { once: true });
  const autoCloseMs = normalizeDelay(payload.autoCloseMs, VOYANCE_AUTO_CLOSE_MS);
  setTimeout(close, autoCloseMs);
  return true;
}

async function handleVoyanceOverlayRequest(data, source = "socket") {
  const requestId = String(data?.requestId || "").trim();
  if (requestId && wasVoyanceRequestProcessed(requestId)) return false;
  if (requestId) rememberVoyanceRequest(requestId);

  const payload = {
    answer: data?.answer,
    backgroundSrc: data?.backgroundSrc,
    answerSrc: data?.answerSrc,
    autoCloseMs: data?.autoCloseMs,
    answerDelayMs: data?.answerDelayMs
  };
  const shown = await showVoyanceOverlay(payload);
  if (!shown) {
    console.warn("[bloodman] voyance:display failed", { source, requestId, payload });
  }
  return shown;
}
globalThis.__bmShowVoyanceOverlay = showVoyanceOverlay;
globalThis.__bmHandleVoyanceOverlayRequest = handleVoyanceOverlayRequest;

function isInitiativeRollMessage(message) {
  if (!message) return false;
  if (foundry.utils.getProperty(message, "flags.bloodman.initiativeGroupSummary")) return false;
  const coreFlag = foundry.utils.getProperty(message, "flags.core.initiativeRoll");
  if (coreFlag != null) return Boolean(coreFlag);
  if (!message.speaker?.combatant) return false;
  if (!Array.isArray(message.rolls) || message.rolls.length === 0) return false;
  const flavor = String(message.flavor || "").toLowerCase();
  return flavor.includes("initiative");
}

function getInitiativeRollTotalFromMessage(message, combat) {
  const roll = Array.isArray(message?.rolls) && message.rolls.length ? message.rolls[0] : null;
  const total = Number(roll?.total);
  if (Number.isFinite(total)) return total;
  const combatantId = message?.speaker?.combatant;
  const combatant = combatantId ? combat?.combatants?.get(combatantId) : null;
  const initiative = Number(combatant?.initiative);
  return Number.isFinite(initiative) ? initiative : 0;
}

function getInitiativeNameFromMessage(message, combat) {
  const combatantId = message?.speaker?.combatant;
  const combatant = combatantId ? combat?.combatants?.get(combatantId) : null;
  if (combatant) return getCombatantDisplayName(combatant) || combatant.name || message?.speaker?.alias || "Combattant";
  return message?.speaker?.alias || message?.alias || "Combattant";
}

async function flushInitiativeGroupBuffer(key) {
  const entry = INITIATIVE_GROUP_BUFFER.get(key);
  if (!entry) return;
  INITIATIVE_GROUP_BUFFER.delete(key);
  const messages = entry.messages.filter(message => message && !message.deleted);
  if (messages.length <= 1) return;

  const combat = game.combats?.get(entry.combatId) || game.combat || null;
  const rows = messages.map(message => ({
    name: getInitiativeNameFromMessage(message, combat),
    total: getInitiativeRollTotalFromMessage(message, combat)
  }));
  rows.sort((a, b) => Number(b.total) - Number(a.total));

  const contentRows = rows
    .map(row => `<li><b>${row.name}</b> : ${row.total}</li>`)
    .join("");
  await ChatMessage.create({
    speaker: { alias: combat?.name || "Initiative" },
    content: `<div class="bm-initiative-group"><p><b>Initiatives (Lancer pour tous)</b></p><ul>${contentRows}</ul></div>`,
    flags: { bloodman: { initiativeGroupSummary: true } }
  }).catch(() => null);

  for (const message of messages) {
    if (!message?.id || !message.isOwner) continue;
    await message.delete().catch(() => null);
  }
}

function queueInitiativeRollMessage(message) {
  const combatId = String(message?.speaker?.combat || game.combat?.id || "");
  if (!combatId) return;
  const key = `${combatId}:${game.user?.id || ""}`;
  const existing = INITIATIVE_GROUP_BUFFER.get(key);
  if (existing) {
    existing.messages.push(message);
    if (existing.timer) clearTimeout(existing.timer);
    existing.timer = setTimeout(() => {
      flushInitiativeGroupBuffer(key);
    }, INITIATIVE_GROUP_BUFFER_MS);
    return;
  }
  const timer = setTimeout(() => {
    flushInitiativeGroupBuffer(key);
  }, INITIATIVE_GROUP_BUFFER_MS);
  INITIATIVE_GROUP_BUFFER.set(key, { combatId, messages: [message], timer });
}

function getDamagePayloadField(data, keys = []) {
  if (!data || !Array.isArray(keys)) return undefined;
  for (const key of keys) {
    const value = data?.[key];
    if (value == null || value === "") continue;
    return value;
  }
  return undefined;
}

function toBooleanFlag(value) {
  if (value === true) return true;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";
  return false;
}

function normalizeRerollTarget(target, { includeAliases = false } = {}) {
  const source = target && typeof target === "object" ? target : {};
  const tokenId = String(getDamagePayloadField(source, ["tokenId", "tokenid", "token_id"]) || "");
  const tokenUuid = String(getDamagePayloadField(source, ["tokenUuid", "tokenuuid", "token_uuid"]) || "");
  const sceneId = String(getDamagePayloadField(source, ["sceneId", "sceneid", "scene_id"]) || "");
  const actorId = String(getDamagePayloadField(source, ["actorId", "actorid", "actor_id"]) || "");
  const targetActorLink = toBooleanFlag(
    getDamagePayloadField(source, ["targetActorLink", "targetactorlink", "target_actor_link"])
  );

  const normalized = {
    ...source,
    tokenId,
    tokenUuid,
    sceneId,
    actorId,
    targetActorLink
  };

  if (includeAliases) {
    normalized.tokenid = tokenId;
    normalized.tokenuuid = tokenUuid;
    normalized.sceneid = sceneId;
    normalized.actorid = actorId;
    normalized.targetactorlink = targetActorLink;
  }

  return normalized;
}

function normalizeRerollTargets(targets, { includeAliases = false } = {}) {
  if (!Array.isArray(targets)) return [];
  return targets.map(target => normalizeRerollTarget(target, { includeAliases }));
}

function buildFallbackRerollTargets(selectedTargets, requestedTotal) {
  const selected = Array.isArray(selectedTargets) ? selectedTargets : [];
  if (!selected.length) return [];
  const baseShare = selected.length > 0 ? Math.floor(requestedTotal / selected.length) : 0;
  let remainder = Math.max(0, requestedTotal - baseShare * selected.length);

  return selected.map(token => {
    const tokenDoc = token?.document || token;
    const bonus = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    return normalizeRerollTarget({
      tokenId: tokenDoc?.id || token?.id || "",
      tokenUuid: tokenDoc?.uuid || "",
      sceneId: tokenDoc?.parent?.id || tokenDoc?.scene?.id || canvas?.scene?.id || "",
      actorId: tokenDoc?.actorId || token?.actor?.id || "",
      targetActorLink: Boolean(tokenDoc?.actorLink),
      targetName: resolveCombatTargetName(tokenDoc?.name || token?.name, token?.actor?.name, "Cible"),
      share: Math.max(0, baseShare + bonus),
      baseShare: Math.max(0, baseShare + bonus),
      hpBefore: Number(getTokenCurrentPv(tokenDoc)),
      hpAfter: Number.NaN,
      pending: true
    });
  }).filter(target => Number(target.share) > 0);
}

async function resolveDamageTokenDocument(data) {
  if (!data) return null;
  const tokenUuid = String(getDamagePayloadField(data, ["tokenUuid", "tokenuuid", "token_uuid"]) || "");
  if (tokenUuid) {
    const resolved = await fromUuid(tokenUuid).catch(() => null);
    const tokenDoc = resolved?.document || resolved || null;
    if (tokenDoc) return tokenDoc;
  }
  const sceneId = String(getDamagePayloadField(data, ["sceneId", "sceneid", "scene_id"]) || "");
  const tokenId = String(getDamagePayloadField(data, ["tokenId", "tokenid", "token_id"]) || "");
  if (sceneId && tokenId) {
    const scene = game.scenes?.get(sceneId);
    const tokenDoc = scene?.tokens?.get(tokenId) || null;
    if (tokenDoc) return tokenDoc;
  }
  if (tokenId) {
    const activeTokenDoc = canvas?.scene?.tokens?.get(tokenId) || null;
    if (activeTokenDoc) return activeTokenDoc;
    for (const scene of game.scenes || []) {
      const candidate = scene?.tokens?.get(tokenId);
      if (candidate) return candidate;
    }
  }

  const actorId = String(getDamagePayloadField(data, ["actorId", "actorid", "actor_id"]) || "");
  if (actorId) {
    const targetNameRaw = String(getDamagePayloadField(data, ["targetName", "targetname", "target_name"]) || "").trim().toLowerCase();
    const scenes = sceneId ? [game.scenes?.get(sceneId)].filter(Boolean) : Array.from(game.scenes || []);
    const actorMatches = [];
    for (const scene of scenes) {
      for (const tokenDoc of scene?.tokens || []) {
        if (String(tokenDoc?.actorId || "") !== actorId) continue;
        actorMatches.push(tokenDoc);
      }
    }
    if (actorMatches.length === 1) return actorMatches[0];
    if (targetNameRaw) {
      const named = actorMatches.filter(tokenDoc => {
        const tokenName = String(tokenDoc?.name || "").trim().toLowerCase();
        const actorName = String(tokenDoc?.actor?.name || "").trim().toLowerCase();
        return tokenName === targetNameRaw || actorName === targetNameRaw;
      });
      if (named.length === 1) return named[0];
    }
  }
  return null;
}

async function resolveDamageActors(tokenDoc, data) {
  let tokenActor = tokenDoc?.actor || null;
  if (!tokenActor && tokenDoc && typeof tokenDoc.getActor === "function") {
    tokenActor = await tokenDoc.getActor().catch(() => null);
  }
  if (!tokenActor && tokenDoc?.object?.actor) tokenActor = tokenDoc.object.actor;

  const actorUuid = String(getDamagePayloadField(data, ["actorUuid", "actoruuid", "actor_uuid"]) || "");
  const actorId = String(getDamagePayloadField(data, ["actorId", "actorid", "actor_id"]) || "");
  const uuidActor = actorUuid ? await fromUuid(actorUuid).catch(() => null) : null;
  const worldActor = actorId ? game.actors.get(actorId) : null;
  return { tokenActor, uuidActor, worldActor };
}

function resolveDamageCurrent(tokenDoc, tokenActor, fallbackCurrent) {
  if (Number.isFinite(fallbackCurrent)) return fallbackCurrent;
  const tokenActorCurrent = Number(tokenActor?.system?.resources?.pv?.current);
  if (Number.isFinite(tokenActorCurrent)) return tokenActorCurrent;
  const tokenDeltaCurrent = Number(foundry.utils.getProperty(tokenDoc, "delta.system.resources.pv.current"));
  if (Number.isFinite(tokenDeltaCurrent)) return tokenDeltaCurrent;
  const tokenActorDataCurrent = Number(foundry.utils.getProperty(tokenDoc, "actorData.system.resources.pv.current"));
  return tokenActorDataCurrent;
}

function getRerollTargetKey(target) {
  if (!target) return "";
  return String(
    getDamagePayloadField(target, [
      "tokenUuid", "tokenuuid", "token_uuid",
      "tokenId", "tokenid", "token_id",
      "actorId", "actorid", "actor_id"
    ]) || ""
  );
}

function isSameRerollTarget(a, b) {
  if (!a || !b) return false;
  const keyA = getRerollTargetKey(a);
  const keyB = getRerollTargetKey(b);
  if (keyA && keyB) return keyA === keyB;
  const actorA = String(getDamagePayloadField(a, ["actorId", "actorid", "actor_id"]) || "");
  const actorB = String(getDamagePayloadField(b, ["actorId", "actorid", "actor_id"]) || "");
  if (actorA && actorB) return actorA === actorB;
  const tokenA = String(getDamagePayloadField(a, ["tokenId", "tokenid", "token_id"]) || "");
  const tokenB = String(getDamagePayloadField(b, ["tokenId", "tokenid", "token_id"]) || "");
  if (tokenA && tokenB) return tokenA === tokenB;
  const uuidA = String(getDamagePayloadField(a, ["tokenUuid", "tokenuuid", "token_uuid"]) || "");
  const uuidB = String(getDamagePayloadField(b, ["tokenUuid", "tokenuuid", "token_uuid"]) || "");
  return Boolean(uuidA && uuidB && uuidA === uuidB);
}

function isDamageRerollContextReady(context) {
  if (!context || !Array.isArray(context.targets) || context.targets.length === 0) return false;
  return context.targets.every(target => Number.isFinite(Number(target.hpBefore)));
}

function buildRerollAllocations(context, totalDamage) {
  const targets = Array.isArray(context?.targets) ? context.targets : [];
  if (targets.length === 0) return [];
  if (targets.length === 1) {
    const baseShare = Math.max(0, Math.floor(Number(targets[0]?.baseShare ?? targets[0]?.share ?? 0)));
    return [{ ...targets[0], baseShare, share: Math.max(0, Math.floor(totalDamage)) }];
  }
  const originalTotal = Number(context.totalDamage || 0);
  let remaining = Math.max(0, Math.floor(totalDamage));
  const allocations = targets.map((target, index) => {
    let share = 0;
    if (Number.isFinite(originalTotal) && originalTotal > 0) {
      if (index === targets.length - 1) {
        share = remaining;
      } else {
        const ratio = Number(target.share || 0) / originalTotal;
        share = Math.max(0, Math.floor(totalDamage * ratio));
        remaining = Math.max(0, remaining - share);
      }
    } else {
      share = index === targets.length - 1 ? remaining : 0;
      remaining = Math.max(0, remaining - share);
    }
    const baseShare = Math.max(0, Math.floor(Number(target?.baseShare ?? target?.share ?? 0)));
    return { ...target, baseShare, share };
  });
  return allocations;
}

function getRollValuesFromRoll(roll) {
  const values = [];
  for (const die of roll?.dice || []) {
    for (const result of die?.results || []) {
      const value = Number(result?.result);
      if (Number.isFinite(value)) values.push(value);
    }
  }
  return values;
}

function emitDamageAppliedMessage(data, result, tokenDoc, share) {
  const attackerUserId = String(data.attackerUserId || "");
  if (!game.socket || !result) return;
  const tokenId = tokenDoc?.id || String(data.tokenId || "");
  const tokenUuid = tokenDoc?.uuid || String(data.tokenUuid || "");
  const sceneId = tokenDoc?.parent?.id || tokenDoc?.scene?.id || String(data.sceneId || "");
  const actorId = tokenDoc?.actorId || String(data.actorId || "");
  const targetActorLink = tokenDoc ? Boolean(tokenDoc.actorLink) : data.targetActorLink === true;
  const targetName = resolveCombatTargetName(
    tokenDoc?.name || data.targetName,
    tokenDoc?.actor?.name,
    data.targetName || tokenDoc?.name || ""
  );
  game.socket.emit(SYSTEM_SOCKET, {
    type: "damageApplied",
    kind: String(data.kind || "item-damage"),
    rerollUsed: Boolean(data.rerollUsed),
    attackerUserId,
    attackerId: String(data.attackerId || data.attaquant_id || ""),
    rollId: String(data.rollId || ""),
    itemId: String(data.itemId || ""),
    itemName: String(data.itemName || ""),
    itemType: String(data.itemType || ""),
    damageFormula: String(data.damageFormula || ""),
    damageLabel: String(data.damageLabel || data.degats || "").trim().toUpperCase(),
    bonusBrut: Math.max(0, Math.floor(toFiniteNumber(data.bonus_brut ?? data.bonusBrut, 0))),
    penetration: Math.max(0, Math.floor(toFiniteNumber(data.penetration ?? data.penetration_plus, 0))),
    totalDamage: Number(data.totalDamage),
    target: {
      tokenId,
      tokenUuid,
      sceneId,
      actorId,
      targetActorLink,
      targetName,
      share: Math.max(0, Math.floor(Number(share) || 0)),
      hpBefore: Number(result.hpBefore),
      hpAfter: Number(result.hpAfter),
      finalDamage: Number(result.finalDamage)
    }
  });
}

async function handleDamageAppliedMessage(data) {
  if (!data) return;
  const attackerUserId = String(data.attackerUserId || "");
  const localUserId = String(game.user?.id || "");
  if (attackerUserId && attackerUserId !== localUserId) return;
  const attackers = resolveAttackerActorInstancesForDamageApplied(data);
  if (!attackers.length) return;
  if (!attackerUserId && !attackers.some(actor => actor.isOwner)) return;
  const rollId = String(data.rollId || "");
  const itemId = String(data.itemId || "");
  const target = normalizeRerollTarget(data.target || {});
  const key = getRerollTargetKey(target);

  let context = attackers[0]?._lastDamageReroll;
  if (!context || context.rollId !== rollId) {
    context = {
      kind: String(data.kind || "item-damage"),
      rollId,
      itemId,
      itemType: String(data.itemType || ""),
      itemName: String(data.itemName || ""),
      attackerId: String(data.attackerId || data.attaquant_id || attackers[0]?.id || ""),
      attackerUserId: String(data.attackerUserId || ""),
      formula: String(data.damageFormula || "1d4"),
      degats: String(data.damageLabel || data.degats || "").trim().toUpperCase(),
      bonusBrut: Math.max(0, Math.floor(toFiniteNumber(data.bonusBrut ?? data.bonus_brut, 0))),
      penetration: Math.max(0, Math.floor(toFiniteNumber(data.penetration, 0))),
      totalDamage: Number(data.totalDamage),
      targets: []
    };
  }
  if (!context.itemId) context.itemId = itemId;
  if (!context.itemType && data.itemType) context.itemType = String(data.itemType);
  if (!context.itemType && context.itemId) {
    for (const attacker of attackers) {
      const candidateType = attacker?.items?.get(context.itemId)?.type;
      if (candidateType) {
        context.itemType = String(candidateType);
        break;
      }
    }
  }
  context.itemType = String(context.itemType || "").toLowerCase();
  context.kind = String(context.kind || "item-damage");
  if (!context.itemName && data.itemName) context.itemName = String(data.itemName);
  if (!context.formula && data.damageFormula) context.formula = String(data.damageFormula);
  if (!context.degats && (data.damageLabel || data.degats)) context.degats = String(data.damageLabel || data.degats).trim().toUpperCase();
  if (!Number.isFinite(Number(context.bonusBrut)) && Number.isFinite(Number(data.bonusBrut ?? data.bonus_brut))) {
    context.bonusBrut = Math.max(0, Math.floor(toFiniteNumber(data.bonusBrut ?? data.bonus_brut, 0)));
  }
  if (!Number.isFinite(Number(context.penetration)) && Number.isFinite(Number(data.penetration))) {
    context.penetration = Math.max(0, Math.floor(toFiniteNumber(data.penetration, 0)));
  }
  if (!Number.isFinite(Number(context.totalDamage)) && Number.isFinite(Number(data.totalDamage))) {
    context.totalDamage = Number(data.totalDamage);
  }

  const existing = context.targets.find(entry => isSameRerollTarget(entry, target));
  if (existing) {
    Object.assign(existing, target);
    if (!Number.isFinite(Number(existing.baseShare))) {
      existing.baseShare = Math.max(0, Math.floor(Number(existing.share || 0)));
    }
  } else if (key || target.actorId || target.tokenId || target.tokenUuid) {
    context.targets.push({
      ...target,
      baseShare: Math.max(0, Math.floor(Number(target.share || 0)))
    });
  }

  const itemRerollState = {
    itemId: context.itemId,
    rollId: context.rollId,
    at: Date.now(),
    damage: context
  };
  const actorInstances = [];
  const seen = new Set();
  for (const actor of attackers) {
    for (const instance of getActorInstancesById(actor.id)) {
      const keyRef = String(instance.uuid || `${instance.id}:${instance.parent?.uuid || instance.parent?.id || "world"}`);
      if (seen.has(keyRef)) continue;
      seen.add(keyRef);
      actorInstances.push(instance);
    }
  }
  if (!actorInstances.length) {
    for (const actor of attackers) {
      const keyRef = String(actor.uuid || `${actor.id}:${actor.parent?.uuid || actor.parent?.id || "world"}`);
      if (seen.has(keyRef)) continue;
      seen.add(keyRef);
      actorInstances.push(actor);
    }
  }
  for (const actorInstance of actorInstances) {
    actorInstance._lastDamageReroll = context;
    actorInstance._lastItemReroll = itemRerollState;
    if (actorInstance.sheet?.rendered) actorInstance.sheet.render(false);
  }
}

async function handleDamageRerollRequest(data) {
  if (!data || !game.user.isGM) return;
  const requestId = String(data.requestId || "");
  if (requestId && wasRerollRequestProcessed(requestId)) return;
  if (requestId) rememberRerollRequest(requestId);
  const kind = String(data.kind || "item-damage");
  if (kind !== "item-damage") return;
  let itemType = String(data.itemType || "").toLowerCase();
  if (!isDamageRerollItemType(itemType)) {
    const attacker = game.actors?.get(String(data.attackerId || ""));
    const item = attacker?.items?.get(String(data.itemId || ""));
    itemType = String(item?.type || itemType).toLowerCase();
  }
  if (!isDamageRerollItemType(itemType)) {
    console.warn("[bloodman] reroll:ignored non-damage item", {
      rollId: data.rollId,
      itemId: data.itemId,
      itemType
    });
    return;
  }
  const targets = normalizeRerollTargets(data.targets);
  if (!targets.length) return;
  const penetration = Math.max(0, Math.floor(toFiniteNumber(data.penetration, 0)));
  console.debug("[bloodman] reroll:recv", {
    attackerUserId: data.attackerUserId,
    attackerId: data.attackerId,
    rollId: data.rollId,
    itemId: data.itemId,
    totalDamage: data.totalDamage,
    penetration,
    targetCount: targets.length
  });

  for (const target of targets) {
    const share = Math.max(0, Math.floor(Number(target.share || 0)));
    const tokenDoc = await resolveDamageTokenDocument(target);
    if (!tokenDoc) {
      console.warn("[bloodman] reroll:target unresolved", {
        rollId: data.rollId,
        target
      });
    }
    const tokenIsLinked = tokenDoc ? Boolean(tokenDoc.actorLink) : toBooleanFlag(target.targetActorLink);
    const targetActor = tokenIsLinked
      ? (tokenDoc?.actor || (target.actorId ? game.actors?.get(target.actorId) : null))
      : null;
    const rawHpBefore = target?.hpBefore;
    let hpBefore = (rawHpBefore == null || rawHpBefore === "")
      ? Number.NaN
      : Number(rawHpBefore);
    if (!Number.isFinite(hpBefore)) {
      const referenceShare = Math.max(0, Math.floor(Number(target.baseShare ?? target.share ?? 0)));
      if (targetActor) {
        const currentHp = Number(targetActor.system?.resources?.pv?.current);
        if (Number.isFinite(currentHp)) {
          const paInitial = getProtectionPA(targetActor);
          const paEffective = Math.max(0, paInitial - penetration);
          const estimatedFinalDamage = Math.max(0, referenceShare - paEffective);
          hpBefore = currentHp + estimatedFinalDamage;
        }
      } else if (tokenDoc) {
        const currentHp = Number(getTokenCurrentPv(tokenDoc));
        if (Number.isFinite(currentHp)) {
          const paInitial = getProtectionPA(tokenDoc.actor || null);
          const paEffective = Math.max(0, paInitial - penetration);
          const estimatedFinalDamage = Math.max(0, referenceShare - paEffective);
          hpBefore = currentHp + estimatedFinalDamage;
        }
      }
    }
    if (Number.isFinite(hpBefore)) {
      if (tokenIsLinked && targetActor) {
        await targetActor.update({ "system.resources.pv.current": hpBefore });
      } else if (tokenDoc) {
        await tokenDoc.update({ "delta.system.resources.pv.current": hpBefore });
      }
      if (tokenDoc) {
        const actorType = getTokenActorType(tokenDoc);
        if (actorType) await syncZeroPvStatusForToken(tokenDoc, actorType, hpBefore);
      }
    }
    const restoredPv = tokenIsLinked && targetActor
      ? Number(targetActor.system?.resources?.pv?.current)
      : Number(getTokenCurrentPv(tokenDoc));
    const okRestored = Number.isFinite(hpBefore)
      ? validateNumericEquality(restoredPv, hpBefore)
      : false;

    const targetName = resolveCombatTargetName(
      target.targetName || tokenDoc?.name,
      targetActor?.name,
      "Cible"
    );
    let result = null;
    if (!share && Number.isFinite(hpBefore)) {
      result = {
        hpBefore,
        hpAfter: hpBefore,
        finalDamage: 0,
        penetration,
        paInitial: 0,
        paEffective: 0,
        pa: 0
      };
    } else if (tokenIsLinked && targetActor) {
      result = await applyDamageToActor(targetActor, share, { targetName, penetration });
    } else if (tokenDoc && Number.isFinite(hpBefore)) {
      const paInitial = getProtectionPA(tokenDoc.actor || null);
      const paEffective = Math.max(0, paInitial - penetration);
      const finalDamage = Math.max(0, share - paEffective);
      const nextValue = Math.max(0, hpBefore - finalDamage);
      await tokenDoc.update({ "delta.system.resources.pv.current": nextValue });
      ChatMessage.create({
        speaker: { alias: targetName },
        content: t("BLOODMAN.Rolls.Damage.Take", { name: targetName, amount: finalDamage, pa: paEffective })
      });
      result = {
        hpBefore,
        hpAfter: nextValue,
        finalDamage,
        penetration,
        paInitial,
        paEffective,
        pa: paEffective
      };
    }
    const expectedHpAfter = result
      ? Math.max(0, Number(hpBefore) - Math.max(0, Number(result.finalDamage || 0)))
      : Number.NaN;
    const okReapplied = result
      ? validateNumericEquality(result.hpAfter, expectedHpAfter)
      : false;
    logDamageRerollValidation("gm-socket-target", {
      rollId: data.rollId,
      itemId: data.itemId,
      itemType,
      targetName,
      share,
      hpBefore,
      restoredPv,
      okRestored,
      hpAfter: result?.hpAfter,
      expectedHpAfter,
      finalDamage: result?.finalDamage,
      okReapplied
    });

    if (result) {
      if (tokenDoc) {
        const actorType = getTokenActorType(tokenDoc);
        if (actorType && Number.isFinite(result.hpAfter)) {
          await syncZeroPvStatusForToken(tokenDoc, actorType, result.hpAfter);
        }
      }
      emitDamageAppliedMessage({ ...data, ...target }, result, tokenDoc, share);
    }
  }
}

async function handleIncomingDamageRequest(data, source = "socket") {
  if (!data || !game.user.isGM) return;
  const requestId = typeof data.requestId === "string" ? data.requestId : "";
  if (requestId && wasDamageRequestProcessed(requestId)) return;
  if (requestId) rememberDamageRequest(requestId);

  console.debug("[bloodman] damage:recv", { source, ...data });

  const tokenDoc = await resolveDamageTokenDocument(data);
  const { tokenActor, uuidActor, worldActor } = await resolveDamageActors(tokenDoc, data);
  const share = Number(data.damage);
  if (!Number.isFinite(share) || share <= 0) return;
  const penetration = Math.max(0, Math.floor(toFiniteNumber(data.penetration ?? data.penetration_plus, 0)));
  const tokenIsLinked = data.targetActorLink === true || tokenDoc?.actorLink === true;
  const fallbackCurrent = Number(data.targetPvCurrent);
  const fallbackPA = Number(data.targetPA);
  const fallbackName = resolveCombatTargetName(
    data.targetName || tokenDoc?.name,
    tokenActor?.name || uuidActor?.name || worldActor?.name,
    "Cible"
  );

  if (tokenDoc && !tokenIsLinked) {
    const current = resolveDamageCurrent(tokenDoc, tokenActor, fallbackCurrent);
    if (!Number.isFinite(current)) return;
    const paInitial = Number.isFinite(fallbackPA) ? fallbackPA : 0;
    const paEffective = Math.max(0, paInitial - penetration);
    const finalDamage = Math.max(0, share - paEffective);
    const nextValue = Math.max(0, current - finalDamage);
    console.debug("[bloodman] damage:apply token-unlinked", { current, paInitial, paEffective, penetration, share, finalDamage, nextValue, tokenId: tokenDoc.id });
    try {
      await tokenDoc.update({ "delta.system.resources.pv.current": nextValue });
    } catch (error) {
      console.error("[bloodman] damage:update tokenDoc failed", error);
    }
    ChatMessage.create({
      speaker: { alias: fallbackName },
      content: t("BLOODMAN.Rolls.Damage.Take", { name: fallbackName, amount: finalDamage, pa: paEffective })
    });
    const result = {
      finalDamage,
      penetration,
      paInitial,
      paEffective,
      hpBefore: current,
      hpAfter: nextValue
    };
    emitDamageAppliedMessage(data, result, tokenDoc, share);
    console.debug("[bloodman] damage:output", {
      degats_selectionnes: String(data.degats || data.damageLabel || data.damageFormula || "").toUpperCase(),
      jet_de: Array.isArray(data.rollResults) ? data.rollResults : [],
      bonus_brut: Math.max(0, Math.floor(toFiniteNumber(data.bonus_brut ?? data.bonusBrut, 0))),
      penetration,
      armure_initiale: paInitial,
      armure_effective: paEffective,
      degats_totaux: finalDamage,
      points_de_vie_avant: current,
      points_de_vie_apres: nextValue,
      icones_a_afficher: nextValue <= 0 ? [(tokenActor?.type === "personnage-non-joueur" ? "mort" : "sang")] : [],
      erreur: null
    });
    return;
  }

  if (tokenActor) {
    console.debug("[bloodman] damage:apply token-actor", { share, actorId: tokenActor.id, actorName: tokenActor.name });
    const result = await applyDamageToActor(tokenActor, share, { targetName: fallbackName, penetration });
    if (result) {
      emitDamageAppliedMessage(data, result, tokenDoc, share);
      console.debug("[bloodman] damage:output", {
        degats_selectionnes: String(data.degats || data.damageLabel || data.damageFormula || "").toUpperCase(),
        jet_de: Array.isArray(data.rollResults) ? data.rollResults : [],
        bonus_brut: Math.max(0, Math.floor(toFiniteNumber(data.bonus_brut ?? data.bonusBrut, 0))),
        penetration: result.penetration,
        armure_initiale: result.paInitial,
        armure_effective: result.paEffective,
        degats_totaux: result.finalDamage,
        points_de_vie_avant: result.hpBefore,
        points_de_vie_apres: result.hpAfter,
        icones_a_afficher: result.hpAfter <= 0 ? [(tokenActor.type === "personnage-non-joueur" ? "mort" : "sang")] : [],
        erreur: null
      });
    }
    return;
  }
  if (uuidActor) {
    console.debug("[bloodman] damage:apply uuid-actor", { share, actorId: uuidActor.id, actorName: uuidActor.name });
    const result = await applyDamageToActor(uuidActor, share, { targetName: fallbackName, penetration });
    if (result) emitDamageAppliedMessage(data, result, tokenDoc, share);
    return;
  }
  if (worldActor) {
    console.debug("[bloodman] damage:apply world-actor", { share, actorId: worldActor.id, actorName: worldActor.name });
    const result = await applyDamageToActor(worldActor, share, { targetName: fallbackName, penetration });
    if (result) emitDamageAppliedMessage(data, result, tokenDoc, share);
    return;
  }
  if (Number.isFinite(fallbackCurrent)) {
    const paInitial = Number.isFinite(fallbackPA) ? fallbackPA : 0;
    const paEffective = Math.max(0, paInitial - penetration);
    const finalDamage = Math.max(0, share - paEffective);
    ChatMessage.create({
      speaker: { alias: fallbackName },
      content: t("BLOODMAN.Rolls.Damage.Take", { name: fallbackName, amount: finalDamage, pa: paEffective })
    });
    return;
  }
  safeWarn(t("BLOODMAN.Notifications.DamageTargetResolveFailed"));
}

async function resolveActorForVitalResourceUpdate(data) {
  const actorBaseId = String(data?.actorBaseId || "");
  const actorId = String(data?.actorId || "");
  const worldActorId = actorBaseId || actorId;
  const worldActor = worldActorId ? (game.actors?.get(worldActorId) || null) : null;
  const actorUuid = String(data?.actorUuid || "");
  if (actorUuid) {
    const resolved = await fromUuid(actorUuid).catch(() => null);
    const candidate = resolved?.document || resolved || null;
    const actor = candidate?.documentName === "Actor"
      ? candidate
      : (candidate?.actor?.documentName === "Actor" ? candidate.actor : null);
    if (actor) {
      // Linked player tokens must update the world actor, not a synthetic token actor.
      if (actor.type === "personnage" && worldActor) return worldActor;
      if (actor.type === "personnage" && actor.isToken && Boolean(actor.token?.actorLink) && worldActor) return worldActor;
      return actor;
    }
  }
  return worldActor;
}

async function resolveActorForSheetRequest(data) {
  const actorBaseId = String(data?.actorBaseId || "");
  const actorId = String(data?.actorId || "");
  const worldActorId = actorBaseId || actorId;
  const worldActor = worldActorId ? (game.actors?.get(worldActorId) || null) : null;
  const actorUuid = String(data?.actorUuid || "");
  if (actorUuid) {
    const resolved = await fromUuid(actorUuid).catch(() => null);
    const candidate = resolved?.document || resolved || null;
    const actor = candidate?.documentName === "Actor"
      ? candidate
      : (candidate?.actor?.documentName === "Actor" ? candidate.actor : null);
    if (actor) {
      // Linked player tokens must route updates/deletes to the world actor.
      if (actor.type === "personnage" && worldActor) return worldActor;
      if (actor.type === "personnage" && actor.isToken && Boolean(actor.token?.actorLink) && worldActor) return worldActor;
      return actor;
    }
  }
  return worldActor;
}

function sanitizeActorUpdateForRole(updateData, role, options = {}) {
  const sanitized = foundry.utils.deepClone(updateData || {});
  const basicPlayer = isBasicPlayerRole(role);
  const allowCharacteristicBase = Boolean(options.allowCharacteristicBase);
  const allowVitalResourceUpdate = Boolean(options.allowVitalResourceUpdate);
  const enforceCharacteristicBaseRange = options.enforceCharacteristicBaseRange !== false;
  if (basicPlayer && !allowCharacteristicBase) {
    stripUnauthorizedCharacteristicBaseUpdates(sanitized);
  }
  if (basicPlayer && !allowVitalResourceUpdate) {
    stripUpdatePaths(sanitized, Array.from(VITAL_RESOURCE_PATHS));
  }
  if (basicPlayer) {
    stripUpdatePaths(sanitized, STATE_MODIFIER_PATHS);
  }
  normalizeCharacteristicXpUpdates(sanitized, options.actor || null);
  if (enforceCharacteristicBaseRange) normalizeCharacteristicBaseUpdatesForRole(sanitized, role);
  return sanitized;
}

function hasActorUpdatePayload(updateData) {
  if (!updateData || typeof updateData !== "object") return false;
  return Object.keys(foundry.utils.flattenObject(updateData)).length > 0;
}

function normalizeVitalResourceValue(actor, path, value) {
  const numeric = Math.max(0, Math.floor(toFiniteNumber(value, 0)));
  if (path === "system.resources.pv.current") {
    const max = toFiniteNumber(actor.system?.resources?.pv?.max, numeric);
    return Math.min(numeric, Math.max(0, max));
  }
  if (path === "system.resources.pp.current") {
    const max = toFiniteNumber(actor.system?.resources?.pp?.max, numeric);
    return Math.min(numeric, Math.max(0, max));
  }
  return numeric;
}

async function handleVitalResourceUpdateRequest(data) {
  if (!game.user.isGM || !data) return;
  const requesterId = String(data.requesterId || "");
  const requester = game.users?.get(requesterId);
  if (!requester) return;
  const requesterRole = game.users?.get(requesterId)?.role ?? 0;
  if (!canUserRoleEditCharacteristics(requesterRole)) return;

  const path = String(data.path || "");
  if (!VITAL_RESOURCE_PATHS.has(path)) return;

  const actor = await resolveActorForVitalResourceUpdate(data);
  if (!actor) return;
  if (actor.type !== "personnage" && actor.type !== "personnage-non-joueur") return;

  const normalizedValue = normalizeVitalResourceValue(actor, path, data.value);
  await actor.update({ [path]: normalizedValue });
}

async function handleActorSheetUpdateRequest(data) {
  if (!game.user.isGM || !data) return;
  const requesterId = String(data.requesterId || "");
  const requester = game.users?.get(requesterId);
  if (!requester) return;
  const requesterRole = game.users?.get(requesterId)?.role ?? 0;
  const actor = await resolveActorForSheetRequest(data);
  if (!actor) return;
  if (actor.type !== "personnage" && actor.type !== "personnage-non-joueur") return;
  const allowCharacteristicBase = Boolean(data?.options?.allowCharacteristicBase);
  const allowVitalResourceUpdate = Boolean(data?.options?.allowVitalResourceUpdate);
  const sanitized = sanitizeActorUpdateForRole(data.updateData || {}, requesterRole, {
    actor,
    allowCharacteristicBase,
    allowVitalResourceUpdate,
    enforceCharacteristicBaseRange: actor.type === "personnage"
  });
  if (!hasActorUpdatePayload(sanitized)) return;
  await actor.update(sanitized, {
    bloodmanAllowCharacteristicBase: allowCharacteristicBase,
    bloodmanAllowVitalResourceUpdate: allowVitalResourceUpdate
  });
}

async function handleDeleteItemRequest(data) {
  if (!game.user.isGM || !data) return;
  const requesterId = String(data.requesterId || "");
  const requester = game.users?.get(requesterId);
  if (!requester) return;
  const initialActor = await resolveActorForSheetRequest(data);
  if (!initialActor) return;

  const extractItemIdFromUuid = uuid => {
    const raw = String(uuid || "");
    const match = raw.match(/Item\.([^\.]+)$/);
    return match?.[1] || "";
  };

  const actorCandidates = [];
  const addActor = candidate => {
    if (!candidate) return;
    if (actorCandidates.some(existing => existing?.id === candidate?.id && existing?.uuid === candidate?.uuid)) return;
    actorCandidates.push(candidate);
  };

  addActor(initialActor);
  const worldActorId = String(data.actorBaseId || data.actorId || "");
  if (worldActorId) addActor(game.actors?.get(worldActorId) || null);
  if (initialActor?.isToken && initialActor?.token?.actorId) {
    addActor(game.actors?.get(initialActor.token.actorId) || null);
  }

  const requestedItemId = String(data.itemId || "") || extractItemIdFromUuid(data.itemUuid);
  const candidateItemIds = [];
  if (requestedItemId) candidateItemIds.push(requestedItemId);
  const uuidItemId = extractItemIdFromUuid(data.itemUuid);
  if (uuidItemId && !candidateItemIds.includes(uuidItemId)) candidateItemIds.push(uuidItemId);

  const deleteFromActorById = async (actor, itemId) => {
    if (!actor || !itemId) return false;
    if (!actor.items?.has(itemId)) return false;
    try {
      await actor.deleteEmbeddedDocuments("Item", [itemId], { render: false });
      return true;
    } catch (_error) {
      const item = actor.items?.get(itemId);
      if (!item) return false;
      try {
        await item.delete();
        return true;
      } catch (_fallbackError) {
        return false;
      }
    }
  };

  for (const actor of actorCandidates) {
    for (const itemId of candidateItemIds) {
      if (await deleteFromActorById(actor, itemId)) return;
    }
  }

  const itemName = String(data.itemName || "").trim().toLowerCase();
  const itemType = String(data.itemType || "").trim().toLowerCase();
  if (itemName) {
    for (const actor of actorCandidates) {
      const match = actor?.items?.find(item => {
        if (!item) return false;
        if (String(item.name || "").trim().toLowerCase() !== itemName) return false;
        if (itemType && String(item.type || "").trim().toLowerCase() !== itemType) return false;
        return true;
      });
      if (match && await deleteFromActorById(actor, match.id)) return;
    }
  }
}

function getSocketActorBaseId(actor) {
  return String(actor?.token?.actorId || actor?.parent?.actorId || actor?.baseActor?.id || actor?.id || "");
}

function requestVitalResourceUpdate(actor, path, value) {
  if (!actor || !game.socket) return;
  if (!VITAL_RESOURCE_PATHS.has(String(path || ""))) return;
  game.socket.emit(SYSTEM_SOCKET, {
    type: "updateVitalResources",
    requesterId: String(game.user?.id || ""),
    actorUuid: String(actor.uuid || ""),
    actorId: String(actor.id || ""),
    actorBaseId: getSocketActorBaseId(actor),
    path: String(path),
    value: Math.max(0, Math.floor(toFiniteNumber(value, 0)))
  });
}

function requestActorSheetUpdate(actor, updateData, options = {}) {
  if (!actor || !game.socket || !hasActorUpdatePayload(updateData)) return false;
  game.socket.emit(SYSTEM_SOCKET, {
    type: "updateActorSheetData",
    requesterId: String(game.user?.id || ""),
    actorUuid: String(actor.uuid || ""),
    actorId: String(actor.id || ""),
    actorBaseId: getSocketActorBaseId(actor),
    updateData,
    options: {
      allowCharacteristicBase: Boolean(options.allowCharacteristicBase),
      allowVitalResourceUpdate: Boolean(options.allowVitalResourceUpdate)
    }
  });
  return true;
}

function requestDeleteActorItem(actor, item) {
  if (!actor || !item || !game.socket) return false;
  game.socket.emit(SYSTEM_SOCKET, {
    type: "deleteActorItem",
    requesterId: String(game.user?.id || ""),
    actorUuid: String(actor.uuid || ""),
    actorId: String(actor.id || ""),
    actorBaseId: getSocketActorBaseId(actor),
    itemId: String(item.id || ""),
    itemUuid: String(item.uuid || ""),
    itemType: String(item.type || ""),
    itemName: String(item.name || "")
  });
  return true;
}


function registerDamageSocketHandlers() {
  if (!game.socket) return;
  const previousHandler = globalThis.__bmDamageSocketHandler;
  if (previousHandler && typeof game.socket.off === "function") {
    try {
      game.socket.off(SYSTEM_SOCKET, previousHandler);
    } catch (_error) {
      // non-fatal: continue with fresh registration
    }
  }
  const handler = async data => {
    if (!data) return;
    if (data.type === "damageApplied") {
      await handleDamageAppliedMessage(data);
      return;
    }
    if (data.type === "rerollDamage") {
      if (game.user.isGM) await handleDamageRerollRequest(data);
      return;
    }
    if (data.type === "updateVitalResources") {
      if (game.user.isGM) await handleVitalResourceUpdateRequest(data);
      return;
    }
    if (data.type === "updateActorSheetData") {
      if (game.user.isGM) await handleActorSheetUpdateRequest(data);
      return;
    }
    if (data.type === "deleteActorItem") {
      if (game.user.isGM) await handleDeleteItemRequest(data);
      return;
    }
    if (data.type === "voyanceOverlay") {
      await handleVoyanceOverlayRequest(data, "socket");
      return;
    }
    if (!game.user.isGM) return;
    if (data.type === "adjustChaosDice") {
      const delta = Number(data.delta);
      if (!Number.isFinite(delta) || delta === 0) return;
      const requestId = String(data.requestId || "");
      if (requestId && wasChaosRequestProcessed(requestId)) return;
      if (requestId) rememberChaosRequest(requestId);
      await setChaosValue(getChaosValue() + delta);
      return;
    }
    if (data.type !== "applyDamage") return;
    await handleIncomingDamageRequest(data, "socket");
  };
  game.socket.on(SYSTEM_SOCKET, handler);
  globalThis.__bmDamageSocketHandler = handler;
  globalThis.__bmDamageSocketReady = true;
}
if (globalThis.game?.ready) registerDamageSocketHandlers();

function getCombatantActor(combatant) {
  return combatant?.token?.actor || combatant?.actor || null;
}

function getActorEffectiveMovementScore(actor, { itemBonuses = null } = {}) {
  if (!actor) return 0;
  const bonuses = itemBonuses || getItemBonusTotals(actor);
  const base = toFiniteNumber(actor.system.characteristics?.MOU?.base, 0);
  const globalMod = toFiniteNumber(actor.system.modifiers?.all, 0);
  const keyMod = toFiniteNumber(actor.system.modifiers?.MOU, 0);
  return base + globalMod + keyMod + toFiniteNumber(bonuses?.MOU, 0) + getActorArchetypeBonus(actor, "MOU");
}

function getActorMoveSlots(actor, options = {}) {
  const effective = getActorEffectiveMovementScore(actor, options);
  return Math.max(0, Math.round(effective / 5));
}

function normalizeActorMoveGauge(actor, { itemBonuses = null, initializeWhenMissing = false } = {}) {
  const max = normalizeNonNegativeInteger(getActorMoveSlots(actor, { itemBonuses }), 0);
  const hasStoredMax = foundry.utils.getProperty(actor, "system.resources.move.max") != null;
  const storedValue = Number(foundry.utils.getProperty(actor, "system.resources.move.value"));
  const hasPositiveStoredValue = Number.isFinite(storedValue) && storedValue > 0;

  let value = storedValue;
  if (!hasStoredMax && initializeWhenMissing && !hasPositiveStoredValue) value = max;
  else if (!Number.isFinite(value)) value = max;
  value = Math.max(0, Math.min(toFiniteNumber(value, max), max));
  value = normalizeNonNegativeInteger(value, max);

  return { max, value, hasStoredMax };
}

async function setActorMoveGauge(actor, nextValue, maxValue) {
  if (!actor) return;
  const max = normalizeNonNegativeInteger(maxValue, 0);
  const value = normalizeNonNegativeInteger(Math.max(0, Math.min(toFiniteNumber(nextValue, max), max)), max);
  const currentValue = Number(foundry.utils.getProperty(actor, "system.resources.move.value"));
  const currentMax = Number(foundry.utils.getProperty(actor, "system.resources.move.max"));
  const hasCurrentMax = foundry.utils.getProperty(actor, "system.resources.move.max") != null;
  if (validateNumericEquality(currentValue, value) && hasCurrentMax && validateNumericEquality(currentMax, max)) return;

  const updateData = {
    "system.resources.move.value": value,
    "system.resources.move.max": max
  };
  if (actor.isOwner || game.user?.isGM) {
    await actor.update(updateData);
    return;
  }
  const sent = requestActorSheetUpdate(actor, updateData);
  if (!sent) safeWarn("Mise a jour impossible: aucun GM actif.");
}

function getTokenMoveDistanceInCells(tokenDoc, changes) {
  if (!tokenDoc || !changes) return Number.NaN;
  const hasX = foundry.utils.getProperty(changes, "x") != null;
  const hasY = foundry.utils.getProperty(changes, "y") != null;
  if (!hasX && !hasY) return 0;

  const currentX = Number(tokenDoc.x);
  const currentY = Number(tokenDoc.y);
  if (!Number.isFinite(currentX) || !Number.isFinite(currentY)) return Number.NaN;

  const nextRawX = foundry.utils.getProperty(changes, "x");
  const nextRawY = foundry.utils.getProperty(changes, "y");
  const nextX = nextRawX == null ? currentX : Number(nextRawX);
  const nextY = nextRawY == null ? currentY : Number(nextRawY);
  if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) return Number.NaN;
  if (validateNumericEquality(currentX, nextX) && validateNumericEquality(currentY, nextY)) return 0;

  const scene = tokenDoc.parent || tokenDoc.scene || canvas?.scene || null;
  const gridSize = toFiniteNumber(scene?.grid?.size, toFiniteNumber(canvas?.grid?.size, 0));
  if (!(gridSize > 0)) return Number.NaN;

  const tokenWidth = Math.max(1, toFiniteNumber(tokenDoc.width, 1));
  const tokenHeight = Math.max(1, toFiniteNumber(tokenDoc.height, 1));
  const offsetX = (tokenWidth * gridSize) / 2;
  const offsetY = (tokenHeight * gridSize) / 2;
  const origin = { x: currentX + offsetX, y: currentY + offsetY };
  const destination = { x: nextX + offsetX, y: nextY + offsetY };

  const sceneId = String(scene?.id || "");
  const activeSceneId = String(canvas?.scene?.id || "");
  const canMeasureOnCanvas = sceneId && activeSceneId && sceneId === activeSceneId;
  const gridDistance = toFiniteNumber(scene?.grid?.distance, 1);
  if (canMeasureOnCanvas && gridDistance > 0 && typeof canvas?.grid?.measurePath === "function") {
    try {
      const measurement = canvas.grid.measurePath([origin, destination]);
      const measuredCost = Number(measurement?.cost);
      if (Number.isFinite(measuredCost)) return Math.max(0, measuredCost);
      const measuredDistance = Number(measurement?.distance);
      if (Number.isFinite(measuredDistance)) return Math.max(0, measuredDistance / gridDistance);
    } catch (_error) {
      // Fallback to deterministic grid-cell delta below.
    }
  }

  const dxCells = Math.abs(destination.x - origin.x) / gridSize;
  const dyCells = Math.abs(destination.y - origin.y) / gridSize;
  return Math.max(dxCells, dyCells);
}

function getFixedInitiativeScore(actor) {
  if (!actor) return 0;
  const effective = getActorEffectiveMovementScore(actor);
  return Math.max(0, Math.round(effective));
}

function getActiveCombatant(combat) {
  if (!combat) return null;
  if (combat.combatant) return combat.combatant;
  const turn = Number(combat.turn ?? -1);
  if (!Number.isInteger(turn) || turn < 0) return null;
  if (Array.isArray(combat.turns) && combat.turns[turn]) return combat.turns[turn];
  if (Array.isArray(combat.combatants?.contents) && combat.combatants.contents[turn]) return combat.combatants.contents[turn];
  return null;
}

function getCombatMoveResetKey(combat) {
  if (!combat?.active) return "";
  const combatId = String(combat?.id || "");
  const activeCombatant = getActiveCombatant(combat);
  const combatantId = String(activeCombatant?.id || "");
  const round = Number(combat?.round ?? 0);
  const turn = Number(combat?.turn ?? -1);
  if (!combatId || !combatantId || round <= 0 || turn < 0) return "";
  return `${combatId}:${round}:${turn}:${combatantId}`;
}

function getStartedActiveCombat() {
  const combat = game.combat || null;
  if (!combat?.active) return null;
  const round = Number(combat?.round ?? 0);
  return round > 0 ? combat : null;
}

function getCombatantForToken(combat, tokenDoc) {
  if (!combat || !tokenDoc) return null;
  const tokenId = String(tokenDoc.id || tokenDoc._id || "");
  if (!tokenId) return null;
  return combat.combatants?.find(combatant => String(combatant?.tokenId || "") === tokenId) || null;
}

function isActorInStartedActiveCombat(actor, combat = null) {
  if (!actor) return false;
  const startedCombat = combat || getStartedActiveCombat();
  if (!startedCombat) return false;
  const actorBaseId = getSocketActorBaseId(actor);
  if (!actorBaseId) return false;
  return Boolean(startedCombat.combatants?.some(combatant => {
    const combatantActor = getCombatantActor(combatant);
    return getSocketActorBaseId(combatantActor) === actorBaseId;
  }));
}

async function resetActiveCombatantMoveGauge(combat) {
  if (!game.user?.isGM) return;
  if (!combat?.active) return;
  const round = Number(combat?.round ?? 0);
  if (round <= 0) return;
  const resetKey = getCombatMoveResetKey(combat);
  if (!resetKey || resetKey === LAST_COMBAT_MOVE_RESET_KEY) return;
  const activeCombatant = getActiveCombatant(combat);
  if (!activeCombatant) return;

  const actor = getCombatantActor(activeCombatant);
  if (!actor) return;
  if (actor.type !== "personnage" && actor.type !== "personnage-non-joueur") return;

  const gauge = normalizeActorMoveGauge(actor, { initializeWhenMissing: true });
  await setActorMoveGauge(actor, gauge.max, gauge.max);
  LAST_COMBAT_MOVE_RESET_KEY = resetKey;
}

function getInitiativeFormulaForActor(actor) {
  const score = getFixedInitiativeScore(actor);
  // Tie-breaker: lower 1d10 wins (adds a slightly higher fraction).
  return `(${score}) + (10 - 1d10) / 100`;
}

function getCombatantDisplayName(combatant) {
  if (!combatant) return "";
  const tokenName = combatant.token?.name;
  const actor = combatant.actor || combatant.token?.actor || null;
  const actorName = actor?.name || "";
  if (actor?.type === "personnage") {
    return actorName || combatant.name || "";
  }
  return resolveCombatTargetName(tokenName, actorName, combatant.name || "");
}

function focusActiveCombatantToken(combat) {
  if (!combat || !canvas?.tokens) return;
  if (combat.round == null || combat.round <= 0) return;
  if (combat.scene && canvas?.scene && combat.scene.id !== canvas.scene.id) return;
  const combatant = combat.combatant;
  const tokenDoc = combatant?.token;
  const tokenObj = tokenDoc?.object;
  if (!tokenDoc || !tokenObj) return;
  if (!tokenDoc.isOwner && !game.user.isGM) return;
  if (tokenObj.controlled) return;
  canvas.tokens.activate();
  tokenObj.control({ releaseOthers: true });
}

async function syncCombatantNameForToken(tokenDoc) {
  if (!tokenDoc) return;
  const actorType = tokenDoc.actor?.type || "";
  const displayName = actorType === "personnage"
    ? (tokenDoc.actor?.name || tokenDoc.name || "")
    : resolveCombatTargetName(tokenDoc.name, tokenDoc.actor?.name, tokenDoc.name || "");
  if (!displayName) return;
  for (const combat of game.combats || []) {
    for (const combatant of combat.combatants || []) {
      if (combatant.tokenId !== tokenDoc.id) continue;
      if (combatant.name === displayName) continue;
      await combatant.update({ name: displayName });
    }
  }
}

Hooks.on("renderDialog", (_app, html) => {
  injectDocumentCreateTypeIcons(html);
});

Hooks.on("renderApplication", (_app, html) => {
  try {
    const root = html?.[0] || html;
    if (!(root instanceof HTMLElement)) return;
    if (!root.querySelector("select, input[name='type']")) return;
    injectDocumentCreateTypeIcons(root);
  } catch (error) {
    console.warn("[bloodman] renderApplication type icon hook skipped", error);
  }
});

Hooks.on("renderDocumentCreateDialog", (_app, html) => {
  injectDocumentCreateTypeIcons(html);
});

Hooks.once("init", () => {
  game.settings.register("bloodman", "chaosDice", {
    name: t("BLOODMAN.Settings.ChaosDiceName"),
    scope: "world",
    config: false,
    type: Number,
    default: 0,
    onChange: value => {
      updateChaosDiceUI(typeof value === "number" ? value : Number(value));
      for (const app of Object.values(ui.windows || {})) {
        if (app instanceof BloodmanNpcSheet) app.render(false);
      }
    }
  });

  ActorsCollection.unregisterSheet("core", BaseActorSheet);
  ActorsCollection.registerSheet("bloodman", BloodmanActorSheet, {
    types: ["personnage"],
    makeDefault: true
  });
  ActorsCollection.registerSheet("bloodman", BloodmanNpcSheet, {
    types: ["personnage-non-joueur"],
    makeDefault: true
  });

  ItemsCollection.unregisterSheet("core", BaseItemSheet);
  ItemsCollection.registerSheet("bloodman", BloodmanItemSheet, {
    types: ["arme", "objet", "ration", "soin", "protection", "aptitude", "pouvoir"],
    makeDefault: true
  });

  const combatantDoc = CONFIG?.Combatant?.documentClass;
  if (combatantDoc?.prototype) {
    const originalGetInitiativeRoll = combatantDoc.prototype.getInitiativeRoll;
    const originalGetFormula = combatantDoc.prototype._getInitiativeFormula || combatantDoc.prototype.getInitiativeFormula;

    combatantDoc.prototype._getInitiativeFormula = function () {
      const actor = getCombatantActor(this);
      if (actor?.type === "personnage" || actor?.type === "personnage-non-joueur") {
        return getInitiativeFormulaForActor(actor);
      }
      const fallback = typeof originalGetFormula === "function" ? originalGetFormula.call(this) : "0";
      return fallback ? String(fallback) : "0";
    };

    combatantDoc.prototype.getInitiativeRoll = function (formula) {
      const RollClass = foundry?.dice?.Roll || Roll;
      const actor = getCombatantActor(this);
      if (actor?.type === "personnage" || actor?.type === "personnage-non-joueur") {
        return new RollClass(getInitiativeFormulaForActor(actor));
      }
      if (typeof originalGetInitiativeRoll === "function") {
        return originalGetInitiativeRoll.call(this, formula);
      }
      const normalized = String(formula ?? "0").trim();
      return new RollClass(normalized || "0");
    };
  }
});

Hooks.once("ready", async () => {
  refreshAllCreateTypeIcons();
  if (!window.__bmCreateTypeIconObserver) {
    const observer = new MutationObserver(() => {
      try {
        refreshAllCreateTypeIcons();
      } catch (_error) {
        // non-fatal UI decoration
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.__bmCreateTypeIconObserver = observer;
  }

  registerDamageSocketHandlers();
  for (const actor of game.actors) {
    if (!actor.isOwner) continue;
    const isCharacter = actor.type === "personnage";
    const isNpc = actor.type === "personnage-non-joueur";
    if (!isCharacter && !isNpc) continue;

    const updates = {};

    if (!actor.system.characteristics) {
      updates["system.characteristics"] = buildDefaultCharacteristics();
    } else {
      for (const c of CHARACTERISTICS) {
        const xp = actor.system.characteristics?.[c.key]?.xp;
        if (!Array.isArray(xp)) updates[`system.characteristics.${c.key}.xp`] = [false, false, false];
      }
    }

    if (!actor.system.modifiers) updates["system.modifiers"] = buildDefaultModifiers();

    const actorResources = actor.system.resources || {};
    const requiresResourceInit = !actor.system.resources
      || actorResources.move == null
      || (isCharacter && actorResources.voyage == null);
    const moveGauge = normalizeActorMoveGauge(actor, { initializeWhenMissing: true });
    if (requiresResourceInit) {
      const mergedResources = foundry.utils.mergeObject(
        buildDefaultResources({ includeVoyage: isCharacter }),
        actorResources,
        { inplace: false }
      );
      if (isCharacter) {
        const rawVoyageCurrent = toFiniteNumber(mergedResources.voyage?.current, 0);
        const rawVoyageTotal = toFiniteNumber(mergedResources.voyage?.total ?? mergedResources.voyage?.max, 0);
        const normalizedVoyageTotal = normalizeNonNegativeInteger(rawVoyageTotal, 0);
        const normalizedVoyageCurrent = Math.min(
          normalizeNonNegativeInteger(rawVoyageCurrent, 0),
          normalizedVoyageTotal
        );
        mergedResources.voyage = {
          current: normalizedVoyageCurrent,
          total: normalizedVoyageTotal,
          max: normalizedVoyageTotal
        };
      } else if (mergedResources.voyage != null) {
        delete mergedResources.voyage;
      }
      mergedResources.move = mergedResources.move || {};
      mergedResources.move.value = moveGauge.value;
      mergedResources.move.max = moveGauge.max;
      updates["system.resources"] = mergedResources;
    } else {
      const storedMoveValue = Number(actorResources.move?.value);
      const storedMoveMax = Number(actorResources.move?.max);
      const hasStoredMoveMax = actorResources.move?.max != null;
      if (!hasStoredMoveMax || !validateNumericEquality(storedMoveValue, moveGauge.value) || !validateNumericEquality(storedMoveMax, moveGauge.max)) {
        updates["system.resources.move.value"] = moveGauge.value;
        updates["system.resources.move.max"] = moveGauge.max;
      }
    }
    if (isCharacter) {
      const rawVoyageCurrent = toFiniteNumber(actorResources.voyage?.current, 0);
      const rawVoyageTotal = toFiniteNumber(actorResources.voyage?.total ?? actorResources.voyage?.max, 0);
      const normalizedVoyageTotal = normalizeNonNegativeInteger(rawVoyageTotal, 0);
      const normalizedVoyageCurrent = Math.min(
        normalizeNonNegativeInteger(rawVoyageCurrent, 0),
        normalizedVoyageTotal
      );
      if (
        actorResources.voyage == null
        || actorResources.voyage.total == null
        || actorResources.voyage.max == null
        || rawVoyageCurrent !== normalizedVoyageCurrent
        || rawVoyageTotal !== normalizedVoyageTotal
      ) {
        updates["system.resources.voyage.current"] = normalizedVoyageCurrent;
        updates["system.resources.voyage.total"] = normalizedVoyageTotal;
        updates["system.resources.voyage.max"] = normalizedVoyageTotal;
      }
    }
    if (isNpc && actorResources.voyage != null) {
      updates["system.resources.-=voyage"] = null;
    }

    const mergedProfile = foundry.utils.mergeObject(
      buildDefaultProfile(),
      actor.system.profile || {},
      { inplace: false }
    );
    const normalizedArchetypeBonusValue = normalizeArchetypeBonusValue(mergedProfile.archetypeBonusValue, 0);
    const normalizedArchetypeBonusCharacteristic = normalizeCharacteristicKey(mergedProfile.archetypeBonusCharacteristic);
    mergedProfile.archetypeBonusValue = Number.isFinite(normalizedArchetypeBonusValue)
      ? normalizedArchetypeBonusValue
      : 0;
    mergedProfile.archetypeBonusCharacteristic = normalizedArchetypeBonusCharacteristic;
    if (
      !actor.system.profile
      || normalizeArchetypeBonusValue(actor.system.profile?.archetypeBonusValue, 0) !== mergedProfile.archetypeBonusValue
      || normalizeCharacteristicKey(actor.system.profile?.archetypeBonusCharacteristic) !== mergedProfile.archetypeBonusCharacteristic
    ) {
      updates["system.profile"] = mergedProfile;
    }

    if (!actor.system.ammo) {
      const legacy = Array.isArray(actor.system.ammoPool) ? actor.system.ammoPool[0] : null;
      updates["system.ammo"] = legacy
        ? { type: legacy.type || "", value: Number(legacy.value) || 0 }
        : buildDefaultAmmo();
    }
    if (actor.prototypeToken) {
      if (isCharacter && actor.prototypeToken.actorLink === false) {
        updates["prototypeToken.actorLink"] = true;
      }
      if (isNpc && actor.prototypeToken.actorLink !== false) {
        updates["prototypeToken.actorLink"] = false;
      }
      const protoScaleX = foundry.utils.getProperty(actor.prototypeToken, "texture.scaleX");
      const protoScaleY = foundry.utils.getProperty(actor.prototypeToken, "texture.scaleY");
      const protoOffsetX = foundry.utils.getProperty(actor.prototypeToken, "texture.offsetX");
      const protoOffsetY = foundry.utils.getProperty(actor.prototypeToken, "texture.offsetY");
      const protoFit = foundry.utils.getProperty(actor.prototypeToken, "texture.fit");
      if (shouldResetTokenScale(protoScaleX)) updates["prototypeToken.texture.scaleX"] = 1;
      if (shouldResetTokenScale(protoScaleY)) updates["prototypeToken.texture.scaleY"] = 1;
      if (shouldResetTokenOffset(protoOffsetX)) updates["prototypeToken.texture.offsetX"] = 0;
      if (shouldResetTokenOffset(protoOffsetY)) updates["prototypeToken.texture.offsetY"] = 0;
      if (shouldResetTokenFit(protoFit)) updates["prototypeToken.texture.fit"] = "cover";
      const protoSrc = foundry.utils.getProperty(actor.prototypeToken, "texture.src");
      if (await needsTokenImageRepair(protoSrc)) {
        const actorImgValid = actor.img ? await canLoadTextureSource(actor.img) : false;
        const nextProtoSrc = actorImgValid ? actor.img : "icons/svg/mystery-man.svg";
        if (nextProtoSrc && nextProtoSrc !== protoSrc) updates["prototypeToken.texture.src"] = nextProtoSrc;
      }
    }

    if (Object.keys(updates).length) await actor.update(updates);
    await applyItemResourceBonuses(actor);

    for (const item of actor.items) {
      if (item.type === "aptitude") {
        const rawCost = item.system?.xpVoyageCost;
        const numericCost = Number(rawCost);
        const normalizedCost = normalizeNonNegativeInteger(rawCost, 0);
        if (rawCost == null || !Number.isFinite(numericCost) || numericCost !== normalizedCost) {
          await item.update({ "system.xpVoyageCost": normalizedCost });
        }
        continue;
      }
      if (item.type !== "arme") continue;
      const normalized = normalizeWeaponType(item.system?.weaponType);
      if (normalized && normalized !== item.system?.weaponType) {
        await item.update({ "system.weaponType": normalized });
      }
      if (!normalized && !item.system?.weaponType) {
        await item.update({ "system.weaponType": "distance" });
      }
    }
  }

  ensureChaosDiceUI();

  if (game.user.isGM) {
    for (const combat of game.combats || []) {
      for (const combatant of combat.combatants || []) {
        const name = getCombatantDisplayName(combatant);
        if (name && name !== combatant.name) {
          await combatant.update({ name });
        }
      }
    }

    for (const scene of game.scenes) {
      for (const token of scene.tokens) {
        const actorType = getTokenActorType(token);
        const tokenUpdates = {};
        if (actorType === "personnage" && !token.actorLink) tokenUpdates.actorLink = true;
        if (actorType === "personnage-non-joueur" && token.actorLink) tokenUpdates.actorLink = false;
        if (actorType === "personnage" || actorType === "personnage-non-joueur") {
          foundry.utils.mergeObject(tokenUpdates, getTokenScaleNormalizationUpdates(token), { inplace: true });
          const tokenActor = token.actor || game.actors?.get(token.actorId) || null;
          const tokenSrc = foundry.utils.getProperty(token, "texture.src");
          if (await needsTokenImageRepair(tokenSrc)) {
            const actorImg = tokenActor?.img || "";
            const actorImgValid = actorImg ? await canLoadTextureSource(actorImg) : false;
            const nextTokenSrc = actorImgValid ? actorImg : "icons/svg/mystery-man.svg";
            if (nextTokenSrc && nextTokenSrc !== tokenSrc) tokenUpdates["texture.src"] = nextTokenSrc;
          }
          if (Object.keys(tokenUpdates).length) await token.update(tokenUpdates);
          const pvCurrent = getTokenCurrentPv(token);
          if (Number.isFinite(pvCurrent)) await syncZeroPvStatusForToken(token, actorType, pvCurrent);
          continue;
        }
        if (Object.keys(tokenUpdates).length) await token.update(tokenUpdates);
      }
    }
    await refreshBossSoloNpcPvMax();
  }
});

function clampChaosValue(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getActiveGMUserIds() {
  return game.users?.filter(user => user.active && user.isGM).map(user => user.id) || [];
}

function getChaosValue() {
  return clampChaosValue(Number(game.settings.get("bloodman", "chaosDice")));
}

async function setChaosValue(nextValue) {
  if (!game.user.isGM) return;
  const clamped = clampChaosValue(nextValue);
  await game.settings.set("bloodman", "chaosDice", clamped);
  updateChaosDiceUI(clamped);
}

async function requestChaosDelta(delta) {
  const numeric = Number(delta);
  if (!Number.isFinite(numeric) || numeric === 0) return;
  if (game.user.isGM) {
    await setChaosValue(getChaosValue() + numeric);
    return;
  }
  const requestId = foundry.utils?.randomID ? foundry.utils.randomID() : Math.random().toString(36).slice(2);
  if (game.socket) {
    game.socket.emit(SYSTEM_SOCKET, { type: "adjustChaosDice", delta: numeric, requestId });
  }
  const gmIds = getActiveGMUserIds();
  if (!gmIds.length) return;
  await ChatMessage.create({
    content: CHAOS_REQUEST_CHAT_MARKUP,
    whisper: gmIds,
    flags: { bloodman: { chaosDeltaRequest: { requestId, delta: numeric } } }
  }).catch(() => null);
}

function updateChaosDiceUI(value) {
  const root = document.getElementById("bm-chaos-dice");
  if (!root) return;
  const chaosValue = clampChaosValue(value);
  const display = root.querySelector(".bm-chaos-value");
  if (display) display.textContent = String(chaosValue);
  root.classList.toggle("is-active", chaosValue > 0);
}

function getVisibleRect(element) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (!rect || rect.width === 0 || rect.height === 0) return null;
  return rect;
}

function positionChaosDiceUI() {
  const root = document.getElementById("bm-chaos-dice");
  if (!root) return;
  const chatRect = getVisibleRect(document.getElementById("chat-form"));
  const hotbarRect = getVisibleRect(document.getElementById("hotbar"));
  const gap = 10;

  if (chatRect) {
    const rootRect = root.getBoundingClientRect();
    const width = rootRect.width || 46;
    const left = Math.max(12, Math.round(chatRect.left - width - gap));
    const bottom = 12;
    root.style.left = `${left}px`;
    root.style.right = "auto";
    root.style.bottom = `${bottom}px`;
    return;
  }

  const anchorTop = hotbarRect?.top;
  if (typeof anchorTop === "number") {
    const bottomOffset = Math.max(12, Math.round(window.innerHeight - anchorTop + 6));
    root.style.bottom = `${bottomOffset}px`;
  }
}

function ensureChaosDiceUI() {
  if (!game.user.isGM) return;
  if (document.getElementById("bm-chaos-dice")) return;
  const target = document.getElementById("ui-bottom") || document.body;
  if (!target) return;

  const container = document.createElement("div");
  container.id = "bm-chaos-dice";
  container.className = "bm-chaos-dice";
  container.title = "Des du chaos";
  container.innerHTML = `
    <button type="button" class="bm-chaos-btn bm-chaos-plus" aria-label="Augmenter les des du chaos">+</button>
    <div class="bm-chaos-icon" aria-hidden="true">
      <img src="systems/bloodman/images/d20_destin.svg" alt="" />
      <span class="bm-chaos-value">0</span>
    </div>
    <button type="button" class="bm-chaos-btn bm-chaos-minus" aria-label="Diminuer les des du chaos">-</button>
  `;

  target.appendChild(container);

  const minus = container.querySelector(".bm-chaos-minus");
  const plus = container.querySelector(".bm-chaos-plus");

  minus?.addEventListener("click", async () => {
    const current = getChaosValue();
    await setChaosValue(current - 1);
  });

  plus?.addEventListener("click", async () => {
    const current = getChaosValue();
    await setChaosValue(current + 1);
  });

  updateChaosDiceUI(getChaosValue());
  positionChaosDiceUI();

  if (!window.__bmChaosDiceObserver) {
    const observer = new ResizeObserver(() => positionChaosDiceUI());
    const sidebar = document.getElementById("sidebar");
    const tabs = document.getElementById("sidebar-tabs");
    const chatForm = document.getElementById("chat-form");
    const hotbar = document.getElementById("hotbar");
    if (sidebar) observer.observe(sidebar);
    if (tabs) observer.observe(tabs);
    if (chatForm) observer.observe(chatForm);
    if (hotbar) observer.observe(hotbar);
    window.addEventListener("resize", positionChaosDiceUI);

    if (sidebar) {
      const mutation = new MutationObserver(() => positionChaosDiceUI());
      mutation.observe(sidebar, { attributes: true, attributeFilter: ["class", "style"] });
      window.__bmChaosDiceMutation = mutation;
    }
    window.__bmChaosDiceObserver = observer;
  }
}

async function applyAptitudeVoyageCostOnCreate(actor, item) {
  if (!actor || !item) return;
  if (actor.type !== "personnage" || item.type !== "aptitude") return;

  const cost = normalizeNonNegativeInteger(item.system?.xpVoyageCost, 0);
  if (cost <= 0) return;

  const voyageTotal = normalizeNonNegativeInteger(
    actor.system?.resources?.voyage?.total ?? actor.system?.resources?.voyage?.max,
    0
  );
  const voyageCurrent = Math.min(
    normalizeNonNegativeInteger(actor.system?.resources?.voyage?.current, 0),
    voyageTotal
  );
  const nextVoyageCurrent = Math.max(0, voyageCurrent - cost);
  if (nextVoyageCurrent === voyageCurrent) return;

  await actor.update({
    "system.resources.voyage.current": nextVoyageCurrent,
    "system.resources.voyage.total": voyageTotal,
    "system.resources.voyage.max": voyageTotal
  });
}

Hooks.on("createItem", async (item, options, userId) => {
  if (!item?.actor) return;

  const sourceUserId = String(userId || options?.userId || "");
  if (sourceUserId && sourceUserId !== game.user?.id) return;

  await applyAptitudeVoyageCostOnCreate(item.actor, item);

  if (item.type !== "aptitude" && item.type !== "pouvoir") return;
  await applyItemResourceBonuses(item.actor);
});

Hooks.on("preCreateItem", (item, createData) => {
  const normalizedAudio = normalizeItemAudioUpdate(item, createData);
  if (normalizedAudio.invalid) {
    ui.notifications?.error(t("BLOODMAN.Notifications.ItemAudioInvalidSelection", { item: getItemAudioName(item) }));
  }

  if (item?.type !== "aptitude") return;

  const rawCost = foundry.utils.getProperty(createData || {}, "system.xpVoyageCost");
  const normalizedCost = normalizeNonNegativeInteger(
    rawCost === undefined ? item.system?.xpVoyageCost : rawCost,
    0
  );
  item.updateSource({ "system.xpVoyageCost": normalizedCost });

  const actor = item.actor || item.parent;
  if (!actor || actor.type !== "personnage") return;

  const availableVoyageXp = normalizeNonNegativeInteger(actor.system?.resources?.voyage?.current, 0);
  if (availableVoyageXp >= normalizedCost) return;

  const aptitudeName = item.name || t("TYPES.Item.aptitude");
  console.warn("[bloodman] aptitude acquisition blocked: not enough voyage XP", {
    actorId: actor.id,
    actorName: actor.name,
    aptitude: aptitudeName,
    required: normalizedCost,
    available: availableVoyageXp
  });
  ui.notifications?.error(
    t("BLOODMAN.Notifications.NotEnoughVoyageXPForAptitude", {
      aptitude: aptitudeName,
      required: normalizedCost,
      available: availableVoyageXp
    })
  );
  return false;
});

Hooks.on("preUpdateItem", (item, updateData) => {
  const normalizedAudio = normalizeItemAudioUpdate(item, updateData);
  if (normalizedAudio.invalid) {
    ui.notifications?.error(t("BLOODMAN.Notifications.ItemAudioInvalidSelection", { item: getItemAudioName(item) }));
  }

  if (item?.type !== "aptitude") return;
  const costPath = "system.xpVoyageCost";
  const rawUpdateCost = foundry.utils.getProperty(updateData, costPath);
  const hasCostUpdate = Object.prototype.hasOwnProperty.call(updateData, costPath)
    || rawUpdateCost !== undefined;
  if (!hasCostUpdate) return;
  const nextCost = normalizeNonNegativeInteger(rawUpdateCost, item.system?.xpVoyageCost ?? 0);
  foundry.utils.setProperty(updateData, costPath, nextCost);
});

Hooks.on("createChatMessage", async (message) => {
  const voyancePayload = foundry.utils.getProperty(message, "flags.bloodman.voyanceOverlayRequest");
  if (voyancePayload) {
    await handleVoyanceOverlayRequest(voyancePayload, "chat");
    if (message.isOwner) {
      setTimeout(() => {
        message.delete().catch(() => null);
      }, 250);
    }
    return;
  }

  if (!game.user.isGM) return;
  if (isInitiativeRollMessage(message)) {
    queueInitiativeRollMessage(message);
    return;
  }
  const chaosPayload = foundry.utils.getProperty(message, "flags.bloodman.chaosDeltaRequest");
  if (chaosPayload) {
    const delta = Number(chaosPayload.delta);
    const requestId = String(chaosPayload.requestId || "");
    if (Number.isFinite(delta) && delta !== 0) {
      if (!requestId || !wasChaosRequestProcessed(requestId)) {
        if (requestId) rememberChaosRequest(requestId);
        await setChaosValue(getChaosValue() + delta);
      }
    }
    if (message.isOwner) {
      setTimeout(() => {
        message.delete().catch(() => null);
      }, 250);
    }
    return;
  }
  const payload = foundry.utils.getProperty(message, "flags.bloodman.damageRequest");
  if (payload) {
    await handleIncomingDamageRequest(payload, "chat");
    if (message.isOwner) {
      setTimeout(() => {
        message.delete().catch(() => null);
      }, 250);
    }
    return;
  }

  const rerollPayload = foundry.utils.getProperty(message, "flags.bloodman.rerollDamageRequest");
  if (!rerollPayload) return;
  await handleDamageRerollRequest(rerollPayload);
  if (message.isOwner) {
    setTimeout(() => {
      message.delete().catch(() => null);
    }, 250);
  }
});

Hooks.on("updateItem", (item) => {
  if (!item?.actor) return;
  if (item.type !== "aptitude" && item.type !== "pouvoir") return;
  applyItemResourceBonuses(item.actor);
});

Hooks.on("deleteItem", (item) => {
  if (!item?.actor) return;
  if (item.type !== "aptitude" && item.type !== "pouvoir") return;
  applyItemResourceBonuses(item.actor);
});

function getItemBonusTotals(actor) {
  const totals = {};
  for (const c of CHARACTERISTICS) totals[c.key] = 0;
  if (!actor?.items) return totals;
  for (const item of actor.items) {
    if (item.type !== "aptitude" && item.type !== "pouvoir") continue;
    if (!item.system?.bonusEnabled) continue;
    if (item.system?.bonuses) {
      for (const c of CHARACTERISTICS) {
        if (!Object.prototype.hasOwnProperty.call(item.system.bonuses, c.key)) continue;
        const bonus = Number(item.system.bonuses[c.key]);
        if (Number.isFinite(bonus)) totals[c.key] += bonus;
      }
    }
    const legacyKey = (item.system?.charKey || "").toString().toUpperCase();
    const legacyBonus = Number(item.system?.charBonus);
    if (Number.isInteger(legacyBonus) && totals[legacyKey] != null) totals[legacyKey] += legacyBonus;
  }
  return totals;
}

function getItemResourceBonusTotals(actor) {
  const totals = { pv: 0, pp: 0 };
  if (!actor?.items) return totals;
  for (const item of actor.items) {
    if (item.type !== "aptitude" && item.type !== "pouvoir") continue;
    if (item.system?.bonusEnabled) {
      const pvBonus = Number(item.system?.resourceBonuses?.pv);
      const ppBonus = Number(item.system?.resourceBonuses?.pp);
      if (Number.isFinite(pvBonus)) totals.pv += pvBonus;
      if (Number.isFinite(ppBonus)) totals.pp += ppBonus;
    }
    if (item.system?.rawBonusEnabled) {
      const pvBonus = Number(item.system?.rawBonuses?.pv);
      const ppBonus = Number(item.system?.rawBonuses?.pp);
      if (Number.isFinite(pvBonus)) totals.pv += pvBonus;
      if (Number.isFinite(ppBonus)) totals.pp += ppBonus;
    }
  }
  return totals;
}

async function applyItemResourceBonuses(actor) {
  const isCharacter = actor?.type === "personnage";
  const isNpc = actor?.type === "personnage-non-joueur";
  if (!actor || (!isCharacter && !isNpc) || !actor.isOwner) return;
  const totals = getItemResourceBonusTotals(actor);
  const currentPv = Number(actor.system.resources?.pv?.current || 0);
  const currentPp = Number(actor.system.resources?.pp?.current || 0);
  const currentPvMax = Number(actor.system.resources?.pv?.max || 0);
  const currentPpMax = Number(actor.system.resources?.pp?.max || 0);
  const storedPv = Number(actor.system.resources?.pv?.itemBonus || 0);
  const storedPp = Number(actor.system.resources?.pp?.itemBonus || 0);
  const deltaPv = totals.pv - storedPv;
  const deltaPp = totals.pp - storedPp;

  const updates = {};
  const nextPvMax = currentPvMax + deltaPv;
  const nextPpMax = currentPpMax + deltaPp;
  if (deltaPv !== 0) {
    updates["system.resources.pv.max"] = Math.max(0, nextPvMax);
    updates["system.resources.pv.current"] = Math.min(currentPv, Math.max(0, nextPvMax));
  }
  if (deltaPp !== 0) {
    updates["system.resources.pp.max"] = Math.max(0, nextPpMax);
    updates["system.resources.pp.current"] = Math.min(currentPp, Math.max(0, nextPpMax));
  }
  if (storedPv !== totals.pv) updates["system.resources.pv.itemBonus"] = totals.pv;
  if (storedPp !== totals.pp) updates["system.resources.pp.itemBonus"] = totals.pp;

  if (Object.keys(updates).length) await actor.update(updates, { bloodmanAllowVitalResourceUpdate: true });
}

async function applyPowerCost(actor, item) {
  if (!actor || !item) return true;
  if (item.type !== "pouvoir") return true;
  if (!item.system?.damageEnabled || !item.system?.powerCostEnabled) return true;
  const cost = Number(item.system?.powerCost);
  if (!Number.isFinite(cost) || cost <= 0) return true;
  const current = Number(actor.system.resources?.pp?.current || 0);
  if (current < cost) {
    ui.notifications?.warn(t("BLOODMAN.Notifications.NotEnoughPP"));
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: t("BLOODMAN.Rolls.Damage.Zero", { name: actor.name, item: item.name })
    });
    return false;
  }
  const nextValue = Math.max(0, current - cost);
  if (actor.isOwner || game.user?.isGM) {
    await actor.update({ "system.resources.pp.current": nextValue }, { bloodmanAllowVitalResourceUpdate: true });
  } else {
    const sent = requestActorSheetUpdate(actor, { "system.resources.pp.current": nextValue }, {
      allowVitalResourceUpdate: true
    });
    if (!sent) return false;
  }
  return true;
}

function buildItemDisplayData(item) {
  const data = item.toObject();
  data._id = data._id ?? item.id;
  const bonusEnabled = Boolean(item.system?.bonusEnabled);
  const displayBonuses = [];
  const displayResourceBonuses = [];

  if (bonusEnabled) {
    const bonuses = item.system?.bonuses || {};
    for (const c of CHARACTERISTICS) {
      const value = Number(bonuses[c.key]);
      if (Number.isFinite(value) && value !== 0) displayBonuses.push({ key: c.key, value });
    }

    const legacyKey = (item.system?.charKey || "").toString().toUpperCase();
    const legacyValue = Number(item.system?.charBonus);
    if (legacyKey && Number.isFinite(legacyValue) && legacyValue !== 0) {
      const exists = displayBonuses.some(bonus => bonus.key === legacyKey);
      if (!exists) displayBonuses.push({ key: legacyKey, value: legacyValue });
    }

    const pvBonus = Number(item.system?.resourceBonuses?.pv);
    const ppBonus = Number(item.system?.resourceBonuses?.pp);
    if (Number.isFinite(pvBonus) && pvBonus !== 0) displayResourceBonuses.push({ key: "PV", value: pvBonus });
    if (Number.isFinite(ppBonus) && ppBonus !== 0) displayResourceBonuses.push({ key: "PP", value: ppBonus });
  }

  if (item.system?.damageEnabled && item.system?.damageDie) {
    const rawDie = item.system.damageDie.toString();
    data.displayDamageDie = normalizeRollDieFormula(rawDie, "d4");
  }

  data.displayBonuses = displayBonuses;
  data.displayResourceBonuses = displayResourceBonuses;
  return data;
}

function getTransportNpcRefs(actor) {
  const refs = actor?.system?.equipment?.transportNpcs;
  if (!Array.isArray(refs)) return [];
  return refs
    .map(ref => (typeof ref === "string" ? ref.trim() : ""))
    .filter(ref => ref.length > 0);
}

function resolveTransportNpc(ref) {
  if (!ref || typeof ref !== "string") return null;
  const uuidRef = ref.startsWith("Actor.") ? ref : null;
  const byUuid = uuidRef && typeof fromUuidSync === "function" ? fromUuidSync(uuidRef) : null;
  const actor = byUuid || game.actors?.get(ref) || null;
  if (!actor || actor.type !== "personnage-non-joueur") return null;
  return actor;
}

function buildTransportNpcDisplayData(actor) {
  const transportNpcs = [];
  const seen = new Set();
  for (const ref of getTransportNpcRefs(actor)) {
    if (seen.has(ref)) continue;
    seen.add(ref);
    const npc = resolveTransportNpc(ref);
    if (!npc) continue;
    transportNpcs.push({
      ref,
      id: npc.id,
      name: npc.name,
      img: npc.img || "icons/svg/mystery-man.svg"
    });
  }
  return transportNpcs;
}

Hooks.on("preCreateToken", (doc) => {
  const sourceUpdates = {};
  const actorType = getTokenActorType(doc);
  if (actorType === "personnage") sourceUpdates.actorLink = true;
  if (actorType === "personnage-non-joueur") sourceUpdates.actorLink = false;
  foundry.utils.mergeObject(sourceUpdates, getTokenScaleNormalizationUpdates(doc), { inplace: true });
  const tokenSrc = foundry.utils.getProperty(doc, "texture.src");
  if (isMissingTokenImage(tokenSrc)) {
    const fallbackSrc = getSafeTokenTextureFallback(doc);
    if (fallbackSrc && fallbackSrc !== tokenSrc) {
      sourceUpdates["texture.src"] = fallbackSrc;
    }
  }
  if (Object.keys(sourceUpdates).length) doc.updateSource(sourceUpdates);
});

Hooks.on("drawToken", token => {
  void repairTokenTextureSource(token);
  scheduleRoundTokenMask(token);
});

Hooks.on("refreshToken", token => {
  scheduleRoundTokenMask(token);
});

Hooks.on("createToken", async (tokenDoc) => {
  if (game.user.isGM) {
    const normalizationUpdates = getTokenScaleNormalizationUpdates(tokenDoc);
    if (Object.keys(normalizationUpdates).length) {
      await tokenDoc.update(normalizationUpdates);
    }
  }
  await repairTokenTextureSource(tokenDoc);
  scheduleRoundTokenMask(tokenDoc);
  if (!game.user.isGM) return;
  if (getTokenActorType(tokenDoc) !== "personnage") return;
  await refreshBossSoloNpcPvMax();
});

Hooks.on("preDeleteToken", (tokenDoc) => {
  clearScheduledRoundTokenMask(tokenDoc);
  clearRoundTokenMask(tokenDoc?.object || canvas?.tokens?.get(tokenDoc?.id));
});

Hooks.on("deleteToken", async (tokenDoc) => {
  clearScheduledRoundTokenMask(tokenDoc);
  clearRoundTokenMask(tokenDoc?.object || canvas?.tokens?.get(tokenDoc?.id));
  cleanupOrphanRoundMasks();
  if (!game.user.isGM) return;
  if (getTokenActorType(tokenDoc) !== "personnage") return;
  await refreshBossSoloNpcPvMax();
});

Hooks.on("canvasReady", async () => {
  if (!game.user.isGM) return;
  await refreshBossSoloNpcPvMax();
});

Hooks.on("canvasReady", async () => {
  cleanupOrphanRoundMasks();
  for (const token of canvas?.tokens?.placeables || []) {
    if (game.user.isGM) {
      const tokenDoc = token?.document || token;
      const normalizationUpdates = getTokenScaleNormalizationUpdates(tokenDoc);
      if (Object.keys(normalizationUpdates).length) {
        await tokenDoc.update(normalizationUpdates);
      }
    }
    await repairTokenTextureSource(token);
    applyRoundTokenMask(token);
  }
});

Hooks.on("preCreateCombatant", (combatant) => {
  const name = getCombatantDisplayName(combatant);
  if (name && name !== combatant.name) {
    combatant.updateSource({ name });
  }
});

Hooks.on("updateCombat", (combat, changes) => {
  if (!changes) return;
  if (changes.round != null || changes.turn != null || changes.active != null) {
    focusActiveCombatantToken(combat);
    resetActiveCombatantMoveGauge(combat).catch(error => {
      console.warn("[bloodman] move:gauge reset failed", error);
    });
  }
});

Hooks.on("combatTurnChange", (combat) => {
  focusActiveCombatantToken(combat);
  resetActiveCombatantMoveGauge(combat).catch(error => {
    console.warn("[bloodman] move:gauge reset failed", error);
  });
});

Hooks.on("combatStart", (combat) => {
  focusActiveCombatantToken(combat);
  resetActiveCombatantMoveGauge(combat).catch(error => {
    console.warn("[bloodman] move:gauge reset failed", error);
  });
});

Hooks.on("preUpdateActor", (actor, updateData, options, userId) => {
  if (actor.type !== "personnage" && actor.type !== "personnage-non-joueur") return;
  normalizeCharacteristicXpUpdates(updateData, actor);
  const updaterRole = game.users?.get(userId)?.role ?? game.user?.role;
  let blockedRestrictedFields = false;
  const allowCharacteristicBase = Boolean(options?.bloodmanAllowCharacteristicBase);
  const allowVitalResourceUpdate = Boolean(options?.bloodmanAllowVitalResourceUpdate);

  if (isBasicPlayerRole(updaterRole)) {
    if (!allowCharacteristicBase) {
      blockedRestrictedFields = stripUnauthorizedCharacteristicBaseUpdates(updateData) || blockedRestrictedFields;
    }
    if (!allowVitalResourceUpdate) {
      blockedRestrictedFields = stripUpdatePaths(updateData, Array.from(VITAL_RESOURCE_PATHS)) || blockedRestrictedFields;
    }
    blockedRestrictedFields = stripUpdatePaths(updateData, STATE_MODIFIER_PATHS) || blockedRestrictedFields;
  }
  if (actor.type === "personnage") {
    normalizeCharacteristicBaseUpdatesForRole(updateData, updaterRole, actor);
  }

  // Keep the update silent when restricted fields are stripped so normal
  // submitOnChange interactions remain fluid for players.

  const getUpdatedNumber = (path, fallback) => {
    if (Object.prototype.hasOwnProperty.call(updateData, path)) {
      return toFiniteNumber(updateData[path], fallback);
    }
    const value = foundry.utils.getProperty(updateData, path);
    if (value == null) return toFiniteNumber(fallback, 0);
    return toFiniteNumber(value, fallback);
  };
  const getUpdatedRawValue = (path, fallback) => {
    if (Object.prototype.hasOwnProperty.call(updateData, path)) return updateData[path];
    const value = foundry.utils.getProperty(updateData, path);
    return value == null ? fallback : value;
  };
  const hasUpdatePath = (path) => {
    return Object.prototype.hasOwnProperty.call(updateData, path)
      || foundry.utils.getProperty(updateData, path) !== undefined;
  };

  const archetypeBonusValuePath = "system.profile.archetypeBonusValue";
  const archetypeBonusCharacteristicPath = "system.profile.archetypeBonusCharacteristic";
  const hasArchetypeBonusValueUpdate = hasUpdatePath(archetypeBonusValuePath);
  const hasArchetypeBonusCharacteristicUpdate = hasUpdatePath(archetypeBonusCharacteristicPath);
  if (hasArchetypeBonusValueUpdate || hasArchetypeBonusCharacteristicUpdate) {
    const currentProfile = actor.system?.profile || {};
    const rawBonusValue = getUpdatedRawValue(archetypeBonusValuePath, currentProfile.archetypeBonusValue ?? 0);
    const rawBonusCharacteristic = getUpdatedRawValue(
      archetypeBonusCharacteristicPath,
      currentProfile.archetypeBonusCharacteristic || ""
    );
    const normalizedBonusValue = normalizeArchetypeBonusValue(rawBonusValue, currentProfile.archetypeBonusValue ?? 0);
    if (!Number.isFinite(normalizedBonusValue)) {
      ui.notifications?.error(t("BLOODMAN.Notifications.InvalidArchetypeBonusNumber"));
      return false;
    }
    const normalizedBonusCharacteristic = normalizeCharacteristicKey(rawBonusCharacteristic);
    const normalizedRawCharacteristic = String(rawBonusCharacteristic || "").trim();
    if (normalizedRawCharacteristic && !normalizedBonusCharacteristic) {
      ui.notifications?.error(t("BLOODMAN.Notifications.InvalidArchetypeBonusCharacteristic"));
      return false;
    }
    if (normalizedBonusValue !== 0 && !normalizedBonusCharacteristic) {
      ui.notifications?.error(t("BLOODMAN.Notifications.ArchetypeBonusCharacteristicRequired"));
      return false;
    }
    foundry.utils.setProperty(updateData, archetypeBonusValuePath, normalizedBonusValue);
    foundry.utils.setProperty(updateData, archetypeBonusCharacteristicPath, normalizedBonusCharacteristic);
  }

  const itemBonuses = getItemBonusTotals(actor);
  const storedPvBonus = getUpdatedNumber("system.resources.pv.itemBonus", actor.system.resources?.pv?.itemBonus || 0);
  const storedPpBonus = getUpdatedNumber("system.resources.pp.itemBonus", actor.system.resources?.pp?.itemBonus || 0);
  const currentProfile = actor.system?.profile || {};
  const archetypeBonusValue = normalizeArchetypeBonusValue(
    getUpdatedRawValue("system.profile.archetypeBonusValue", currentProfile.archetypeBonusValue ?? 0),
    currentProfile.archetypeBonusValue ?? 0
  );
  const archetypeBonusCharacteristic = normalizeCharacteristicKey(
    getUpdatedRawValue("system.profile.archetypeBonusCharacteristic", currentProfile.archetypeBonusCharacteristic || "")
  );
  const getEffective = key => {
    const base = getUpdatedNumber(`system.characteristics.${key}.base`, actor.system.characteristics?.[key]?.base || 0);
    const globalMod = getUpdatedNumber("system.modifiers.all", actor.system.modifiers?.all || 0);
    const keyMod = getUpdatedNumber(`system.modifiers.${key}`, actor.system.modifiers?.[key] || 0);
    const itemBonus = Number(itemBonuses?.[key] || 0);
    const profileBonus = archetypeBonusCharacteristic === key && Number.isFinite(archetypeBonusValue)
      ? archetypeBonusValue
      : 0;
    return Number(base) + Number(globalMod) + Number(keyMod) + itemBonus + profileBonus;
  };

  const phyEffective = getEffective("PHY");
  const espEffective = getEffective("ESP");
  const roleOverride = foundry.utils.getProperty(updateData, "system.npcRole");
  const pvMax = getDerivedPvMax(actor, phyEffective, roleOverride) + Number(storedPvBonus || 0);
  const ppMax = Math.round(espEffective / 5) + Number(storedPpBonus || 0);
  const storedPvMax = getUpdatedNumber("system.resources.pv.max", actor.system.resources?.pv?.max);
  const storedPpMax = getUpdatedNumber("system.resources.pp.max", actor.system.resources?.pp?.max);
  const finalPvMax = Number.isFinite(storedPvMax) ? storedPvMax : toFiniteNumber(pvMax, 0);
  const finalPpMax = Number.isFinite(storedPpMax) ? storedPpMax : toFiniteNumber(ppMax, 0);
  const allowedPvMax = Math.max(0, finalPvMax);
  const allowedPpMax = Math.max(0, finalPpMax);

  const pvCurrentPath = "system.resources.pv.current";
  const ppCurrentPath = "system.resources.pp.current";

  if (foundry.utils.getProperty(updateData, pvCurrentPath) != null) {
    const requested = getUpdatedNumber(pvCurrentPath, 0);
    const nextValue = Math.min(requested, allowedPvMax);
    foundry.utils.setProperty(updateData, pvCurrentPath, Math.max(0, toFiniteNumber(nextValue, 0)));
  }

  if (foundry.utils.getProperty(updateData, ppCurrentPath) != null) {
    const requested = getUpdatedNumber(ppCurrentPath, 0);
    const nextValue = Math.min(requested, allowedPpMax);
    foundry.utils.setProperty(updateData, ppCurrentPath, Math.max(0, toFiniteNumber(nextValue, 0)));
  }

  const voyageCurrentPath = "system.resources.voyage.current";
  const voyageTotalPath = "system.resources.voyage.total";
  const voyageMaxPath = "system.resources.voyage.max";

  if (actor.type === "personnage") {
    const hasVoyageUpdate = hasUpdatePath(voyageCurrentPath)
      || hasUpdatePath(voyageTotalPath)
      || hasUpdatePath(voyageMaxPath);
    if (hasVoyageUpdate) {
      const actorVoyageCurrent = normalizeNonNegativeInteger(actor.system?.resources?.voyage?.current, 0);
      const actorVoyageTotal = normalizeNonNegativeInteger(
        actor.system?.resources?.voyage?.total ?? actor.system?.resources?.voyage?.max,
        0
      );
      const requestedCurrent = getUpdatedNumber(voyageCurrentPath, actorVoyageCurrent);
      const requestedTotal = hasUpdatePath(voyageTotalPath)
        ? getUpdatedNumber(voyageTotalPath, actorVoyageTotal)
        : getUpdatedNumber(voyageMaxPath, actorVoyageTotal);
      const normalizedTotal = normalizeNonNegativeInteger(requestedTotal, actorVoyageTotal);
      const normalizedCurrent = Math.min(
        normalizeNonNegativeInteger(requestedCurrent, actorVoyageCurrent),
        normalizedTotal
      );
      foundry.utils.setProperty(updateData, voyageCurrentPath, normalizedCurrent);
      foundry.utils.setProperty(updateData, voyageTotalPath, normalizedTotal);
      foundry.utils.setProperty(updateData, voyageMaxPath, normalizedTotal);
    }
  } else {
    const hasVoyagePayload = hasUpdatePath("system.resources.voyage")
      || hasUpdatePath(voyageCurrentPath)
      || hasUpdatePath(voyageTotalPath)
      || hasUpdatePath(voyageMaxPath);
    if (hasVoyagePayload) {
      stripUpdatePaths(updateData, [
        "system.resources.voyage",
        voyageCurrentPath,
        voyageTotalPath,
        voyageMaxPath
      ]);
      updateData["system.resources.-=voyage"] = null;
    }
  }
});

Hooks.on("updateActor", async (actor, changes) => {
  if (actor.type !== "personnage" && actor.type !== "personnage-non-joueur") return;
  if (!game.user.isGM && !actor.isOwner) return;
  if (foundry.utils.getProperty(changes, "system.resources.move.value") != null) return;
  const hasCharBaseChange = CHARACTERISTICS.some(c => {
    return foundry.utils.getProperty(changes, `system.characteristics.${c.key}.base`) != null;
  });
  const hasModChange = foundry.utils.getProperty(changes, "system.modifiers") != null;
  const hasNpcRoleChange = foundry.utils.getProperty(changes, "system.npcRole") != null;
  if (!hasCharBaseChange && !hasModChange && !hasNpcRoleChange) return;

  const itemBonuses = getItemBonusTotals(actor);
  const profile = actor.system?.profile || {};
  const archetypeBonusValue = normalizeArchetypeBonusValue(profile.archetypeBonusValue, 0);
  const archetypeBonusCharacteristic = normalizeCharacteristicKey(profile.archetypeBonusCharacteristic);
  const getArchetypeBonus = key => {
    if (!Number.isFinite(archetypeBonusValue)) return 0;
    return archetypeBonusCharacteristic === key ? archetypeBonusValue : 0;
  };
  const moveGauge = normalizeActorMoveGauge(actor, { itemBonuses, initializeWhenMissing: true });
  await setActorMoveGauge(actor, moveGauge.value, moveGauge.max);

  const phyEffective = toFiniteNumber(actor.system.characteristics?.PHY?.base, 0)
    + toFiniteNumber(actor.system.modifiers?.all, 0)
    + toFiniteNumber(actor.system.modifiers?.PHY, 0)
    + toFiniteNumber(itemBonuses.PHY, 0)
    + getArchetypeBonus("PHY");
  const espEffective = toFiniteNumber(actor.system.characteristics?.ESP?.base, 0)
    + toFiniteNumber(actor.system.modifiers?.all, 0)
    + toFiniteNumber(actor.system.modifiers?.ESP, 0)
    + toFiniteNumber(itemBonuses.ESP, 0)
    + getArchetypeBonus("ESP");
  const derivedPvMax = getDerivedPvMax(actor, phyEffective);
  const derivedPpMax = Math.round(espEffective / 5);
  const storedPvBonus = toFiniteNumber(actor.system.resources?.pv?.itemBonus, 0);
  const storedPpBonus = toFiniteNumber(actor.system.resources?.pp?.itemBonus, 0);
  const derivedPvTotal = derivedPvMax + storedPvBonus;
  const derivedPpTotal = derivedPpMax + storedPpBonus;
  const pvMax = toFiniteNumber(actor.system.resources?.pv?.max, derivedPvTotal);
  const ppMax = toFiniteNumber(actor.system.resources?.pp?.max, derivedPpTotal);
  const pvCurrent = toFiniteNumber(actor.system.resources?.pv?.current, 0);
  const ppCurrent = toFiniteNumber(actor.system.resources?.pp?.current, 0);
  const allowedPvMax = Math.max(0, pvMax);
  const allowedPpMax = Math.max(0, ppMax);

  const resourceUpdates = {};
  const pvMaxChange = foundry.utils.getProperty(changes, "system.resources.pv.max") != null;
  const ppMaxChange = foundry.utils.getProperty(changes, "system.resources.pp.max") != null;
  if (!pvMaxChange && derivedPvTotal !== pvMax) resourceUpdates["system.resources.pv.max"] = derivedPvTotal;
  if (!ppMaxChange && derivedPpTotal !== ppMax) resourceUpdates["system.resources.pp.max"] = derivedPpTotal;
  if (pvCurrent > allowedPvMax) resourceUpdates["system.resources.pv.current"] = allowedPvMax;
  if (ppCurrent > allowedPpMax) resourceUpdates["system.resources.pp.current"] = allowedPpMax;
  if (Object.keys(resourceUpdates).length) await actor.update(resourceUpdates);

});

Hooks.on("updateActor", async (actor, changes) => {
  if (actor.type !== "personnage" && actor.type !== "personnage-non-joueur") return;
  if (!game.user.isGM) return;
  const hasPvChange = foundry.utils.getProperty(changes, "system.resources.pv.current") != null;
  if (!hasPvChange) return;
  if (actor.isToken) {
    const tokenDoc = actor.token || actor.parent || null;
    const pvCurrent = Number(actor.system?.resources?.pv?.current);
    if (tokenDoc && Number.isFinite(pvCurrent)) {
      await syncZeroPvStatusForToken(tokenDoc, actor.type, pvCurrent);
    }
    return;
  }
  await syncZeroPvStatusForActor(actor);
});

Hooks.on("preUpdateToken", (tokenDoc, changes, options, userId) => {
  if (options?.bloodmanIgnoreMoveLimit) return;
  const hasX = foundry.utils.getProperty(changes, "x") != null;
  const hasY = foundry.utils.getProperty(changes, "y") != null;
  if (!hasX && !hasY) return;

  const combat = getStartedActiveCombat();
  if (!combat) return;
  const combatant = getCombatantForToken(combat, tokenDoc);
  if (!combatant) return;

  const sourceUserId = String(userId || "");
  const currentUserId = String(game.user?.id || "");
  if (sourceUserId && currentUserId && sourceUserId !== currentUserId) return;

  const actorType = getTokenActorType(tokenDoc);
  if (actorType !== "personnage" && actorType !== "personnage-non-joueur") return;
  const actor = tokenDoc?.actor || (tokenDoc?.actorId ? game.actors?.get(tokenDoc.actorId) : null);
  if (!actor) return;

  const gauge = normalizeActorMoveGauge(actor, { initializeWhenMissing: true });
  const remaining = gauge.value;
  const movedCells = getTokenMoveDistanceInCells(tokenDoc, changes);
  if (!Number.isFinite(movedCells)) return;
  const moveCost = Math.max(0, Math.ceil(Math.max(0, movedCells) - TOKEN_MOVE_LIMIT_EPSILON));
  if (moveCost <= TOKEN_MOVE_LIMIT_EPSILON) return;
  if (moveCost > remaining + TOKEN_MOVE_LIMIT_EPSILON) {
    safeWarn(t("BLOODMAN.Notifications.MoveLimitExceeded", { max: remaining, attempted: moveCost }));
    return false;
  }

  options.bloodmanMoveCost = moveCost;
  options.bloodmanMoveCombatId = String(combat.id || "");
});

Hooks.on("updateToken", async (tokenDoc, changes, options, userId) => {
  scheduleRoundTokenMask(tokenDoc);
  const moveCost = Number(options?.bloodmanMoveCost);
  const startedCombat = getStartedActiveCombat();
  const isCombatMove = startedCombat
    && String(options?.bloodmanMoveCombatId || "") === String(startedCombat.id || "")
    && Boolean(getCombatantForToken(startedCombat, tokenDoc));
  const sourceUserId = String(userId || "");
  const currentUserId = String(game.user?.id || "");
  const isSourceUser = sourceUserId ? sourceUserId === currentUserId : Boolean(game.user?.isGM);
  if (isCombatMove && Number.isFinite(moveCost) && moveCost > TOKEN_MOVE_LIMIT_EPSILON && isSourceUser) {
    const actorType = getTokenActorType(tokenDoc);
    if (actorType === "personnage" || actorType === "personnage-non-joueur") {
      const actor = tokenDoc?.actor || (tokenDoc?.actorId ? game.actors?.get(tokenDoc.actorId) : null);
      if (actor) {
        const gauge = normalizeActorMoveGauge(actor, { initializeWhenMissing: true });
        const nextValue = Math.max(0, gauge.value - moveCost);
        await setActorMoveGauge(actor, nextValue, gauge.max);
      }
    }
  }

  if (!game.user.isGM) return;
  if (foundry.utils.getProperty(changes, "name") != null) {
    await syncCombatantNameForToken(tokenDoc);
  }
  const actorType = getTokenActorType(tokenDoc);
  if (actorType !== "personnage" && actorType !== "personnage-non-joueur") return;
  const pvFromUpdate = getTokenPvFromUpdate(tokenDoc, changes);
  if (pvFromUpdate == null) return;
  const pvCurrent = Number.isFinite(pvFromUpdate) ? pvFromUpdate : getTokenCurrentPv(tokenDoc);
  if (!Number.isFinite(pvCurrent)) return;
  await syncZeroPvStatusForToken(tokenDoc, actorType, pvCurrent);
});

class BloodmanActorSheet extends BaseActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["bloodman", "sheet", "actor"],
      template: "systems/bloodman/templates/actor-joueur.html",
      width: 1050,
      height: 820,
      resizable: true,
      submitOnChange: true,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "carac" }]
    });
  }

  get isEditable() {
    if (super.isEditable) return true;
    if (this.actor?.type === "personnage") return true;
    return false;
  }

  clearRerollDisplayState() {
    this.clearCharacteristicRerollState();
    this.clearItemRerollState();
  }

  render(force, options = {}) {
    if (Boolean(force) && !options?.bloodmanKeepRerollState) {
      this.clearRerollDisplayState();
    }
    return super.render(force, options);
  }

  async close(options = {}) {
    this.clearRerollDisplayState();
    return super.close(options);
  }

  async applyActorUpdate(updateData, options = {}) {
    if (!hasActorUpdatePayload(updateData)) return null;
    if (this.actor?.isOwner || game.user?.isGM) {
      return this.actor.update(updateData, options);
    }
    const sent = requestActorSheetUpdate(this.actor, updateData, {
      allowCharacteristicBase: Boolean(options?.bloodmanAllowCharacteristicBase),
      allowVitalResourceUpdate: Boolean(options?.bloodmanAllowVitalResourceUpdate)
    });
    if (!sent) safeWarn("Mise à jour impossible: aucun GM actif.");
    if (sent) {
      // Keep the local sheet responsive while the GM applies the real update.
      try {
        if (typeof this.actor?.updateSource === "function") {
          this.actor.updateSource(foundry.utils.deepClone(updateData));
        }
      } catch (_error) {
        // Non-fatal optimistic update.
      }
    }
    return null;
  }

  async deleteActorItem(item) {
    if (!item) return false;
    if (this.actor?.isOwner || item.isOwner || game.user?.isGM) {
      try {
        await item.delete();
      } catch (_error) {
        // Fallback to GM relay when direct deletion fails on synthetic contexts.
      }
      const itemId = String(item.id || "");
      if (itemId && !this.actor?.items?.has(itemId)) return true;
    }
    const sent = requestDeleteActorItem(this.actor, item);
    if (!sent) safeWarn("Suppression impossible: aucun GM actif.");
    return sent;
  }

  getItemFromListElement(li) {
    if (!li || !this.actor?.items) return null;
    const rawId = String(li.dataset?.itemId || li.getAttribute?.("data-item-id") || "").trim();
    if (rawId) {
      const byId = this.actor.items.get(rawId);
      if (byId) return byId;
    }
    const rawType = String(li.dataset?.itemType || li.getAttribute?.("data-item-type") || "").trim().toLowerCase();
    const nameText = String(li.querySelector?.(".item-name")?.textContent || "").trim();
    if (!nameText) return null;
    const candidates = this.actor.items.filter(item => {
      if (!item) return false;
      if (rawType && String(item.type || "").trim().toLowerCase() !== rawType) return false;
      return String(item.name || "").trim() === nameText;
    });
    if (!candidates.length) return null;
    if (candidates.length === 1) return candidates[0];
    const exactById = rawId ? candidates.find(item => String(item.id || "") === rawId) : null;
    return exactById || candidates[0];
  }

  async _updateObject(_event, formData) {
    if (this.actor?.isOwner || game.user?.isGM) {
      return super._updateObject(_event, formData);
    }

    const allowCharacteristicBase = canCurrentUserEditCharacteristics() && Boolean(this._characteristicsEditEnabled);
    const sanitized = sanitizeActorUpdateForRole(formData, game.user?.role, {
      actor: this.actor,
      allowCharacteristicBase,
      enforceCharacteristicBaseRange: this.actor?.type === "personnage"
    });
    if (!hasActorUpdatePayload(sanitized)) return;
    await this.applyActorUpdate(sanitized, { bloodmanAllowCharacteristicBase: allowCharacteristicBase });
  }

  getData() {
    const data = super.getData();
    const canToggleCharacteristicsEdit = canCurrentUserEditCharacteristics();
    const characteristicBaseHasBounds = data.actor.type === "personnage"
      && isCharacteristicBaseRangeRestrictedRole(game.user?.role);
    const canEditRestrictedFields = canToggleCharacteristicsEdit;
    const canEditXpChecks = canToggleCharacteristicsEdit;
    const canOpenItemSheets = canToggleCharacteristicsEdit;
    if (!canToggleCharacteristicsEdit) this._characteristicsEditEnabled = false;
    const characteristicsEditEnabled = canToggleCharacteristicsEdit && Boolean(this._characteristicsEditEnabled);
    const modifiers = data.actor.system.modifiers || buildDefaultModifiers();
    const isPlayerActor = data.actor.type === "personnage";
    const isNpcActor = data.actor.type === "personnage-non-joueur";
    const profileBonusValue = normalizeArchetypeBonusValue(data.actor.system?.profile?.archetypeBonusValue, 0);
    const profileBonusCharacteristic = normalizeCharacteristicKey(data.actor.system?.profile?.archetypeBonusCharacteristic);
    const rerollKey = this._lastCharacteristicRollKey || "";
    const characteristicRerollActive = isPlayerActor
      ? Boolean(rerollKey)
      : this.isRerollWindowActive(this._lastCharacteristicRollAt);
    const itemRerollState = this.getItemRerollState();
    const itemRerollWindowActive = isPlayerActor
      ? Boolean(itemRerollState?.itemId)
      : this.isRerollWindowActive(itemRerollState?.at);
    const itemRerollContext = itemRerollState?.damage || null;
    const itemRerollKind = String(itemRerollContext?.kind || "item-damage");
    const itemRerollType = String(itemRerollContext?.itemType || "").toLowerCase();
    const itemRerollAllowed = itemRerollKind === "item-damage" && isDamageRerollItemType(itemRerollType);
    const itemRerollActive = Boolean(itemRerollState?.itemId) && itemRerollWindowActive && itemRerollAllowed;
    const activeRerollKey = characteristicRerollActive ? rerollKey : "";
    const lastItemRerollId = itemRerollActive ? (itemRerollState?.itemId || "") : "";
    const chaosValue = getChaosValue();
    const hasChaosForReroll = isNpcActor && game.user.isGM && chaosValue > 0;
    const canUseCharacteristicReroll = (isPlayerActor || hasChaosForReroll) && characteristicRerollActive;
    const canUseItemReroll = (isPlayerActor || hasChaosForReroll) && itemRerollActive;
    const shouldShowItemReroll = itemId => {
      if (!canUseItemReroll) return false;
      return itemId === lastItemRerollId;
    };

    const itemBonuses = getItemBonusTotals(data.actor);
    const characteristics = CHARACTERISTICS.map(c => {
      const label = t(c.labelKey) || c.key;
      const base = Number(data.actor.system.characteristics?.[c.key]?.base || 0);
      const xp = Array.isArray(data.actor.system.characteristics?.[c.key]?.xp)
        ? data.actor.system.characteristics[c.key].xp
        : [false, false, false];
      const flat = Number(modifiers.all || 0) + Number(modifiers[c.key] || 0);
      const itemBonus = Number(itemBonuses[c.key] || 0);
      const profileBonus = profileBonusCharacteristic === c.key && Number.isFinite(profileBonusValue)
        ? profileBonusValue
        : 0;
      const totalBonus = itemBonus + profileBonus;
      const effective = base + flat + totalBonus;
      const xpReady = xp.every(Boolean);
      const showReroll = canUseCharacteristicReroll && activeRerollKey === c.key;
      const showRerollClear = isPlayerActor && showReroll;
      return {
        key: c.key,
        label,
        icon: c.icon,
        base,
        effective,
        itemBonus: totalBonus,
        xp,
        xpReady,
        showReroll,
        showRerollClear
      };
    });
    const totalPoints = characteristics.reduce((sum, c) => sum + Number(c.base || 0), 0);

    const phy = characteristics.find(c => c.key === "PHY")?.effective ?? 0;
    const esp = characteristics.find(c => c.key === "ESP")?.effective ?? 0;
    const startedCombat = getStartedActiveCombat();
    const moveGaugeActive = isActorInStartedActiveCombat(this.actor, startedCombat);
    const moveGauge = normalizeActorMoveGauge(this.actor, { itemBonuses, initializeWhenMissing: true });
    const moveValue = moveGaugeActive ? moveGauge.value : moveGauge.max;
    const moveMax = moveGauge.max;
    const pvBase = getDerivedPvMax(this.actor, phy);

    const resources = foundry.utils.mergeObject(
      buildDefaultResources({ includeVoyage: isPlayerActor }),
      data.actor.system.resources || {},
      {
        inplace: false
      }
    );
    resources.pv.max = Math.max(0, toFiniteNumber(resources.pv.max, pvBase));
    resources.pp.max = Math.max(0, toFiniteNumber(resources.pp.max, Math.round(esp / 5)));
    resources.pv.current = Math.max(0, Math.min(toFiniteNumber(resources.pv.current, 0), resources.pv.max));
    resources.pp.current = Math.max(0, Math.min(toFiniteNumber(resources.pp.current, 0), resources.pp.max));
    resources.move.max = moveMax;
    resources.move.value = moveValue;
    if (isPlayerActor) {
      const voyageTotal = normalizeNonNegativeInteger(resources.voyage?.total ?? resources.voyage?.max, 0);
      const voyageCurrent = Math.min(
        normalizeNonNegativeInteger(resources.voyage?.current, 0),
        voyageTotal
      );
      resources.voyage = {
        current: voyageCurrent,
        total: voyageTotal,
        max: voyageTotal
      };
    } else if (resources.voyage != null) {
      delete resources.voyage;
    }
    {
      const pvMax = Math.max(0, toFiniteNumber(resources.pv.max, 0));
      const pvCurrent = Math.max(0, toFiniteNumber(resources.pv.current, 0));
      const pvRatio = pvMax > 0 ? Math.max(0, Math.min(1, pvCurrent / pvMax)) : 0;
      const pvPercent = Math.max(0, Math.min(100, pvRatio * 100));
      const pvSteps = Math.max(1, Math.round(pvMax || 1));
      const pvStateClass = pvRatio <= 0
        ? "is-empty"
        : pvRatio <= 0.25
          ? "is-critical"
          : pvRatio <= 0.5
            ? "is-warning"
            : "is-healthy";
      resources.pv.ratio = pvRatio.toFixed(4);
      resources.pv.fill = `${pvPercent.toFixed(2)}%`;
      resources.pv.steps = pvSteps;
      resources.pv.stateClass = pvStateClass;
    }
    {
      const ppMax = Math.max(0, toFiniteNumber(resources.pp.max, 0));
      const ppCurrent = Math.max(0, toFiniteNumber(resources.pp.current, 0));
      const ppRatio = ppMax > 0 ? Math.max(0, Math.min(1, ppCurrent / ppMax)) : 0;
      const ppPercent = Math.max(0, Math.min(100, ppRatio * 100));
      const ppSteps = Math.max(1, Math.round(ppMax || 1));
      const ppStateClass = ppRatio <= 0
        ? "is-empty"
        : ppRatio <= 0.25
          ? "is-critical"
          : ppRatio <= 0.5
            ? "is-warning"
            : "is-healthy";
      resources.pp.ratio = ppRatio.toFixed(4);
      resources.pp.fill = `${ppPercent.toFixed(2)}%`;
      resources.pp.steps = ppSteps;
      resources.pp.stateClass = ppStateClass;
    }

    const moveChar = characteristics.find(c => c.key === "MOU");
    if (moveChar) {
      moveChar.moveValue = moveValue;
      moveChar.moveMax = moveMax;
      moveChar.showMoveValue = true;
    }

    const profile = foundry.utils.mergeObject(buildDefaultProfile(), data.actor.system.profile || {}, {
      inplace: false
    });
    profile.archetypeBonusValue = Number.isFinite(profileBonusValue) ? profileBonusValue : 0;
    profile.archetypeBonusCharacteristic = profileBonusCharacteristic;
    const archetypeCharacteristicOptions = CHARACTERISTICS.map(characteristic => ({
      key: characteristic.key,
      label: t(characteristic.labelKey) || characteristic.key
    }));
    const equipment = foundry.utils.mergeObject(buildDefaultEquipment(), data.actor.system.equipment || {}, {
      inplace: false
    });
    const ammo = foundry.utils.mergeObject(buildDefaultAmmo(), data.actor.system.ammo || {}, { inplace: false });
    const transportNpcs = buildTransportNpcDisplayData(this.actor);

    const itemBuckets = {
      arme: [],
      objet: [],
      ration: [],
      soin: [],
      protection: [],
      aptitude: [],
      pouvoir: []
    };
    for (const item of this.actor.items) {
      if (itemBuckets[item.type]) itemBuckets[item.type].push(item);
    }

    const aptitudes = itemBuckets.aptitude.map(item => {
      const dataItem = buildItemDisplayData(item);
      dataItem.showItemReroll = Boolean(dataItem.displayDamageDie) && shouldShowItemReroll(item.id);
      return dataItem;
    });
    const pouvoirs = itemBuckets.pouvoir.map(item => {
      const dataItem = buildItemDisplayData(item);
      dataItem.showItemReroll = Boolean(dataItem.displayDamageDie) && shouldShowItemReroll(item.id);
      return dataItem;
    });
    const aptitudesTwoColumns = aptitudes.length >= 2;
    const pouvoirsTwoColumns = pouvoirs.length >= 2;

    const npcRole = data.actor.system.npcRole || "";

    const weaponTypeDistance = t("BLOODMAN.Equipment.WeaponType.Distance");
    const weaponTypeMelee = t("BLOODMAN.Equipment.WeaponType.Melee");
    const weapons = itemBuckets.arme.map(item => {
      const weapon = item.toObject();
      weapon._id = weapon._id ?? item.id;
      const normalized = normalizeWeaponType(weapon.system?.weaponType);
      if (normalized === "corps") weapon.displayWeaponType = weaponTypeMelee;
      else if (normalized === "distance") weapon.displayWeaponType = weaponTypeDistance;
      else if (weapon.system?.weaponType) weapon.displayWeaponType = weapon.system.weaponType;
      else weapon.displayWeaponType = weaponTypeDistance;
      weapon.showItemReroll = shouldShowItemReroll(item.id);
      return weapon;
    });

    const soins = itemBuckets.soin.map(item => {
      const heal = item.toObject();
      heal._id = heal._id ?? item.id;
      heal.showItemReroll = false;
      return heal;
    });
    const carriedItemsCount = itemBuckets.objet.length + itemBuckets.soin.length + itemBuckets.ration.length;
    const equipmentThreeColumns = carriedItemsCount >= 2;

    return {
      ...data,
      canToggleCharacteristicsEdit,
      characteristicBaseHasBounds,
      characteristicBaseMin: CHARACTERISTIC_BASE_MIN,
      characteristicBaseMax: CHARACTERISTIC_BASE_MAX,
      canEditRestrictedFields,
      canEditXpChecks,
      canOpenItemSheets,
      characteristicsEditEnabled,
      characteristics,
      totalPoints,
      modifiers,
      resources,
      profile,
      archetypeCharacteristicOptions,
      npcRole,
      npcRoleSbire: npcRole === "sbire",
      npcRoleSbireFort: npcRole === "sbire-fort",
      npcRoleBossSeul: npcRole === "boss-seul",
      equipment,
      weapons,
      objects: itemBuckets.objet,
      rations: itemBuckets.ration,
      soins,
      protections: itemBuckets.protection,
      aptitudes,
      pouvoirs,
      ammo,
      transportNpcs,
      equipmentThreeColumns,
      aptitudesTwoColumns,
      pouvoirsTwoColumns
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    const canToggleCharacteristicsEdit = canCurrentUserEditCharacteristics();
    const basicPlayer = isBasicPlayerRole(game.user?.role);
    const forceEnableSheetUi = () => {
      const root = this.element;
      if (!root?.length) return;
      if (basicPlayer) {
        root.find("input, textarea, select, button").prop("disabled", false);
      }
      if (canToggleCharacteristicsEdit) {
        root.find(".char-edit-toggle").prop("disabled", false);
        root
          .find("input[name='system.resources.pv.current'], input[name='system.resources.pv.max'], input[name='system.resources.pp.current'], input[name='system.resources.pp.max']")
          .prop("disabled", false)
          .prop("readonly", false);
      }
      if (this._characteristicsEditEnabled) {
        root
          .find("input[name^='system.characteristics.'][name$='.base']")
          .prop("disabled", false)
          .prop("readonly", false);
      }
    };
    forceEnableSheetUi();
    setTimeout(forceEnableSheetUi, 0);
    this.refreshResourceVisuals(html);
    setTimeout(() => this.refreshResourceVisuals(html), 0);

    html.on("click", ".char-edit-toggle", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      if (!canCurrentUserEditCharacteristics()) return;
      this._characteristicsEditEnabled = !this._characteristicsEditEnabled;
      this.render(false);
    });

    html.on("change", "input[name='system.resources.pv.current'], input[name='system.resources.pv.max'], input[name='system.resources.pp.current'], input[name='system.resources.pp.max']", async ev => {
      if (!canCurrentUserEditCharacteristics()) return;
      if (this.actor?.isOwner) return;
      ev.preventDefault();
      ev.stopPropagation();
      const input = ev.currentTarget;
      const path = String(input?.name || "");
      if (!VITAL_RESOURCE_PATHS.has(path)) return;
      const nextValue = Math.max(0, Math.floor(toFiniteNumber(input?.value, 0)));
      requestVitalResourceUpdate(this.actor, path, nextValue);
    });

    html.on("input change", "input[name='system.resources.pv.current'], input[name='system.resources.pv.max'], input[name='system.resources.pp.current'], input[name='system.resources.pp.max']", () => {
      this.refreshResourceVisuals(html);
    });

    html.find(".luck-roll").click(ev => {
      ev.preventDefault();
      ev.stopPropagation();
      this.rollLuck();
    });

    html.find(".char-icon").click(ev => {
      const row = ev.currentTarget.closest(".char-row");
      const key = row?.dataset?.key;
      this.handleCharacteristicRoll(key);
    });

    html.find(".char-roll").click(ev => {
      const key = ev.currentTarget.dataset.key;
      this.handleCharacteristicRoll(key);
    });

    html.find(".char-reroll").click(ev => {
      const key = ev.currentTarget.dataset.key;
      this.rerollCharacteristic(key);
    });

    html.find(".char-reroll-clear").click(ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const key = ev.currentTarget.dataset.key;
      this.clearCharacteristicReroll(key);
    });

    html.find(".weapon-roll").click(ev => {
      const li = ev.currentTarget.closest(".item");
      const item = this.getItemFromListElement(li);
      this.rollDamage(item);
    });

    html.find(".ability-roll").click(ev => {
      const li = ev.currentTarget.closest(".item");
      const item = this.getItemFromListElement(li);
      this.rollAbilityDamage(item);
    });

    html.find(".item-delete").click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const li = ev.currentTarget.closest(".item");
      const item = this.getItemFromListElement(li);
      if (!item) return;
      await this.deleteActorItem(item);
      this.render(false);
    });

    html.find(".item-edit").click(ev => {
      if (!canCurrentUserEditCharacteristics()) return;
      const li = ev.currentTarget.closest(".item");
      const item = this.getItemFromListElement(li);
      item?.sheet?.render(true);
    });

    html.find(".item-use").click(async ev => {
      const li = ev.currentTarget.closest(".item");
      const item = this.getItemFromListElement(li);
      await this.useItem(item);
    });

    html.find(".item-reroll").click(ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const li = ev.currentTarget.closest(".item");
      const itemId = li?.dataset?.itemId;
      this.rerollItemRoll(itemId);
    });

    html.find(".item-reroll-clear").click(ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const li = ev.currentTarget.closest(".item");
      const itemId = li?.dataset?.itemId;
      this.clearItemReroll(itemId);
    });

    html.find(".transport-npc-open").click(ev => {
      const li = ev.currentTarget.closest(".item");
      const ref = li?.dataset?.transportNpcRef;
      const npc = resolveTransportNpc(ref);
      npc?.sheet?.render(true);
    });

    html.find(".transport-npc-delete").click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const li = ev.currentTarget.closest(".item");
      const ref = li?.dataset?.transportNpcRef;
      if (!ref) return;
      const refs = getTransportNpcRefs(this.actor);
      const nextRefs = refs.filter(entry => entry !== ref);
      await this.applyActorUpdate({ "system.equipment.transportNpcs": nextRefs });
    });

    html.find(".xp-check input").change(async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const input = ev.currentTarget;
      if (!canCurrentUserEditCharacteristics()) {
        input.checked = !Boolean(input.checked);
        return;
      }
      const row = input.closest(".char-row");
      const key = row?.dataset?.key;
      const index = Number(input.dataset.index);
      if (!key || !Number.isFinite(index)) return;
      const xp = Array.isArray(this.actor.system.characteristics?.[key]?.xp)
        ? [...this.actor.system.characteristics[key].xp]
        : [false, false, false];
      xp[index] = Boolean(input.checked);
      await this.applyActorUpdate({ [`system.characteristics.${key}.xp`]: xp });
      foundry.utils.setProperty(this.actor, `system.characteristics.${key}.xp`, xp);
      const ready = xp.length === 3 && xp.every(Boolean);
      if (ready) setTimeout(() => this.promptGrowthRoll(key), 0);
    });

    html.find(".xp-roll").click(ev => {
      const key = ev.currentTarget.dataset.key;
      this.rollGrowth(key);
    });
  }

  refreshResourceVisuals(html) {
    const root = html?.find ? html : this.element;
    if (!root?.length) return;
    const updateGauge = (kind, currentPath, maxPath) => {
      const currentInput = root.find(`input[name='${currentPath}']`).first();
      const maxInput = root.find(`input[name='${maxPath}']`).first();
      const circle = root.find(`.resource-circle.${kind}`).first();
      if (!currentInput.length || !maxInput.length || !circle.length) return;

      const current = Math.max(0, toFiniteNumber(currentInput.val(), 0));
      const maxRaw = Math.max(0, toFiniteNumber(maxInput.val(), 0));
      const max = maxRaw > 0 ? maxRaw : 1;
      const ratio = Math.max(0, Math.min(1, current / max));
      const fill = `${Math.max(0, Math.min(100, ratio * 100)).toFixed(2)}%`;
      const steps = Math.max(1, Math.round(maxRaw || 1));
      const ratioKey = `data-${kind}-ratio`;
      const previousRatio = Number(circle.attr(ratioKey));

      circle.css(`--${kind}-fill`, fill);
      circle.css(`--${kind}-ratio`, ratio.toFixed(4));
      circle.css(`--${kind}-steps`, String(steps));
      circle.attr(ratioKey, ratio.toFixed(4));

      circle.removeClass("is-empty is-critical is-warning is-healthy");
      if (ratio <= 0) circle.addClass("is-empty");
      else if (ratio <= 0.25) circle.addClass("is-critical");
      else if (ratio <= 0.5) circle.addClass("is-warning");
      else circle.addClass("is-healthy");

      if (Number.isFinite(previousRatio) && Math.abs(previousRatio - ratio) >= 0.001) {
        const directionClass = ratio > previousRatio ? "is-rising" : "is-falling";
        const timerKey = kind === "pv" ? "_pvGaugePulseTimer" : "_ppGaugePulseTimer";
        circle.removeClass("is-rising is-falling");
        circle.addClass(directionClass);
        if (this[timerKey]) clearTimeout(this[timerKey]);
        this[timerKey] = setTimeout(() => {
          circle.removeClass("is-rising is-falling");
        }, 380);
      }
    };

    updateGauge("pv", "system.resources.pv.current", "system.resources.pv.max");
    updateGauge("pp", "system.resources.pp.current", "system.resources.pp.max");
  }

  async _onDrop(event) {
    const data = TextEditor.getDragEventData(event);
    if (data?.type === "Actor") {
      const handled = await this._onDropTransportNpc(event, data);
      if (handled) return;
    }
    return super._onDrop(event);
  }

  async _onDropItem(event, data) {
    const reachedLimit = await this._reachedCarriedItemsLimit(data);
    if (reachedLimit) return null;
    return super._onDropItem(event, data);
  }

  async _reachedCarriedItemsLimit(data) {
    if (this.actor.type !== "personnage") return false;
    const droppedItem = await Item.implementation.fromDropData(data).catch(() => null);
    if (!droppedItem || !CARRIED_ITEM_TYPES.has(droppedItem.type)) return false;

    const sourceActor = droppedItem.actor;
    if (sourceActor?.id === this.actor.id) return false;

    const carriedCount = this.actor.items.filter(item => CARRIED_ITEM_TYPES.has(item.type)).length;
    if (carriedCount < CARRIED_ITEM_LIMIT) return false;

    ui.notifications?.warn(t("BLOODMAN.Notifications.MaxCarriedItems", { max: CARRIED_ITEM_LIMIT }));
    return true;
  }

  async _onDropTransportNpc(event, data) {
    const transportZone = event.target?.closest?.("[data-transport-drop]");
    if (!transportZone) return false;
    const droppedActor = await Actor.implementation.fromDropData(data).catch(() => null);
    if (!droppedActor || droppedActor.type !== "personnage-non-joueur") return true;

    const ref = droppedActor.uuid || droppedActor.id;
    if (!ref) return true;

    const refs = getTransportNpcRefs(this.actor);
    if (refs.includes(ref)) return true;
    await this.applyActorUpdate({ "system.equipment.transportNpcs": [...refs, ref] });
    return true;
  }

  async rollLuck() {
    if (this.actor.type !== "personnage") return;

    const roll = await new Roll("2d100").evaluate();
    const results = getRollValuesFromRoll(roll);
    const chanceValue = Number(results[0] || 0);
    const luckValue = Number(results[1] || 0);
    const success = luckValue <= chanceValue;
    const outcome = t(success ? "BLOODMAN.Rolls.Success" : "BLOODMAN.Rolls.Failure");
    const luckLabel = t("BLOODMAN.Common.LuckRoll");
    const actorName = String(this.actor.name || "").trim() || t("BLOODMAN.Common.Name");
    const content = `<p><strong>${actorName}</strong> - ${luckLabel} : <strong>${outcome}</strong></p><p><small>D1: <strong>${chanceValue}</strong> | D2: <strong>${luckValue}</strong></small></p>`;
    let usedDice3d = false;
    try {
      if (game?.dice3d && typeof game.dice3d.showForRoll === "function") {
        await game.dice3d.showForRoll(roll, game.user, true);
        usedDice3d = true;
      }
    } catch (error) {
      console.warn("[bloodman] luck:dice3d feedback failed", error);
    }
    const diceSound = String(CONFIG?.sounds?.dice || "").trim();

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content,
      ...(usedDice3d || !diceSound ? {} : { sound: diceSound })
    });
  }

  async handleCharacteristicRoll(key) {
    if (!key) return;
    this.markCharacteristicReroll(key);
    await doCharacteristicRoll(this.actor, key);
    if (this.actor.type === "personnage") {
      await this.markXpProgress(key);
    }
    this.render(false);
  }

  async rerollCharacteristic(key) {
    if (!key) return;

    if (this.actor.type === "personnage") {
      if (this._lastCharacteristicRollKey !== key) return;
      const currentPP = toFiniteNumber(this.actor.system.resources?.pp?.current, 0);
      if (!Number.isFinite(currentPP) || currentPP < CHARACTERISTIC_REROLL_PP_COST) {
        ui.notifications?.warn(t("BLOODMAN.Notifications.NotEnoughPPReroll", { cost: CHARACTERISTIC_REROLL_PP_COST }));
        return;
      }

      await this.applyActorUpdate({ "system.resources.pp.current": Math.max(0, currentPP - CHARACTERISTIC_REROLL_PP_COST) }, {
        bloodmanAllowVitalResourceUpdate: true
      });
      await doCharacteristicRoll(this.actor, key);
      await requestChaosDelta(CHAOS_PER_PLAYER_REROLL);
      this.markCharacteristicReroll(key);
      this.render(false);
      return;
    }

    if (this.actor.type !== "personnage-non-joueur" || !game.user.isGM) return;
    if (this._lastCharacteristicRollKey !== key || !this.isRerollWindowActive(this._lastCharacteristicRollAt)) return;
    const currentChaos = getChaosValue();
    if (currentChaos < CHAOS_COST_NPC_REROLL) {
      ui.notifications?.warn(t("BLOODMAN.Notifications.NotEnoughChaosReroll"));
      this.render(false);
      return;
    }

    await setChaosValue(currentChaos - CHAOS_COST_NPC_REROLL);
    await doCharacteristicRoll(this.actor, key);
    this.markCharacteristicReroll(key);
    this.render(false);
  }

  clearCharacteristicReroll(key) {
    if (!key || this._lastCharacteristicRollKey !== key) return;
    this.clearCharacteristicRerollState();
    this.render(false);
  }

  async markXpProgress(key) {
    if (this.actor.type !== "personnage") return;
    const xp = Array.isArray(this.actor.system.characteristics?.[key]?.xp)
      ? [...this.actor.system.characteristics[key].xp]
      : [false, false, false];
    const index = xp.findIndex(value => !value);
    if (index === -1) return;
    xp[index] = true;
    await this.applyActorUpdate({ [`system.characteristics.${key}.xp`]: xp });
    foundry.utils.setProperty(this.actor, `system.characteristics.${key}.xp`, xp);
    if (xp.length === 3 && xp.every(Boolean)) this.promptGrowthRoll(key);
  }

  async rollDamage(item) {
    if (!item) return;
    const result = await doDamageRoll(this.actor, item);
    if (!result) return;
    await playItemAudio(item);
    if (result?.context) {
      result.context.kind = "item-damage";
      result.context.itemType = String(item.type || "arme");
      this.markItemReroll(item.id, result.context);
    }
    this.render(false);
  }

  async rollAbilityDamage(item) {
    if (!item) return;
    const formula = normalizeRollDieFormula(item.system?.damageDie, "d4");
    const beforeRoll = async () => applyPowerCost(this.actor, item);
    const result = await doDirectDamageRoll(this.actor, formula, item.name, {
      beforeRoll,
      itemId: item.id,
      itemType: item.type
    });
    if (!result) return;
    await playItemAudio(item);
    if (result?.context) {
      result.context.kind = "item-damage";
      result.context.itemType = String(item.type || "");
      this.markItemReroll(item.id, result.context);
    }
    this.render(false);
  }

  async useItem(item) {
    if (!item) return;
    if (item.type === "soin") {
      const healAudioRef = {
        id: item.id,
        type: item.type,
        name: item.name,
        system: { audioFile: item.system?.audioFile }
      };
      if (this.actor?.isOwner || game.user?.isGM) {
        const result = await doHealRoll(this.actor, item);
        if (result) await playItemAudio(healAudioRef);
        if (result && this.actor.items.get(item.id)) this.render(false);
      } else {
        const formula = normalizeRollDieFormula(item.system?.healDie, "d4");
        const roll = await new Roll(formula).evaluate();
        const current = toFiniteNumber(this.actor.system?.resources?.pv?.current, 0);
        const max = toFiniteNumber(this.actor.system?.resources?.pv?.max, current);
        const nextValue = max > 0 ? Math.min(current + roll.total, max) : current + roll.total;
        await this.applyActorUpdate({ "system.resources.pv.current": nextValue }, {
          bloodmanAllowVitalResourceUpdate: true
        });
        roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          flavor: t("BLOODMAN.Rolls.Heal.Gain", { name: this.actor.name, amount: roll.total })
        });
        await playItemAudio(healAudioRef);
        await this.deleteActorItem(item);
        this.render(false);
      }
      return;
    }
    if (item.type === "ration") {
      await this.deleteActorItem(item);
      this.render(false);
      return;
    }
    if (item.type === "objet") {
      if (!toBooleanFlag(item.system?.useEnabled)) return;
      await this.deleteActorItem(item);
      this.render(false);
    }
  }

  async rerollItemRoll(itemId) {
    if (!itemId) return;
    const item = this.actor.items.get(itemId);
    if (!item) return;
    if (!isDamageRerollItemType(item.type)) return;
    const state = this.getItemRerollState();
    const context = state?.damage;
    if (!context || state?.itemId !== itemId) return;
    context.kind = String(context.kind || "item-damage");
    context.itemType = String(context.itemType || item.type || "").toLowerCase();
    if (context.kind !== "item-damage" || !isDamageRerollItemType(context.itemType)) return;
    if (this.actor.type !== "personnage" && !this.isRerollWindowActive(state?.at)) return;
    let targets = normalizeRerollTargets(context.targets).filter(Boolean);
    if (!targets.length) {
      const selected = Array.from(game.user.targets || []);
      if (selected.length) {
        const requestedTotal = Math.max(0, Math.floor(Number(context.totalDamage || 0)));
        targets = buildFallbackRerollTargets(selected, requestedTotal);
        context.targets = targets;
      }
    }
    if (!targets.length) {
      ui.notifications?.warn(t("BLOODMAN.Notifications.NoTargetSelected"));
      return;
    }
    if (!this.isDamageRerollReady({ ...context, targets })) {
      ui.notifications?.warn("Relance indisponible : le dernier jet de degats n'est pas encore confirme.");
      this.render(false);
      return;
    }

    const isPlayerActor = this.actor.type === "personnage";
    const isNpcActor = this.actor.type === "personnage-non-joueur";
    if (!isPlayerActor && !isNpcActor) return;
    const validationMeta = {
      rollId: context.rollId,
      itemId,
      itemType: context.itemType
    };

    if (isPlayerActor) {
      const currentPP = toFiniteNumber(this.actor.system.resources?.pp?.current, 0);
      if (currentPP < CHARACTERISTIC_REROLL_PP_COST) {
        ui.notifications?.warn(t("BLOODMAN.Notifications.NotEnoughPPReroll", { cost: CHARACTERISTIC_REROLL_PP_COST }));
        return;
      }
      await this.applyActorUpdate({ "system.resources.pp.current": Math.max(0, currentPP - CHARACTERISTIC_REROLL_PP_COST) }, {
        bloodmanAllowVitalResourceUpdate: true
      });
      const nextPP = toFiniteNumber(this.actor.system.resources?.pp?.current, 0);
      const expectedPP = Math.max(0, currentPP - CHARACTERISTIC_REROLL_PP_COST);
      logDamageRerollValidation("resource-player-pp", {
        ...validationMeta,
        before: currentPP,
        after: nextPP,
        expected: expectedPP,
        cost: CHARACTERISTIC_REROLL_PP_COST,
        okResource: validateNumericEquality(nextPP, expectedPP)
      });
      await requestChaosDelta(CHAOS_PER_PLAYER_REROLL);
    } else {
      if (!game.user.isGM) return;
      const currentChaos = getChaosValue();
      if (currentChaos < CHAOS_COST_NPC_REROLL) {
        ui.notifications?.warn(t("BLOODMAN.Notifications.NotEnoughChaosReroll"));
        this.render(false);
        return;
      }
      await setChaosValue(currentChaos - CHAOS_COST_NPC_REROLL);
      const nextChaos = getChaosValue();
      const expectedChaos = Math.max(0, currentChaos - CHAOS_COST_NPC_REROLL);
      logDamageRerollValidation("resource-gm-chaos", {
        ...validationMeta,
        before: currentChaos,
        after: nextChaos,
        expected: expectedChaos,
        cost: CHAOS_COST_NPC_REROLL,
        okResource: validateNumericEquality(nextChaos, expectedChaos)
      });
    }

    const roll = await new Roll(context.formula || "1d4").evaluate();
    const rollResults = getRollValuesFromRoll(roll);
    const totalDamage = Math.max(0, Number(roll.total || 0) + Math.max(0, Number(context.bonusBrut || 0)));
    const allocations = buildRerollAllocations(context, totalDamage);
    const penetrationValue = Math.max(0, Number(context.penetration || 0));
    const hasActiveGM = game.users?.some(user => user.active && user.isGM) || false;

    const damageLabel = context.degats || context.formula || "";
    roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: `${t("BLOODMAN.Rolls.Damage.Deal", {
        name: this.actor.name,
        amount: totalDamage,
        source: context.itemName ? ` (${context.itemName})` : ""
      })}<br><small>${damageLabel} + ${context.bonusBrut} | PEN ${context.penetration} | ${t("BLOODMAN.Common.Reroll")}</small>`
    });

    if (!game.user.isGM && hasActiveGM) {
      const requestId = foundry.utils?.randomID ? foundry.utils.randomID() : Math.random().toString(36).slice(2);
      const socketTargets = normalizeRerollTargets(allocations, { includeAliases: true });
      const rerollPayload = {
        type: "rerollDamage",
        requestId,
        kind: "item-damage",
        rerollUsed: false,
        attackerUserId: game.user?.id || "",
        attackerId: context.attackerId || this.actor.id,
        rollId: context.rollId,
        itemId: context.itemId || itemId,
        itemType: context.itemType || item.type,
        itemName: context.itemName || item.name,
        damageFormula: context.formula,
        damageLabel: context.degats,
        bonusBrut: context.bonusBrut,
        penetration: context.penetration,
        totalDamage,
        rollResults,
        targets: socketTargets
      };
      if (game.socket) game.socket.emit(SYSTEM_SOCKET, rerollPayload);
      const gmIds = getActiveGMUserIds();
      if (gmIds.length) {
        await ChatMessage.create({
          content: REROLL_REQUEST_CHAT_MARKUP,
          whisper: gmIds,
          flags: { bloodman: { rerollDamageRequest: rerollPayload } }
        }).catch(() => null);
      }
      console.debug("[bloodman] reroll:send", {
        requestId,
        attackerUserId: game.user?.id || "",
        attackerId: context.attackerId || this.actor.id,
        rollId: context.rollId,
        itemId: context.itemId || itemId,
        itemType: context.itemType || item.type,
        totalDamage,
        penetration: context.penetration,
        targets: socketTargets
      });
      this.markItemReroll(itemId, context);
      this.render(false);
      return;
    }

    for (const rawTarget of allocations) {
      const target = normalizeRerollTarget(rawTarget);
      const tokenDoc = await resolveDamageTokenDocument(target);
      const tokenIsLinked = tokenDoc ? Boolean(tokenDoc.actorLink) : toBooleanFlag(target.targetActorLink);
      const targetActor = tokenIsLinked
        ? (tokenDoc?.actor || (target.actorId ? game.actors?.get(target.actorId) : null))
        : null;
      const rawHpBefore = target?.hpBefore;
      let hpBefore = (rawHpBefore == null || rawHpBefore === "")
        ? Number.NaN
        : Number(rawHpBefore);
      if (!Number.isFinite(hpBefore)) {
        const referenceShare = Math.max(0, Math.floor(Number(target.baseShare ?? target.share ?? 0)));
        if (tokenIsLinked && targetActor) {
          const currentHp = Number(targetActor.system?.resources?.pv?.current);
          if (Number.isFinite(currentHp)) {
            const paInitial = getProtectionPA(targetActor);
            const paEffective = Math.max(0, paInitial - penetrationValue);
            const estimatedFinalDamage = Math.max(0, referenceShare - paEffective);
            hpBefore = currentHp + estimatedFinalDamage;
          }
        } else if (tokenDoc) {
          const currentHp = Number(getTokenCurrentPv(tokenDoc));
          if (Number.isFinite(currentHp)) {
            const paInitial = getProtectionPA(tokenDoc.actor || null);
            const paEffective = Math.max(0, paInitial - penetrationValue);
            const estimatedFinalDamage = Math.max(0, referenceShare - paEffective);
            hpBefore = currentHp + estimatedFinalDamage;
          }
        }
      }
      if (Number.isFinite(hpBefore)) {
        if (tokenIsLinked && targetActor) {
          await targetActor.update({ "system.resources.pv.current": hpBefore });
        } else if (tokenDoc) {
          await tokenDoc.update({ "delta.system.resources.pv.current": hpBefore });
        }
        if (tokenDoc) {
          const actorType = getTokenActorType(tokenDoc);
          if (actorType) await syncZeroPvStatusForToken(tokenDoc, actorType, hpBefore);
        }
      }
      const restoredPv = tokenIsLinked && targetActor
        ? Number(targetActor.system?.resources?.pv?.current)
        : Number(getTokenCurrentPv(tokenDoc));
      const okRestored = Number.isFinite(hpBefore)
        ? validateNumericEquality(restoredPv, hpBefore)
        : false;

      const share = Math.max(0, Math.floor(Number(target.share || 0)));
      if (!share) {
        logDamageRerollValidation("local-target-zero-share", {
          ...validationMeta,
          targetName: target.targetName || tokenDoc?.name || "Cible",
          share,
          hpBefore,
          restoredPv,
          okRestored,
          okReapplied: okRestored
        });
        continue;
      }
      const targetName = resolveCombatTargetName(
        target.targetName || tokenDoc?.name,
        targetActor?.name,
        "Cible"
      );
      let result = null;
      if (tokenIsLinked && targetActor) {
        result = await applyDamageToActor(targetActor, share, { targetName, penetration: penetrationValue });
      } else if (tokenDoc && Number.isFinite(hpBefore)) {
        const paInitial = getProtectionPA(tokenDoc.actor || null);
        const paEffective = Math.max(0, paInitial - penetrationValue);
        const finalDamage = Math.max(0, share - paEffective);
        const nextValue = Math.max(0, hpBefore - finalDamage);
        await tokenDoc.update({ "delta.system.resources.pv.current": nextValue });
        ChatMessage.create({
          speaker: { alias: targetName },
          content: t("BLOODMAN.Rolls.Damage.Take", { name: targetName, amount: finalDamage, pa: paEffective })
        });
        result = {
          hpBefore,
          hpAfter: nextValue,
          finalDamage,
          penetration: penetrationValue,
          paInitial,
          paEffective,
          pa: paEffective
        };
      }
      const expectedHpAfter = result
        ? Math.max(0, Number(hpBefore) - Math.max(0, Number(result.finalDamage || 0)))
        : Number.NaN;
      const okReapplied = result
        ? validateNumericEquality(result.hpAfter, expectedHpAfter)
        : false;
      logDamageRerollValidation("local-target", {
        ...validationMeta,
        targetName,
        share,
        hpBefore,
        restoredPv,
        okRestored,
        hpAfter: result?.hpAfter,
        expectedHpAfter,
        finalDamage: result?.finalDamage,
        okReapplied
      });

      if (result && tokenDoc) {
        const actorType = getTokenActorType(tokenDoc);
        if (actorType && Number.isFinite(result.hpAfter)) {
          await syncZeroPvStatusForToken(tokenDoc, actorType, result.hpAfter);
        }
      }
    }

    this.markItemReroll(itemId, context);
    this.render(false);
  }

  getItemRerollState() {
    return this.actor?._lastItemReroll || this._lastItemReroll || null;
  }

  setItemRerollState(state) {
    this._lastItemReroll = state;
    if (this.actor) this.actor._lastItemReroll = state;
  }

  clearItemRerollState() {
    this._lastItemReroll = null;
    if (this.actor) {
      this.actor._lastItemReroll = null;
      this.actor._lastDamageReroll = null;
    }
    if (this._itemRerollTimer) {
      clearTimeout(this._itemRerollTimer);
      this._itemRerollTimer = null;
    }
  }

  clearItemReroll(itemId) {
    const state = this.getItemRerollState();
    const currentItemId = state?.itemId || "";
    if (!currentItemId) return;
    if (itemId && currentItemId !== itemId) return;
    this.clearItemRerollState();
    this.render(false);
  }

  isDamageRerollReady(context) {
    return isDamageRerollContextReady(context);
  }

  isRerollWindowActive(timestamp) {
    const value = Number(timestamp);
    if (!Number.isFinite(value) || value <= 0) return false;
    return Date.now() - value < REROLL_VISIBILITY_MS;
  }

  scheduleRerollExpiry(kind) {
    if (this.actor?.type === "personnage") return;
    const timerKey = kind === "item" ? "_itemRerollTimer" : "_charRerollTimer";
    if (this[timerKey]) {
      clearTimeout(this[timerKey]);
      this[timerKey] = null;
    }

    const timestamp = kind === "item" ? this.getItemRerollState()?.at : this._lastCharacteristicRollAt;
    if (!this.isRerollWindowActive(timestamp)) return;
    const remaining = Math.max(0, REROLL_VISIBILITY_MS - (Date.now() - Number(timestamp)));
    this[timerKey] = setTimeout(() => {
      if (kind === "item") this.clearItemRerollState();
      else this.clearCharacteristicRerollState();
      this.render(false);
    }, remaining);
  }

  markCharacteristicReroll(key) {
    if (!key) return;
    this._lastCharacteristicRollKey = key;
    this._lastCharacteristicRollAt = Date.now();
    this.scheduleRerollExpiry("characteristic");
  }

  clearCharacteristicRerollState() {
    this._lastCharacteristicRollKey = "";
    this._lastCharacteristicRollAt = 0;
    if (this._charRerollTimer) {
      clearTimeout(this._charRerollTimer);
      this._charRerollTimer = null;
    }
  }

  markItemReroll(itemId, damageContext = null) {
    if (!itemId) return;
    const damage = damageContext || this.actor?._lastDamageReroll || null;
    if (damage) {
      damage.kind = String(damage.kind || "item-damage");
      damage.itemType = String(damage.itemType || this.actor?.items?.get(itemId)?.type || "").toLowerCase();
      if (damage.kind !== "item-damage" || !isDamageRerollItemType(damage.itemType)) return;
    }
    if (this.actor && damage) this.actor._lastDamageReroll = damage;
    this.setItemRerollState({ itemId, at: Date.now(), damage });
    this.scheduleRerollExpiry("item");
  }

  async performItemRerollRoll(item) {
    if (!item) return false;

    if (item.type === "arme") {
      const formula = normalizeRollDieFormula(item.system?.damageDie, "d4");
      const result = await doDirectDamageRoll(this.actor, formula, item.name, { itemId: item.id, itemType: item.type });
      return Boolean(result);
    }

    if (item.type === "aptitude" || item.type === "pouvoir") {
      if (!item.system?.damageEnabled || !item.system?.damageDie) return false;
      const formula = normalizeRollDieFormula(item.system.damageDie, "d4");
      const result = await doDirectDamageRoll(this.actor, formula, item.name, { itemId: item.id, itemType: item.type });
      return Boolean(result);
    }

    if (item.type === "soin") {
      const formula = normalizeRollDieFormula(item.system?.healDie, "d4");
      const roll = await new Roll(formula).evaluate();
      const current = toFiniteNumber(this.actor.system.resources?.pv?.current, 0);
      const max = toFiniteNumber(this.actor.system.resources?.pv?.max, current);
      const nextValue = max > 0 ? Math.min(current + roll.total, max) : current + roll.total;
      await this.applyActorUpdate({ "system.resources.pv.current": nextValue }, {
        bloodmanAllowVitalResourceUpdate: true
      });
      roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: t("BLOODMAN.Rolls.Heal.Gain", { name: this.actor.name, amount: roll.total })
      });
      return true;
    }

    return false;
  }

  async rollGrowth(key) {
    if (!key) return;
    if (this.actor.type !== "personnage") return;
    if (this.actor?.isOwner || game.user?.isGM) {
      await doGrowthRoll(this.actor, key);
      this.clearCharacteristicRerollState();
      this.render(false);
      return;
    }
    const itemBonuses = getItemBonusTotals(this.actor);
    const base = toFiniteNumber(this.actor.system.characteristics?.[key]?.base, 0);
    const archetypeBonus = getActorArchetypeBonus(this.actor, key);
    const effective = base
      + toFiniteNumber(this.actor.system.modifiers?.all, 0)
      + toFiniteNumber(this.actor.system.modifiers?.[key], 0)
      + toFiniteNumber(itemBonuses?.[key], 0)
      + toFiniteNumber(archetypeBonus, 0);

    const roll = await new Roll("1d100").evaluate();
    const success = Number(roll.total || 0) > effective;
    const xpPath = `system.characteristics.${key}.xp`;
    const basePath = `system.characteristics.${key}.base`;
    await this.applyActorUpdate({
      [basePath]: base + (success ? 1 : 0),
      [xpPath]: [false, false, false]
    }, {
      bloodmanAllowCharacteristicBase: true
    });
    foundry.utils.setProperty(this.actor, basePath, base + (success ? 1 : 0));
    foundry.utils.setProperty(this.actor, xpPath, [false, false, false]);

    roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: t("BLOODMAN.Rolls.Growth.Chat", {
        name: this.actor.name,
        key,
        roll: roll.total,
        effective,
        result: t(success ? "BLOODMAN.Rolls.Success" : "BLOODMAN.Rolls.Failure")
      })
    });
    this.clearCharacteristicRerollState();
    this.render(false);
  }

  promptGrowthRoll(key) {
    if (this.actor.type !== "personnage") return;
    const labelKey = CHARACTERISTICS.find(c => c.key === key)?.labelKey || "";
    const label = labelKey ? t(labelKey) : key;
    new Dialog({
      title: t("BLOODMAN.Dialogs.Growth.Title"),
      content: `<p>${t("BLOODMAN.Dialogs.Growth.Prompt", { label })}</p>`,
      buttons: {
        roll: {
          label: t("BLOODMAN.Common.Roll"),
          callback: async () => this.rollGrowth(key)
        },
        cancel: {
          label: t("BLOODMAN.Common.Cancel")
        }
      },
      default: "roll"
    }).render(true);
  }
}

class BloodmanNpcSheet extends BloodmanActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: "systems/bloodman/templates/actor-non-joueur.html"
    });
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find(".npc-role-toggle").change(ev => {
      const input = ev.currentTarget;
      const role = input.dataset.role || "";
      const nextRole = input.checked ? role : "";
      if (input.checked) {
        html.find(".npc-role-toggle").not(input).prop("checked", false);
      }
      this.applyActorUpdate({ "system.npcRole": nextRole });
    });
  }
}

class BloodmanItemSheet extends BaseItemSheet {
  get template() {
    return `systems/bloodman/templates/item-${this.item.type}.html`;
  }

  async getData(options) {
    const data = await super.getData(options);
    if (this.item.type === "arme") {
      const weaponType = getWeaponCategory(this.item.system?.weaponType);
      data.weaponTypeDistance = weaponType === "distance";
      data.weaponTypeMelee = weaponType === "corps";
      // Weapons predate the damageEnabled flag; treat missing as enabled for backward compatibility.
      data.weaponDamageEnabled = this.item.system?.damageEnabled !== false;
    }
    if (this.item.type === "aptitude") {
      if (!data.item.system) data.item.system = {};
      data.item.system.xpVoyageCost = normalizeNonNegativeInteger(this.item.system?.xpVoyageCost, 0);
    }
    return data;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["bloodman", "sheet", "item"],
      width: 700,
      height: 460,
      resizable: true,
      submitOnChange: true
    });
  }

  activateListeners(html) {
    super.activateListeners(html);

    if (this.item.type !== "aptitude" && this.item.type !== "pouvoir") return;

    html.find(".damage-roll").click(() => {
      this.rollAbilityDamage();
    });
  }

  async rollAbilityDamage() {
    if (!this.item.actor) {
      ui.notifications?.warn(t("BLOODMAN.Notifications.AbilityNoActor"));
      return;
    }
    const formula = normalizeRollDieFormula(this.item.system?.damageDie, "d4");
    const beforeRoll = async () => applyPowerCost(this.item.actor, this.item);
    const result = await doDirectDamageRoll(this.item.actor, formula, this.item.name, {
      beforeRoll,
      itemId: this.item.id,
      itemType: this.item.type
    });
    if (result) await playItemAudio(this.item);
  }
}
