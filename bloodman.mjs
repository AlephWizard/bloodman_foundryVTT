import { applyDamageToActor, doCharacteristicRoll, doDamageRoll, doDirectDamageRoll, doGrowthRoll, doHealRoll, getWeaponCategory, normalizeWeaponType, postDamageTakenChatMessage } from "./rollHelpers.mjs";

const BaseActorSheet = foundry?.appv1?.sheets?.ActorSheet ?? ActorSheet;
const BaseItemSheet = foundry?.appv1?.sheets?.ItemSheet ?? ItemSheet;
const ActorsCollection = foundry?.documents?.collections?.Actors ?? Actors;
const ItemsCollection = foundry?.documents?.collections?.Items ?? Items;

function t(key, data = null) {
  if (!globalThis.game?.i18n) return key;
  return data ? game.i18n.format(key, data) : game.i18n.localize(key);
}

function tl(key, fallback, data = null) {
  const localized = t(key, data);
  return localized && localized !== key ? localized : fallback;
}

function safeWarn(message) {
  try {
    ui.notifications?.warn(message);
  } catch (error) {
    console.warn("[bloodman] notify.warn failed", message, error);
  }
}

function formatMultilineTextToHtml(value) {
  const raw = String(value || "");
  if (!raw.trim()) return "";
  const escaped = foundry.utils?.escapeHTML ? foundry.utils.escapeHTML(raw) : raw;
  return escaped.replace(/\r\n|\r|\n/g, "<br>");
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

function canUserRoleDropMenuItems(role) {
  const minRole = Number(CONST?.USER_ROLES?.TRUSTED ?? 2);
  return Number(role ?? 0) >= minRole;
}

function canCurrentUserDropMenuItems() {
  return canUserRoleDropMenuItems(game.user?.role);
}

function isBasicPlayerRole(role) {
  const playerRole = Number(CONST?.USER_ROLES?.PLAYER ?? 1);
  return Number(role ?? 0) <= playerRole;
}

const CHARACTERISTIC_BASE_MIN = 30;
const CHARACTERISTIC_BASE_MAX = 95;

function isAssistantOrHigherRole(role) {
  const assistantRole = Number(CONST?.USER_ROLES?.ASSISTANT ?? 3);
  return Number(role ?? 0) >= assistantRole;
}

function canUserRoleOpenItemSheets(role) {
  return isAssistantOrHigherRole(role);
}

function canCurrentUserOpenItemSheets() {
  return canUserRoleOpenItemSheets(game.user?.role);
}

function isCharacteristicBaseRangeRestrictedRole(role) {
  return !isAssistantOrHigherRole(role);
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

const ROUND_TOKEN_ACTOR_TYPES = new Set(["personnage", "personnage-non-joueur"]);
const ROUND_MASK_RETRY_DELAYS_MS = [0, 90, 260];
const ROUND_MASK_SCHEDULE_TIMERS = new Map();

function shouldUseRoundTokenMask(tokenLike) {
  const tokenDoc = tokenLike?.document || tokenLike;
  const actorType = getTokenActorType(tokenDoc);
  return ROUND_TOKEN_ACTOR_TYPES.has(actorType);
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

function resolveTokenObject(tokenLike) {
  if (!tokenLike) return null;
  if (tokenLike.mesh) return tokenLike;
  if (tokenLike.object?.mesh) return tokenLike.object;
  const tokenId = String(tokenLike.id || tokenLike._id || "").trim();
  if (tokenId && canvas?.tokens?.get) {
    const byCanvas = canvas.tokens.get(tokenId);
    if (byCanvas?.mesh) return byCanvas;
  }
  return null;
}

function getTokenSpriteForRoundMask(tokenObject) {
  const mesh = tokenObject?.mesh;
  if (!mesh || mesh.destroyed) return null;
  if (!mesh.texture) return null;
  return mesh;
}

function computeRoundMaskGeometry(sprite) {
  const bounds = sprite?.getLocalBounds?.();
  const x = Number(bounds?.x);
  const y = Number(bounds?.y);
  const width = Number(bounds?.width);
  const height = Number(bounds?.height);
  if (!(Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0)) return null;
  const centerX = x + (width / 2);
  const centerY = y + (height / 2);
  const radius = (Math.min(width, height) / 2) * 0.995;
  if (!(Number.isFinite(centerX) && Number.isFinite(centerY) && Number.isFinite(radius) && radius > 0)) return null;
  const signature = `${centerX.toFixed(2)}|${centerY.toFixed(2)}|${radius.toFixed(2)}`;
  return { centerX, centerY, radius, signature };
}

function clearRoundTokenMask(tokenLike) {
  const tokenObject = resolveTokenObject(tokenLike);
  if (!tokenObject) return false;
  const sprite = getTokenSpriteForRoundMask(tokenObject);
  const mask = tokenObject._bmRoundMask || null;
  if (sprite?.mask === mask) sprite.mask = null;
  if (mask && !mask.destroyed) {
    if (mask.parent) {
      try {
        mask.parent.removeChild(mask);
      } catch (_error) {
        // non-fatal detach
      }
    }
    try {
      mask.destroy({ children: true });
    } catch (_error) {
      // non-fatal cleanup
    }
  }
  tokenObject._bmRoundMask = null;
  tokenObject._bmRoundMaskSignature = "";
  return true;
}

function applyRoundTokenMask(tokenLike) {
  const source = tokenLike?.document || tokenLike;
  const tokenObject = resolveTokenObject(tokenLike);
  if (!source || !tokenObject) return false;
  if (!shouldUseRoundTokenMask(source)) {
    clearRoundTokenMask(tokenObject);
    return false;
  }

  const sprite = getTokenSpriteForRoundMask(tokenObject);
  if (!sprite) {
    clearRoundTokenMask(tokenObject);
    return false;
  }

  const geometry = computeRoundMaskGeometry(sprite);
  if (!geometry) {
    clearRoundTokenMask(tokenObject);
    return false;
  }

  const PIXI_NS = globalThis.PIXI;
  if (!PIXI_NS?.Graphics) return false;
  let mask = tokenObject._bmRoundMask || null;
  if (!mask || mask.destroyed) {
    mask = new PIXI_NS.Graphics();
    mask._bmRoundMaskGraphic = true;
    tokenObject._bmRoundMask = mask;
    tokenObject._bmRoundMaskSignature = "";
  }

  const previousSignature = String(tokenObject._bmRoundMaskSignature || "");
  if (previousSignature !== geometry.signature) {
    mask.clear();
    mask.beginFill(0xffffff, 1);
    mask.drawCircle(geometry.centerX, geometry.centerY, geometry.radius);
    mask.endFill();
    tokenObject._bmRoundMaskSignature = geometry.signature;
  }

  if (mask.parent !== sprite) sprite.addChild(mask);
  if (sprite.mask !== mask) sprite.mask = mask;
  return true;
}

function cleanupOrphanRoundMasks() {
  const root = canvas?.stage;
  if (!root?.children) return;
  const stack = [...root.children];
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    if (Array.isArray(node.children) && node.children.length) stack.push(...node.children);
    if (!node._bmRoundMaskGraphic) continue;
    const hasLivingParent = Boolean(node.parent && !node.parent.destroyed);
    if (hasLivingParent) continue;
    try {
      node.destroy({ children: true });
    } catch (_error) {
      // non-fatal cleanup
    }
  }
}

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
  const source = tokenLike?.document || tokenLike;
  if (!source) return;
  const scheduleKey = getRoundMaskScheduleKey(source);
  if (scheduleKey) clearScheduledRoundTokenMask(source);
  if (!shouldUseRoundTokenMask(source)) {
    clearRoundTokenMask(source);
    return;
  }
  applyRoundTokenMask(source);

  const timers = [];
  const delays = ROUND_MASK_RETRY_DELAYS_MS.filter(delay => Number(delay) > 0);
  const lastIndex = delays.length - 1;
  delays.forEach((delay, index) => {
    const timerId = setTimeout(() => {
      applyRoundTokenMask(source);
      if (scheduleKey && index === lastIndex) ROUND_MASK_SCHEDULE_TIMERS.delete(scheduleKey);
    }, delay);
    timers.push(timerId);
  });
  if (scheduleKey && timers.length) ROUND_MASK_SCHEDULE_TIMERS.set(scheduleKey, timers);
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
const STATE_PRESETS = [
  {
    id: "psychic-1",
    category: "psychic",
    name: "NIV 1 : INQUIETUDE (24h)",
    shortName: "INQUIETUDE",
    duration: "24h",
    description: "",
    modifierAll: -2,
    modifierByKey: {}
  },
  {
    id: "psychic-2",
    category: "psychic",
    name: "NIV 2 : ANGOISSE (72h)",
    shortName: "ANGOISSE",
    duration: "72h",
    description: "",
    modifierAll: -4,
    modifierByKey: {}
  },
  {
    id: "psychic-3",
    category: "psychic",
    name: "NIV 3 : EFFROI (168h)",
    shortName: "EFFROI",
    duration: "168h",
    description: "",
    modifierAll: -6,
    modifierByKey: {}
  },
  {
    id: "psychic-4",
    category: "psychic",
    name: "NIV 4 : PANIQUE (730h)",
    shortName: "PANIQUE",
    duration: "730h",
    description: "",
    modifierAll: -8,
    modifierByKey: {}
  },
  {
    id: "psychic-5",
    category: "psychic",
    name: "NIV 5 : DELIRES (8760h)",
    shortName: "DELIRES",
    duration: "8760h",
    description: "",
    modifierAll: -10,
    modifierByKey: {}
  },
  {
    id: "psychic-6",
    category: "psychic",
    name: "NIV 6 : ALIENATION (87600h)",
    shortName: "ALIENATION",
    duration: "87600h",
    description: "",
    modifierAll: -12,
    modifierByKey: {}
  },
  {
    id: "psychic-7",
    category: "psychic",
    name: "NIV 7 : FOLIE",
    shortName: "FOLIE",
    duration: "",
    description: "Vous devenez fou.",
    modifierAll: 0,
    modifierByKey: {}
  },
  {
    id: "body-injured",
    category: "body",
    name: "BLESSE",
    shortName: "BLESSE",
    duration: "",
    description: "",
    modifierAll: -30,
    modifierByKey: {}
  },
  {
    id: "body-hunger",
    category: "body",
    name: "FAIM",
    shortName: "FAIM",
    duration: "",
    description: "",
    modifierAll: 0,
    modifierByKey: { MOU: -10, PHY: -10, ADR: -10, SOC: -10 }
  },
  {
    id: "body-thirst",
    category: "body",
    name: "SOIF",
    shortName: "SOIF",
    duration: "",
    description: "",
    modifierAll: 0,
    modifierByKey: { MOU: -20, PHY: -20, ADR: -20, SOC: -20 }
  },
  {
    id: "body-drowsy",
    category: "body",
    name: "SOMNOLENT",
    shortName: "SOMNOLENT",
    duration: "",
    description: "",
    modifierAll: 0,
    modifierByKey: { MOU: -40, PHY: -40, ADR: -40 }
  },
  {
    id: "body-sick",
    category: "body",
    name: "MALADE",
    shortName: "MALADE",
    duration: "",
    description: "",
    modifierAll: -10,
    modifierByKey: {}
  },
  {
    id: "body-hypothermia",
    category: "body",
    name: "HYPOTHERMIE",
    shortName: "HYPOTHERMIE",
    duration: "",
    description: "",
    modifierAll: 0,
    modifierByKey: { MEL: -30, MOU: -30, PHY: -30, ADR: -30 }
  },
  {
    id: "body-hyperthermia",
    category: "body",
    name: "HYPERTHERMIE",
    shortName: "HYPERTHERMIE",
    duration: "",
    description: "",
    modifierAll: 0,
    modifierByKey: { MEL: -30, MOU: -30, PHY: -30, ADR: -30 }
  }
];
const STATE_PRESET_BY_ID = new Map(STATE_PRESETS.map(preset => [preset.id, preset]));
const STATE_PRESET_ORDER = STATE_PRESETS.map(preset => preset.id);

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

  for (const preset of STATE_PRESETS) {
    registerAlias(preset.id, preset.id);
    registerAlias(preset.name, preset.id);
    registerAlias(preset.shortName, preset.id);
    const levelMatch = String(preset.name || "").match(/^NIV\s*(\d+)/i);
    if (levelMatch?.[1]) registerAlias(`NIV ${levelMatch[1]}`, preset.id);
  }

  return aliasMap;
}

const STATE_PRESET_ALIAS_MAP = buildStatePresetAliasMap();

function resolveStatePresetIdFromToken(token) {
  const normalized = normalizeStatePresetToken(token);
  if (!normalized) return "";
  const direct = STATE_PRESET_ALIAS_MAP.get(normalized);
  if (direct) return direct;
  for (const preset of STATE_PRESETS) {
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
  for (const presetId of STATE_PRESET_ORDER) {
    if (!selected.has(presetId)) continue;
    const preset = STATE_PRESET_BY_ID.get(presetId);
    if (!preset) continue;
    names.push(preset.name);
  }
  return names.join(" ; ");
}

function resolveStatePresetSelection(rawLabel) {
  const tokens = splitStatePresetLabel(rawLabel);
  const selectedIds = [];
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
    selectedIds.push(stateId);
  }

  const orderedIds = STATE_PRESET_ORDER.filter(stateId => seen.has(stateId));
  return {
    ids: orderedIds,
    invalidTokens,
    label: buildStatePresetLabelFromIds(orderedIds)
  };
}

function buildStatePresetModifierTotals(stateIds = []) {
  const totals = { all: 0 };
  for (const characteristic of CHARACTERISTICS) totals[characteristic.key] = 0;

  for (const stateId of stateIds) {
    const preset = STATE_PRESET_BY_ID.get(String(stateId || "").trim());
    if (!preset) continue;
    totals.all += toFiniteNumber(preset.modifierAll, 0);
    const modifierByKey = preset.modifierByKey || {};
    for (const characteristic of CHARACTERISTICS) {
      totals[characteristic.key] += toFiniteNumber(modifierByKey[characteristic.key], 0);
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
  foundry.utils.setProperty(updateData, "system.modifiers.label", String(label || "").trim());
  foundry.utils.setProperty(updateData, "system.modifiers.all", toFiniteNumber(totals?.all, 0));
  for (const characteristic of CHARACTERISTICS) {
    const key = characteristic.key;
    foundry.utils.setProperty(updateData, `system.modifiers.${key}`, toFiniteNumber(totals?.[key], 0));
  }
}

function buildStatePresetModifierLabel(preset) {
  if (!preset) return tl("BLOODMAN.StateBar.NoModifier", "Aucun modificateur");
  const parts = [];
  const allValue = toFiniteNumber(preset.modifierAll, 0);
  if (allValue !== 0) {
    parts.push(`${allValue > 0 ? "+" : ""}${allValue}% ALL CARACS`);
  }
  const grouped = new Map();
  for (const characteristic of CHARACTERISTICS) {
    const value = toFiniteNumber(preset.modifierByKey?.[characteristic.key], 0);
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
  for (const preset of STATE_PRESETS) {
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
const ACTOR_TOKEN_IMAGE_UPDATE_PATHS = [
  "prototypeToken.texture.src",
  "token.img"
];
const TOKEN_IMAGE_UPDATE_PATHS = [
  "texture.src",
  "img"
];

const SYSTEM_SOCKET = "system.bloodman";
const CARRIED_ITEM_LIMIT_BASE = 10;
const CARRIED_ITEM_LIMIT_WITH_BAG = 15;
const CARRIED_ITEM_LIMIT_ACTOR_TYPES = new Set(["personnage", "personnage-non-joueur"]);
const CARRIED_ITEM_TYPES = new Set(["objet", "ration", "soin"]);
const CHARACTERISTIC_BONUS_ITEM_TYPES = new Set(["objet", "protection"]);
const PRICE_ITEM_TYPES = new Set(["arme", "protection", "ration", "objet", "soin"]);
const ITEM_BUCKET_TYPES = ["arme", "objet", "ration", "soin", "protection", "aptitude", "pouvoir"];
const CHARACTERISTIC_REROLL_PP_COST = 4;
const CHAOS_PER_PLAYER_REROLL = 1;
const CHAOS_COST_NPC_REROLL = 1;
const REROLL_VISIBILITY_MS = 5 * 60 * 1000;
const DAMAGE_REROLL_ALLOWED_ITEM_TYPES = new Set(["arme", "aptitude", "pouvoir"]);
const AUDIO_ENABLED_ITEM_TYPES = new Set(["arme", "aptitude", "pouvoir", "soin", "objet"]);
const AUDIO_FILE_EXTENSION_PATTERN = /\.(mp3|ogg|oga|wav|flac|m4a|aac|webm)$/i;
const ITEM_AUDIO_POST_ROLL_DELAY_MS = 450;
const CURRENCY_CURRENT_MAX = 1_000_000;
const VITAL_RESOURCE_PATHS = new Set([
  "system.resources.pv.current",
  "system.resources.pv.max",
  "system.resources.pp.current",
  "system.resources.pp.max"
]);
const AMMO_UPDATE_PATHS = [
  "system.ammo",
  "system.ammo.type",
  "system.ammo.stock",
  "system.ammo.magazine",
  "system.ammo.value"
];

function isDamageRerollItemType(itemType) {
  const type = String(itemType || "").trim().toLowerCase();
  return DAMAGE_REROLL_ALLOWED_ITEM_TYPES.has(type);
}

function isCarriedItemLimitedActorType(actorType) {
  const type = String(actorType || "").trim().toLowerCase();
  return CARRIED_ITEM_LIMIT_ACTOR_TYPES.has(type);
}

function isBagSlotsEnabled(actor) {
  return Boolean(actor?.system?.equipment?.bagSlotsEnabled);
}

function getActorCarriedItemsLimit(actor) {
  return isBagSlotsEnabled(actor) ? CARRIED_ITEM_LIMIT_WITH_BAG : CARRIED_ITEM_LIMIT_BASE;
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

function parseLooseNumericInput(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: true, empty: true, value: 0 };
  const compact = raw.replace(/\s+/g, "").replace(",", ".");
  const numericPattern = /^[-+]?(?:\d+|\d*\.\d+)$/;
  if (!numericPattern.test(compact)) return { ok: false, empty: false, value: 0 };
  const numericValue = Number(compact);
  if (!Number.isFinite(numericValue)) return { ok: false, empty: false, value: 0 };
  return { ok: true, empty: false, value: numericValue };
}

function roundCurrencyValue(value) {
  const rounded = Math.round((Number(value) || 0) * 100) / 100;
  const whole = Math.round(rounded);
  if (Math.abs(rounded - whole) <= 0.000001) return whole;
  return rounded;
}

function normalizeCurrencyCurrentValue(value, fallback = 0) {
  const parsed = parseLooseNumericInput(value);
  if (!parsed.ok) {
    return { ok: false, value: roundCurrencyValue(Math.max(0, toFiniteNumber(fallback, 0))) };
  }
  const numeric = parsed.empty ? 0 : parsed.value;
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > CURRENCY_CURRENT_MAX) {
    return { ok: false, value: roundCurrencyValue(Math.max(0, toFiniteNumber(fallback, 0))) };
  }
  return { ok: true, value: roundCurrencyValue(numeric) };
}

function formatCurrencyValue(value) {
  const normalized = roundCurrencyValue(Math.max(0, toFiniteNumber(value, 0)));
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
  const hasEquipmentRootUpdate = hasUpdatePath(updateData, equipmentPath);
  const hasCurrencyTypeUpdate = hasUpdatePath(updateData, currencyTypePath);
  const hasCurrencyCurrentUpdate = hasUpdatePath(updateData, currencyCurrentPath);
  if (!hasEquipmentRootUpdate && !hasCurrencyTypeUpdate && !hasCurrencyCurrentUpdate) {
    return { changed: false, invalid: false };
  }

  const currentEquipment = foundry.utils.mergeObject(buildDefaultEquipment(), actor?.system?.equipment || {}, {
    inplace: false
  });

  const rootUpdate = hasEquipmentRootUpdate ? getUpdatedPathValue(updateData, equipmentPath, {}) : {};
  const rootSource = rootUpdate && typeof rootUpdate === "object" ? rootUpdate : {};
  const nextEquipment = foundry.utils.mergeObject(currentEquipment, rootSource, { inplace: false });
  if (hasCurrencyTypeUpdate) {
    nextEquipment.monnaies = getUpdatedPathValue(updateData, currencyTypePath, nextEquipment.monnaies);
  }
  if (hasCurrencyCurrentUpdate) {
    nextEquipment.monnaiesActuel = getUpdatedPathValue(updateData, currencyCurrentPath, nextEquipment.monnaiesActuel);
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
    foundry.utils.setProperty(updateData, equipmentPath, nextEquipment);
  } else {
    foundry.utils.setProperty(updateData, currencyTypePath, nextEquipment.monnaies);
    foundry.utils.setProperty(updateData, currencyCurrentPath, nextEquipment.monnaiesActuel);
  }

  return {
    changed: true,
    invalid: false,
    currencyCurrent: nextEquipment.monnaiesActuel
  };
}

function resolveResourceGaugeState(currentValue, maxValue, options = {}) {
  const useUnitMaxWhenZero = options.useUnitMaxWhenZero === true;
  const current = Math.max(0, toFiniteNumber(currentValue, 0));
  const maxRaw = Math.max(0, toFiniteNumber(maxValue, 0));
  const denominator = maxRaw > 0 ? maxRaw : (useUnitMaxWhenZero ? 1 : 0);
  const ratio = denominator > 0 ? Math.max(0, Math.min(1, current / denominator)) : 0;
  const percent = Math.max(0, Math.min(100, ratio * 100));
  const stateClass = ratio <= 0
    ? "is-empty"
    : ratio <= 0.25
      ? "is-critical"
      : ratio <= 0.5
        ? "is-warning"
        : "is-healthy";
  return {
    ratio,
    fill: `${percent.toFixed(2)}%`,
    steps: Math.max(1, Math.round(maxRaw || 1)),
    stateClass
  };
}

function applyResourceGaugeState(resource, options = {}) {
  if (!resource || typeof resource !== "object") return;
  const gauge = resolveResourceGaugeState(resource.current, resource.max, options);
  resource.ratio = gauge.ratio.toFixed(4);
  resource.fill = gauge.fill;
  resource.steps = gauge.steps;
  resource.stateClass = gauge.stateClass;
}

function buildTypedItemBuckets(items = []) {
  const buckets = Object.fromEntries(ITEM_BUCKET_TYPES.map(type => [type, []]));
  for (const item of items || []) {
    const type = String(item?.type || "").trim().toLowerCase();
    if (Array.isArray(buckets[type])) buckets[type].push(item);
  }
  return buckets;
}

function getActorItemCounts(items = []) {
  const counts = {
    total: 0,
    aptitudes: 0,
    pouvoirs: 0,
    carried: 0
  };
  for (const item of items || []) {
    if (!item) continue;
    counts.total += 1;
    const type = String(item.type || "").trim().toLowerCase();
    if (type === "aptitude") counts.aptitudes += 1;
    if (type === "pouvoir") counts.pouvoirs += 1;
    if (CARRIED_ITEM_TYPES.has(type)) counts.carried += 1;
  }
  return counts;
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

function isPriceManagedItemType(itemType) {
  const type = String(itemType || "").trim().toLowerCase();
  return PRICE_ITEM_TYPES.has(type);
}

function resolveItemPricePreviewState(rawValue) {
  const raw = String(rawValue ?? "").trim();
  if (!raw) return { salePrice: "", errorMessage: "" };
  const compact = raw.replace(/\s+/g, "").replace(",", ".");
  const numericPattern = /^[-+]?(?:\d+|\d*\.\d+)$/;
  const numericValue = Number(compact);
  const invalidLabel = t("BLOODMAN.Items.PriceInvalid");
  const errorMessage = invalidLabel && invalidLabel !== "BLOODMAN.Items.PriceInvalid"
    ? invalidLabel
    : "Le prix doit etre un nombre valide.";
  if (!numericPattern.test(compact) || !Number.isFinite(numericValue) || numericValue < 0) {
    return { salePrice: "", errorMessage };
  }
  const salePrice = Math.ceil(numericValue * 0.2);
  return { salePrice: String(salePrice), errorMessage: "" };
}

function resolveItemSalePriceState(rawPriceValue, rawSalePriceValue) {
  const pricePreview = resolveItemPricePreviewState(rawPriceValue);
  const salePriceRaw = String(rawSalePriceValue ?? "").trim();
  if (salePriceRaw) {
    return {
      salePrice: salePriceRaw,
      errorMessage: pricePreview.errorMessage
    };
  }
  return {
    salePrice: pricePreview.errorMessage ? "" : pricePreview.salePrice,
    errorMessage: pricePreview.errorMessage
  };
}

function isItemSalePriceManual(rawPriceValue, rawSalePriceValue) {
  const salePriceRaw = String(rawSalePriceValue ?? "").trim();
  if (!salePriceRaw) return false;
  const pricePreview = resolveItemPricePreviewState(rawPriceValue);
  if (pricePreview.errorMessage) return true;
  return salePriceRaw !== String(pricePreview.salePrice ?? "").trim();
}

function normalizeItemPriceUpdate(item, updateData = null) {
  if (!isPriceManagedItemType(item?.type)) return false;
  const pricePath = "system.price";
  const salePricePath = "system.salePrice";
  if (updateData) {
    const hasPriceUpdate = Object.prototype.hasOwnProperty.call(updateData, pricePath)
      || foundry.utils.getProperty(updateData, pricePath) !== undefined;
    const hasSalePriceUpdate = Object.prototype.hasOwnProperty.call(updateData, salePricePath)
      || foundry.utils.getProperty(updateData, salePricePath) !== undefined;
    if (!hasPriceUpdate && !hasSalePriceUpdate) return false;

    const nextPrice = hasPriceUpdate
      ? String(foundry.utils.getProperty(updateData, pricePath) ?? "").trim()
      : String(item?.system?.price ?? "").trim();
    const currentPrice = String(item?.system?.price ?? "").trim();
    const currentSalePrice = String(item?.system?.salePrice ?? "").trim();
    const saleWasManual = isItemSalePriceManual(currentPrice, currentSalePrice);
    const nextSalePrice = hasSalePriceUpdate
      ? String(foundry.utils.getProperty(updateData, salePricePath) ?? "").trim()
      : (saleWasManual ? currentSalePrice : "");
    const nextState = resolveItemSalePriceState(nextPrice, nextSalePrice);

    foundry.utils.setProperty(updateData, pricePath, nextPrice);
    foundry.utils.setProperty(updateData, salePricePath, nextState.salePrice);
    return true;
  }
  const sourcePrice = String(item?.system?.price ?? "").trim();
  const sourceSalePrice = String(item?.system?.salePrice ?? "").trim();
  const sourceState = resolveItemSalePriceState(sourcePrice, sourceSalePrice);
  item.updateSource({
    [pricePath]: sourcePrice,
    [salePricePath]: sourceState.salePrice
  });
  return true;
}

function normalizeWeaponMagazineCapacityUpdate(item, updateData = null) {
  const type = String(item?.type || "").trim().toLowerCase();
  if (type !== "arme") return false;
  const path = "system.magazineCapacity";
  if (updateData) {
    const hasCapacityUpdate = Object.prototype.hasOwnProperty.call(updateData, path)
      || foundry.utils.getProperty(updateData, path) !== undefined;
    if (!hasCapacityUpdate) return false;
    const nextCapacity = normalizeNonNegativeInteger(
      foundry.utils.getProperty(updateData, path),
      item?.system?.magazineCapacity ?? 0
    );
    foundry.utils.setProperty(updateData, path, nextCapacity);
    return true;
  }
  const sourceCapacity = normalizeNonNegativeInteger(item?.system?.magazineCapacity, 0);
  item.updateSource({ [path]: sourceCapacity });
  return true;
}

function normalizeCharacteristicBonusItemUpdate(item, updateData = null) {
  const type = String(item?.type || "").trim().toLowerCase();
  if (!CHARACTERISTIC_BONUS_ITEM_TYPES.has(type)) return false;
  const defaultUseEnabled = type === "protection";
  const sourceSystem = updateData
    ? foundry.utils.mergeObject(
      foundry.utils.deepClone(item?.system || {}),
      foundry.utils.getProperty(updateData, "system") || {},
      { inplace: false }
    )
    : (item?.system || {});

  const useEnabled = toCheckboxBoolean(sourceSystem?.useEnabled, defaultUseEnabled);
  const characteristicBonusEnabled = toCheckboxBoolean(sourceSystem?.characteristicBonusEnabled, false);
  const characteristicBonuses = {};
  for (const characteristic of CHARACTERISTICS) {
    characteristicBonuses[characteristic.key] = toFiniteNumber(
      sourceSystem?.characteristicBonuses?.[characteristic.key],
      0
    );
  }

  if (updateData) {
    foundry.utils.setProperty(updateData, "system.useEnabled", useEnabled);
    foundry.utils.setProperty(updateData, "system.characteristicBonusEnabled", characteristicBonusEnabled);
    for (const characteristic of CHARACTERISTICS) {
      const key = characteristic.key;
      foundry.utils.setProperty(updateData, `system.characteristicBonuses.${key}`, characteristicBonuses[key]);
    }
    return true;
  }

  const sourceUpdate = {
    "system.useEnabled": useEnabled,
    "system.characteristicBonusEnabled": characteristicBonusEnabled
  };
  for (const characteristic of CHARACTERISTICS) {
    const key = characteristic.key;
    sourceUpdate[`system.characteristicBonuses.${key}`] = characteristicBonuses[key];
  }
  item.updateSource(sourceUpdate);
  return true;
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
  return { type: "", stock: 0, magazine: 0, value: 0 };
}

function normalizeAmmoType(value) {
  return String(value ?? "").trim();
}

function getActorAmmoCapacityLimit(actor) {
  if (!actor?.items) return 0;
  let maxCapacity = 0;
  for (const item of actor.items) {
    if (String(item?.type || "").trim().toLowerCase() !== "arme") continue;
    const weaponType = getWeaponCategory(item.system?.weaponType);
    if (weaponType !== "distance") continue;
    if (toCheckboxBoolean(item.system?.infiniteAmmo, false)) continue;
    const capacity = normalizeNonNegativeInteger(item.system?.magazineCapacity, 0);
    if (capacity > maxCapacity) maxCapacity = capacity;
  }
  return maxCapacity;
}

function normalizeAmmoState(rawAmmo = null, options = {}) {
  const fallbackBase = options.fallback ?? buildDefaultAmmo();
  const fallback = foundry.utils.mergeObject(buildDefaultAmmo(), fallbackBase || {}, { inplace: false });
  const source = foundry.utils.mergeObject(fallback, rawAmmo || {}, { inplace: false });
  const type = normalizeAmmoType(source.type);

  const fallbackStock = normalizeNonNegativeInteger(fallback.stock ?? fallback.value, 0);
  const fallbackMagazine = normalizeNonNegativeInteger(fallback.magazine ?? fallback.value, 0);

  const stockRaw = source.stock ?? source.value ?? fallbackStock;
  const magazineRaw = source.magazine ?? source.value ?? fallbackMagazine;

  let stock = normalizeNonNegativeInteger(stockRaw, fallbackStock);
  let magazine = normalizeNonNegativeInteger(magazineRaw, fallbackMagazine);

  const capacity = normalizeNonNegativeInteger(options.capacity, 0);
  if (capacity > 0) magazine = Math.min(magazine, capacity);

  stock = Math.max(0, stock);
  magazine = Math.max(0, magazine);

  return {
    type,
    stock,
    magazine,
    value: stock
  };
}

function areAmmoStatesEqual(currentAmmo = null, nextAmmo = null) {
  const currentType = normalizeAmmoType(currentAmmo?.type);
  const nextType = normalizeAmmoType(nextAmmo?.type);
  if (currentType !== nextType) return false;
  const currentStock = normalizeNonNegativeInteger(currentAmmo?.stock ?? currentAmmo?.value, 0);
  const nextStock = normalizeNonNegativeInteger(nextAmmo?.stock ?? nextAmmo?.value, 0);
  if (currentStock !== nextStock) return false;
  const currentMagazine = normalizeNonNegativeInteger(currentAmmo?.magazine, 0);
  const nextMagazine = normalizeNonNegativeInteger(nextAmmo?.magazine, 0);
  return currentMagazine === nextMagazine;
}

function hasUpdatePath(updateData, path) {
  if (!updateData || !path) return false;
  return Object.prototype.hasOwnProperty.call(updateData, path)
    || foundry.utils.getProperty(updateData, path) !== undefined;
}

function getUpdatedPathValue(updateData, path, fallback) {
  if (Object.prototype.hasOwnProperty.call(updateData, path)) return updateData[path];
  const nested = foundry.utils.getProperty(updateData, path);
  return nested === undefined ? fallback : nested;
}

function normalizeActorAmmoUpdateData(actor, updateData) {
  if (!updateData || typeof updateData !== "object") return false;
  const ammoPath = "system.ammo";
  const ammoTypePath = "system.ammo.type";
  const ammoStockPath = "system.ammo.stock";
  const ammoMagazinePath = "system.ammo.magazine";
  const ammoLegacyValuePath = "system.ammo.value";

  const hasAmmoRootUpdate = hasUpdatePath(updateData, ammoPath);
  const hasAmmoTypeUpdate = hasUpdatePath(updateData, ammoTypePath);
  const hasAmmoStockUpdate = hasUpdatePath(updateData, ammoStockPath);
  const hasAmmoMagazineUpdate = hasUpdatePath(updateData, ammoMagazinePath);
  const hasAmmoLegacyValueUpdate = hasUpdatePath(updateData, ammoLegacyValuePath);
  const hasAnyAmmoUpdate = hasAmmoRootUpdate
    || hasAmmoTypeUpdate
    || hasAmmoStockUpdate
    || hasAmmoMagazineUpdate
    || hasAmmoLegacyValueUpdate;
  if (!hasAnyAmmoUpdate) return false;

  const capacity = getActorAmmoCapacityLimit(actor);
  const currentAmmo = normalizeAmmoState(actor?.system?.ammo, {
    fallback: buildDefaultAmmo(),
    capacity
  });

  const rootAmmoUpdate = hasAmmoRootUpdate ? getUpdatedPathValue(updateData, ammoPath, {}) : {};
  const rootAmmoSource = rootAmmoUpdate && typeof rootAmmoUpdate === "object" ? rootAmmoUpdate : {};
  const nextRawAmmo = foundry.utils.mergeObject(currentAmmo, rootAmmoSource, { inplace: false });

  if (hasAmmoTypeUpdate) {
    nextRawAmmo.type = getUpdatedPathValue(updateData, ammoTypePath, nextRawAmmo.type);
  }
  if (hasAmmoStockUpdate) {
    nextRawAmmo.stock = getUpdatedPathValue(updateData, ammoStockPath, nextRawAmmo.stock);
  }
  if (hasAmmoMagazineUpdate) {
    nextRawAmmo.magazine = getUpdatedPathValue(updateData, ammoMagazinePath, nextRawAmmo.magazine);
  }
  if (hasAmmoLegacyValueUpdate && !hasAmmoStockUpdate) {
    nextRawAmmo.stock = getUpdatedPathValue(updateData, ammoLegacyValuePath, nextRawAmmo.stock);
  }

  const normalizedAmmo = normalizeAmmoState(nextRawAmmo, {
    fallback: currentAmmo,
    capacity
  });

  unsetUpdatePath(updateData, ammoPath);
  foundry.utils.setProperty(updateData, ammoTypePath, normalizedAmmo.type);
  foundry.utils.setProperty(updateData, ammoStockPath, normalizedAmmo.stock);
  foundry.utils.setProperty(updateData, ammoMagazinePath, normalizedAmmo.magazine);
  foundry.utils.setProperty(updateData, ammoLegacyValuePath, normalizedAmmo.value);
  return true;
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
    quickNotes: "",
    notes: "",
    aptitudes: "",
    pouvoirs: ""
  };
}

function buildDefaultEquipment() {
  return {
    armes: "",
    protections: "",
    objets: "",
    monnaies: "",
    monnaiesActuel: 0,
    transports: "",
    transportNpcs: [],
    bagSlotsEnabled: false
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
const PROCESSED_DAMAGE_CONFIG_POPUPS = new Map();
const PROCESSED_POWER_USE_POPUPS = new Map();
const PROCESSED_CHAOS_REQUESTS = new Map();
const PROCESSED_REROLL_REQUESTS = new Map();
const PROCESSED_VOYANCE_REQUESTS = new Map();
const INITIATIVE_GROUP_BUFFER = new Map();
const ACTIVE_DAMAGE_CONFIG_POPUPS = new Map();
const VOYANCE_OVERLAY_ID = "bm-voyance-overlay";
const VOYANCE_STYLE_ID = "bm-voyance-style";
const VOYANCE_AUTO_CLOSE_MS = 6500;
const VOYANCE_DEFAULT_BACKGROUND_SRC = "systems/bloodman/images/des_destin.png";
const VOYANCE_REQUEST_CHAT_MARKUP = "<span style='display:none'>bloodman-voyance-request</span>";
const POWER_USE_POPUP_CHAT_MARKUP = "<span style='display:none'>bloodman-power-use-popup</span>";

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

function rememberDamageConfigPopupRequest(requestId) {
  if (!requestId) return;
  const now = Date.now();
  PROCESSED_DAMAGE_CONFIG_POPUPS.set(requestId, now);
  for (const [key, value] of PROCESSED_DAMAGE_CONFIG_POPUPS.entries()) {
    if (now - value > DAMAGE_REQUEST_RETENTION_MS) PROCESSED_DAMAGE_CONFIG_POPUPS.delete(key);
  }
}

function wasDamageConfigPopupRequestProcessed(requestId) {
  if (!requestId) return false;
  return PROCESSED_DAMAGE_CONFIG_POPUPS.has(requestId);
}

function rememberPowerUsePopupRequest(requestId) {
  if (!requestId) return;
  const now = Date.now();
  PROCESSED_POWER_USE_POPUPS.set(requestId, now);
  for (const [key, value] of PROCESSED_POWER_USE_POPUPS.entries()) {
    if (now - value > DAMAGE_REQUEST_RETENTION_MS) PROCESSED_POWER_USE_POPUPS.delete(key);
  }
}

function wasPowerUsePopupRequestProcessed(requestId) {
  if (!requestId) return false;
  return PROCESSED_POWER_USE_POPUPS.has(requestId);
}

function buildDamageConfigObserverState(data) {
  const escapeHtml = value => (foundry.utils?.escapeHTML ? foundry.utils.escapeHTML(String(value || "")) : String(value || ""));
  const actorName = String(data?.actorName || "").trim();
  const sourceName = String(data?.sourceName || "").trim();
  const requesterName = String(game.users?.get(String(data?.requesterUserId || ""))?.name || "").trim();
  const config = data?.config && typeof data.config === "object" ? data.config : {};
  const formula = String(config.formula || "1d4").trim() || "1d4";
  const damageLabel = String(config.degats || "").trim().toUpperCase() || formula.toUpperCase();
  const bonusBrut = Math.max(0, Math.floor(toFiniteNumber(config.bonusBrut, 0)));
  const penetration = Math.max(0, Math.floor(toFiniteNumber(config.penetration, 0)));
  const keepHighest = config.rollKeepHighest === true;
  const yesLabel = t("BLOODMAN.Common.Yes");
  const noLabel = t("BLOODMAN.Common.No");
  const actorDisplay = actorName || requesterName || "Attaquant";
  const sourceDisplay = sourceName || "-";
  const keepHighestText = `2 jets, garder le plus haut: ${keepHighest ? yesLabel : noLabel}`;
  return {
    escapeHtml,
    formula,
    damageLabel,
    bonusBrut,
    penetration,
    keepHighest,
    actorDisplay,
    sourceDisplay,
    keepHighestText,
    title: `Jet de degats - ${actorDisplay}`
  };
}

function getDamageConfigObserverContent(state) {
  const safe = state.escapeHtml;
  return `<form class="bm-damage-config">
    <div class="bm-damage-config-shell">
      <div class="bm-damage-config-head">
        <div class="bm-damage-config-icon-wrap" aria-hidden="true">
          <div class="bm-damage-config-icon-ring"><i class="fa-solid fa-skull"></i></div>
        </div>
        <div class="bm-damage-config-head-copy">
          <p class="bm-damage-config-eyebrow">Suivi MJ</p>
          <p class="bm-damage-config-hint" data-bm-popup-field="hint">${safe(state.actorDisplay)} - ${safe(state.sourceDisplay)}</p>
        </div>
      </div>
      <div class="bm-damage-config-grid">
        <div class="bm-damage-config-row bm-damage-config-row-wide">
          <label>Degats</label>
          <input type="text" data-bm-popup-field="damage" value="${safe(state.damageLabel)} (${safe(state.formula)})" disabled />
        </div>
        <div class="bm-damage-config-row bm-damage-config-inline">
          <label>Degats bruts +</label>
          <input type="number" data-bm-popup-field="bonus" value="${state.bonusBrut}" disabled />
        </div>
        <div class="bm-damage-config-row bm-damage-config-inline">
          <label>Penetration +</label>
          <input type="number" data-bm-popup-field="penetration" value="${state.penetration}" disabled />
        </div>
      </div>
      <label class="bm-damage-config-toggle">
        <input type="checkbox" data-bm-popup-field="roll-keep-highest" disabled ${state.keepHighest ? "checked" : ""} />
        <span class="bm-damage-config-toggle-indicator" aria-hidden="true">2x</span>
        <span class="bm-damage-config-toggle-copy">
          <span class="bm-damage-config-toggle-title" data-bm-popup-field="keep-highest-text">${safe(state.keepHighestText)}</span>
        </span>
      </label>
    </div>
  </form>`;
}

function updateDamageConfigObserverDialog(dialog, state) {
  const root = dialog?.element;
  if (!root?.length) return false;
  root.find("[data-bm-popup-field='hint']").text(`${state.actorDisplay} - ${state.sourceDisplay}`);
  root.find("[data-bm-popup-field='damage']").val(`${state.damageLabel} (${state.formula})`);
  root.find("[data-bm-popup-field='bonus']").val(String(state.bonusBrut));
  root.find("[data-bm-popup-field='penetration']").val(String(state.penetration));
  root.find("[data-bm-popup-field='roll-keep-highest']").prop("checked", state.keepHighest);
  root.find("[data-bm-popup-field='keep-highest-text']").text(state.keepHighestText);
  return true;
}

function closeDamageConfigObserverDialog(requestId) {
  const key = String(requestId || "").trim();
  if (!key) return false;
  const dialog = ACTIVE_DAMAGE_CONFIG_POPUPS.get(key);
  if (!dialog) return false;
  ACTIVE_DAMAGE_CONFIG_POPUPS.delete(key);
  try {
    dialog.close();
  } catch (_error) {
    // ignore
  }
  return true;
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

function escapeChatMarkup(value) {
  const raw = String(value ?? "");
  if (typeof foundry?.utils?.escapeHTML === "function") return foundry.utils.escapeHTML(raw);
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getChatSpeakerTokenDocument(message) {
  if (!message) return null;
  const tokenId = String(message?.speaker?.token || "");
  if (!tokenId) return null;
  const sceneId = String(message?.speaker?.scene || canvas?.scene?.id || "");
  const scene = sceneId ? game.scenes?.get(sceneId) : canvas?.scene;
  if (!scene) return null;
  return scene.tokens?.get(tokenId) || scene.tokens?.contents?.find(token => token.id === tokenId) || null;
}

function getChatSpeakerActor(message) {
  const actorId = String(message?.speaker?.actor || "");
  if (actorId) {
    const actor = game.actors?.get(actorId) || null;
    if (actor) return actor;
  }
  const tokenDoc = getChatSpeakerTokenDocument(message);
  return tokenDoc?.actor || (tokenDoc?.actorId ? game.actors?.get(tokenDoc.actorId) : null) || null;
}

function resolveChatTokenImage(actor, tokenDoc) {
  const tokenSrc = String(foundry.utils.getProperty(tokenDoc, "texture.src") || "").trim();
  if (tokenSrc) return tokenSrc;
  const prototypeSrc = String(foundry.utils.getProperty(actor, "prototypeToken.texture.src") || "").trim();
  if (prototypeSrc) return prototypeSrc;
  const actorImage = String(actor?.img || "").trim();
  if (actorImage) return actorImage;
  return "icons/svg/mystery-man.svg";
}

function resolveChatAccentColor(message) {
  const userId = String(message?.user?.id || message?.user || "");
  const author = (userId ? game.users?.get(userId) : null) || message?.author || null;
  const raw = author?.color;
  if (typeof raw === "string" && raw.trim()) return normalizeChatCssColor(raw.trim());
  const cssValue = typeof raw?.css === "string"
    ? raw.css
    : (typeof raw?.css === "function" ? raw.css() : "");
  if (cssValue) return normalizeChatCssColor(cssValue);
  const fallback = String(raw || "").trim();
  if (fallback && fallback !== "[object Object]") return normalizeChatCssColor(fallback);
  return "#2f66d9";
}

function normalizeChatCssColor(value, fallback = "#2f66d9") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  const supportsApi = Boolean(globalThis.CSS && typeof globalThis.CSS.supports === "function");
  if (!supportsApi) return raw;
  return globalThis.CSS.supports("color", raw) ? raw : fallback;
}

function resolveChatPseudoName(actor, message) {
  const candidates = [
    foundry.utils.getProperty(actor, "system.profile.pseudonyme"),
    foundry.utils.getProperty(actor, "system.profile.pseudo"),
    actor?.name,
    message?.speaker?.alias,
    message?.alias
  ];
  for (const candidate of candidates) {
    const label = String(candidate || "").trim();
    if (label) return label;
  }
  return t("BLOODMAN.Common.Name");
}

function shouldDecorateChatRollMessage(message, actor) {
  if (!message) return false;
  const hasRoll = Array.isArray(message?.rolls) && message.rolls.length > 0;
  const hasLuckFlag = Boolean(foundry.utils.getProperty(message, "flags.bloodman.luckRoll"));
  if (!hasRoll && !hasLuckFlag) return false;
  const actorType = String(actor?.type || "");
  return actorType === "personnage" || actorType === "personnage-non-joueur" || hasLuckFlag;
}

function decorateBloodmanChatRollMessage(message, html) {
  const root = html?.[0] || html;
  if (!(root instanceof HTMLElement)) return;
  if (root.classList.contains("bm-chat-roll")) return;

  const actor = getChatSpeakerActor(message);
  if (!shouldDecorateChatRollMessage(message, actor)) return;
  const contentEl = root.querySelector(".message-content");
  if (!contentEl) return;
  if (contentEl.querySelector(".bm-chat-roll-frame")) return;

  const tokenDoc = getChatSpeakerTokenDocument(message);
  const tokenImage = resolveChatTokenImage(actor, tokenDoc);
  const pseudo = resolveChatPseudoName(actor, message);
  const accent = resolveChatAccentColor(message);

  const escapedPseudo = escapeChatMarkup(pseudo);
  const escapedImage = escapeChatMarkup(tokenImage);
  const escapedAccent = escapeChatMarkup(accent);
  const originalContent = contentEl.innerHTML;

  contentEl.innerHTML = `<div class="bm-chat-roll-frame" style="--bm-chat-roll-accent:${escapedAccent};">
    <div class="bm-chat-roll-head">
      <span class="bm-chat-roll-accent-band" aria-hidden="true"></span>
      <div class="bm-chat-roll-token"><img src="${escapedImage}" alt="${escapedPseudo}" /></div>
      <div class="bm-chat-roll-pseudo">${escapedPseudo}</div>
    </div>
    <div class="bm-chat-roll-inner bm-chat-roll-native">${originalContent}</div>
  </div>`;
  root.classList.add("bm-chat-roll");
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

function isPowerUsableEnabled(value) {
  if (value == null || value === "") return true;
  return toBooleanFlag(value);
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

function buildKeepHighestDamageTag(firstTotal, secondTotal, keptTotal) {
  if (!Number.isFinite(firstTotal) || !Number.isFinite(secondTotal) || !Number.isFinite(keptTotal)) return "";
  return `2 jets, garder le plus haut: ${firstTotal} / ${secondTotal} -> ${keptTotal}`;
}

async function evaluateRerollDamageFormula(formula, rollKeepHighest = false) {
  const normalizedFormula = normalizeRollDieFormula(formula, "d4");
  if (!rollKeepHighest) {
    const roll = await new Roll(normalizedFormula).evaluate();
    return {
      roll,
      rollResults: getRollValuesFromRoll(roll),
      rawTotal: Number(roll.total) || 0,
      modeTag: ""
    };
  }

  const firstRoll = await new Roll(normalizedFormula).evaluate();
  const secondRoll = await new Roll(normalizedFormula).evaluate();
  const firstTotal = Number(firstRoll.total) || 0;
  const secondTotal = Number(secondRoll.total) || 0;
  const keepFirst = firstTotal >= secondTotal;
  const keptRoll = keepFirst ? firstRoll : secondRoll;
  const keptTotal = keepFirst ? firstTotal : secondTotal;
  return {
    roll: keptRoll,
    rollResults: getRollValuesFromRoll(keptRoll),
    rawTotal: keptTotal,
    modeTag: buildKeepHighestDamageTag(firstTotal, secondTotal, keptTotal)
  };
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
    rollKeepHighest: data.rollKeepHighest === true,
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

function canCurrentUserReceiveDamageConfigPopup(data) {
  const localUserId = String(game.user?.id || "").trim();
  if (!localUserId) return false;
  const requesterUserId = String(data?.requesterUserId || "").trim();
  if (requesterUserId && requesterUserId === localUserId) return false;

  const viewerIds = Array.isArray(data?.viewerIds)
    ? data.viewerIds.map(id => String(id || "").trim()).filter(Boolean)
    : [];
  if (viewerIds.length && !viewerIds.includes(localUserId)) return false;

  if (game.user?.isGM) return true;
  return isAssistantOrHigherRole(game.user?.role);
}

function showDamageConfigObserverPopup(data) {
  if (!data || typeof Dialog !== "function") return false;
  const requestId = String(data.requestId || "").trim();
  const action = String(data.action || "open").trim().toLowerCase() || "open";
  if (action === "close") return closeDamageConfigObserverDialog(requestId);

  const state = buildDamageConfigObserverState(data);
  const existing = requestId ? ACTIVE_DAMAGE_CONFIG_POPUPS.get(requestId) : null;
  if (existing?.element?.length) {
    return updateDamageConfigObserverDialog(existing, state);
  }
  if (existing) ACTIVE_DAMAGE_CONFIG_POPUPS.delete(requestId);

  const content = getDamageConfigObserverContent(state);
  const dialog = new Dialog(
    {
      title: state.title,
      content,
      buttons: {
        ok: { label: "OK" }
      },
      default: "ok",
      close: () => {
        if (!requestId) return;
        const current = ACTIVE_DAMAGE_CONFIG_POPUPS.get(requestId);
        if (current === dialog) ACTIVE_DAMAGE_CONFIG_POPUPS.delete(requestId);
      }
    },
    {
      classes: ["bloodman-damage-dialog"],
      width: 500
    }
  );
  dialog.render(true);
  if (requestId) ACTIVE_DAMAGE_CONFIG_POPUPS.set(requestId, dialog);
  return true;
}

async function handleDamageConfigPopupMessage(data, source = "socket") {
  if (!data) return false;
  const eventId = String(data.eventId || "").trim();
  if (eventId && wasDamageConfigPopupRequestProcessed(eventId)) return false;
  if (eventId) rememberDamageConfigPopupRequest(eventId);
  if (!canCurrentUserReceiveDamageConfigPopup(data)) return false;
  const shown = showDamageConfigObserverPopup(data);
  if (!shown) console.warn("[bloodman] damage:config popup display failed", { source, eventId, payload: data });
  return shown;
}

function getPowerUsePopupViewerIds(requesterUserId = "", options = {}) {
  const requesterId = String(requesterUserId || "").trim();
  const includeRequesterUser = options?.includeRequesterUser === true;
  const ids = [];
  for (const user of game.users || []) {
    if (!user?.active) continue;
    const userId = String(user.id || "").trim();
    if (!userId) continue;
    if (!user.isGM && !isAssistantOrHigherRole(user.role)) continue;
    if (!includeRequesterUser && requesterId && userId === requesterId) continue;
    ids.push(userId);
  }
  return ids;
}

function emitPowerUsePopup(actor, item, options = {}) {
  if (!game.socket || !actor || !item || item.type !== "pouvoir") return false;
  const requesterUserId = String(game.user?.id || "").trim();
  const includeRequesterUser = options?.includeRequesterUser === true;
  const viewerIds = getPowerUsePopupViewerIds(requesterUserId, { includeRequesterUser });
  if (!viewerIds.length) return false;
  const randomId = () => (foundry.utils?.randomID ? foundry.utils.randomID() : Math.random().toString(36).slice(2));
  const powerDamageFormula = item.system?.damageEnabled ? normalizeRollDieFormula(item.system?.damageDie, "d4") : "";
  const payload = {
    type: "powerUsePopup",
    eventId: randomId(),
    requestId: String(options.requestId || randomId()),
    requesterUserId,
    requesterUserName: String(game.user?.name || "").trim(),
    viewerIds,
    actorId: String(actor.id || ""),
    actorName: String(actor.name || "").trim(),
    powerId: String(item.id || ""),
    powerName: String(item.name || "").trim() || "Pouvoir",
    powerDescription: String(item.system?.note || item.system?.notes || "").trim(),
    powerCostEnabled: toBooleanFlag(item.system?.powerCostEnabled),
    powerCost: Math.max(0, Math.floor(toFiniteNumber(item.system?.powerCost, 0))),
    damageEnabled: toBooleanFlag(item.system?.damageEnabled),
    damageFormula: String(powerDamageFormula || "").trim(),
    context: {
      fromUseButton: options.fromUseButton === true
    }
  };
  try {
    game.socket.emit(SYSTEM_SOCKET, payload);
  } catch (error) {
    console.error("[bloodman] power:popup socket emit failed", error);
  }
  if (typeof ChatMessage?.create === "function") {
    void ChatMessage.create({
      content: POWER_USE_POPUP_CHAT_MARKUP,
      whisper: viewerIds,
      flags: { bloodman: { powerUsePopup: payload } }
    }).catch(error => {
      console.error("[bloodman] power:popup chat fallback failed", error);
    });
  }
  return true;
}

function canCurrentUserReceivePowerUsePopup(data) {
  const localUserId = String(game.user?.id || "").trim();
  if (!localUserId) return false;
  const requesterUserId = String(data?.requesterUserId || "").trim();
  const isRequester = requesterUserId && requesterUserId === localUserId;
  const viewerIds = Array.isArray(data?.viewerIds)
    ? data.viewerIds.map(id => String(id || "").trim()).filter(Boolean)
    : [];
  if (isRequester && viewerIds.length && !viewerIds.includes(localUserId)) return false;
  if (isRequester && !viewerIds.length) return false;
  if (viewerIds.length && !viewerIds.includes(localUserId)) return false;
  if (game.user?.isGM) return true;
  return isAssistantOrHigherRole(game.user?.role);
}

function showPowerUsePopup(data) {
  if (!data || typeof Dialog !== "function") return false;
  const escapeHtml = value => (foundry.utils?.escapeHTML ? foundry.utils.escapeHTML(String(value || "")) : String(value || ""));
  const actorName = String(data.actorName || "").trim();
  const requesterUserName = String(data.requesterUserName || "").trim();
  const powerName = String(data.powerName || "").trim() || "Pouvoir";
  const descriptionHtml = formatMultilineTextToHtml(data.powerDescription);
  const noDescriptionText = escapeHtml("Aucune description.");
  const damageEnabled = data.damageEnabled === true;
  const damageFormula = String(data.damageFormula || "").trim().toUpperCase();
  const damageText = damageEnabled && damageFormula ? damageFormula : "Aucun";
  const powerCostEnabled = data.powerCostEnabled === true;
  const powerCost = Math.max(0, Math.floor(toFiniteNumber(data.powerCost, 0)));
  const costText = powerCostEnabled ? `${powerCost} PP` : "Aucun";
  const actorLabel = escapeHtml(actorName || "Joueur");
  const requesterLabel = escapeHtml(requesterUserName || actorName || "Joueur");
  const powerLabel = escapeHtml(powerName);
  const damageLabel = escapeHtml(damageText);
  const costLabel = escapeHtml(costText);
  const title = `Pouvoir utilise - ${actorName || requesterUserName || "Joueur"}`;
  const content = `<div class="bm-power-use-popup">
    <p><strong>Joueur :</strong> ${requesterLabel}</p>
    <p><strong>Personnage :</strong> ${actorLabel}</p>
    <p><strong>Pouvoir :</strong> ${powerLabel}</p>
    <p><strong>Cout :</strong> ${costLabel}</p>
    <p><strong>Degats :</strong> ${damageLabel}</p>
    <p><strong>Description :</strong></p>
    <p>${descriptionHtml || noDescriptionText}</p>
  </div>`;
  const dialog = new Dialog(
    {
      title,
      content,
      buttons: {
        ok: { label: "OK" }
      },
      default: "ok"
    },
    {
      classes: ["bloodman-damage-dialog", "bloodman-power-use-dialog"],
      width: 480
    }
  );
  dialog.render(true);
  return true;
}

async function handlePowerUsePopupMessage(data, source = "socket") {
  if (!data) return false;
  const eventId = String(data.eventId || data.requestId || "").trim();
  if (eventId && wasPowerUsePopupRequestProcessed(eventId)) return false;
  if (eventId) rememberPowerUsePopupRequest(eventId);
  if (!canCurrentUserReceivePowerUsePopup(data)) return false;
  const shown = showPowerUsePopup(data);
  if (!shown) console.warn("[bloodman] power:popup display failed", { source, eventId, payload: data });
  return shown;
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
      rollKeepHighest: data.rollKeepHighest === true,
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
  if (typeof context.rollKeepHighest !== "boolean") {
    context.rollKeepHighest = data.rollKeepHighest === true;
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
      await postDamageTakenChatMessage({
        name: targetName,
        amount: finalDamage,
        pa: paEffective,
        speakerAlias: targetName
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
    await postDamageTakenChatMessage({
      name: fallbackName,
      amount: finalDamage,
      pa: paEffective,
      speakerAlias: fallbackName
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
    await postDamageTakenChatMessage({
      name: fallbackName,
      amount: finalDamage,
      pa: paEffective,
      speakerAlias: fallbackName
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
  const allowAmmoUpdate = Boolean(options.allowAmmoUpdate);
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
  if (!isAssistantOrHigherRole(role)) {
    stripUpdatePaths(sanitized, ACTOR_TOKEN_IMAGE_UPDATE_PATHS);
    if (!allowAmmoUpdate) stripUpdatePaths(sanitized, AMMO_UPDATE_PATHS);
  }
  normalizeActorAmmoUpdateData(options.actor || null, sanitized);
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
  const allowAmmoUpdate = Boolean(data?.options?.allowAmmoUpdate);
  const sanitized = sanitizeActorUpdateForRole(data.updateData || {}, requesterRole, {
    actor,
    allowCharacteristicBase,
    allowVitalResourceUpdate,
    allowAmmoUpdate,
    enforceCharacteristicBaseRange: actor.type === "personnage"
  });
  if (!hasActorUpdatePayload(sanitized)) return;
  await actor.update(sanitized, {
    bloodmanAllowCharacteristicBase: allowCharacteristicBase,
    bloodmanAllowVitalResourceUpdate: allowVitalResourceUpdate,
    bloodmanAllowAmmoUpdate: allowAmmoUpdate
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
      allowVitalResourceUpdate: Boolean(options.allowVitalResourceUpdate),
      allowAmmoUpdate: Boolean(options.allowAmmoUpdate)
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
    if (data.type === "damageConfigPopup") {
      await handleDamageConfigPopupMessage(data, "socket");
      return;
    }
    if (data.type === "powerUsePopup") {
      await handlePowerUsePopupMessage(data, "socket");
      return;
    }
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

    const currentEquipment = foundry.utils.mergeObject(buildDefaultEquipment(), actor.system.equipment || {}, {
      inplace: false
    });
    const normalizedCurrencyCurrent = normalizeCurrencyCurrentValue(currentEquipment.monnaiesActuel, 0);
    const safeCurrencyCurrent = normalizedCurrencyCurrent.ok ? normalizedCurrencyCurrent.value : 0;
    const normalizedCurrencyType = String(currentEquipment.monnaies ?? "").trim();
    if (!actor.system.equipment) {
      updates["system.equipment"] = {
        ...currentEquipment,
        monnaies: normalizedCurrencyType,
        monnaiesActuel: safeCurrencyCurrent
      };
    } else {
      const storedCurrencyType = String(actor.system.equipment?.monnaies ?? "").trim();
      const storedCurrencyCurrent = normalizeCurrencyCurrentValue(actor.system.equipment?.monnaiesActuel, 0).value;
      if (storedCurrencyType !== normalizedCurrencyType) {
        updates["system.equipment.monnaies"] = normalizedCurrencyType;
      }
      if (!validateNumericEquality(storedCurrencyCurrent, safeCurrencyCurrent)) {
        updates["system.equipment.monnaiesActuel"] = safeCurrencyCurrent;
      }
    }

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

    const legacyAmmo = Array.isArray(actor.system.ammoPool) ? actor.system.ammoPool[0] : null;
    const fallbackAmmo = legacyAmmo
      ? {
        type: legacyAmmo.type || "",
        stock: Number(legacyAmmo.value) || 0,
        magazine: Number(legacyAmmo.value) || 0,
        value: Number(legacyAmmo.value) || 0
      }
      : buildDefaultAmmo();
    const normalizedAmmo = normalizeAmmoState(actor.system?.ammo, {
      fallback: fallbackAmmo,
      capacity: getActorAmmoCapacityLimit(actor)
    });
    const hasAmmoShape = actor.system?.ammo
      && actor.system.ammo.stock != null
      && actor.system.ammo.magazine != null
      && actor.system.ammo.value != null;
    if (!hasAmmoShape || !areAmmoStatesEqual(actor.system?.ammo, normalizedAmmo)) {
      updates["system.ammo"] = normalizedAmmo;
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
    await syncActorDerivedCharacteristicsResources(actor);

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
      const rawMagazineCapacity = Number(item.system?.magazineCapacity);
      const magazineCapacity = normalizeNonNegativeInteger(item.system?.magazineCapacity, 0);
      if (!Number.isFinite(rawMagazineCapacity) || rawMagazineCapacity < 0 || rawMagazineCapacity !== Math.floor(rawMagazineCapacity)) {
        await item.update({ "system.magazineCapacity": magazineCapacity });
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
  // Keep the widget at document level so fixed coordinates stay viewport-based.
  if (root.parentElement !== document.body) {
    document.body.appendChild(root);
  }
  const hotbarRect = getVisibleRect(document.getElementById("hotbar"));
  const macroStripRect = getVisibleRect(
    document.querySelector("#hotbar #macro-list")
    || document.querySelector("#hotbar ol#macro-list")
    || document.querySelector("#hotbar #action-bar")
    || document.querySelector("#hotbar ol#action-bar")
  );
  const sidebarRect = getVisibleRect(document.getElementById("sidebar"))
    || getVisibleRect(document.getElementById("ui-right"));
  const anchorRect = hotbarRect || macroStripRect || null;
  const rootRect = root.getBoundingClientRect();
  const halfWidth = Math.max(18, (rootRect.width || 60) / 2);
  const viewportMargin = 8;
  const rightGap = 14;
  const bottomOffset = 30;

  let centerX = Math.round(window.innerWidth / 2);
  if (anchorRect) {
    centerX = Math.round(anchorRect.right + rightGap + halfWidth);
  } else if (sidebarRect) {
    centerX = Math.round(sidebarRect.left - halfWidth - rightGap);
  }

  const rightBoundary = sidebarRect
    ? (sidebarRect.left - viewportMargin - halfWidth)
    : (window.innerWidth - viewportMargin - halfWidth);
  const leftBoundary = viewportMargin + halfWidth;
  const maxCenter = Math.max(leftBoundary, rightBoundary);
  const clampedX = Math.max(leftBoundary, Math.min(maxCenter, centerX));

  root.style.left = `${clampedX}px`;
  root.style.right = "auto";
  root.style.bottom = `${bottomOffset}px`;
  root.style.top = "auto";
  root.style.transform = "translateX(-50%)";
}

function ensureChaosDiceUI() {
  if (!game.user.isGM) return;
  if (document.getElementById("bm-chaos-dice")) return;
  const target = document.body;
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

  const type = String(item.type || "").trim().toLowerCase();
  if (type === "aptitude" || type === "pouvoir") {
    await applyItemResourceBonuses(item.actor);
    return;
  }
  if (CHARACTERISTIC_BONUS_ITEM_TYPES.has(type)) {
    await syncActorDerivedCharacteristicsResources(item.actor);
  }
});

Hooks.on("preCreateItem", (item, createData) => {
  const normalizedAudio = normalizeItemAudioUpdate(item, createData);
  if (normalizedAudio.invalid) {
    ui.notifications?.error(t("BLOODMAN.Notifications.ItemAudioInvalidSelection", { item: getItemAudioName(item) }));
  }

  normalizeItemPriceUpdate(item, createData);
  normalizeWeaponMagazineCapacityUpdate(item, createData);
  normalizeCharacteristicBonusItemUpdate(item, createData);

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

  normalizeItemPriceUpdate(item, updateData);
  normalizeWeaponMagazineCapacityUpdate(item, updateData);
  normalizeCharacteristicBonusItemUpdate(item, updateData);

  if (item?.type !== "aptitude") return;
  const costPath = "system.xpVoyageCost";
  const rawUpdateCost = foundry.utils.getProperty(updateData, costPath);
  const hasCostUpdate = Object.prototype.hasOwnProperty.call(updateData, costPath)
    || rawUpdateCost !== undefined;
  if (!hasCostUpdate) return;
  const nextCost = normalizeNonNegativeInteger(rawUpdateCost, item.system?.xpVoyageCost ?? 0);
  foundry.utils.setProperty(updateData, costPath, nextCost);
});

function isCurrentUserChatMessageAuthor(message) {
  const localUserId = String(game.user?.id || "").trim();
  const messageUserId = String(message?.user?.id || message?.user || message?.author?.id || "").trim();
  if (localUserId && messageUserId) return localUserId === messageUserId;
  return Boolean(message?.isAuthor);
}

function scheduleTransientChatMessageDeletion(message, delayMs = 250) {
  const messageId = String(message?.id || "").trim();
  if (!messageId) return;
  if (!isCurrentUserChatMessageAuthor(message)) return;
  const timeout = Math.max(0, Math.floor(toFiniteNumber(delayMs, 250)));
  setTimeout(() => {
    const existing = game.messages?.get(messageId);
    if (!existing) return;
    if (!isCurrentUserChatMessageAuthor(existing)) return;
    existing.delete().catch(() => null);
  }, timeout);
}

Hooks.on("createChatMessage", async (message) => {
  const voyancePayload = foundry.utils.getProperty(message, "flags.bloodman.voyanceOverlayRequest");
  if (voyancePayload) {
    await handleVoyanceOverlayRequest(voyancePayload, "chat");
    scheduleTransientChatMessageDeletion(message, 250);
    return;
  }

  const damageConfigPopupPayload = foundry.utils.getProperty(message, "flags.bloodman.damageConfigPopup");
  if (damageConfigPopupPayload) {
    await handleDamageConfigPopupMessage(damageConfigPopupPayload, "chat");
    scheduleTransientChatMessageDeletion(message, 250);
    return;
  }

  const powerUsePopupPayload = foundry.utils.getProperty(message, "flags.bloodman.powerUsePopup");
  if (powerUsePopupPayload) {
    await handlePowerUsePopupMessage(powerUsePopupPayload, "chat");
    scheduleTransientChatMessageDeletion(message, 250);
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
    scheduleTransientChatMessageDeletion(message, 250);
    return;
  }
  const payload = foundry.utils.getProperty(message, "flags.bloodman.damageRequest");
  if (payload) {
    await handleIncomingDamageRequest(payload, "chat");
    scheduleTransientChatMessageDeletion(message, 250);
    return;
  }

  const rerollPayload = foundry.utils.getProperty(message, "flags.bloodman.rerollDamageRequest");
  if (!rerollPayload) return;
  await handleDamageRerollRequest(rerollPayload);
  scheduleTransientChatMessageDeletion(message, 250);
});

Hooks.on("renderChatMessage", (message, html) => {
  try {
    decorateBloodmanChatRollMessage(message, html);
  } catch (error) {
    console.warn("[bloodman] chat:roll decorate skipped", error);
  }
});

Hooks.on("renderHotbar", () => {
  positionChaosDiceUI();
});

Hooks.on("updateItem", (item) => {
  if (!item?.actor) return;
  const type = String(item.type || "").trim().toLowerCase();
  if (type === "aptitude" || type === "pouvoir") {
    applyItemResourceBonuses(item.actor);
    return;
  }
  if (CHARACTERISTIC_BONUS_ITEM_TYPES.has(type)) {
    syncActorDerivedCharacteristicsResources(item.actor);
  }
});

Hooks.on("deleteItem", (item) => {
  if (!item?.actor) return;
  const type = String(item.type || "").trim().toLowerCase();
  if (type === "aptitude" || type === "pouvoir") {
    applyItemResourceBonuses(item.actor);
    return;
  }
  if (CHARACTERISTIC_BONUS_ITEM_TYPES.has(type)) {
    syncActorDerivedCharacteristicsResources(item.actor);
  }
});

function getItemBonusTotals(actor) {
  const totals = {};
  for (const c of CHARACTERISTICS) totals[c.key] = 0;
  if (!actor?.items) return totals;

  for (const item of actor.items) {
    const type = String(item?.type || "").trim().toLowerCase();
    if (!CHARACTERISTIC_BONUS_ITEM_TYPES.has(type)) continue;
    if (!toCheckboxBoolean(item.system?.characteristicBonusEnabled, false)) continue;
    for (const characteristic of CHARACTERISTICS) {
      const key = characteristic.key;
      const value = Number(item.system?.characteristicBonuses?.[key]);
      if (Number.isFinite(value)) totals[key] += value;
    }
  }
  return totals;
}

function getItemResourceBonusTotals(actor) {
  const totals = { pv: 0, pp: 0 };
  if (!actor?.items) return totals;
  for (const item of actor.items) {
    if (item.type !== "aptitude" && item.type !== "pouvoir") continue;
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

async function syncActorDerivedCharacteristicsResources(actor) {
  const isCharacter = actor?.type === "personnage";
  const isNpc = actor?.type === "personnage-non-joueur";
  if (!actor || (!isCharacter && !isNpc) || !actor.isOwner) return;

  const itemBonuses = getItemBonusTotals(actor);
  const profile = actor.system?.profile || {};
  const archetypeBonusValue = normalizeArchetypeBonusValue(profile.archetypeBonusValue, 0);
  const archetypeBonusCharacteristic = normalizeCharacteristicKey(profile.archetypeBonusCharacteristic);
  const getArchetypeBonus = key => {
    if (!Number.isFinite(archetypeBonusValue)) return 0;
    return archetypeBonusCharacteristic === key ? archetypeBonusValue : 0;
  };
  const effective = key => {
    return toFiniteNumber(actor.system.characteristics?.[key]?.base, 0)
      + toFiniteNumber(actor.system.modifiers?.all, 0)
      + toFiniteNumber(actor.system.modifiers?.[key], 0)
      + toFiniteNumber(itemBonuses?.[key], 0)
      + getArchetypeBonus(key);
  };

  const phyEffective = effective("PHY");
  const espEffective = effective("ESP");
  const derivedPvMax = getDerivedPvMax(actor, phyEffective);
  const derivedPpMax = Math.round(espEffective / 5);
  const storedPvBonus = toFiniteNumber(actor.system.resources?.pv?.itemBonus, 0);
  const storedPpBonus = toFiniteNumber(actor.system.resources?.pp?.itemBonus, 0);
  const nextPvMax = Math.max(0, derivedPvMax + storedPvBonus);
  const nextPpMax = Math.max(0, derivedPpMax + storedPpBonus);
  const currentPvMax = toFiniteNumber(actor.system.resources?.pv?.max, nextPvMax);
  const currentPpMax = toFiniteNumber(actor.system.resources?.pp?.max, nextPpMax);
  const currentPv = toFiniteNumber(actor.system.resources?.pv?.current, 0);
  const currentPp = toFiniteNumber(actor.system.resources?.pp?.current, 0);

  const updates = {};
  if (!validateNumericEquality(currentPvMax, nextPvMax)) updates["system.resources.pv.max"] = nextPvMax;
  if (!validateNumericEquality(currentPpMax, nextPpMax)) updates["system.resources.pp.max"] = nextPpMax;
  if (currentPv > nextPvMax) updates["system.resources.pv.current"] = nextPvMax;
  if (currentPp > nextPpMax) updates["system.resources.pp.current"] = nextPpMax;
  if (Object.keys(updates).length) {
    await actor.update(updates, { bloodmanAllowVitalResourceUpdate: true });
  }

  const gauge = normalizeActorMoveGauge(actor, { itemBonuses, initializeWhenMissing: true });
  await setActorMoveGauge(actor, gauge.value, gauge.max);
}

async function applyPowerCost(actor, item) {
  if (!actor || !item) return true;
  if (item.type !== "pouvoir") return true;
  if (!item.system?.powerCostEnabled) return true;
  const cost = Number(item.system?.powerCost);
  if (!Number.isFinite(cost) || cost <= 0) return true;
  const current = Number(actor.system.resources?.pp?.current || 0);
  if (current < cost) {
    ui.notifications?.error("Points de puissance insuffisants pour utiliser ce pouvoir.");
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
  data.usableEnabled = isPowerUsableEnabled(item.system?.usableEnabled);
  data.displayNoteHtml = formatMultilineTextToHtml(item.system?.note || item.system?.notes || "");

  if (item.system?.damageEnabled && item.system?.damageDie) {
    const rawDie = item.system.damageDie.toString();
    data.displayDamageDie = normalizeRollDieFormula(rawDie, "d4");
  }
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
  void repairTokenTextureSource(token);
  scheduleRoundTokenMask(token);
});

Hooks.on("createToken", async (tokenDoc) => {
  await repairTokenTextureSource(tokenDoc);
  scheduleRoundTokenMask(tokenDoc);
  if (!game.user.isGM) return;
  if (getTokenActorType(tokenDoc) !== "personnage") return;
  await refreshBossSoloNpcPvMax();
});

Hooks.on("preDeleteToken", (tokenDoc) => {
  clearScheduledRoundTokenMask(tokenDoc);
  clearRoundTokenMask(tokenDoc);
});

Hooks.on("deleteToken", async (tokenDoc) => {
  clearScheduledRoundTokenMask(tokenDoc);
  clearRoundTokenMask(tokenDoc);
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
    await repairTokenTextureSource(token);
    scheduleRoundTokenMask(token);
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
  const allowAmmoUpdate = Boolean(options?.bloodmanAllowAmmoUpdate);

  if (isBasicPlayerRole(updaterRole)) {
    if (!allowCharacteristicBase) {
      blockedRestrictedFields = stripUnauthorizedCharacteristicBaseUpdates(updateData) || blockedRestrictedFields;
    }
    if (!allowVitalResourceUpdate) {
      blockedRestrictedFields = stripUpdatePaths(updateData, Array.from(VITAL_RESOURCE_PATHS)) || blockedRestrictedFields;
    }
    blockedRestrictedFields = stripUpdatePaths(updateData, STATE_MODIFIER_PATHS) || blockedRestrictedFields;
  }
  if (!isAssistantOrHigherRole(updaterRole)) {
    blockedRestrictedFields = stripUpdatePaths(updateData, ACTOR_TOKEN_IMAGE_UPDATE_PATHS) || blockedRestrictedFields;
    if (!allowAmmoUpdate) {
      blockedRestrictedFields = stripUpdatePaths(updateData, AMMO_UPDATE_PATHS) || blockedRestrictedFields;
    }
  }
  normalizeActorAmmoUpdateData(actor, updateData);
  const currencyNormalization = normalizeActorEquipmentCurrencyUpdateData(actor, updateData);
  if (currencyNormalization.invalid) {
    ui.notifications?.error(currencyNormalization.message || buildInvalidCurrencyCurrentMessage());
    return false;
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

  const stateLabelPath = "system.modifiers.label";
  if (hasUpdatePath(stateLabelPath)) {
    const rawLabel = getUpdatedRawValue(stateLabelPath, actor.system?.modifiers?.label || "");
    const currentLabel = String(actor.system?.modifiers?.label || "").trim();
    const nextLabel = String(rawLabel || "").trim();
    const labelChanged = nextLabel !== currentLabel;
    if (labelChanged) {
      const stateUpdate = buildStateModifierUpdateFromLabel(rawLabel);
      if (!stateUpdate.ok) {
        ui.notifications?.error(buildInvalidStatePresetMessage(stateUpdate.invalidTokens));
        return false;
      }
      applyStateModifierUpdateToData(updateData, stateUpdate.label, stateUpdate.totals);
    }
  }

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
  const updaterRole = game.users?.get(userId)?.role ?? game.user?.role;
  if (!isAssistantOrHigherRole(updaterRole)) {
    const blockedTokenImageUpdate = stripUpdatePaths(changes, TOKEN_IMAGE_UPDATE_PATHS);
    if (blockedTokenImageUpdate) {
      const hasRemainingChanges = Object.keys(foundry.utils.flattenObject(changes || {})).length > 0;
      if (!hasRemainingChanges) return false;
    }
  }

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
      minimizable: true,
      resizable: true,
      submitOnChange: true,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "carac" }]
    });
  }

  _getHeaderButtons() {
    const baseButtons = typeof super._getHeaderButtons === "function"
      ? super._getHeaderButtons()
      : [];
    const buttons = baseButtons.filter(button => {
      const cls = String(button?.class || "");
      return !cls.includes("minimize") && !cls.includes("maximize");
    });

    buttons.unshift({
      label: "",
      class: "bloodman-minimize",
      icon: this._minimized ? "far fa-window-maximize" : "far fa-window-minimize",
      onclick: event => {
        event?.preventDefault?.();
        if (this._minimized && typeof this.maximize === "function") return this.maximize();
        if (!this._minimized && typeof this.minimize === "function") return this.minimize();
        return null;
      }
    });

    return buttons;
  }

  _syncMinimizeHeaderButton() {
    const root = this.element;
    if (!root?.length) return;
    const button = root.find(".window-header .header-button.bloodman-minimize");
    if (!button.length) return;
    const icon = button.find("i");
    icon.removeClass("fa-window-minimize fa-window-maximize");
    icon.addClass(this._minimized ? "fa-window-maximize" : "fa-window-minimize");
    button.attr(
      "title",
      this._minimized
        ? (game?.i18n?.localize?.("BLOODMAN.Common.Maximize") || "Agrandir")
        : (game?.i18n?.localize?.("BLOODMAN.Common.Minimize") || "Reduire")
    );
  }

  async minimize(...args) {
    this.clearPowerUseState();
    this._lastAutoResizeKey = "";
    const result = await super.minimize(...args);
    this._syncMinimizeHeaderButton();
    return result;
  }

  async maximize(...args) {
    this._lastAutoResizeKey = "";
    const result = await super.maximize(...args);
    this._syncMinimizeHeaderButton();
    this.render(false);
    return result;
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

  getPowerUseState() {
    if (!(this._usedPowerItemIds instanceof Set)) this._usedPowerItemIds = new Set();
    return this._usedPowerItemIds;
  }

  clearPowerUseState() {
    this.getPowerUseState().clear();
  }

  isPowerActivated(itemId) {
    const key = String(itemId || "").trim();
    if (!key) return false;
    return this.getPowerUseState().has(key);
  }

  markPowerActivated(itemId, active = true) {
    const key = String(itemId || "").trim();
    if (!key) return;
    const state = this.getPowerUseState();
    if (active) state.add(key);
    else state.delete(key);
  }

  render(force, options = {}) {
    if (Boolean(force) && !options?.bloodmanKeepRerollState) {
      this.clearRerollDisplayState();
    }
    return super.render(force, options);
  }

  async close(options = {}) {
    this.clearRerollDisplayState();
    this.clearPowerUseState();
    this._lastAutoResizeKey = "";
    return super.close(options);
  }

  async applyActorUpdate(updateData, options = {}) {
    if (!hasActorUpdatePayload(updateData)) return null;
    if (this.actor?.isOwner || game.user?.isGM) {
      return this.actor.update(updateData, options);
    }
    const sent = requestActorSheetUpdate(this.actor, updateData, {
      allowCharacteristicBase: Boolean(options?.bloodmanAllowCharacteristicBase),
      allowVitalResourceUpdate: Boolean(options?.bloodmanAllowVitalResourceUpdate),
      allowAmmoUpdate: Boolean(options?.bloodmanAllowAmmoUpdate)
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
    const canEditTokenImage = isAssistantOrHigherRole(game.user?.role);
    const canEditAmmoFields = isAssistantOrHigherRole(game.user?.role);
    const characteristicBaseHasBounds = data.actor.type === "personnage"
      && isCharacteristicBaseRangeRestrictedRole(game.user?.role);
    const canEditRestrictedFields = canToggleCharacteristicsEdit;
    const canEditXpChecks = canToggleCharacteristicsEdit;
    const canOpenItemSheets = canCurrentUserOpenItemSheets();
    if (!canToggleCharacteristicsEdit) this._characteristicsEditEnabled = false;
    const characteristicsEditEnabled = canToggleCharacteristicsEdit && Boolean(this._characteristicsEditEnabled);
    const modifiers = foundry.utils.mergeObject(buildDefaultModifiers(), data.actor.system.modifiers || {}, {
      inplace: false
    });
    const statePresetData = buildStatePresetDisplayData(modifiers.label);
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

    const itemBonuses = getItemBonusTotals(this.actor);
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
      const modifierTotal = flat + totalBonus;
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
        modifierTotal,
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
    applyResourceGaugeState(resources.pv);
    applyResourceGaugeState(resources.pp);

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
    equipment.monnaies = String(equipment.monnaies ?? "").trim();
    equipment.monnaiesActuel = normalizeCurrencyCurrentValue(equipment.monnaiesActuel, 0).value;
    const bagSlotsEnabled = Boolean(equipment.bagSlotsEnabled);
    const carriedItemsLimit = bagSlotsEnabled ? CARRIED_ITEM_LIMIT_WITH_BAG : CARRIED_ITEM_LIMIT_BASE;
    const ammoCapacityLimit = getActorAmmoCapacityLimit(this.actor);
    const ammo = normalizeAmmoState(
      foundry.utils.mergeObject(buildDefaultAmmo(), data.actor.system.ammo || {}, { inplace: false }),
      {
        fallback: buildDefaultAmmo(),
        capacity: ammoCapacityLimit
      }
    );
    const transportNpcs = buildTransportNpcDisplayData(this.actor);

    const itemBuckets = buildTypedItemBuckets(this.actor.items);

    const aptitudes = itemBuckets.aptitude.map(item => {
      const dataItem = buildItemDisplayData(item);
      dataItem.showItemReroll = Boolean(dataItem.displayDamageDie) && shouldShowItemReroll(item.id);
      return dataItem;
    });
    const powerUseState = this.getPowerUseState();
    const pouvoirs = itemBuckets.pouvoir.map(item => {
      const dataItem = buildItemDisplayData(item);
      const itemId = String(item.id || dataItem._id || "").trim();
      const usableEnabled = isPowerUsableEnabled(item.system?.usableEnabled);
      const isActivated = usableEnabled && itemId ? powerUseState.has(itemId) : false;
      if (!usableEnabled && itemId) powerUseState.delete(itemId);
      dataItem.showPowerUseButton = usableEnabled;
      dataItem.showPowerDamage = Boolean(dataItem.displayDamageDie) && (!usableEnabled || isActivated);
      dataItem.showItemReroll = dataItem.showPowerDamage && shouldShowItemReroll(item.id);
      return dataItem;
    });
    const activePowerIds = new Set(itemBuckets.pouvoir.map(item => String(item.id || "").trim()).filter(Boolean));
    for (const key of [...powerUseState]) {
      if (!activePowerIds.has(key)) powerUseState.delete(key);
    }
    const aptitudesThreeColumns = aptitudes.length >= 2;
    const pouvoirsThreeColumns = pouvoirs.length >= 2;

    const npcRole = data.actor.system.npcRole || "";

    const weaponTypeDistance = t("BLOODMAN.Equipment.WeaponType.Distance");
    const weaponTypeMelee = t("BLOODMAN.Equipment.WeaponType.Melee");
    const weapons = itemBuckets.arme.map(item => {
      const weapon = item.toObject();
      weapon._id = weapon._id ?? item.id;
      const normalized = normalizeWeaponType(weapon.system?.weaponType);
      const weaponCategory = getWeaponCategory(weapon.system?.weaponType);
      if (normalized === "corps") weapon.displayWeaponType = weaponTypeMelee;
      else if (normalized === "distance") weapon.displayWeaponType = weaponTypeDistance;
      else if (weapon.system?.weaponType) weapon.displayWeaponType = weapon.system.weaponType;
      else weapon.displayWeaponType = weaponTypeDistance;
      const consumesAmmo = weaponCategory === "distance" && !toCheckboxBoolean(weapon.system?.infiniteAmmo, false);
      const magazineCapacity = normalizeNonNegativeInteger(weapon.system?.magazineCapacity, 0);
      const usesDirectStock = consumesAmmo && magazineCapacity <= 0;
      const magazineForWeapon = usesDirectStock
        ? Math.max(0, ammo.stock)
        : Math.min(ammo.magazine, magazineCapacity);
      const magazineMissingAmmo = !usesDirectStock && magazineForWeapon < magazineCapacity;
      weapon.magazineCapacity = magazineCapacity;
      weapon.ammoCapacityDisplay = usesDirectStock ? Math.max(0, ammo.stock) : magazineCapacity;
      weapon.showAmmoState = consumesAmmo;
      weapon.ammoMagazine = magazineForWeapon;
      weapon.showReloadButton = consumesAmmo && ammo.stock > 0 && magazineMissingAmmo;
      weapon.reloadBlocked = !usesDirectStock && ammo.stock <= 0;
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
      canEditTokenImage,
      canEditAmmoFields,
      canOpenItemSheets,
      characteristicsEditEnabled,
      characteristics,
      totalPoints,
      modifiers,
      canEditStatePresets: canEditRestrictedFields,
      statePresetPsychic: statePresetData.psychic,
      statePresetBody: statePresetData.body,
      resources,
      profile,
      archetypeCharacteristicOptions,
      npcRole,
      npcRoleSbire: npcRole === "sbire",
      npcRoleSbireFort: npcRole === "sbire-fort",
      npcRoleBossSeul: npcRole === "boss-seul",
      equipment,
      showBagSlotsToggle: isCarriedItemLimitedActorType(this.actor?.type),
      bagSlotsEnabled,
      bagSlotsDisabled: !bagSlotsEnabled,
      carriedItemsLimit,
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
      aptitudesThreeColumns,
      pouvoirsThreeColumns
    };
  }

  getAutoResizeKey() {
    const root = this.element;
    const activeTab = String(
      root?.find?.(".sheet-body .tab.active")?.first?.()?.data?.("tab")
      || root?.find?.(".sheet-tabs .item.active")?.first?.()?.data?.("tab")
      || ""
    ).trim();
    const actorItems = this.actor?.items;
    const itemCounts = getActorItemCounts(actorItems);
    const transportCount = Number(getTransportNpcRefs(this.actor).length || 0);
    return `${activeTab}|${itemCounts.total}|${itemCounts.aptitudes}|${itemCounts.pouvoirs}|${itemCounts.carried}|${transportCount}`;
  }

  autoResizeToContent(force = false) {
    if (this._minimized) return;
    const root = this.element;
    if (!root?.length) return;
    const app = root.closest(".window-app");
    if (!app?.length) return;
    const resizeKey = this.getAutoResizeKey();
    if (!force && resizeKey && resizeKey === this._lastAutoResizeKey) return;
    const formEl = root.get(0);
    if (!formEl) return;
    const headerEl = app.find(".window-header").get(0);
    const configuredMinHeight = Number(this.options?.height);
    const minHeight = Number.isFinite(configuredMinHeight) ? Math.max(420, configuredMinHeight) : 820;
    const previousInlineHeight = formEl.style.height;
    formEl.style.height = "auto";
    const formNaturalHeight = Math.ceil(
      Math.max(
        Number(formEl.scrollHeight) || 0,
        Number(formEl.offsetHeight) || 0,
        Number(formEl.getBoundingClientRect?.().height) || 0
      )
    );
    formEl.style.height = previousInlineHeight;
    if (formNaturalHeight <= 0) return;
    const headerHeight = Math.ceil(
      Number(headerEl?.getBoundingClientRect?.().height)
      || Number(app.find(".window-header").outerHeight(true))
      || 0
    );
    const targetHeight = Math.max(minHeight, headerHeight + formNaturalHeight + 4);
    const currentHeight = Math.ceil(Number(this.position?.height) || Number(app.outerHeight()) || 0);
    if (Math.abs(targetHeight - currentHeight) < 2) {
      if (resizeKey) this._lastAutoResizeKey = resizeKey;
      return;
    }
    this.setPosition({ height: targetHeight });
    if (resizeKey) this._lastAutoResizeKey = resizeKey;
  }

  activateListeners(html) {
    super.activateListeners(html);
    this._syncMinimizeHeaderButton();
    const scheduleAutoResize = (force = false) => setTimeout(() => this.autoResizeToContent(force), 0);

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
    scheduleAutoResize(true);

    html.find(".sheet-tabs .item").on("click", () => {
      scheduleAutoResize();
    });

    html.on("click", ".char-edit-toggle", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      if (!canCurrentUserEditCharacteristics()) return;
      this._characteristicsEditEnabled = !this._characteristicsEditEnabled;
      this.render(false);
    });

    html.on("click", ".state-preset-item", async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      if (!canCurrentUserEditCharacteristics()) return;
      const stateId = String(ev.currentTarget?.dataset?.stateId || "").trim();
      if (!stateId) return;
      await this.toggleStatePreset(stateId);
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

    html.find(".weapon-reload").click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const li = ev.currentTarget.closest(".item");
      const item = this.getItemFromListElement(li);
      await this.reloadWeapon(item);
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
      if (!canCurrentUserOpenItemSheets()) return;
      const li = ev.currentTarget.closest(".item");
      const item = this.getItemFromListElement(li);
      item?.sheet?.render(true);
    });

    html.find(".item-use").click(async ev => {
      const li = ev.currentTarget.closest(".item");
      const item = this.getItemFromListElement(li);
      await this.useItem(item);
    });

    html.find(".power-use").click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const li = ev.currentTarget.closest(".item");
      const item = this.getItemFromListElement(li);
      await this.usePower(item);
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

    html.find(".bag-slots-toggle").change(async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const input = ev.currentTarget;
      const choice = String(input?.dataset?.bagSlots || "").toLowerCase();
      if (choice !== "yes" && choice !== "no") return;

      const yesInput = html.find(".bag-slots-toggle[data-bag-slots='yes']");
      const noInput = html.find(".bag-slots-toggle[data-bag-slots='no']");
      const checked = Boolean(input.checked);

      let bagSlotsEnabled = false;
      if (choice === "yes") {
        bagSlotsEnabled = checked;
        yesInput.prop("checked", checked);
        noInput.prop("checked", !checked);
      } else {
        bagSlotsEnabled = !checked;
        yesInput.prop("checked", !checked);
        noInput.prop("checked", checked);
      }

      await this.applyActorUpdate({ "system.equipment.bagSlotsEnabled": bagSlotsEnabled });
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

    html.find(".item-icon").on("load", () => {
      scheduleAutoResize();
    });
  }

  async toggleStatePreset(stateId) {
    const preset = STATE_PRESET_BY_ID.get(String(stateId || "").trim());
    if (!preset) return;
    const currentLabel = String(this.actor?.system?.modifiers?.label || "");
    const currentSelection = resolveStatePresetSelection(currentLabel);
    if (currentSelection.invalidTokens.length) {
      ui.notifications?.error(buildInvalidStatePresetMessage(currentSelection.invalidTokens));
      return;
    }
    const selected = new Set(currentSelection.ids);
    if (selected.has(preset.id)) selected.delete(preset.id);
    else selected.add(preset.id);
    const nextIds = STATE_PRESET_ORDER.filter(id => selected.has(id));
    const nextLabel = buildStatePresetLabelFromIds(nextIds);
    await this.applyActorUpdate({ "system.modifiers.label": nextLabel });
    this.render(false);
  }

  refreshResourceVisuals(html) {
    const root = html?.find ? html : this.element;
    if (!root?.length) return;
    const updateGauge = (kind, currentPath, maxPath) => {
      const currentInput = root.find(`input[name='${currentPath}']`).first();
      const maxInput = root.find(`input[name='${maxPath}']`).first();
      const circle = root.find(`.resource-circle.${kind}`).first();
      if (!currentInput.length || !maxInput.length || !circle.length) return;

      const gauge = resolveResourceGaugeState(currentInput.val(), maxInput.val(), { useUnitMaxWhenZero: true });
      const ratioKey = `data-${kind}-ratio`;
      const previousRatio = Number(circle.attr(ratioKey));
      const ratio = gauge.ratio;

      circle.css(`--${kind}-fill`, gauge.fill);
      circle.css(`--${kind}-ratio`, ratio.toFixed(4));
      circle.css(`--${kind}-steps`, String(gauge.steps));
      circle.attr(ratioKey, ratio.toFixed(4));

      circle.removeClass("is-empty is-critical is-warning is-healthy");
      circle.addClass(gauge.stateClass);

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

  getActorCurrencyCurrentValue() {
    return normalizeCurrencyCurrentValue(this.actor?.system?.equipment?.monnaiesActuel, 0).value;
  }

  getDropItemQuantity(dropData, droppedItem = null) {
    const candidates = [
      dropData?.quantity,
      dropData?.count,
      dropData?.amount,
      dropData?.data?.quantity,
      droppedItem?.system?.quantity
    ];
    for (const candidate of candidates) {
      const quantity = Number(candidate);
      if (!Number.isFinite(quantity)) continue;
      if (quantity <= 0) continue;
      return Math.max(1, Math.floor(quantity));
    }
    return 1;
  }

  async resolveDropPermissionState(dropData) {
    if (game.user?.isGM) return { allowed: true };
    const entries = Array.isArray(dropData?.items) && dropData.items.length
      ? dropData.items
      : [dropData];
    const canDropMenuItems = canCurrentUserDropMenuItems();
    const limitedLevel = Number(CONST?.DOCUMENT_OWNERSHIP_LEVELS?.LIMITED ?? 1);

    for (const entry of entries) {
      const droppedItem = await Item.implementation.fromDropData(entry).catch(() => null);
      if (!droppedItem) continue;
      const sourceActor = droppedItem.actor;
      if (sourceActor?.id === this.actor?.id) continue;
      const isMenuSource = !sourceActor;
      if (isMenuSource && !canDropMenuItems) return { allowed: false, reason: "role" };
      // Keep actor-to-actor transfers unchanged.
      if (sourceActor) continue;
      // Compendium access rules are handled by Foundry and pack visibility.
      if (String(droppedItem.pack || "").trim()) continue;

      const hasLimitedAccess = typeof droppedItem.testUserPermission === "function"
        ? droppedItem.testUserPermission(game.user, limitedLevel, { exact: false })
        : Number(droppedItem.permission ?? 0) >= limitedLevel;
      if (!hasLimitedAccess) return { allowed: false, reason: "permission" };
    }

    return { allowed: true };
  }

  getDroppedItemUnitPrice(item) {
    const rawPrice = String(item?.system?.price ?? "").trim();
    if (!rawPrice) return { ok: true, value: 0 };
    const parsed = parseLooseNumericInput(rawPrice);
    if (!parsed.ok) return { ok: false, value: 0 };
    const unitPrice = parsed.value;
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return { ok: false, value: 0 };
    return { ok: true, value: roundCurrencyValue(unitPrice) };
  }

  async resolveDropPurchaseSummary(dropData) {
    const entries = Array.isArray(dropData?.items) && dropData.items.length
      ? dropData.items
      : [dropData];
    let totalCost = 0;
    let hasInvalidPrice = false;

    for (const entry of entries) {
      const droppedItem = await Item.implementation.fromDropData(entry).catch(() => null);
      if (!droppedItem) continue;
      const sourceActor = droppedItem.actor;
      if (sourceActor?.id === this.actor?.id) continue;
      const priceState = this.getDroppedItemUnitPrice(droppedItem);
      if (!priceState.ok) {
        hasInvalidPrice = true;
        continue;
      }
      if (!(priceState.value > 0)) continue;
      const quantity = this.getDropItemQuantity(entry, droppedItem);
      totalCost += priceState.value * quantity;
    }

    return {
      hasInvalidPrice,
      totalCost: roundCurrencyValue(totalCost)
    };
  }

  async _onDropItem(event, data) {
    const permissionState = await this.resolveDropPermissionState(data);
    if (!permissionState.allowed) {
      const notificationKey = permissionState.reason === "role"
        ? "BLOODMAN.Notifications.DropBlockedForPlayerRole"
        : "BLOODMAN.Notifications.DropRequiresLimitedPermission";
      ui.notifications?.warn(t(notificationKey));
      return null;
    }

    const reachedLimit = await this._reachedCarriedItemsLimit(data);
    if (reachedLimit) return null;

    const purchase = await this.resolveDropPurchaseSummary(data);
    if (purchase.hasInvalidPrice) {
      ui.notifications?.warn(t("BLOODMAN.Notifications.InvalidPurchasePrice"));
      return null;
    }

    let previousCurrency = null;
    let deductedBeforeDrop = false;
    if (purchase.totalCost > 0) {
      previousCurrency = this.getActorCurrencyCurrentValue();
      if (previousCurrency + 0.000001 < purchase.totalCost) {
        ui.notifications?.warn(t("BLOODMAN.Notifications.NotEnoughCurrency", {
          cost: formatCurrencyValue(purchase.totalCost),
          current: formatCurrencyValue(previousCurrency)
        }));
        return null;
      }
      const nextCurrency = roundCurrencyValue(previousCurrency - purchase.totalCost);
      await this.applyActorUpdate({ "system.equipment.monnaiesActuel": nextCurrency });
      deductedBeforeDrop = true;
    }

    try {
      const dropped = await super._onDropItem(event, data);
      if (!dropped && deductedBeforeDrop && previousCurrency != null) {
        await this.applyActorUpdate({ "system.equipment.monnaiesActuel": previousCurrency });
      }
      return dropped;
    } catch (error) {
      if (deductedBeforeDrop && previousCurrency != null) {
        await this.applyActorUpdate({ "system.equipment.monnaiesActuel": previousCurrency });
      }
      throw error;
    }
  }

  async _reachedCarriedItemsLimit(data) {
    if (!isCarriedItemLimitedActorType(this.actor?.type)) return false;
    const droppedItem = await Item.implementation.fromDropData(data).catch(() => null);
    if (!droppedItem || !CARRIED_ITEM_TYPES.has(droppedItem.type)) return false;

    const sourceActor = droppedItem.actor;
    if (sourceActor?.id === this.actor.id) return false;

    const carriedCount = this.actor.items.filter(item => CARRIED_ITEM_TYPES.has(item.type)).length;
    const carriedItemsLimit = getActorCarriedItemsLimit(this.actor);
    if (carriedCount < carriedItemsLimit) return false;

    ui.notifications?.warn(t("BLOODMAN.Notifications.MaxCarriedItems", { max: carriedItemsLimit }));
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
      flags: {
        bloodman: {
          luckRoll: {
            chance: chanceValue,
            roll: luckValue,
            outcome
          }
        }
      },
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

  async reloadWeapon(item) {
    if (!item || String(item.type || "").trim().toLowerCase() !== "arme") return;
    const weaponType = getWeaponCategory(item.system?.weaponType);
    if (weaponType !== "distance") return;
    if (toCheckboxBoolean(item.system?.infiniteAmmo, false)) return;

    const capacity = normalizeNonNegativeInteger(item.system?.magazineCapacity, 0);
    if (capacity <= 0) return;
    const ammoState = normalizeAmmoState(this.actor?.system?.ammo, {
      fallback: buildDefaultAmmo(),
      capacity: capacity > 0 ? capacity : 0
    });
    const currentMagazine = capacity > 0
      ? Math.min(ammoState.magazine, capacity)
      : Math.max(0, ammoState.magazine);
    const targetCapacity = capacity > 0 ? capacity : (currentMagazine + Math.max(0, ammoState.stock));
    const needed = Math.max(0, targetCapacity - currentMagazine);
    if (needed <= 0) return;
    if (ammoState.stock <= 0) {
      ui.notifications?.warn(t("BLOODMAN.Notifications.NoAmmo"));
      return;
    }

    const transferred = Math.min(needed, ammoState.stock);
    const nextStock = Math.max(0, ammoState.stock - transferred);
    const nextMagazine = capacity > 0
      ? Math.min(capacity, currentMagazine + transferred)
      : Math.max(0, currentMagazine + transferred);

    await this.applyActorUpdate({
      "system.ammo.stock": nextStock,
      "system.ammo.magazine": nextMagazine,
      "system.ammo.value": nextStock
    }, {
      bloodmanAllowAmmoUpdate: true
    });
    this.render(false);
  }

  async rollAbilityDamage(item) {
    if (!item) return;
    const isUsablePower = item.type === "pouvoir" && isPowerUsableEnabled(item.system?.usableEnabled);
    if (isUsablePower && !this.isPowerActivated(item.id)) return;
    const formula = normalizeRollDieFormula(item.system?.damageDie, "d4");
    const beforeRoll = async () => {
      if (isUsablePower) return true;
      return applyPowerCost(this.actor, item);
    };
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

  async usePower(item) {
    if (!item || item.type !== "pouvoir") return;
    if (!isPowerUsableEnabled(item.system?.usableEnabled)) return;
    const used = await applyPowerCost(this.actor, item);
    if (!used) return;
    this.markPowerActivated(item.id, true);
    const includeRequesterUser = game.user?.isGM && this.actor?.type === "personnage-non-joueur";
    emitPowerUsePopup(this.actor, item, {
      fromUseButton: true,
      includeRequesterUser
    });
    this.render(false);
  }

  async useItem(item) {
    if (!item) return;
    if (item.type === "pouvoir") {
      await this.usePower(item);
      return;
    }
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
      await playItemAudio(item, { delayMs: 0 });
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

    const rollEval = await evaluateRerollDamageFormula(context.formula || "1d4", context.rollKeepHighest === true);
    const roll = rollEval.roll;
    const rollResults = Array.isArray(rollEval.rollResults) ? rollEval.rollResults : [];
    const totalDamage = Math.max(0, Number(rollEval.rawTotal || 0) + Math.max(0, Number(context.bonusBrut || 0)));
    const modeTag = String(rollEval.modeTag || "");
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
      })}<br><small>${damageLabel} + ${context.bonusBrut} | PEN ${context.penetration}${modeTag ? ` | ${modeTag}` : ""} | ${t("BLOODMAN.Common.Reroll")}</small>`
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
        rollKeepHighest: context.rollKeepHighest === true,
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
        await postDamageTakenChatMessage({
          name: targetName,
          amount: finalDamage,
          pa: paEffective,
          speakerAlias: targetName
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
      if (!data.item.system) data.item.system = {};
      const weaponType = getWeaponCategory(this.item.system?.weaponType);
      data.weaponTypeDistance = weaponType === "distance";
      data.weaponTypeMelee = weaponType === "corps";
      // Weapons predate the damageEnabled flag; treat missing as enabled for backward compatibility.
      data.weaponDamageEnabled = this.item.system?.damageEnabled !== false;
      data.item.system.magazineCapacity = normalizeNonNegativeInteger(this.item.system?.magazineCapacity, 0);
      data.canEditMagazineCapacity = isAssistantOrHigherRole(game.user?.role);
    }
    if (this.item.type === "aptitude") {
      if (!data.item.system) data.item.system = {};
      data.item.system.xpVoyageCost = normalizeNonNegativeInteger(this.item.system?.xpVoyageCost, 0);
    }
    if (this.item.type === "pouvoir") {
      if (!data.item.system) data.item.system = {};
      data.item.system.usableEnabled = isPowerUsableEnabled(this.item.system?.usableEnabled);
    }
    if (this.item.type === "objet" || this.item.type === "protection") {
      if (!data.item.system) data.item.system = {};
      const defaultUseEnabled = this.item.type === "protection";
      data.item.system.useEnabled = toCheckboxBoolean(this.item.system?.useEnabled, defaultUseEnabled);
      data.item.system.characteristicBonusEnabled = toCheckboxBoolean(this.item.system?.characteristicBonusEnabled, false);
      const characteristicBonuses = {};
      for (const characteristic of CHARACTERISTICS) {
        characteristicBonuses[characteristic.key] = toFiniteNumber(
          this.item.system?.characteristicBonuses?.[characteristic.key],
          0
        );
      }
      data.item.system.characteristicBonuses = characteristicBonuses;
    }
    if (isPriceManagedItemType(this.item.type)) {
      if (!data.item.system) data.item.system = {};
      data.item.system.price = String(this.item.system?.price ?? "").trim();
      data.item.system.salePrice = String(this.item.system?.salePrice ?? "").trim();
      const preview = resolveItemSalePriceState(data.item.system.price, data.item.system.salePrice);
      data.itemComputedSellPrice = preview.salePrice;
      data.itemPriceError = preview.errorMessage;
      data.item.system.salePrice = preview.salePrice;
    }
    return data;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["bloodman", "sheet", "item"],
      width: 860,
      height: 500,
      resizable: true,
      submitOnChange: true
    });
  }

  activateListeners(html) {
    super.activateListeners(html);
    this.activatePricePreviewListeners(html);

    if (this.item.type !== "aptitude" && this.item.type !== "pouvoir") return;

    html.find(".damage-roll").click(() => {
      this.rollAbilityDamage();
    });
  }

  refreshPricePreview(htmlLike = null) {
    if (!isPriceManagedItemType(this.item?.type)) return;
    const root = htmlLike?.find ? htmlLike : this.element;
    if (!root?.length) return;
    const priceInput = root.find("input[name='system.price']").first();
    const saleInput = root.find("input[name='system.salePrice']").first();
    const errorNode = root.find("[data-price-error]").first();
    if (!priceInput.length || !saleInput.length || !errorNode.length) return;
    const saleManual = saleInput.attr("data-sale-manual") === "true";
    const pricePreview = resolveItemPricePreviewState(priceInput.val());
    if (!saleManual) {
      saleInput.val(pricePreview.errorMessage ? "" : pricePreview.salePrice);
    }
    errorNode.text(pricePreview.errorMessage || "");
    priceInput.toggleClass("is-invalid", Boolean(pricePreview.errorMessage));
    priceInput.attr("aria-invalid", pricePreview.errorMessage ? "true" : "false");
  }

  activatePricePreviewListeners(html) {
    if (!isPriceManagedItemType(this.item?.type)) return;
    const setSaleManualState = () => {
      const root = html?.find ? html : this.element;
      if (!root?.length) return false;
      const priceInput = root.find("input[name='system.price']").first();
      const saleInput = root.find("input[name='system.salePrice']").first();
      if (!priceInput.length || !saleInput.length) return false;
      const manual = isItemSalePriceManual(priceInput.val(), saleInput.val());
      saleInput.attr("data-sale-manual", manual ? "true" : "false");
      return manual;
    };
    const refresh = () => this.refreshPricePreview(html);
    html.on("input change blur", "input[name='system.price']", () => {
      refresh();
    });
    html.on("input change blur", "input[name='system.salePrice']", () => {
      setSaleManualState();
      refresh();
    });
    setSaleManualState();
    refresh();
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
