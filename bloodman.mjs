import { applyDamageToActor, doCharacteristicRoll, doDamageRoll, doDirectDamageRoll, doGrowthRoll, doHealRoll, getWeaponCategory, normalizeWeaponType, postDamageTakenChatMessage } from "./rollHelpers.mjs";
import { bmLog } from "./utils/logger.mjs";
import { registerBloodmanCoreSettings, initializeBloodmanLoggerFromSettings } from "./utils/settings.mjs";
import {
  getActivePrivilegedOperatorIds,
  getActiveGMUserIds,
  isAssistantOrHigherRole,
  isCurrentUserPrimaryPrivilegedOperator,
  registerPrivilegedUsersCacheHooks
} from "./utils/privileged-users.mjs";

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

const CHAT_ROLL_TYPES = Object.freeze({
  GENERIC: "generic",
  CHARACTERISTIC: "characteristic",
  DAMAGE: "damage",
  EXPERIENCE: "experience",
  HEAL: "heal",
  LUCK: "luck"
});
const CHAT_ROLL_TYPE_SET = new Set(Object.values(CHAT_ROLL_TYPES));

function normalizeChatRollType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return CHAT_ROLL_TYPE_SET.has(normalized) ? normalized : CHAT_ROLL_TYPES.GENERIC;
}

function buildChatRollFlags(chatRollType, extraBloodman = null) {
  const bloodmanFlags = { chatRollType: normalizeChatRollType(chatRollType) };
  if (extraBloodman && typeof extraBloodman === "object") Object.assign(bloodmanFlags, extraBloodman);
  return { bloodman: bloodmanFlags };
}

function safeWarn(message) {
  try {
    ui.notifications?.warn(message);
  } catch (error) {
    bmLog.warn("notify.warn failed", { message, error });
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
const CREATE_TYPE_REFRESH_DEBOUNCE_MS = 120;
const CREATE_TYPE_REFRESH_MAX_ROOTS = 40;
const ENABLE_CREATE_TYPE_ICON_OBSERVER = false;
let CREATE_TYPE_REFRESH_TIMER_ID = null;
let CREATE_TYPE_REFRESH_RUNNING = false;
let CREATE_TYPE_REFRESH_PENDING = false;
const CREATE_TYPE_REFRESH_ROOTS = new Set();

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
      const nextLabel = emoji ? `${emoji} ${baseLabel}` : baseLabel;
      if (String(option.textContent || "") !== nextLabel) option.textContent = nextLabel;
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
    bmLog.warn("[bloodman] create type icon picker disabled for this select", error);
    return;
  }
}

function injectDocumentCreateTypeIcons(htmlLike) {
  try {
    const root = htmlLike?.[0] || htmlLike;
    if (root instanceof HTMLElement) {
      const typeSelects = root.querySelectorAll("select[name='type']");
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
      ".window-app select[name='type'], .application select[name='type'], dialog select[name='type']"
    );
    for (const selectEl of fallbackSelects) decorateCreateTypeSelect(selectEl);
  } catch (error) {
    bmLog.warn("[bloodman] create type icon injection skipped", error);
  }
}

function refreshAllCreateTypeIcons() {
  const selectNodes = document.querySelectorAll(
    ".window-app select[name='type'], .application select[name='type'], dialog select[name='type']"
  );
  for (const selectEl of selectNodes) decorateCreateTypeSelect(selectEl);
}

function shouldRefreshCreateTypeIconsForNode(node) {
  if (!(node instanceof HTMLElement)) return false;
  if (node.matches("select[name='type'], input[name='type'], .window-app, .application, dialog")) return true;
  return Boolean(node.querySelector("select[name='type'], input[name='type']"));
}

function scheduleCreateTypeIconsRefresh() {
  if (CREATE_TYPE_REFRESH_TIMER_ID) return;
  CREATE_TYPE_REFRESH_TIMER_ID = setTimeout(() => {
    CREATE_TYPE_REFRESH_TIMER_ID = null;
    flushCreateTypeIconsRefreshQueue();
  }, CREATE_TYPE_REFRESH_DEBOUNCE_MS);
}

function queueCreateTypeIconsRefreshFromMutations(mutations = []) {
  let hasRelevantMutation = false;
  for (const mutation of mutations || []) {
    if (!mutation?.addedNodes?.length) continue;
    for (const node of mutation.addedNodes) {
      if (!shouldRefreshCreateTypeIconsForNode(node)) continue;
      CREATE_TYPE_REFRESH_ROOTS.add(node);
      hasRelevantMutation = true;
    }
  }
  if (!hasRelevantMutation) return;
  scheduleCreateTypeIconsRefresh();
}

function flushCreateTypeIconsRefreshQueue() {
  if (CREATE_TYPE_REFRESH_RUNNING) {
    CREATE_TYPE_REFRESH_PENDING = true;
    return;
  }
  CREATE_TYPE_REFRESH_RUNNING = true;
  try {
    const roots = Array.from(CREATE_TYPE_REFRESH_ROOTS).filter(node => node?.isConnected);
    CREATE_TYPE_REFRESH_ROOTS.clear();
    if (!roots.length) return;
    const cappedRoots = roots.slice(0, CREATE_TYPE_REFRESH_MAX_ROOTS);
    for (const root of cappedRoots) injectDocumentCreateTypeIcons(root);
    if (roots.length > cappedRoots.length) {
      for (const root of roots.slice(cappedRoots.length)) {
        if (root?.isConnected) CREATE_TYPE_REFRESH_ROOTS.add(root);
      }
      CREATE_TYPE_REFRESH_PENDING = true;
    }
  } catch (error) {
    bmLog.warn("create type icon refresh queue failed", { error });
  } finally {
    CREATE_TYPE_REFRESH_RUNNING = false;
    if (CREATE_TYPE_REFRESH_PENDING || CREATE_TYPE_REFRESH_ROOTS.size > 0) {
      CREATE_TYPE_REFRESH_PENDING = false;
      scheduleCreateTypeIconsRefresh();
    }
  }
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

function getTokenHudRootElement(htmlLike, fallback = null) {
  if (htmlLike instanceof HTMLElement) return htmlLike;

  const candidateFromCollection = Array.isArray(htmlLike)
    ? htmlLike[0]
    : htmlLike?.[0];
  if (candidateFromCollection instanceof HTMLElement) return candidateFromCollection;

  if (fallback instanceof HTMLElement) return fallback;

  const domRoot = document.getElementById("token-hud");
  return domRoot instanceof HTMLElement ? domRoot : null;
}

function getTokenHudStorageKey(tokenDoc) {
  return String(tokenDoc?.uuid || tokenDoc?.id || "").trim();
}

function clampTokenHudTurnValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return TOKEN_HUD_TURN_MIN;
  return Math.max(TOKEN_HUD_TURN_MIN, Math.min(TOKEN_HUD_TURN_MAX, Math.floor(numeric)));
}

function queryTokenHudControl(root, selectors = []) {
  if (!(root instanceof HTMLElement)) return null;
  for (const selector of selectors) {
    if (!selector) continue;
    const element = root.querySelector(selector);
    if (element) return element;
  }
  return null;
}

function ensureTokenHudColumn(root, name) {
  if (!(root instanceof HTMLElement) || !name) return null;
  const existing = root.querySelector(`.col.${name}`);
  if (existing) return existing;
  const column = document.createElement("div");
  column.className = `col ${name}`;
  root.appendChild(column);
  return column;
}

function reorderTokenHudColumn(column, orderedNodes = []) {
  if (!(column instanceof HTMLElement)) return;
  const unique = [];
  const seen = new Set();
  for (const node of orderedNodes) {
    if (!(node instanceof HTMLElement)) continue;
    if (seen.has(node)) continue;
    seen.add(node);
    unique.push(node);
  }
  const extras = Array.from(column.children).filter(node => !seen.has(node));
  column.replaceChildren(...unique, ...extras);
}

function ensureTokenHudLayoutContainer(root, className) {
  if (!(root instanceof HTMLElement) || !className) return null;
  let container = root.querySelector(`.${className}`);
  if (!(container instanceof HTMLElement)) {
    container = document.createElement("div");
    container.className = className;
    root.appendChild(container);
  }
  return container;
}

function resolveTokenHudEffectsButton(root) {
  const directMatch = queryTokenHudControl(root, [
    "button[data-action='togglePalette'][data-palette='effects']",
    "[data-action='togglePalette'][data-palette='effects']",
    "[data-action='toggleStatusEffects']",
    "button[data-action='toggleStatusEffects']",
    "button.control-icon.effects",
    "button[data-action='effects']",
    ".control-icon[data-action='togglePalette'][data-palette='effects']",
    ".control-icon.effects",
    ".control-icon[data-action='effects']",
    "[data-action='effects']",
    "[data-tooltip='HUD.AssignStatusEffects']",
    "[data-tooltip-text='HUD.AssignStatusEffects']"
  ]);
  if (directMatch instanceof HTMLElement) return directMatch;

  const effectsPalette = resolveTokenHudEffectsPalette(root);
  const previousSibling = effectsPalette?.previousElementSibling;
  if (previousSibling instanceof HTMLElement) return previousSibling;

  const rightCol = root instanceof HTMLElement ? root.querySelector(".col.right") : null;
  if (rightCol instanceof HTMLElement) {
    const paletteSibling = Array.from(rightCol.querySelectorAll(".palette.status-effects, .palette[data-palette='effects'], .status-effects"))
      .map(palette => palette?.previousElementSibling)
      .find(node => node instanceof HTMLElement);
    if (paletteSibling instanceof HTMLElement) return paletteSibling;
  }

  return null;
}

function resolveTokenHudEffectsPalette(root) {
  let palette = queryTokenHudControl(root, [
    ".palette[data-palette='effects']",
    ".palette.status-effects",
    ".status-effects"
  ]);
  if (!(palette instanceof HTMLElement) && root instanceof HTMLElement) {
    palette = Array.from(root.querySelectorAll(".palette, .status-effects"))
      .find(node => node instanceof HTMLElement && (
        node.matches(".palette.status-effects, .palette[data-palette='effects'], .status-effects")
        || Boolean(node.querySelector?.(".effect-control[data-status-id]"))
      )) || null;
  }
  if (!(palette instanceof HTMLElement)) return null;
  palette.classList.add("palette", "status-effects");
  if (!palette.dataset.palette) palette.dataset.palette = "effects";
  return palette;
}

function resolveTokenHudMovementButton(root) {
  return queryTokenHudControl(root, [
    "button[data-action='togglePalette'][data-palette='movementActions']",
    "button[data-action='movement']",
    "button[data-action='movementAction']",
    ".control-icon[data-action='togglePalette'][data-palette='movementActions']",
    ".control-icon[data-action='movement']"
  ]);
}

function resolveTokenHudMovementPalette(root) {
  const palette = queryTokenHudControl(root, [
    ".palette[data-palette='movementActions']",
    ".movement-actions"
  ]);
  if (!(palette instanceof HTMLElement)) return null;
  palette.classList.add("palette", "movement-actions");
  if (!palette.dataset.palette) palette.dataset.palette = "movementActions";
  return palette;
}

function getTokenHudLocalIconDirectoryPath() {
  return `${SYSTEM_ROOT_PATH}/images`;
}

function extractFileNameFromPath(path) {
  const normalized = String(path || "").trim();
  if (!normalized) return "";
  const cleanPath = normalized.split("#")[0].split("?")[0];
  const chunks = cleanPath.split("/");
  return String(chunks[chunks.length - 1] || "").trim();
}

function isSvgAssetPath(path) {
  const normalized = String(path || "").trim();
  if (!normalized) return false;
  return /\.svg(?:$|[?#])/i.test(normalized);
}

function collectTokenHudSvgStatusSources() {
  const sources = new Map();
  const effects = Array.isArray(CONFIG.statusEffects) ? CONFIG.statusEffects : [];
  for (const effect of effects) {
    if (!effect || typeof effect !== "object") continue;
    for (const key of ["img", "icon"]) {
      const sourcePath = String(effect[key] || "").trim();
      if (!isSvgAssetPath(sourcePath)) continue;
      const fileName = extractFileNameFromPath(sourcePath);
      if (!fileName) continue;
      const lower = fileName.toLowerCase();
      if (!sources.has(lower)) sources.set(lower, { fileName, sourcePath });
    }
  }
  return sources;
}

async function listTokenHudLocalSvgIconNames() {
  try {
    const browseResult = await FilePicker.browse("data", getTokenHudLocalIconDirectoryPath());
    const names = new Set();
    for (const filePath of Array.isArray(browseResult?.files) ? browseResult.files : []) {
      if (!isSvgAssetPath(filePath)) continue;
      const fileName = extractFileNameFromPath(filePath).toLowerCase();
      if (fileName) names.add(fileName);
    }
    return names;
  } catch (_error) {
    return new Set();
  }
}

async function copyTokenHudSvgIconToLocalFolder(fileName, sourcePath) {
  if (!fileName || !sourcePath) return false;
  try {
    const response = await fetch(sourcePath, { cache: "no-store" });
    if (!response?.ok) return false;
    const content = await response.text();
    if (!/<svg[\s>]/i.test(content)) return false;
    const file = new File([content], fileName, { type: "image/svg+xml" });
    await FilePicker.upload("data", getTokenHudLocalIconDirectoryPath(), file, {}, { notify: false });
    return true;
  } catch (_error) {
    return false;
  }
}

async function ensureTokenHudLocalSvgIcons({ copyMissing = false, force = false } = {}) {
  const now = Date.now();
  if (
    !force
    && !copyMissing
    && TOKEN_HUD_LOCAL_SVG_ICON_NAMES.size
    && (now - TOKEN_HUD_LAST_ICON_SYNC_AT) < TOKEN_HUD_ICON_SYNC_INTERVAL_MS
  ) {
    return TOKEN_HUD_LOCAL_SVG_ICON_NAMES;
  }

  if (TOKEN_HUD_ICON_SYNC_PROMISE) return TOKEN_HUD_ICON_SYNC_PROMISE;

  TOKEN_HUD_ICON_SYNC_PROMISE = (async () => {
    const svgSources = collectTokenHudSvgStatusSources();
    let localIconNames = await listTokenHudLocalSvgIconNames();

    if (copyMissing && game.user?.isGM && svgSources.size) {
      for (const { fileName, sourcePath } of svgSources.values()) {
        const lower = fileName.toLowerCase();
        if (localIconNames.has(lower)) continue;
        const copied = await copyTokenHudSvgIconToLocalFolder(fileName, sourcePath);
        if (copied) localIconNames.add(lower);
      }
      localIconNames = await listTokenHudLocalSvgIconNames();
    }

    TOKEN_HUD_LOCAL_SVG_ICON_NAMES = localIconNames;
    TOKEN_HUD_LAST_ICON_SYNC_AT = Date.now();
    TOKEN_HUD_ICON_CACHE_BUSTER = TOKEN_HUD_LAST_ICON_SYNC_AT;
    return TOKEN_HUD_LOCAL_SVG_ICON_NAMES;
  })().finally(() => {
    TOKEN_HUD_ICON_SYNC_PROMISE = null;
  });

  return TOKEN_HUD_ICON_SYNC_PROMISE;
}

function resolveTokenHudLocalSvgIconPath(sourcePath) {
  const normalized = String(sourcePath || "").trim();
  if (!normalized || !isSvgAssetPath(normalized)) return normalized;
  const fileName = extractFileNameFromPath(normalized);
  const lower = fileName.toLowerCase();
  if (!fileName || !TOKEN_HUD_LOCAL_SVG_ICON_NAMES.has(lower)) return normalized;
  return `${getTokenHudLocalIconDirectoryPath()}/${fileName}?v=${TOKEN_HUD_ICON_CACHE_BUSTER}`;
}

function refreshTokenHudStatusEffectIconPaths({ bumpCache = false } = {}) {
  if (bumpCache) TOKEN_HUD_ICON_CACHE_BUSTER = Date.now();
  const effects = Array.isArray(CONFIG.statusEffects) ? CONFIG.statusEffects : [];
  for (const effect of effects) {
    if (!effect || typeof effect !== "object") continue;
    const nextImg = resolveTokenHudLocalSvgIconPath(effect.img);
    if (nextImg && nextImg !== effect.img) effect.img = nextImg;
    const nextIcon = resolveTokenHudLocalSvgIconPath(effect.icon);
    if (nextIcon && nextIcon !== effect.icon) effect.icon = nextIcon;
  }
}

function arrangeTokenHudControlLayout(root) {
  if (!(root instanceof HTMLElement)) return;
  const leftCol = ensureTokenHudColumn(root, "left");
  const middleCol = ensureTokenHudColumn(root, "middle");
  const rightCol = ensureTokenHudColumn(root, "right");
  if (!(leftCol && middleCol && rightCol)) return;

  const elevation = queryTokenHudControl(root, [
    ".attribute.elevation",
    ".attribute[data-attribute='elevation']",
    "[name='elevation']"
  ])?.closest(".attribute") || null;

  const sortUp = queryTokenHudControl(root, [
    "button[data-action='sort'][data-direction='up']",
    "button[data-action='sort-up']",
    "button[data-action='sortUp']",
    "button[data-direction='up'][data-action='sort']"
  ]);

  const sortDown = queryTokenHudControl(root, [
    "button[data-action='sort'][data-direction='down']",
    "button[data-action='sort-down']",
    "button[data-action='sortDown']",
    "button[data-direction='down'][data-action='sort']"
  ]);

  const config = queryTokenHudControl(root, [
    "button[data-action='config']",
    ".control-icon[data-action='config']"
  ]);

  const visibility = queryTokenHudControl(root, [
    "button[data-action='visibility']",
    ".control-icon[data-action='visibility']"
  ]);

  const effectsButton = resolveTokenHudEffectsButton(root);
  const effectsPalette = resolveTokenHudEffectsPalette(root);

  const movementButton = resolveTokenHudMovementButton(root);
  const movementPalette = resolveTokenHudMovementPalette(root);

  const target = queryTokenHudControl(root, [
    "button[data-action='target']",
    ".control-icon[data-action='target']"
  ]);

  const combat = queryTokenHudControl(root, [
    "button[data-action='combat']",
    ".control-icon[data-action='combat']"
  ]);

  const bar2 = queryTokenHudControl(root, [".attribute.bar2"]);
  const bar1 = queryTokenHudControl(root, [".attribute.bar1"]);

  const topRow = ensureTokenHudLayoutContainer(root, "bm-token-hud-top-row");
  if (topRow instanceof HTMLElement) {
    if (effectsButton instanceof HTMLElement) topRow.appendChild(effectsButton);
    if (effectsPalette instanceof HTMLElement) topRow.appendChild(effectsPalette);
  }

  const bottomRow = ensureTokenHudLayoutContainer(root, "bm-token-hud-bottom-row");
  const bottomSort = ensureTokenHudLayoutContainer(root, "bm-token-hud-bottom-sort");
  if (bottomRow instanceof HTMLElement && bottomSort instanceof HTMLElement) {
    if (sortUp instanceof HTMLElement) bottomSort.appendChild(sortUp);
    if (sortDown instanceof HTMLElement) bottomSort.appendChild(sortDown);
    reorderTokenHudColumn(bottomRow, [config, elevation, bottomSort]);
  }

  reorderTokenHudColumn(leftCol, [combat, target]);
  reorderTokenHudColumn(middleCol, [bar2, bar1]);
  reorderTokenHudColumn(rightCol, [
    visibility,
    movementButton,
    movementPalette,
    ...Array.from(rightCol.children).filter(node => {
      if (!(node instanceof HTMLElement)) return false;
      return node !== visibility && node !== movementButton && node !== movementPalette;
    })
  ]);
}

function getTokenHudCounterFlagData(effectDoc) {
  const data = foundry.utils.getProperty(effectDoc, `flags.${SYSTEM_ID}.${TOKEN_HUD_COUNTER_FLAG_KEY}`);
  return data && typeof data === "object" ? data : null;
}

function isTokenHudCounterEffect(effectDoc, statusId = "") {
  const flagData = getTokenHudCounterFlagData(effectDoc);
  if (!flagData) return false;
  if (!statusId) return true;
  return normalizeStatusValue(flagData.statusId) === normalizeStatusValue(statusId);
}

function getTokenHudCounterEffects(actor, statusId = "") {
  const normalizedStatusId = normalizeStatusValue(statusId);
  return getActorEffectDocuments(actor).filter(effectDoc => {
    if (!isTokenHudCounterEffect(effectDoc)) return false;
    if (!normalizedStatusId) return true;
    return isTokenHudCounterEffect(effectDoc, normalizedStatusId);
  });
}

async function clearTokenHudCounterEffects(actor, statusId = "") {
  const counterEffects = getTokenHudCounterEffects(actor, statusId);
  if (!counterEffects.length) return false;
  return deleteStatusEffectDocuments(counterEffects);
}

async function cleanupTokenHudOrphanCounterEffects(actor) {
  if (!actor) return false;
  const orphanEffects = [];
  for (const effectDoc of getTokenHudCounterEffects(actor)) {
    const statusId = normalizeStatusValue(getTokenHudCounterFlagData(effectDoc)?.statusId);
    if (!statusId) {
      orphanEffects.push(effectDoc);
      continue;
    }
    if (!actorHasStatusInFamily(actor, [statusId])) orphanEffects.push(effectDoc);
  }
  if (!orphanEffects.length) return false;
  return deleteStatusEffectDocuments(orphanEffects);
}

function buildTokenHudTurnDurationData(turns) {
  const duration = { rounds: clampTokenHudTurnValue(turns), turns: 0 };
  const combat = game.combat || null;
  if (combat) {
    duration.startRound = Math.max(0, Math.floor(Number(combat.round ?? 0)));
    duration.startTurn = Math.max(0, Math.floor(Number(combat.turn ?? 0)));
  }
  return duration;
}

async function setTokenHudEffectDuration(effectDoc, turns) {
  if (!effectDoc) return false;
  const duration = buildTokenHudTurnDurationData(turns);
  await effectDoc.update({ duration }).catch(() => null);
  return true;
}

function getTokenHudPrimaryStatusEffectDocument(actor, statusId) {
  const normalizedStatusId = normalizeStatusValue(statusId);
  if (!actor || !normalizedStatusId) return null;
  const candidates = getActorStatusEffectDocumentsByFamily(actor, [normalizedStatusId]);
  for (const effectDoc of candidates) {
    if (isTokenHudCounterEffect(effectDoc)) continue;
    const statusIds = getActiveEffectStatusIds(effectDoc);
    if (statusIds.includes(normalizedStatusId)) return effectDoc;
  }
  return candidates.find(effectDoc => !isTokenHudCounterEffect(effectDoc)) || null;
}

function buildTokenHudTurnCounterEffectPayloads({ statusId, turns, primaryEffect, tokenDoc }) {
  const totalTurns = clampTokenHudTurnValue(turns);
  if (totalTurns <= TOKEN_HUD_TURN_MIN) return [];
  const statusDef = findStatusEffect([statusId]) || null;
  const statusNameKey = String(statusDef?.name ?? statusDef?.label ?? "").trim();
  const statusName = statusNameKey
    ? (game.i18n?.has?.(statusNameKey) ? game.i18n.localize(statusNameKey) : statusNameKey)
    : String(primaryEffect?.name || statusId || "Etat").trim();
  const rawStatusImg = String(statusDef?.img || statusDef?.icon || primaryEffect?.img || "icons/svg/aura.svg").trim();
  const statusImg = resolveTokenHudLocalSvgIconPath(rawStatusImg) || rawStatusImg;
  const normalizedStatusId = normalizeStatusValue(statusId);
  const tokenRef = String(tokenDoc?.uuid || tokenDoc?.id || "").trim();
  const payloads = [];

  for (let roundCount = TOKEN_HUD_TURN_MIN; roundCount < totalTurns; roundCount += 1) {
    payloads.push({
      name: `${statusName} (${roundCount})`,
      img: statusImg,
      origin: tokenRef || null,
      statuses: [],
      changes: [],
      duration: buildTokenHudTurnDurationData(roundCount),
      flags: {
        [SYSTEM_ID]: {
          [TOKEN_HUD_COUNTER_FLAG_KEY]: {
            statusId: normalizedStatusId,
            token: tokenRef,
            rounds: roundCount
          }
        }
      }
    });
  }

  return payloads;
}

async function applyTokenHudStatusTurnSelection(hud, statusId, { active = true, turns = TOKEN_HUD_TURN_MIN, overlay = false } = {}) {
  const actor = hud?.actor || hud?.document?.actor || null;
  const tokenDoc = hud?.document || hud?.object?.document || null;
  const normalizedStatusId = normalizeStatusValue(statusId);
  if (!actor || !normalizedStatusId || typeof actor.toggleStatusEffect !== "function") return false;

  await clearTokenHudCounterEffects(actor, normalizedStatusId);

  try {
    await actor.toggleStatusEffect(statusId, { active: Boolean(active), overlay: Boolean(overlay) });
  } catch (error) {
    bmLog.warn("[bloodman] token HUD status toggle failed", { statusId, error });
    return false;
  }

  if (!active) {
    await cleanupTokenHudOrphanCounterEffects(actor);
    return true;
  }

  const primaryEffect = getTokenHudPrimaryStatusEffectDocument(actor, normalizedStatusId);
  if (!primaryEffect) return true;

  const totalTurns = clampTokenHudTurnValue(turns);
  await setTokenHudEffectDuration(primaryEffect, totalTurns);

  if (totalTurns > TOKEN_HUD_TURN_MIN) {
    const payloads = buildTokenHudTurnCounterEffectPayloads({
      statusId: normalizedStatusId,
      turns: totalTurns,
      primaryEffect,
      tokenDoc
    });
    if (payloads.length) {
      await actor.createEmbeddedDocuments("ActiveEffect", payloads).catch(error => {
        bmLog.warn("[bloodman] token HUD counter effects creation failed", { statusId: normalizedStatusId, error });
      });
    }
  }

  await cleanupTokenHudOrphanCounterEffects(actor);
  return true;
}

function buildTokenHudTurnLabel(turns) {
  const count = clampTokenHudTurnValue(turns);
  return `${count} ${count > 1 ? "TOURS" : "TOUR"}`;
}

function getTokenHudTurnFieldValue(turnField) {
  if (turnField instanceof HTMLSelectElement) {
    return clampTokenHudTurnValue(turnField.value);
  }
  if (!(turnField instanceof HTMLElement)) return TOKEN_HUD_TURN_MIN;
  const valueInput = turnField.querySelector(".bm-token-hud-turn-value");
  if (valueInput instanceof HTMLInputElement) return clampTokenHudTurnValue(valueInput.value);
  return clampTokenHudTurnValue(turnField.dataset.turns || TOKEN_HUD_TURN_MIN);
}

function setTokenHudTurnFieldValue(turnField, turns) {
  const value = String(clampTokenHudTurnValue(turns));
  if (turnField instanceof HTMLSelectElement) {
    turnField.value = value;
    return;
  }
  if (!(turnField instanceof HTMLElement)) return;
  turnField.dataset.turns = value;
  const valueInput = turnField.querySelector(".bm-token-hud-turn-value");
  if (valueInput instanceof HTMLInputElement) valueInput.value = value;
  const label = turnField.querySelector(".bm-token-hud-turn-label");
  if (label instanceof HTMLElement) label.textContent = buildTokenHudTurnLabel(value);
  const options = turnField.querySelectorAll(".bm-token-hud-turn-option[data-turns]");
  for (const option of options) {
    if (!(option instanceof HTMLElement)) continue;
    const isSelected = option.dataset.turns === value;
    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-selected", isSelected ? "true" : "false");
  }
}

function buildTokenHudTurnControlContent(wrapper) {
  if (!(wrapper instanceof HTMLElement)) return null;
  wrapper.replaceChildren();

  const valueInput = document.createElement("input");
  valueInput.type = "hidden";
  valueInput.className = "bm-token-hud-turn-value";
  valueInput.name = "bm-token-hud-turns";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "bm-token-hud-turn-toggle";
  toggle.setAttribute("aria-label", "Nombre de tours d'effet");
  toggle.title = "Nombre de tours d'attribution d'effet d'etat (1 a 12)";

  const label = document.createElement("span");
  label.className = "bm-token-hud-turn-label";
  label.textContent = buildTokenHudTurnLabel(TOKEN_HUD_TURN_MIN);

  const caret = document.createElement("i");
  caret.className = "fa-solid fa-chevron-down bm-token-hud-turn-caret";
  caret.setAttribute("inert", "");

  toggle.append(label, caret);

  const menu = document.createElement("div");
  menu.className = "bm-token-hud-turn-menu";
  menu.setAttribute("role", "listbox");

  for (let turns = TOKEN_HUD_TURN_MIN; turns <= TOKEN_HUD_TURN_MAX; turns += 1) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "bm-token-hud-turn-option";
    option.dataset.turns = String(turns);
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", "false");
    option.textContent = buildTokenHudTurnLabel(turns);
    menu.appendChild(option);
  }

  wrapper.append(valueInput, toggle, menu);
  return wrapper;
}

function ensureTokenHudTurnControl(root, hud) {
  const topRow = ensureTokenHudLayoutContainer(root, "bm-token-hud-top-row");
  if (!(topRow instanceof HTMLElement)) return null;

  const effectsPalette = resolveTokenHudEffectsPalette(root);
  const effectsButton = resolveTokenHudEffectsButton(root);
  const anchorButton = effectsButton instanceof HTMLElement
    ? effectsButton
    : (effectsPalette?.previousElementSibling instanceof HTMLElement ? effectsPalette.previousElementSibling : null);
  if (!(anchorButton instanceof HTMLElement)) return null;

  let wrapper = topRow.querySelector(".bm-token-hud-turn-control");
  if (!(wrapper instanceof HTMLElement)) {
    wrapper = document.createElement("div");
    wrapper.className = "bm-token-hud-turn-control";
    buildTokenHudTurnControlContent(wrapper);
  } else if (!(wrapper.querySelector(".bm-token-hud-turn-toggle") instanceof HTMLElement)) {
    buildTokenHudTurnControlContent(wrapper);
  }

  const legacyInput = wrapper.querySelector(".bm-token-hud-turn-field");
  if (legacyInput instanceof HTMLElement) legacyInput.remove();
  const legacySuffix = wrapper.querySelector(".bm-token-hud-turn-suffix");
  if (legacySuffix instanceof HTMLElement) legacySuffix.remove();
  const legacySelect = wrapper.querySelector(".bm-token-hud-turn-select");
  if (legacySelect instanceof HTMLElement) legacySelect.remove();

  if (effectsPalette?.parentElement === topRow) {
    topRow.insertBefore(wrapper, effectsPalette);
  } else if (anchorButton.parentElement === topRow) {
    topRow.insertBefore(wrapper, anchorButton.nextSibling);
  } else if (wrapper.parentElement !== topRow) {
    topRow.appendChild(wrapper);
  }
  wrapper.classList.add("is-visible");

  const turnField = wrapper;

  const tokenKey = getTokenHudStorageKey(hud?.document || hud?.object?.document || null);
  const selectedTurns = tokenKey ? TOKEN_HUD_TURN_SELECTION_BY_TOKEN.get(tokenKey) : null;
  setTokenHudTurnFieldValue(turnField, selectedTurns ?? TOKEN_HUD_TURN_MIN);

  const selectedStatus = tokenKey ? TOKEN_HUD_LAST_STATUS_BY_TOKEN.get(tokenKey) : "";
  if (selectedStatus) turnField.dataset.statusId = selectedStatus;

  return turnField;
}

function syncTokenHudTurnControlUi(root) {
  if (!(root instanceof HTMLElement)) return;
  const wrapper = root.querySelector(".bm-token-hud-turn-control");
  if (!(wrapper instanceof HTMLElement)) return;
  wrapper.classList.add("is-visible");
  wrapper.style.top = "";

  const effectsPalette = resolveTokenHudEffectsPalette(root);
  if (effectsPalette instanceof HTMLElement) {
    effectsPalette.style.top = "";
    effectsPalette.style.bottom = "";
    effectsPalette.style.left = "";
    effectsPalette.style.right = "";
  }
}

function bindTokenHudTurnControlEvents(root, hud, turnField) {
  if (!(root instanceof HTMLElement) || !(turnField instanceof HTMLElement)) return;

  if (turnField.dataset.bmTokenHudTurnsBound !== "true") {
    const applyTurnValue = () => {
      const turns = getTokenHudTurnFieldValue(turnField);
      setTokenHudTurnFieldValue(turnField, turns);
      const tokenKey = getTokenHudStorageKey(hud?.document || hud?.object?.document || null);
      if (tokenKey) TOKEN_HUD_TURN_SELECTION_BY_TOKEN.set(tokenKey, turns);

      const statusId = String(turnField.dataset.statusId || "").trim();
      if (!statusId) return;
      const actor = hud?.actor || hud?.document?.actor || null;
      if (!actor || !actorHasStatusInFamily(actor, [statusId])) return;

      void applyTokenHudStatusTurnSelection(hud, statusId, { active: true, turns, overlay: false });
    };

    const toggle = turnField.querySelector(".bm-token-hud-turn-toggle");
    const menu = turnField.querySelector(".bm-token-hud-turn-menu");
    const closeMenu = () => menu?.classList.remove("is-open");

    if (toggle instanceof HTMLButtonElement && menu instanceof HTMLElement) {
      toggle.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        menu.classList.toggle("is-open");
      });

      menu.addEventListener("click", event => {
        const option = event.target instanceof HTMLElement
          ? event.target.closest(".bm-token-hud-turn-option[data-turns]")
          : null;
        if (!(option instanceof HTMLElement)) return;
        event.preventDefault();
        event.stopPropagation();
        setTokenHudTurnFieldValue(turnField, option.dataset.turns || TOKEN_HUD_TURN_MIN);
        applyTurnValue();
        closeMenu();
      });

      root.addEventListener("click", event => {
        const target = event.target;
        if (target instanceof Node && turnField.contains(target)) return;
        closeMenu();
      });
      root.addEventListener("contextmenu", () => closeMenu());
    }

    turnField.dataset.bmTokenHudTurnsBound = "true";
  }

  const effectsPalette = resolveTokenHudEffectsPalette(root);
  if (effectsPalette && effectsPalette.dataset.bmTokenHudPaletteBound !== "true") {
    const handleEffectSelection = event => {
      const target = event.target instanceof HTMLElement
        ? event.target.closest(".effect-control[data-status-id]")
        : null;
      if (!(target instanceof HTMLElement) || !effectsPalette.contains(target)) return;
      const statusId = String(target.dataset.statusId || "").trim();
      if (!statusId) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const turns = getTokenHudTurnFieldValue(turnField);
      setTokenHudTurnFieldValue(turnField, turns);
      turnField.dataset.statusId = statusId;
      const tokenKey = getTokenHudStorageKey(hud?.document || hud?.object?.document || null);
      if (tokenKey) {
        TOKEN_HUD_TURN_SELECTION_BY_TOKEN.set(tokenKey, turns);
        TOKEN_HUD_LAST_STATUS_BY_TOKEN.set(tokenKey, statusId);
      }

      const nextActive = !target.classList.contains("active");
      const overlay = event.type === "contextmenu";
      void applyTokenHudStatusTurnSelection(hud, statusId, { active: nextActive, turns, overlay });
    };

    effectsPalette.addEventListener("click", handleEffectSelection, true);
    effectsPalette.addEventListener("contextmenu", handleEffectSelection, true);
    effectsPalette.dataset.bmTokenHudPaletteBound = "true";
  }

  if (root.dataset.bmTokenHudSyncBound !== "true") {
    const scheduleSync = () => {
      requestAnimationFrame(() => syncTokenHudTurnControlUi(root));
    };
    root.addEventListener("click", scheduleSync);
    root.addEventListener("contextmenu", scheduleSync);
    root.dataset.bmTokenHudSyncBound = "true";
  }
}

function configureTokenHudEnhancements(hud, htmlLike) {
  const root = getTokenHudRootElement(htmlLike, hud?.element);
  if (!root) return;

  void ensureTokenHudLocalSvgIcons({ copyMissing: false });
  refreshTokenHudStatusEffectIconPaths({ bumpCache: true });

  root.classList.add("bm-token-hud");
  root.dataset.bmTokenHudEnhanced = "true";
  arrangeTokenHudControlLayout(root);

  const turnField = ensureTokenHudTurnControl(root, hud);
  if (!(turnField instanceof HTMLElement)) return;

  bindTokenHudTurnControlEvents(root, hud, turnField);
  syncTokenHudTurnControlUi(root);

  const actor = hud?.actor || hud?.document?.actor || null;
  if (actor) void cleanupTokenHudOrphanCounterEffects(actor);
}

function installTokenHudRenderPatch() {
  const hudClass = CONFIG?.Token?.hudClass;
  if (!hudClass?.prototype) return false;
  const proto = hudClass.prototype;
  if (proto[TOKEN_HUD_RENDER_PATCH_FLAG] === true) return true;

  const originalOnRender = proto._onRender;
  if (typeof originalOnRender !== "function") return false;

  proto._onRender = async function (...args) {
    const response = await originalOnRender.apply(this, args);
    try {
      configureTokenHudEnhancements(this, this.element);
    } catch (error) {
      bmLog.warn("[bloodman] token HUD enhancement (patched render) skipped", error);
    }
    return response;
  };

  Object.defineProperty(proto, TOKEN_HUD_RENDER_PATCH_FLAG, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  return true;
}

function scheduleTokenHudDomEnhancement(attempt = 0) {
  if (TOKEN_HUD_DOM_SYNC_FRAME !== null) return;
  TOKEN_HUD_DOM_SYNC_FRAME = requestAnimationFrame(() => {
    TOKEN_HUD_DOM_SYNC_FRAME = null;
    const root = document.getElementById("token-hud");
    if (!(root instanceof HTMLElement)) {
      if (attempt < 8) setTimeout(() => scheduleTokenHudDomEnhancement(attempt + 1), 40);
      return;
    }
    const hud = canvas?.hud?.token || null;
    try {
      configureTokenHudEnhancements(hud, root);
    } catch (error) {
      bmLog.warn("[bloodman] token HUD enhancement (dom observer) skipped", error);
    }
    const hasTurnControl = Boolean(root.querySelector(".bm-token-hud-turn-control"));
    if (!hasTurnControl && attempt < 8) setTimeout(() => scheduleTokenHudDomEnhancement(attempt + 1), 40);
  });
}

function installTokenHudDomObserver() {
  if (TOKEN_HUD_DOM_OBSERVER) return true;
  if (typeof MutationObserver !== "function") return false;
  const hudContainer = document.getElementById("hud");
  if (!(hudContainer instanceof HTMLElement)) return false;

  TOKEN_HUD_DOM_OBSERVER = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") continue;
      const added = Array.from(mutation.addedNodes || []).some(node => {
        return node instanceof HTMLElement && (node.id === "token-hud" || Boolean(node.querySelector?.("#token-hud")));
      });
      if (added) {
        scheduleTokenHudDomEnhancement();
        return;
      }
      const removedTokenHud = Array.from(mutation.removedNodes || []).some(node => node instanceof HTMLElement && node.id === "token-hud");
      if (removedTokenHud) {
        TOKEN_HUD_DOM_SYNC_FRAME = null;
      }
    }
  });

  TOKEN_HUD_DOM_OBSERVER.observe(hudContainer, { childList: true });
  scheduleTokenHudDomEnhancement();
  return true;
}

function setTokenEffectBackgroundTransparent(target) {
  if (!target || target.destroyed) return false;
  let changed = false;
  if (typeof target.clear === "function") {
    try {
      target.clear();
      changed = true;
    } catch (_error) {
      // no-op
    }
  }
  if ("alpha" in target && target.alpha !== 0) {
    target.alpha = 0;
    changed = true;
  }
  if ("visible" in target && target.visible !== false) {
    target.visible = false;
    changed = true;
  }
  if ("renderable" in target && target.renderable !== false) {
    target.renderable = false;
    changed = true;
  }
  return changed;
}

function applyTransparentTokenEffectBackground(tokenLike) {
  const tokenObject = tokenLike?.object || tokenLike || null;
  if (!tokenObject) return false;

  const roots = [
    tokenObject.effects,
    tokenObject.effectContainer,
    tokenObject.effectsContainer,
    tokenObject._effects
  ].filter(root => root && typeof root === "object");
  if (!roots.length) return false;

  let changed = false;
  for (const root of roots) {
    changed = setTokenEffectBackgroundTransparent(root?.bg) || changed;
    changed = setTokenEffectBackgroundTransparent(root?.background) || changed;
    changed = setTokenEffectBackgroundTransparent(root?.backdrop) || changed;

    const children = Array.isArray(root?.children) ? root.children : [];
    for (const child of children) {
      const name = String(child?.name || "").trim().toLowerCase();
      const isBackgroundLike = name === "bg" || name.includes("background") || name.includes("backdrop");
      if (isBackgroundLike) changed = setTokenEffectBackgroundTransparent(child) || changed;
      changed = setTokenEffectBackgroundTransparent(child?.bg) || changed;
      changed = setTokenEffectBackgroundTransparent(child?.background) || changed;
      changed = setTokenEffectBackgroundTransparent(child?.backdrop) || changed;
    }
  }

  return changed;
}

function installTokenEffectBackgroundPatch() {
  const tokenClass = CONFIG?.Token?.objectClass || globalThis.Token;
  if (!tokenClass?.prototype) return false;
  const proto = tokenClass.prototype;
  if (proto[TOKEN_EFFECT_BG_PATCH_FLAG] === true) return true;

  const originalDrawEffects = proto.drawEffects;
  if (typeof originalDrawEffects !== "function") return false;

  proto.drawEffects = function (...args) {
    const finalize = () => {
      try {
        applyTransparentTokenEffectBackground(this);
      } catch (error) {
        bmLog.warn("[bloodman] token effect background transparency patch skipped", error);
      }
    };

    const result = originalDrawEffects.apply(this, args);
    if (result && typeof result.then === "function") {
      return result.then(value => {
        finalize();
        return value;
      }).catch(error => {
        finalize();
        throw error;
      });
    }
    finalize();
    return result;
  };

  Object.defineProperty(proto, TOKEN_EFFECT_BG_PATCH_FLAG, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  return true;
}

function getTokenActorType(tokenDoc) {
  const actorType = tokenDoc?.actor?.type;
  if (actorType) return actorType;
  const worldActorType = tokenDoc?.actorId ? game.actors?.get(tokenDoc.actorId)?.type : "";
  return worldActorType || "";
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
  return String(fitValue || "").trim().toLowerCase() !== "fill";
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
  await syncZeroPvBodyStateForToken(tokenDoc, actorType, isZeroOrLess);
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
      if (!okBleed) bmLog.warn("[bloodman] status:bleeding sync failed", { tokenId: tokenDoc.id, pvCurrent, actorType });
    }
    if (dead) {
      const okDeadClear = await setTokenStatusEffect(tokenDoc, dead, false, deadFamily);
      if (!okDeadClear) bmLog.warn("[bloodman] status:dead clear failed", { tokenId: tokenDoc.id, pvCurrent, actorType });
    }
  } else {
    if (dead) {
      const okDead = await setTokenStatusEffect(tokenDoc, dead, isZeroOrLess, deadFamily);
      if (!okDead) bmLog.warn("[bloodman] status:dead sync failed", { tokenId: tokenDoc.id, pvCurrent, actorType });
    }
    if (bleeding) {
      const okBleedClear = await setTokenStatusEffect(tokenDoc, bleeding, false, bleedingFamily);
      if (!okBleedClear) bmLog.warn("[bloodman] status:bleeding clear failed", { tokenId: tokenDoc.id, pvCurrent, actorType });
    }
  }

  if (typeof tokenDoc?.object?.drawEffects === "function") {
    tokenDoc.object.drawEffects();
    applyTransparentTokenEffectBackground(tokenDoc.object);
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

async function setActorStatePresetActive(actor, stateId, active) {
  if (!actor) return false;
  const presetId = String(stateId || "").trim();
  if (!presetId || !STATE_PRESET_BY_ID.has(presetId)) return false;

  const currentLabel = String(actor.system?.modifiers?.label || "");
  const currentSelection = resolveStatePresetSelection(currentLabel);
  if (currentSelection.invalidTokens.length) {
    bmLog.warn("[bloodman] state:preset sync skipped (invalid label)", {
      actorId: actor.id,
      actorName: actor.name,
      invalidTokens: currentSelection.invalidTokens
    });
    return false;
  }

  const selected = new Set(currentSelection.ids);
  const shouldBeActive = Boolean(active);
  const isActive = selected.has(presetId);
  if (isActive === shouldBeActive) return true;

  if (shouldBeActive) selected.add(presetId);
  else selected.delete(presetId);

  const nextIds = STATE_PRESET_ORDER.filter(id => selected.has(id));
  const nextLabel = buildStatePresetLabelFromIds(nextIds);
  try {
    await actor.update({ "system.modifiers.label": nextLabel });
    return true;
  } catch (error) {
    bmLog.warn("[bloodman] state:preset sync failed", {
      actorId: actor.id,
      actorName: actor.name,
      stateId: presetId,
      active: shouldBeActive,
      error
    });
    return false;
  }
}

async function syncZeroPvBodyStateForToken(tokenDoc, actorType, isZeroOrLess) {
  if (!tokenDoc) return;

  const actor = tokenDoc.actorLink === true
    ? (tokenDoc.actor || (tokenDoc.actorId ? game.actors?.get(tokenDoc.actorId) : null))
    : (tokenDoc.actor || null);
  if (!actor) return;

  await syncZeroPvBodyStateForActor(actor, actorType, isZeroOrLess);
}

async function syncZeroPvBodyStateForActor(actor, actorType, isZeroOrLess) {
  if (!actor) return;
  const resolvedActorType = String(actorType || actor.type || "").trim();
  if (resolvedActorType !== "personnage") return;
  await setActorStatePresetActive(actor, PLAYER_ZERO_PV_STATE_PRESET_ID, isZeroOrLess);
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

const SYSTEM_ID = "bloodman";
const SYSTEM_ROOT_PATH = `systems/${SYSTEM_ID}`;
const SYSTEM_SOCKET = `system.${SYSTEM_ID}`;
const CHAOS_DICE_ICON_SRC = `${SYSTEM_ROOT_PATH}/images/d20_destin.svg`;
const CHAOS_DICE_ICON_FALLBACK_SRC = "icons/svg/d20.svg";
const CARRIED_ITEM_LIMIT_BASE = 10;
const CARRIED_ITEM_LIMIT_WITH_BAG = 15;
const CARRIED_ITEM_LIMIT_ACTOR_TYPES = new Set(["personnage", "personnage-non-joueur"]);
const CARRIED_ITEM_TYPES = new Set(["arme", "objet", "ration", "soin"]);
const CHARACTERISTIC_BONUS_ITEM_TYPES = new Set(["objet", "protection", "aptitude", "pouvoir"]);
const PA_BONUS_ITEM_TYPES = new Set(["protection", "aptitude", "pouvoir"]);
const VOYAGE_XP_COST_ITEM_TYPES = new Set(["aptitude", "pouvoir"]);
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

function isVoyageXPCostItemType(itemType) {
  const type = String(itemType || "").trim().toLowerCase();
  return VOYAGE_XP_COST_ITEM_TYPES.has(type);
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
    bmLog.debug("reroll:validate", payload);
  } else {
    bmLog.warn("reroll:validate", payload);
  }
}
const DAMAGE_REQUEST_RETENTION_MS = 2 * 60 * 1000;
const ENABLE_CHAT_TRANSPORT_FALLBACK = false;
const CHAOS_REQUEST_CHAT_MARKUP = "<span style='display:none'>bloodman-chaos-request</span>";
const REROLL_REQUEST_CHAT_MARKUP = "<span style='display:none'>bloodman-reroll-request</span>";
const INITIATIVE_GROUP_BUFFER_MS = 180;
const TOKEN_MOVE_LIMIT_EPSILON = 0.0001;
let LAST_COMBAT_MOVE_RESET_KEY = "";
let LAST_COMBAT_MOVE_HISTORY_RESET_KEY = "";
let LAST_TOKEN_HUD_COUNTER_TICK_KEY = "";
const PLAYER_ZERO_PV_STATE_PRESET_ID = "body-injured";
const PLAYER_ZERO_PV_STATUS_CANDIDATES = ["bleeding", "bleed", "bloodied"];
const NPC_ZERO_PV_STATUS_CANDIDATES = ["dead", "defeated", "death", "mort"];
const TOKEN_HUD_TURN_MIN = 1;
const TOKEN_HUD_TURN_MAX = 12;
const TOKEN_HUD_COUNTER_FLAG_KEY = "tokenHudTurnCounter";
const TOKEN_HUD_RENDER_PATCH_FLAG = "__bmTokenHudRenderPatched";
const TOKEN_EFFECT_BG_PATCH_FLAG = "__bmTokenEffectBackgroundPatched";
const TOKEN_HUD_TURN_SELECTION_BY_TOKEN = new Map();
const TOKEN_HUD_LAST_STATUS_BY_TOKEN = new Map();
const TOKEN_HUD_ICON_SYNC_INTERVAL_MS = 2_000;
let TOKEN_HUD_LOCAL_SVG_ICON_NAMES = new Set();
let TOKEN_HUD_ICON_SYNC_PROMISE = null;
let TOKEN_HUD_LAST_ICON_SYNC_AT = 0;
let TOKEN_HUD_ICON_CACHE_BUSTER = Date.now();
let TOKEN_HUD_DOM_OBSERVER = null;
let TOKEN_HUD_DOM_SYNC_FRAME = null;

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

function parseSimpleArithmeticInput(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: true, empty: true, value: 0 };
  const source = raw.replace(/\s+/g, "").replace(/,/g, ".");
  if (!/^[\d+\-*/().]+$/.test(source)) return { ok: false, empty: false, value: 0 };

  let index = 0;
  const peek = () => source[index] || "";
  const read = () => source[index++] || "";

  const parseNumber = () => {
    let token = "";
    let dotCount = 0;
    while (index < source.length) {
      const char = peek();
      if (char >= "0" && char <= "9") {
        token += read();
        continue;
      }
      if (char === ".") {
        dotCount += 1;
        if (dotCount > 1) break;
        token += read();
        continue;
      }
      break;
    }
    if (!token || token === ".") return Number.NaN;
    const numeric = Number(token);
    return Number.isFinite(numeric) ? numeric : Number.NaN;
  };

  const parseFactor = () => {
    const char = peek();
    if (char === "+") {
      read();
      return parseFactor();
    }
    if (char === "-") {
      read();
      const value = parseFactor();
      return Number.isFinite(value) ? -value : Number.NaN;
    }
    if (char === "(") {
      read();
      const value = parseExpression();
      if (peek() !== ")") return Number.NaN;
      read();
      return value;
    }
    return parseNumber();
  };

  const parseTerm = () => {
    let value = parseFactor();
    while (Number.isFinite(value)) {
      const operator = peek();
      if (operator !== "*" && operator !== "/") break;
      read();
      const rhs = parseFactor();
      if (!Number.isFinite(rhs)) return Number.NaN;
      if (operator === "*") value *= rhs;
      else {
        if (Math.abs(rhs) <= 1e-12) return Number.NaN;
        value /= rhs;
      }
    }
    return value;
  };

  const parseExpression = () => {
    let value = parseTerm();
    while (Number.isFinite(value)) {
      const operator = peek();
      if (operator !== "+" && operator !== "-") break;
      read();
      const rhs = parseTerm();
      if (!Number.isFinite(rhs)) return Number.NaN;
      if (operator === "+") value += rhs;
      else value -= rhs;
    }
    return value;
  };

  const numericValue = parseExpression();
  if (!Number.isFinite(numericValue) || index !== source.length) {
    return { ok: false, empty: false, value: 0 };
  }
  return { ok: true, empty: false, value: numericValue };
}

function normalizeSignedModifierInput(rawValue, fallback = 0) {
  if (rawValue == null || rawValue === "") return { value: 0, invalid: false };
  if (typeof rawValue === "number") {
    if (Number.isFinite(rawValue)) return { value: rawValue, invalid: false };
    return { value: toFiniteNumber(fallback, 0), invalid: true };
  }
  if (typeof rawValue === "string") {
    const parsed = parseLooseNumericInput(rawValue);
    if (!parsed.ok) return { value: toFiniteNumber(fallback, 0), invalid: true };
    return { value: parsed.empty ? 0 : parsed.value, invalid: false };
  }
  const numeric = Number(rawValue);
  if (Number.isFinite(numeric)) return { value: numeric, invalid: false };
  return { value: toFiniteNumber(fallback, 0), invalid: true };
}

function buildItemModifierErrorMessage(invalidFields = []) {
  const uniqueFields = Array.from(new Set((invalidFields || []).filter(Boolean)));
  if (!uniqueFields.length) return null;
  return `Valeur non numerique: ${uniqueFields.join(", ")}`;
}

function roundCurrencyValue(value) {
  const rounded = Math.round((Number(value) || 0) * 100) / 100;
  const whole = Math.round(rounded);
  if (Math.abs(rounded - whole) <= 0.000001) return whole;
  return rounded;
}

function normalizeCurrencyCurrentValue(value, fallback = 0) {
  const parsed = parseSimpleArithmeticInput(value);
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
  const capacityPath = "system.magazineCapacity";
  const loadedAmmoPath = "system.loadedAmmo";
  const weaponTypePath = "system.weaponType";
  const infiniteAmmoPath = "system.infiniteAmmo";
  const actorAmmoMagazineFallback = normalizeNonNegativeInteger(item?.actor?.system?.ammo?.magazine, 0);
  if (updateData) {
    const hasRelevantUpdate = [
      capacityPath,
      loadedAmmoPath,
      weaponTypePath,
      infiniteAmmoPath
    ].some(path => (
      Object.prototype.hasOwnProperty.call(updateData, path)
      || foundry.utils.getProperty(updateData, path) !== undefined
    ));
    if (!hasRelevantUpdate) return false;

    const nextCapacity = normalizeNonNegativeInteger(
      getUpdatedPathValue(updateData, capacityPath, item?.system?.magazineCapacity ?? 0),
      item?.system?.magazineCapacity ?? 0
    );
    const nextWeaponType = normalizeWeaponType(
      getUpdatedPathValue(updateData, weaponTypePath, item?.system?.weaponType || "distance")
    );
    const weaponType = nextWeaponType || "distance";
    const infiniteAmmo = toCheckboxBoolean(
      getUpdatedPathValue(updateData, infiniteAmmoPath, item?.system?.infiniteAmmo),
      false
    );
    const consumesAmmo = getWeaponCategory(weaponType) === "distance" && !infiniteAmmo;
    const usesMagazine = consumesAmmo && nextCapacity > 0;

    const fallbackLoadedAmmo = normalizeWeaponLoadedAmmoValue(
      item?.system?.loadedAmmo,
      actorAmmoMagazineFallback,
      usesMagazine ? nextCapacity : 0
    );
    const nextLoadedAmmo = normalizeWeaponLoadedAmmoValue(
      getUpdatedPathValue(updateData, loadedAmmoPath, fallbackLoadedAmmo),
      fallbackLoadedAmmo,
      usesMagazine ? nextCapacity : 0
    );

    foundry.utils.setProperty(updateData, weaponTypePath, weaponType);
    foundry.utils.setProperty(updateData, capacityPath, nextCapacity);
    foundry.utils.setProperty(updateData, loadedAmmoPath, nextLoadedAmmo);
    return true;
  }

  const sourceCapacity = normalizeNonNegativeInteger(item?.system?.magazineCapacity, 0);
  const sourceWeaponType = normalizeWeaponType(item?.system?.weaponType || "distance") || "distance";
  const sourceInfiniteAmmo = toCheckboxBoolean(item?.system?.infiniteAmmo, false);
  const sourceConsumesAmmo = getWeaponCategory(sourceWeaponType) === "distance" && !sourceInfiniteAmmo;
  const sourceUsesMagazine = sourceConsumesAmmo && sourceCapacity > 0;
  const sourceLoadedAmmo = normalizeWeaponLoadedAmmoValue(
    item?.system?.loadedAmmo,
    actorAmmoMagazineFallback,
    sourceUsesMagazine ? sourceCapacity : 0
  );
  item.updateSource({
    [weaponTypePath]: sourceWeaponType,
    [capacityPath]: sourceCapacity,
    [loadedAmmoPath]: sourceLoadedAmmo
  });
  return true;
}

function normalizeCharacteristicBonusItemUpdate(item, updateData = null) {
  const type = String(item?.type || "").trim().toLowerCase();
  const supportsCharacteristicBonuses = CHARACTERISTIC_BONUS_ITEM_TYPES.has(type);
  const supportsPaBonus = PA_BONUS_ITEM_TYPES.has(type);
  if (!supportsCharacteristicBonuses && !supportsPaBonus) return false;
  const supportsUseEnabled = type === "objet" || type === "protection";
  const defaultUseEnabled = type === "protection";
  const updateSystemData = updateData
    ? (foundry.utils.getProperty(
      foundry.utils.expandObject(foundry.utils.deepClone(updateData || {})),
      "system"
    ) || {})
    : {};
  const sourceSystem = updateData
    ? foundry.utils.mergeObject(
      foundry.utils.deepClone(item?.system || {}),
      updateSystemData,
      { inplace: false }
    )
    : (item?.system || {});

  const invalidFields = [];
  const useEnabled = supportsUseEnabled
    ? toCheckboxBoolean(sourceSystem?.useEnabled, defaultUseEnabled)
    : false;
  const characteristicBonusEnabled = supportsCharacteristicBonuses
    ? toCheckboxBoolean(sourceSystem?.characteristicBonusEnabled, false)
    : false;
  const characteristicBonuses = {};
  if (supportsCharacteristicBonuses) {
    for (const characteristic of CHARACTERISTICS) {
      const key = characteristic.key;
      const normalizedValue = normalizeSignedModifierInput(
        sourceSystem?.characteristicBonuses?.[key],
        item?.system?.characteristicBonuses?.[key] ?? 0
      );
      characteristicBonuses[key] = normalizedValue.value;
      if (normalizedValue.invalid) invalidFields.push(key);
    }
  }
  const paNormalized = supportsPaBonus
    ? normalizeSignedModifierInput(sourceSystem?.pa, item?.system?.pa ?? 0)
    : { value: 0, invalid: false };
  if (supportsPaBonus && paNormalized.invalid) invalidFields.push("PA");
  const modifierError = buildItemModifierErrorMessage(invalidFields);

  if (updateData) {
    if (supportsUseEnabled) {
      foundry.utils.setProperty(updateData, "system.useEnabled", useEnabled);
    }
    if (supportsCharacteristicBonuses) {
      foundry.utils.setProperty(updateData, "system.characteristicBonusEnabled", characteristicBonusEnabled);
      for (const characteristic of CHARACTERISTICS) {
        const key = characteristic.key;
        foundry.utils.setProperty(updateData, `system.characteristicBonuses.${key}`, characteristicBonuses[key]);
      }
    }
    if (supportsPaBonus) {
      foundry.utils.setProperty(updateData, "system.pa", paNormalized.value);
    }
    foundry.utils.setProperty(updateData, "system.erreur", modifierError);
    return true;
  }

  const sourceUpdate = {};
  if (supportsUseEnabled) {
    sourceUpdate["system.useEnabled"] = useEnabled;
  }
  if (supportsCharacteristicBonuses) {
    sourceUpdate["system.characteristicBonusEnabled"] = characteristicBonusEnabled;
    for (const characteristic of CHARACTERISTICS) {
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

async function playItemAudio(item, options = {}) {
  if (!item || !isAudioEnabledItemType(item.type)) return false;
  const requestedDelay = Number(options?.delayMs);
  const delayMs = Number.isFinite(requestedDelay)
    ? Math.max(0, Math.floor(requestedDelay))
    : ITEM_AUDIO_POST_ROLL_DELAY_MS;
  const broadcast = options?.broadcast !== false;
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
    await AudioHelper.play({ src: audioFile, volume: 0.9, autoplay: true, loop: false }, broadcast);
    return true;
  } catch (error) {
    bmLog.error("[bloodman] audio:play failed", { itemType: item.type, itemId: item.id, audioFile, error });
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

function normalizeWeaponLoadedAmmoValue(value, fallback = 0, capacity = 0) {
  const normalizedCapacity = normalizeNonNegativeInteger(capacity, 0);
  const numeric = normalizeNonNegativeInteger(value, fallback);
  if (normalizedCapacity <= 0) return 0;
  return Math.min(numeric, normalizedCapacity);
}

function getWeaponLoadedAmmo(item, options = {}) {
  const capacity = normalizeNonNegativeInteger(item?.system?.magazineCapacity, 0);
  const fallback = normalizeNonNegativeInteger(options.fallback, 0);
  return normalizeWeaponLoadedAmmoValue(item?.system?.loadedAmmo, fallback, capacity);
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

function getTokenTexturePresentationUpdates(tokenDoc) {
  if (!tokenDoc) return {};
  const actorType = getTokenActorType(tokenDoc);
  if (actorType !== "personnage" && actorType !== "personnage-non-joueur") return {};
  const updates = {};
  const scaleX = foundry.utils.getProperty(tokenDoc, "texture.scaleX");
  const scaleY = foundry.utils.getProperty(tokenDoc, "texture.scaleY");
  const offsetX = foundry.utils.getProperty(tokenDoc, "texture.offsetX");
  const offsetY = foundry.utils.getProperty(tokenDoc, "texture.offsetY");
  const fit = foundry.utils.getProperty(tokenDoc, "texture.fit");
  if (shouldResetTokenScale(scaleX)) updates["texture.scaleX"] = 1;
  if (shouldResetTokenScale(scaleY)) updates["texture.scaleY"] = 1;
  if (shouldResetTokenOffset(offsetX)) updates["texture.offsetX"] = 0;
  if (shouldResetTokenOffset(offsetY)) updates["texture.offsetY"] = 0;
  if (shouldResetTokenFit(fit)) updates["texture.fit"] = "fill";
  return updates;
}

function resolveTokenPlaceable(tokenLike) {
  if (!tokenLike) return null;
  if (tokenLike.mesh) return tokenLike;
  if (tokenLike.object?.mesh) return tokenLike.object;
  const tokenId = String(tokenLike.id || tokenLike._id || tokenLike.document?.id || "").trim();
  if (!tokenId || !canvas?.tokens?.get) return null;
  const placeable = canvas.tokens.get(tokenId);
  return placeable?.mesh ? placeable : null;
}

async function repairTokenTextureSource(tokenLike) {
  const tokenDoc = tokenLike?.document || tokenLike;
  if (!tokenDoc) return false;
  const tokenObject = resolveTokenPlaceable(tokenLike);
  const canPersistUpdate = Boolean(game.user?.isGM && tokenDoc?.update);
  const canLocalUpdate = Boolean(tokenDoc?.updateSource);
  if (!canPersistUpdate && !canLocalUpdate) return false;
  const updates = getTokenTexturePresentationUpdates(tokenDoc);
  const currentSrc = String(foundry.utils.getProperty(tokenDoc, "texture.src") || "");
  const shouldRepairSource = canPersistUpdate ? await needsTokenImageRepair(currentSrc) : false;
  if (!shouldRepairSource && !Object.keys(updates).length) return false;

  if (shouldRepairSource) {
    const actorSrc = getTokenActorImage(tokenDoc);
    const fallbackSrc = "icons/svg/mystery-man.svg";
    const actorSrcValid = actorSrc ? await canLoadTextureSource(actorSrc) : false;
    const nextSrc = actorSrcValid ? actorSrc : fallbackSrc;
    if (nextSrc && nextSrc !== currentSrc) updates["texture.src"] = nextSrc;
  }
  if (!Object.keys(updates).length) return false;
  try {
    if (canPersistUpdate) {
      await tokenDoc.update(updates);
    } else {
      tokenDoc.updateSource(foundry.utils.expandObject(updates));
      tokenObject?.renderFlags?.set?.({ refreshMesh: true });
      tokenObject?.refresh?.();
    }
    return true;
  } catch (_error) {
    return false;
  }
}

async function syncPrototypeTokenImageFromActorImage(actor) {
  if (!game.user?.isGM) return false;
  if (!actor || (actor.type !== "personnage" && actor.type !== "personnage-non-joueur")) return false;
  if (actor.isToken) return false;

  const actorImg = String(actor.img || "").trim();
  const currentPrototypeSrc = String(foundry.utils.getProperty(actor, "prototypeToken.texture.src") || "").trim();
  const nextPrototypeSrc = actorImg || "icons/svg/mystery-man.svg";

  if (!nextPrototypeSrc || nextPrototypeSrc === currentPrototypeSrc) return false;
  try {
    await actor.update(
      {
        "prototypeToken.texture.src": nextPrototypeSrc,
        "prototypeToken.img": nextPrototypeSrc,
        "token.img": nextPrototypeSrc
      },
      { bloodmanSkipPrototypeImageSync: true }
    );
    return true;
  } catch (_error) {
    return false;
  }
}

async function syncSceneTokenImagesFromActorImage(actor, options = {}) {
  if (!game.user?.isGM) return 0;
  if (!actor || (actor.type !== "personnage" && actor.type !== "personnage-non-joueur")) return 0;
  if (actor.isToken) return 0;

  const previousActorImage = String(options.previousActorImage || "").trim();
  const previousPrototypeImage = String(options.previousPrototypeImage || "").trim();
  const previousSources = new Set([previousActorImage, previousPrototypeImage].filter(Boolean));

  const actorImg = String(actor.img || "").trim();
  const nextTokenSrc = actorImg || "icons/svg/mystery-man.svg";
  if (!nextTokenSrc) return 0;

  let updatedCount = 0;
  for (const tokenDoc of getTokenDocumentsForActor(actor)) {
    if (!tokenDoc?.update) continue;
    const currentTokenSrc = String(
      foundry.utils.getProperty(tokenDoc, "texture.src")
      || foundry.utils.getProperty(tokenDoc, "img")
      || ""
    ).trim();
    const isMissing = isMissingTokenImage(currentTokenSrc);
    const isLinkedToken = tokenDoc.actorLink === true;
    const matchesPrevious = previousSources.has(currentTokenSrc);
    if (!isLinkedToken && !isMissing && !matchesPrevious) continue;
    if (currentTokenSrc === nextTokenSrc) continue;
    try {
      await tokenDoc.update(
        { "texture.src": nextTokenSrc, "img": nextTokenSrc },
        { bloodmanSkipActorImageSync: true }
      );
      updatedCount += 1;
    } catch (_error) {
      // non-fatal: keep syncing other token instances
    }
  }
  return updatedCount;
}

function resolveWorldActorFromTokenDocument(tokenDoc) {
  if (!tokenDoc) return null;
  const actorId = String(tokenDoc.actorId || "").trim();
  if (actorId) return game.actors?.get(actorId) || null;
  const actor = tokenDoc.actor || null;
  if (!actor || actor.isToken) return null;
  return actor;
}

async function syncActorAndPrototypeImageFromTokenImage(tokenDoc) {
  if (!game.user?.isGM) return false;
  const actor = resolveWorldActorFromTokenDocument(tokenDoc);
  if (!actor) return false;
  if (actor.type !== "personnage" && actor.type !== "personnage-non-joueur") return false;

  const tokenSrc = String(
    foundry.utils.getProperty(tokenDoc, "texture.src")
    || foundry.utils.getProperty(tokenDoc, "img")
    || ""
  ).trim();
  if (!tokenSrc) return false;

  const actorImg = String(actor.img || "").trim();
  const protoSrc = String(foundry.utils.getProperty(actor, "prototypeToken.texture.src") || "").trim();
  const legacyProtoImg = String(foundry.utils.getProperty(actor, "prototypeToken.img") || "").trim();
  const legacyTokenImg = String(foundry.utils.getProperty(actor, "token.img") || "").trim();
  const needsUpdate = actorImg !== tokenSrc || protoSrc !== tokenSrc || legacyProtoImg !== tokenSrc || legacyTokenImg !== tokenSrc;
  if (!needsUpdate) return false;

  try {
    await actor.update(
      {
        img: tokenSrc,
        "prototypeToken.texture.src": tokenSrc,
        "prototypeToken.img": tokenSrc,
        "token.img": tokenSrc
      },
      { bloodmanSkipPrototypeImageSync: true, bloodmanSkipSceneTokenImageSync: true }
    );
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

function getSelectedVoyageXpRecipientActors(controlledTokens = null) {
  const tokens = Array.isArray(controlledTokens)
    ? controlledTokens
    : (globalThis.canvas?.tokens?.controlled || []);
  const recipients = [];
  const seen = new Set();
  for (const token of tokens) {
    const tokenDoc = token?.document || token || null;
    const tokenActor = token?.actor || tokenDoc?.actor || null;
    const worldActor = tokenDoc?.actorId ? game.actors?.get(tokenDoc.actorId) || null : null;
    const actor = tokenActor || worldActor;
    if (!actor) continue;
    const type = String(actor.type || tokenActor?.type || "").trim().toLowerCase();
    if (type !== "personnage") continue;
    const key = String(actor.uuid || actor.id || tokenDoc?.uuid || tokenDoc?.id || tokenDoc?.actorId || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    recipients.push(actor);
  }
  return recipients;
}

function formatVoyageXpGrantLine(actorName, amount) {
  const name = String(actorName || tl("TYPES.Actor.personnage", "Joueur")).trim() || "Joueur";
  const fallback = `${name} a recu ${amount} point${amount > 1 ? "s" : ""} d'experience.`;
  return tl("BLOODMAN.Notifications.VoyageXPGrantLine", fallback, { actor: name, amount });
}

async function grantVoyageXpToSelectedPlayers(rawAmount, options = {}) {
  const amount = normalizeNonNegativeInteger(rawAmount, 0);
  const selectedTokens = Array.isArray(options.selectedTokens)
    ? options.selectedTokens
    : (globalThis.canvas?.tokens?.controlled || []);
  if (amount <= 0) {
    return {
      amount,
      selectedTokens,
      grants: [],
      failures: [],
      reason: "no-points"
    };
  }

  if (!selectedTokens.length) {
    return {
      amount,
      selectedTokens,
      grants: [],
      failures: [],
      reason: "no-selection"
    };
  }

  const recipients = getSelectedVoyageXpRecipientActors(selectedTokens);
  if (!recipients.length) {
    return {
      amount,
      selectedTokens,
      grants: [],
      failures: [],
      reason: "no-recipients"
    };
  }

  const grants = [];
  const failures = [];
  for (const actor of recipients) {
    const actorName = String(actor?.name || tl("TYPES.Actor.personnage", "Joueur")).trim() || "Joueur";
    if (!actor?.update) {
      failures.push({ actorName });
      continue;
    }
    const voyageTotal = normalizeNonNegativeInteger(
      actor.system?.resources?.voyage?.total ?? actor.system?.resources?.voyage?.max,
      0
    );
    const voyageCurrent = Math.min(
      normalizeNonNegativeInteger(actor.system?.resources?.voyage?.current, 0),
      voyageTotal
    );
    const nextVoyageTotal = voyageTotal + amount;
    const nextVoyageCurrent = voyageCurrent + amount;

    try {
      await actor.update({
        "system.resources.voyage.total": nextVoyageTotal,
        "system.resources.voyage.current": nextVoyageCurrent,
        "system.resources.voyage.max": nextVoyageTotal
      });
      grants.push({ actorName, amount });
    } catch (error) {
      bmLog.warn("[bloodman] voyage XP grant failed", {
        actorId: actor.id,
        actorName,
        amount,
        error
      });
      failures.push({ actorName });
    }
  }

  return {
    amount,
    selectedTokens,
    grants,
    failures,
    reason: grants.length ? "ok" : "all-failed"
  };
}

async function postVoyageXpGrantSummary(result) {
  if (!result) return false;
  const escapeHtml = value => (foundry.utils?.escapeHTML ? foundry.utils.escapeHTML(String(value || "")) : String(value || ""));
  const titleText = tl("BLOODMAN.Dialogs.VoyageXPGrant.Title", "Attribution XP voyage");
  const lines = [];

  if (result.reason === "no-points") {
    lines.push(tl("BLOODMAN.Notifications.VoyageXPGrantNoPoints", "Aucun point d'XP voyage octroye."));
  } else if (result.reason === "no-selection") {
    lines.push(tl("BLOODMAN.Notifications.VoyageXPGrantNoSelection", "Selectionnez au moins un token joueur pour attribuer de l'XP voyage."));
  } else if (result.reason === "no-recipients") {
    lines.push(tl("BLOODMAN.Notifications.VoyageXPGrantNoRecipients", "Aucun token joueur selectionne pour recevoir de l'XP voyage."));
  } else if (result.reason === "all-failed") {
    lines.push(tl("BLOODMAN.Notifications.VoyageXPGrantAllFailed", "Aucune attribution d'XP voyage n'a pu etre appliquee."));
  } else {
    for (const grant of result.grants || []) {
      lines.push(formatVoyageXpGrantLine(grant.actorName, grant.amount));
    }
    const failureCount = Number(result.failures?.length || 0);
    if (failureCount > 0) {
      lines.push(
        tl(
          "BLOODMAN.Notifications.VoyageXPGrantPartialFailure",
          "{count} attribution(s) d'XP voyage n'ont pas pu etre appliquees.",
          { count: failureCount }
        )
      );
    }
  }

  const contentLines = lines.map(line => `<p>${escapeHtml(line)}</p>`).join("");
  const content = `<div class="bm-voyage-xp-grant-log"><p><strong>${escapeHtml(titleText)}</strong></p>${contentLines}</div>`;
  await ChatMessage.create({ content }).catch(() => null);
  return true;
}

function getProtectionPA(actor) {
  if (!actor?.items) return 0;
  let total = 0;
  for (const item of actor.items) {
    const type = String(item?.type || "").trim().toLowerCase();
    if (!PA_BONUS_ITEM_TYPES.has(type)) continue;
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

function getResourceCharacteristicTotal(actor, key, itemBonuses = null) {
  if (!actor || !key) return 0;
  const bonuses = itemBonuses || getItemBonusTotals(actor);
  return toFiniteNumber(actor.system?.characteristics?.[key]?.base, 0)
    + toFiniteNumber(bonuses?.[key], 0)
    + toFiniteNumber(getActorArchetypeBonus(actor, key), 0);
}

async function refreshBossSoloNpcPvMax() {
  if (!game.user?.isGM) return;
  for (const actor of game.actors || []) {
    if (actor?.type !== "personnage-non-joueur") continue;
    if (String(actor.system?.npcRole || "") !== "boss-seul") continue;

    const itemBonuses = getItemBonusTotals(actor);
    // State modifiers are characteristic-roll penalties and must not alter PV/PP maxima.
    const phyEffective = getResourceCharacteristicTotal(actor, "PHY", itemBonuses);
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
const INITIATIVE_GROUP_BUFFER = new Map();
const ACTIVE_DAMAGE_CONFIG_POPUPS = new Map();
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
  const dialogVariant = String(data?.dialogVariant || config?.dialogVariant || "").trim().toLowerCase();
  const isSimpleAttackVariant = dialogVariant === "simple-attack";
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
    dialogVariant,
    isSimpleAttackVariant,
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
  const formVariantClass = state?.isSimpleAttackVariant ? " bm-damage-config--simple-attack" : "";
  return `<form class="bm-damage-config${formVariantClass}">
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
  root.find("form.bm-damage-config").toggleClass("bm-damage-config--simple-attack", state?.isSimpleAttackVariant === true);
  root.closest(".window-app").toggleClass("bloodman-damage-dialog-simple-attack", state?.isSimpleAttackVariant === true);
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

function resolveChatRollType(message) {
  const flaggedType = normalizeChatRollType(foundry.utils.getProperty(message, "flags.bloodman.chatRollType"));
  if (flaggedType !== CHAT_ROLL_TYPES.GENERIC) return flaggedType;
  if (foundry.utils.getProperty(message, "flags.bloodman.luckRoll")) return CHAT_ROLL_TYPES.LUCK;
  return CHAT_ROLL_TYPES.GENERIC;
}

function resolveChatRollTypeLabel(chatRollType) {
  const type = normalizeChatRollType(chatRollType);
  if (type === CHAT_ROLL_TYPES.CHARACTERISTIC) return tl("BLOODMAN.Chat.RollTypes.Characteristic", "Caracteristique");
  if (type === CHAT_ROLL_TYPES.DAMAGE) return tl("BLOODMAN.Chat.RollTypes.Damage", "Degats");
  if (type === CHAT_ROLL_TYPES.EXPERIENCE) return tl("BLOODMAN.Chat.RollTypes.Experience", "Experience");
  if (type === CHAT_ROLL_TYPES.HEAL) return tl("BLOODMAN.Chat.RollTypes.Heal", "Soin");
  if (type === CHAT_ROLL_TYPES.LUCK) return tl("BLOODMAN.Chat.RollTypes.Luck", "Chance");
  return tl("BLOODMAN.Chat.RollTypes.Generic", "Jet");
}

function toChatRollTypeClassSuffix(chatRollType) {
  const type = normalizeChatRollType(chatRollType);
  return /^[a-z0-9-]+$/.test(type) ? type : CHAT_ROLL_TYPES.GENERIC;
}

function shouldDecorateChatRollMessage(message, actor) {
  if (!message) return false;
  const hasRoll = Array.isArray(message?.rolls) && message.rolls.length > 0;
  const hasLuckFlag = Boolean(foundry.utils.getProperty(message, "flags.bloodman.luckRoll"));
  const hasChatRollTypeFlag = Boolean(String(foundry.utils.getProperty(message, "flags.bloodman.chatRollType") || "").trim());
  if (!hasRoll && !hasLuckFlag && !hasChatRollTypeFlag) return false;
  const actorType = String(actor?.type || "");
  return actorType === "personnage" || actorType === "personnage-non-joueur" || hasLuckFlag || hasChatRollTypeFlag;
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
  const chatRollType = resolveChatRollType(message);
  const chatRollTypeClass = toChatRollTypeClassSuffix(chatRollType);
  const chatRollTypeLabel = resolveChatRollTypeLabel(chatRollType);

  const escapedPseudo = escapeChatMarkup(pseudo);
  const escapedImage = escapeChatMarkup(tokenImage);
  const escapedAccent = escapeChatMarkup(accent);
  const escapedTypeLabel = escapeChatMarkup(chatRollTypeLabel);
  const originalContent = contentEl.innerHTML;

  contentEl.innerHTML = `<div class="bm-chat-roll-frame" style="--bm-chat-roll-author-accent:${escapedAccent};">
    <div class="bm-chat-roll-head">
      <span class="bm-chat-roll-accent-band" aria-hidden="true"></span>
      <div class="bm-chat-roll-token"><img src="${escapedImage}" alt="${escapedPseudo}" /></div>
      <div class="bm-chat-roll-pseudo-wrap">
        <div class="bm-chat-roll-pseudo">${escapedPseudo}</div>
        <div class="bm-chat-roll-type">${escapedTypeLabel}</div>
      </div>
    </div>
    <div class="bm-chat-roll-inner bm-chat-roll-native">${originalContent}</div>
  </div>`;
  root.classList.add("bm-chat-roll", `bm-chat-roll--${chatRollTypeClass}`);
  root.dataset.bmChatRollType = chatRollTypeClass;
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
      classes: state?.isSimpleAttackVariant
        ? ["bloodman-damage-dialog", "bloodman-damage-dialog-simple-attack"]
        : ["bloodman-damage-dialog"],
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
  if (!shown) bmLog.warn("[bloodman] damage:config popup display failed", { source, eventId, payload: data });
  return shown;
}

function getPowerUsePopupViewerIds(requesterUserId = "", options = {}) {
  const requesterId = String(requesterUserId || "").trim();
  const includeRequesterUser = options?.includeRequesterUser === true;
  return getActivePrivilegedOperatorIds()
    .filter(userId => includeRequesterUser || !requesterId || userId !== requesterId);
}

function getPopupItemLabel(itemType) {
  return String(itemType || "").trim().toLowerCase() === "aptitude" ? "Aptitude" : "Pouvoir";
}

function emitPowerUsePopup(actor, item, options = {}) {
  if (!game.socket || !actor || !item) return false;
  const popupItemType = String(item.type || "").trim().toLowerCase();
  if (popupItemType !== "pouvoir" && popupItemType !== "aptitude") return false;
  const requesterUserId = String(game.user?.id || "").trim();
  const includeRequesterUser = options?.includeRequesterUser === true;
  const viewerIds = getPowerUsePopupViewerIds(requesterUserId, { includeRequesterUser });
  if (!viewerIds.length) return false;
  const randomId = () => (foundry.utils?.randomID ? foundry.utils.randomID() : Math.random().toString(36).slice(2));
  const powerDamageFormula = item.system?.damageEnabled ? normalizeRollDieFormula(item.system?.damageDie, "d4") : "";
  const popupItemLabel = getPopupItemLabel(popupItemType);
  const hasPowerCost = popupItemType === "pouvoir" && toBooleanFlag(item.system?.powerCostEnabled);
  const payload = {
    type: "powerUsePopup",
    eventId: randomId(),
    requestId: String(options.requestId || randomId()),
    requesterUserId,
    requesterUserName: String(game.user?.name || "").trim(),
    viewerIds,
    actorId: String(actor.id || ""),
    actorName: String(actor.name || "").trim(),
    itemId: String(item.id || ""),
    itemType: popupItemType,
    itemLabel: popupItemLabel,
    itemName: String(item.name || "").trim() || popupItemLabel,
    powerId: String(item.id || ""),
    powerName: String(item.name || "").trim() || popupItemLabel,
    powerDescription: String(item.system?.note || item.system?.notes || "").trim(),
    powerCostEnabled: hasPowerCost,
    powerCost: hasPowerCost ? Math.max(0, Math.floor(toFiniteNumber(item.system?.powerCost, 0))) : 0,
    damageEnabled: toBooleanFlag(item.system?.damageEnabled),
    damageFormula: String(powerDamageFormula || "").trim(),
    context: {
      fromUseButton: options.fromUseButton === true
    }
  };
  try {
    game.socket.emit(SYSTEM_SOCKET, payload);
  } catch (error) {
    bmLog.error("[bloodman] power:popup socket emit failed", error);
  }
  if (ENABLE_CHAT_TRANSPORT_FALLBACK && typeof ChatMessage?.create === "function") {
    void ChatMessage.create({
      content: POWER_USE_POPUP_CHAT_MARKUP,
      whisper: viewerIds,
      flags: { bloodman: { powerUsePopup: payload } }
    }).catch(error => {
      bmLog.error("[bloodman] power:popup chat fallback failed", error);
    });
  }
  return true;
}

function canCurrentUserReceivePowerUsePopup(data) {
  const localUserId = String(game.user?.id || "").trim();
  if (!localUserId) return false;
  if (game.user?.isGM) return true;
  const requesterUserId = String(data?.requesterUserId || "").trim();
  const isRequester = requesterUserId && requesterUserId === localUserId;
  const viewerIds = Array.isArray(data?.viewerIds)
    ? data.viewerIds.map(id => String(id || "").trim()).filter(Boolean)
    : [];
  if (isRequester && viewerIds.length && !viewerIds.includes(localUserId)) return false;
  if (isRequester && !viewerIds.length) return false;
  if (viewerIds.length && !viewerIds.includes(localUserId)) return false;
  return isAssistantOrHigherRole(game.user?.role);
}

function showPowerUsePopup(data) {
  if (!data || typeof Dialog !== "function") return false;
  const escapeHtml = value => (foundry.utils?.escapeHTML ? foundry.utils.escapeHTML(String(value || "")) : String(value || ""));
  const actorName = String(data.actorName || "").trim();
  const requesterUserName = String(data.requesterUserName || "").trim();
  const popupItemType = String(data.itemType || "").trim().toLowerCase();
  const popupItemLabel = getPopupItemLabel(popupItemType);
  const powerName = String(data.itemName || data.powerName || "").trim() || popupItemLabel;
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
  const itemLabel = escapeHtml(popupItemLabel);
  const damageLabel = escapeHtml(damageText);
  const costLabel = escapeHtml(costText);
  const title = `${popupItemLabel} utilise - ${actorName || requesterUserName || "Joueur"}`;
  const content = `<div class="bm-power-use-popup">
    <p><strong>Joueur :</strong> ${requesterLabel}</p>
    <p><strong>Personnage :</strong> ${actorLabel}</p>
    <p><strong>${itemLabel} :</strong> ${powerLabel}</p>
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
  if (!shown) bmLog.warn("[bloodman] power:popup display failed", { source, eventId, payload: data });
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
    bmLog.warn("reroll:ignored non-damage item", {
      rollId: data.rollId,
      itemId: data.itemId,
      itemType
    });
    return;
  }
  const targets = normalizeRerollTargets(data.targets);
  if (!targets.length) return;
  const penetration = Math.max(0, Math.floor(toFiniteNumber(data.penetration, 0)));
  bmLog.debug("reroll:recv", {
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
      bmLog.warn("reroll:target unresolved", {
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

  bmLog.debug("damage:recv", { source, ...data });

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
    bmLog.debug("damage:apply token-unlinked", { current, paInitial, paEffective, penetration, share, finalDamage, nextValue, tokenId: tokenDoc.id });
    try {
      await tokenDoc.update({ "delta.system.resources.pv.current": nextValue });
    } catch (error) {
      bmLog.error("damage:update tokenDoc failed", { error });
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
    bmLog.debug("damage:output", {
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
    bmLog.debug("damage:apply token-actor", { share, actorId: tokenActor.id, actorName: tokenActor.name });
    const result = await applyDamageToActor(tokenActor, share, { targetName: fallbackName, penetration });
    if (result) {
      emitDamageAppliedMessage(data, result, tokenDoc, share);
      bmLog.debug("damage:output", {
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
    bmLog.debug("damage:apply uuid-actor", { share, actorId: uuidActor.id, actorName: uuidActor.name });
    const result = await applyDamageToActor(uuidActor, share, { targetName: fallbackName, penetration });
    if (result) emitDamageAppliedMessage(data, result, tokenDoc, share);
    return;
  }
  if (worldActor) {
    bmLog.debug("damage:apply world-actor", { share, actorId: worldActor.id, actorName: worldActor.name });
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

async function handleReorderActorItemsRequest(data) {
  if (!game.user.isGM || !data) return;
  const requesterId = String(data.requesterId || "");
  const requester = game.users?.get(requesterId);
  if (!requester) return;
  const actor = await resolveActorForSheetRequest(data);
  if (!actor) return;
  if (actor.type !== "personnage" && actor.type !== "personnage-non-joueur") return;
  const ownerLevel = Number(CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3);
  const hasOwnerAccess = typeof actor.testUserPermission === "function"
    ? actor.testUserPermission(requester, ownerLevel, { exact: false })
    : false;
  if (!hasOwnerAccess) return;

  const requestedUpdates = Array.isArray(data.updates) ? data.updates : [];
  if (!requestedUpdates.length) return;

  const safeUpdates = requestedUpdates
    .map(entry => {
      const itemId = String(entry?._id || entry?.id || "").trim();
      if (!itemId || !actor.items?.has(itemId)) return null;
      const fallbackSort = toFiniteNumber(actor.items.get(itemId)?.sort, 0);
      const sortValue = Math.max(0, Math.floor(toFiniteNumber(entry?.sort, fallbackSort)));
      return { _id: itemId, sort: sortValue };
    })
    .filter(Boolean);
  if (!safeUpdates.length) return;

  await actor.updateEmbeddedDocuments("Item", safeUpdates);
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

function requestReorderActorItems(actor, updates = []) {
  if (!actor || !game.socket || !Array.isArray(updates)) return false;
  const sanitizedUpdates = updates
    .map(entry => {
      const itemId = String(entry?._id || entry?.id || "").trim();
      if (!itemId) return null;
      const sortValue = Math.max(0, Math.floor(toFiniteNumber(entry?.sort, 0)));
      return { _id: itemId, sort: sortValue };
    })
    .filter(Boolean);
  if (!sanitizedUpdates.length) return false;

  game.socket.emit(SYSTEM_SOCKET, {
    type: "reorderActorItems",
    requesterId: String(game.user?.id || ""),
    actorUuid: String(actor.uuid || ""),
    actorId: String(actor.id || ""),
    actorBaseId: getSocketActorBaseId(actor),
    updates: sanitizedUpdates
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
    const canHandlePrivilegedRequests = isCurrentUserPrimaryPrivilegedOperator();
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
      if (canHandlePrivilegedRequests) await handleDamageRerollRequest(data);
      return;
    }
    if (data.type === "updateVitalResources") {
      if (canHandlePrivilegedRequests) await handleVitalResourceUpdateRequest(data);
      return;
    }
    if (data.type === "updateActorSheetData") {
      if (canHandlePrivilegedRequests) await handleActorSheetUpdateRequest(data);
      return;
    }
    if (data.type === "deleteActorItem") {
      if (canHandlePrivilegedRequests) await handleDeleteItemRequest(data);
      return;
    }
    if (data.type === "reorderActorItems") {
      if (canHandlePrivilegedRequests) await handleReorderActorItemsRequest(data);
      return;
    }
    if (data.type === "adjustChaosDice") {
      if (!canHandlePrivilegedRequests) return;
      const delta = Number(data.delta);
      if (!Number.isFinite(delta) || delta === 0) return;
      const requestId = String(data.requestId || "");
      if (requestId && wasChaosRequestProcessed(requestId)) return;
      if (requestId) rememberChaosRequest(requestId);
      await setChaosValue(getChaosValue() + delta);
      return;
    }
    if (data.type !== "applyDamage") return;
    if (!canHandlePrivilegedRequests) return;
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
  if (!sent) safeWarn("Mise a jour impossible: aucun GM ou assistant actif.");
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

function getCombatMoveHistoryResetKey(combat) {
  if (!combat?.active) return "";
  const combatId = String(combat?.id || "");
  const round = Number(combat?.round ?? 0);
  const turn = Number(combat?.turn ?? -1);
  if (!combatId || round <= 0 || turn < 0) return "";
  return `${combatId}:${round}:${turn}`;
}

async function resetCombatMovementHistory(combat) {
  if (!game.user?.isGM) return;
  if (!combat?.active) return;
  const resetKey = getCombatMoveHistoryResetKey(combat);
  if (!resetKey || resetKey === LAST_COMBAT_MOVE_HISTORY_RESET_KEY) return;
  LAST_COMBAT_MOVE_HISTORY_RESET_KEY = resetKey;

  if (typeof combat.clearMovementHistories === "function") {
    try {
      await combat.clearMovementHistories();
      return;
    } catch (error) {
      bmLog.warn("[bloodman] combat move history reset failed (combat.clearMovementHistories)", error);
    }
  }

  for (const combatant of combat.combatants || []) {
    if (typeof combatant?.clearMovementHistory !== "function") continue;
    try {
      await combatant.clearMovementHistory();
    } catch (error) {
      bmLog.warn("[bloodman] combat move history reset failed (combatant.clearMovementHistory)", error);
    }
  }
}

function getTokenHudCounterPriorityValue(effectDoc) {
  const fromFlag = Number(getTokenHudCounterFlagData(effectDoc)?.rounds);
  if (Number.isFinite(fromFlag)) return Math.max(0, Math.floor(fromFlag));
  const fromDuration = Number(foundry.utils.getProperty(effectDoc, "duration.rounds"));
  if (Number.isFinite(fromDuration)) return Math.max(0, Math.floor(fromDuration));
  return 0;
}

async function decrementTokenHudCountersForActorTurn(actor) {
  if (!actor) return false;
  const allCounters = getTokenHudCounterEffects(actor);
  if (!allCounters.length) return false;

  const statusIds = [...new Set(
    allCounters
      .map(effectDoc => normalizeStatusValue(getTokenHudCounterFlagData(effectDoc)?.statusId))
      .filter(Boolean)
  )];
  if (!statusIds.length) return false;

  let changed = false;
  for (const statusId of statusIds) {
    if (!actorHasStatusInFamily(actor, [statusId])) {
      const cleared = await clearTokenHudCounterEffects(actor, statusId);
      changed = changed || cleared;
      continue;
    }

    const counters = getTokenHudCounterEffects(actor, statusId)
      .sort((a, b) => getTokenHudCounterPriorityValue(b) - getTokenHudCounterPriorityValue(a));
    if (!counters.length) continue;

    const removed = await deleteStatusEffectDocuments([counters[0]]);
    changed = changed || removed;

    const primaryEffect = getTokenHudPrimaryStatusEffectDocument(actor, statusId);
    if (!primaryEffect) continue;
    const currentRounds = clampTokenHudTurnValue(
      foundry.utils.getProperty(primaryEffect, "duration.rounds")
    );
    const nextRounds = Math.max(TOKEN_HUD_TURN_MIN, currentRounds - 1);
    if (nextRounds === currentRounds) continue;
    const updated = await setTokenHudEffectDuration(primaryEffect, nextRounds);
    changed = changed || updated;
  }

  if (changed) await cleanupTokenHudOrphanCounterEffects(actor);
  return changed;
}

async function decrementActiveCombatantTokenHudCounters(combat) {
  if (!game.user?.isGM) return;
  if (!combat?.active) return;
  const resetKey = getCombatMoveResetKey(combat);
  if (!resetKey || resetKey === LAST_TOKEN_HUD_COUNTER_TICK_KEY) return;
  LAST_TOKEN_HUD_COUNTER_TICK_KEY = resetKey;

  const activeCombatant = getActiveCombatant(combat);
  const actor = getCombatantActor(activeCombatant);
  if (!actor || actor.type !== "personnage") return;

  await decrementTokenHudCountersForActorTurn(actor);
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

function injectCreateTypeIconsFromHook(htmlLike, sourceHook = "unknown") {
  try {
    const root = htmlLike?.[0] || htmlLike;
    if (!(root instanceof HTMLElement)) return;
    if (!root.querySelector("select[name='type'], input[name='type']")) return;
    injectDocumentCreateTypeIcons(root);
  } catch (error) {
    bmLog.warn(`[bloodman] ${sourceHook} type icon hook skipped`, error);
  }
}

Hooks.on("renderDialog", (_app, html) => {
  injectCreateTypeIconsFromHook(html, "renderDialog");
});

Hooks.on("renderApplication", (_app, html) => {
  injectCreateTypeIconsFromHook(html, "renderApplication");
});

Hooks.on("renderApplicationV1", (_app, html) => {
  injectCreateTypeIconsFromHook(html, "renderApplicationV1");
});

Hooks.on("renderApplicationV2", (_app, element) => {
  injectCreateTypeIconsFromHook(element, "renderApplicationV2");
});

Hooks.on("renderDocumentCreateDialog", (_app, html) => {
  injectCreateTypeIconsFromHook(html, "renderDocumentCreateDialog");
});

Hooks.on("renderDocumentCreateDialogV1", (_app, html) => {
  injectCreateTypeIconsFromHook(html, "renderDocumentCreateDialogV1");
});

Hooks.on("renderDocumentCreateDialogV2", (_app, element) => {
  injectCreateTypeIconsFromHook(element, "renderDocumentCreateDialogV2");
});

Hooks.on("renderTokenHUD", (hud, html) => {
  try {
    configureTokenHudEnhancements(hud, html);
  } catch (error) {
    bmLog.warn("token HUD enhancement skipped", { error });
  }
});

Hooks.on("canvasReady", () => {
  installTokenEffectBackgroundPatch();
  installTokenHudRenderPatch();
  installTokenHudDomObserver();
  scheduleTokenHudDomEnhancement();
  for (const token of canvas?.tokens?.placeables || []) {
    applyTransparentTokenEffectBackground(token);
  }
});

Hooks.on("controlToken", () => {
  scheduleTokenHudDomEnhancement();
});

Hooks.once("ready", () => {
  initializeBloodmanLoggerFromSettings();
  bmLog.info("HUD patch build 2026-02-13-b loaded");
  installTokenEffectBackgroundPatch();
  void ensureTokenHudLocalSvgIcons({ copyMissing: true, force: true }).then(() => {
    refreshTokenHudStatusEffectIconPaths({ bumpCache: true });
  }).catch(error => {
    bmLog.warn("token HUD svg icon sync skipped", { error });
  });
  installTokenHudRenderPatch();
  installTokenHudDomObserver();
  scheduleTokenHudDomEnhancement();
});

Hooks.once("init", () => {
  registerBloodmanCoreSettings();
  registerPrivilegedUsersCacheHooks();
  initializeBloodmanLoggerFromSettings();
  installTokenEffectBackgroundPatch();
  installTokenHudRenderPatch();

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
  try {
    refreshAllCreateTypeIcons();
    const existingObserver = window.__bmCreateTypeIconObserver;
    if (existingObserver && typeof existingObserver.disconnect === "function") {
      try {
        existingObserver.disconnect();
      } catch (_disconnectError) {
        // ignore stale observer cleanup failure
      }
      window.__bmCreateTypeIconObserver = null;
    }

    if (ENABLE_CREATE_TYPE_ICON_OBSERVER && !window.__bmCreateTypeIconObserver) {
      const observer = new MutationObserver(mutations => {
        queueCreateTypeIconsRefreshFromMutations(mutations);
      });
      observer.observe(document.body, { childList: true, subtree: true });
      window.__bmCreateTypeIconObserver = observer;
    }
  } catch (error) {
    bmLog.warn("create type icon ready hook skipped", { error });
  }

  try {
    registerDamageSocketHandlers();
  } catch (error) {
    bmLog.error("socket handler registration failed", { error });
  }
  if (!game.user?.isGM) return;

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
      if (shouldResetTokenFit(protoFit)) updates["prototypeToken.texture.fit"] = "fill";
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
      if (isVoyageXPCostItemType(item.type)) {
        const rawCost = item.system?.xpVoyageCost;
        const numericCost = Number(rawCost);
        const normalizedCost = normalizeNonNegativeInteger(rawCost, 0);
        if (rawCost == null || !Number.isFinite(numericCost) || numericCost !== normalizedCost) {
          await item.update({ "system.xpVoyageCost": normalizedCost });
        }
        continue;
      }
      if (item.type !== "arme") continue;
      const weaponUpdates = {};
      const normalizedWeaponType = normalizeWeaponType(item.system?.weaponType);
      if (normalizedWeaponType && normalizedWeaponType !== item.system?.weaponType) {
        weaponUpdates["system.weaponType"] = normalizedWeaponType;
      }
      if (!normalizedWeaponType && !item.system?.weaponType) {
        weaponUpdates["system.weaponType"] = "distance";
      }
      const effectiveWeaponType = normalizeWeaponType(
        weaponUpdates["system.weaponType"] ?? item.system?.weaponType
      ) || "distance";
      const rawMagazineCapacity = Number(item.system?.magazineCapacity);
      const magazineCapacity = normalizeNonNegativeInteger(item.system?.magazineCapacity, 0);
      if (!Number.isFinite(rawMagazineCapacity) || rawMagazineCapacity < 0 || rawMagazineCapacity !== Math.floor(rawMagazineCapacity)) {
        weaponUpdates["system.magazineCapacity"] = magazineCapacity;
      }
      const infiniteAmmo = toCheckboxBoolean(item.system?.infiniteAmmo, false);
      const consumesAmmo = getWeaponCategory(effectiveWeaponType) === "distance" && !infiniteAmmo;
      const usesMagazine = consumesAmmo && magazineCapacity > 0;
      const normalizedLoadedAmmo = normalizeWeaponLoadedAmmoValue(
        item.system?.loadedAmmo,
        actor.system?.ammo?.magazine ?? 0,
        usesMagazine ? magazineCapacity : 0
      );
      const hasStoredLoadedAmmo = foundry.utils.getProperty(item, "system.loadedAmmo") != null;
      const rawLoadedAmmo = Number(item.system?.loadedAmmo);
      if (!hasStoredLoadedAmmo || !Number.isFinite(rawLoadedAmmo) || rawLoadedAmmo !== normalizedLoadedAmmo) {
        weaponUpdates["system.loadedAmmo"] = normalizedLoadedAmmo;
      }
      if (Object.keys(weaponUpdates).length) {
        await item.update(weaponUpdates);
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
  if (!ENABLE_CHAT_TRANSPORT_FALLBACK || !gmIds.length) return;
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
  const macroStripRect = getVisibleRect(
    document.querySelector("#hotbar #macro-list")
    || document.querySelector("#hotbar ol#macro-list")
    || document.querySelector("#hotbar #action-bar")
    || document.querySelector("#hotbar ol#action-bar")
    || document.querySelector("#hotbar .macro-list")
    || document.querySelector("#hotbar .action-bar")
  );
  const hotbarRect = getVisibleRect(document.getElementById("hotbar"));
  const sidebarRect = getVisibleRect(document.getElementById("sidebar"))
    || getVisibleRect(document.getElementById("ui-right"));
  const anchorRect = macroStripRect || hotbarRect || null;
  const rootRect = root.getBoundingClientRect();
  const halfWidth = Math.max(18, (rootRect.width || 60) / 2);
  const viewportMargin = 8;
  const sideGap = 72;
  const bottomOffset = 30;

  // Default to the left edge when hotbar geometry is unavailable.
  let centerX = Math.round(viewportMargin + halfWidth);
  if (anchorRect) {
    centerX = Math.round(anchorRect.left - sideGap - halfWidth);
  }

  const leftBoundary = viewportMargin + halfWidth;
  const rightBoundary = sidebarRect
    ? (sidebarRect.left - viewportMargin - halfWidth)
    : (window.innerWidth - viewportMargin - halfWidth);
  const maxCenter = Math.max(leftBoundary, rightBoundary);
  const clampedX = Math.max(leftBoundary, Math.min(maxCenter, centerX));

  root.style.left = `${clampedX}px`;
  root.style.right = "auto";
  root.style.bottom = `${bottomOffset}px`;
  root.style.top = "auto";
  root.style.transform = "translateX(-50%)";
}

function showSelectedVoyageXpGrantDialog() {
  if (!game.user?.isGM) return;
  if (typeof Dialog !== "function") return;
  const escapeHtml = value => (foundry.utils?.escapeHTML ? foundry.utils.escapeHTML(String(value || "")) : String(value || ""));
  const titleText = tl("BLOODMAN.Dialogs.VoyageXPGrant.Title", "Attribution XP voyage");
  const promptText = tl("BLOODMAN.Dialogs.VoyageXPGrant.Prompt", "Saisissez le montant d'XP voyage a attribuer aux tokens joueurs selectionnes.");
  const labelText = tl("BLOODMAN.Dialogs.VoyageXPGrant.ValueLabel", "XP voyage");
  const validateLabel = tl("BLOODMAN.Common.Validate", "Valider");
  const cancelLabel = tl("BLOODMAN.Common.Cancel", "Annuler");
  const content = `<form class="bm-voyage-xp-dialog">
    <p>${escapeHtml(promptText)}</p>
    <div class="bm-damage-config bm-damage-config-inline">
      <label for="bm-voyage-xp-amount">${escapeHtml(labelText)}</label>
      <input id="bm-voyage-xp-amount" type="number" name="voyageXpAmount" min="0" step="1" value="0" />
    </div>
  </form>`;
  const dialog = new Dialog(
    {
      title: titleText,
      content,
      buttons: {
        validate: {
          label: validateLabel,
          callback: async html => {
            const input = html?.find?.('input[name="voyageXpAmount"]');
            const rawValue = input?.length ? input.val() : 0;
            const result = await grantVoyageXpToSelectedPlayers(rawValue);
            await postVoyageXpGrantSummary(result);
          }
        },
        cancel: {
          label: cancelLabel
        }
      },
      default: "validate"
    },
    {
      classes: ["bloodman-damage-dialog", "bloodman-voyage-xp-dialog"],
      width: 420
    }
  );
  dialog.render(true);
}

function ensureChaosDiceUI() {
  if (!game.user.isGM) return;
  if (document.getElementById("bm-chaos-dice")) return;
  const target = document.body;
  if (!target) return;

  const container = document.createElement("div");
  container.id = "bm-chaos-dice";
  container.className = "bm-chaos-dice";
  container.title = tl("BLOODMAN.Settings.ChaosDiceName", "Des du chaos");
  container.innerHTML = `
    <button type="button" class="bm-chaos-xp-btn" aria-label="${tl("BLOODMAN.Dialogs.VoyageXPGrant.Title", "Attribution XP voyage")}">XP</button>
    <div class="bm-chaos-row">
      <button type="button" class="bm-chaos-btn bm-chaos-plus" aria-label="Augmenter les des du chaos">+</button>
      <div class="bm-chaos-icon" aria-hidden="true">
        <img src="${CHAOS_DICE_ICON_SRC}" data-fallback-src="${CHAOS_DICE_ICON_FALLBACK_SRC}" alt="" />
        <span class="bm-chaos-value">0</span>
      </div>
      <button type="button" class="bm-chaos-btn bm-chaos-minus" aria-label="Diminuer les des du chaos">-</button>
    </div>
  `;

  target.appendChild(container);

  const xp = container.querySelector(".bm-chaos-xp-btn");
  const minus = container.querySelector(".bm-chaos-minus");
  const plus = container.querySelector(".bm-chaos-plus");
  const chaosIconImage = container.querySelector(".bm-chaos-icon img");

  chaosIconImage?.addEventListener("error", () => {
    if (chaosIconImage.dataset.fallbackApplied === "true") return;
    const fallbackSrc = String(chaosIconImage.dataset.fallbackSrc || "").trim();
    if (!fallbackSrc) return;
    chaosIconImage.dataset.fallbackApplied = "true";
    chaosIconImage.src = fallbackSrc;
  });

  minus?.addEventListener("click", async () => {
    const current = getChaosValue();
    await setChaosValue(current - 1);
  });

  plus?.addEventListener("click", async () => {
    const current = getChaosValue();
    await setChaosValue(current + 1);
  });

  xp?.addEventListener("click", () => {
    showSelectedVoyageXpGrantDialog();
  });

  updateChaosDiceUI(getChaosValue());
  positionChaosDiceUI();

  if (!window.__bmChaosDiceObserver) {
    const observer = new ResizeObserver(() => positionChaosDiceUI());
    const leftUi = document.getElementById("ui-left");
    const controls = document.getElementById("controls");
    const navigation = document.getElementById("navigation");
    const players = document.getElementById("players");
    const sidebar = document.getElementById("sidebar");
    const tabs = document.getElementById("sidebar-tabs");
    const chatForm = document.getElementById("chat-form");
    const hotbar = document.getElementById("hotbar");
    if (leftUi) observer.observe(leftUi);
    if (controls) observer.observe(controls);
    if (navigation) observer.observe(navigation);
    if (players) observer.observe(players);
    if (sidebar) observer.observe(sidebar);
    if (tabs) observer.observe(tabs);
    if (chatForm) observer.observe(chatForm);
    if (hotbar) observer.observe(hotbar);
    window.addEventListener("resize", positionChaosDiceUI);

    const mutationTargets = [leftUi, controls, navigation, players, sidebar].filter(Boolean);
    if (mutationTargets.length) {
      const mutation = new MutationObserver(() => positionChaosDiceUI());
      for (const targetElement of mutationTargets) {
        mutation.observe(targetElement, { attributes: true, attributeFilter: ["class", "style"] });
      }
      window.__bmChaosDiceMutation = mutation;
    }
    window.__bmChaosDiceObserver = observer;
  }
}

async function applyVoyageXPCostOnCreate(actor, item) {
  if (!actor || !item) return;
  if (actor.type !== "personnage" || !isVoyageXPCostItemType(item.type)) return;

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

  await applyVoyageXPCostOnCreate(item.actor, item);

  const type = String(item.type || "").trim().toLowerCase();
  if (type === "aptitude" || type === "pouvoir") {
    await applyItemResourceBonuses(item.actor);
    await syncActorDerivedCharacteristicsResources(item.actor);
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
  const normalizedWeaponAmmo = normalizeWeaponMagazineCapacityUpdate(item, createData);
  if (!normalizedWeaponAmmo) normalizeWeaponMagazineCapacityUpdate(item);
  normalizeCharacteristicBonusItemUpdate(item, createData);

  if (!isVoyageXPCostItemType(item?.type)) return;

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

  const type = String(item?.type || "").trim().toLowerCase();
  const typeFallbackLabel = type ? t(`TYPES.Item.${type}`) : t("BLOODMAN.Common.Name");
  const itemName = item.name || typeFallbackLabel;
  bmLog.warn("[bloodman] item acquisition blocked: not enough voyage XP", {
    actorId: actor.id,
    actorName: actor.name,
    itemType: type,
    item: itemName,
    required: normalizedCost,
    available: availableVoyageXp
  });
  ui.notifications?.error(
    t("BLOODMAN.Notifications.NotEnoughVoyageXPForAptitude", {
      aptitude: itemName,
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

  if (!isVoyageXPCostItemType(item?.type)) return;
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

  const canHandlePrivilegedRequests = isCurrentUserPrimaryPrivilegedOperator();
  if (!canHandlePrivilegedRequests) return;
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

function isTransportRelayChatMessage(message) {
  const bloodmanFlags = foundry.utils.getProperty(message, "flags.bloodman") || {};
  if (!bloodmanFlags || typeof bloodmanFlags !== "object") return false;
  if (bloodmanFlags.damageConfigPopup) return true;
  if (bloodmanFlags.powerUsePopup) return true;
  if (bloodmanFlags.damageRequest) return true;
  if (bloodmanFlags.chaosDeltaRequest) return true;
  if (bloodmanFlags.rerollDamageRequest) return true;

  const content = String(message?.content || "").toLowerCase();
  if (!content) return false;
  return content.includes("bloodman-damage-config-popup")
    || content.includes("bloodman-power-use-popup")
    || content.includes("bloodman-damage-request")
    || content.includes("bloodman-chaos-request")
    || content.includes("bloodman-reroll-request");
}

function hideTransientRelayChatMessage(htmlLike) {
  const root = htmlLike?.[0] || htmlLike;
  if (!(root instanceof HTMLElement)) return;
  root.style.display = "none";
  root.classList.add("bm-chat-relay-hidden");
}

Hooks.on("renderChatMessage", (message, html) => {
  handleChatMessageRenderHook(message, html, "renderChatMessage");
});

Hooks.on("renderChatMessageHTML", (message, html) => {
  handleChatMessageRenderHook(message, html, "renderChatMessageHTML");
});

function handleChatMessageRenderHook(message, htmlLike, sourceHook = "renderChatMessage") {
  if (isTransportRelayChatMessage(message)) {
    hideTransientRelayChatMessage(htmlLike);
    return;
  }
  try {
    decorateBloodmanChatRollMessage(message, htmlLike);
  } catch (error) {
    bmLog.warn(`chat:roll decorate skipped (${sourceHook})`, { error });
  }
}

Hooks.on("renderHotbar", () => {
  positionChaosDiceUI();
});

Hooks.on("updateItem", (item) => {
  if (!item?.actor) return;
  const type = String(item.type || "").trim().toLowerCase();
  if (type === "aptitude" || type === "pouvoir") {
    applyItemResourceBonuses(item.actor);
    syncActorDerivedCharacteristicsResources(item.actor);
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
    syncActorDerivedCharacteristicsResources(item.actor);
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
    // State modifiers apply to characteristic checks only, not vital resource maxima.
    return toFiniteNumber(actor.system.characteristics?.[key]?.base, 0)
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
    try {
      if (typeof actor?.updateSource === "function") {
        actor.updateSource(foundry.utils.deepClone({ "system.resources.pp.current": nextValue }));
      } else {
        foundry.utils.setProperty(actor, "system.resources.pp.current", nextValue);
      }
    } catch (_error) {
      // Non-fatal optimistic update.
    }
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
  const tokenSrc = String(
    foundry.utils.getProperty(doc, "texture.src")
    || foundry.utils.getProperty(doc, "img")
    || ""
  ).trim();
  const actorImg = String(
    doc?.actor?.img
    || (doc?.actorId ? game.actors?.get(doc.actorId)?.img : "")
    || ""
  ).trim();
  const isCharacterTokenType = actorType === "personnage" || actorType === "personnage-non-joueur";

  if (isCharacterTokenType && actorImg) {
    if (tokenSrc !== actorImg) {
      sourceUpdates["texture.src"] = actorImg;
      sourceUpdates.img = actorImg;
    }
  } else if (isMissingTokenImage(tokenSrc)) {
    const fallbackSrc = getSafeTokenTextureFallback(doc);
    if (fallbackSrc && fallbackSrc !== tokenSrc) {
      sourceUpdates["texture.src"] = fallbackSrc;
      sourceUpdates.img = fallbackSrc;
    }
  }
  if (Object.keys(sourceUpdates).length) doc.updateSource(sourceUpdates);
});

Hooks.on("drawToken", token => {
  void repairTokenTextureSource(token);
  applyTransparentTokenEffectBackground(token);
});

Hooks.on("refreshToken", token => {
  void repairTokenTextureSource(token);
  applyTransparentTokenEffectBackground(token);
});

Hooks.on("createToken", async (tokenDoc) => {
  await repairTokenTextureSource(tokenDoc);
  if (!game.user.isGM) return;
  if (getTokenActorType(tokenDoc) !== "personnage") return;
  await refreshBossSoloNpcPvMax();
});

Hooks.on("deleteToken", async (tokenDoc) => {
  if (!game.user.isGM) return;
  if (getTokenActorType(tokenDoc) !== "personnage") return;
  await refreshBossSoloNpcPvMax();
});

Hooks.on("canvasReady", async () => {
  if (!game.user.isGM) return;
  await refreshBossSoloNpcPvMax();
});

Hooks.on("canvasReady", async () => {
  for (const token of canvas?.tokens?.placeables || []) {
    await repairTokenTextureSource(token);
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
  if (changes.active === false) {
    LAST_COMBAT_MOVE_RESET_KEY = "";
    LAST_COMBAT_MOVE_HISTORY_RESET_KEY = "";
    LAST_TOKEN_HUD_COUNTER_TICK_KEY = "";
  }
  if (changes.round != null || changes.turn != null || changes.active != null) {
    focusActiveCombatantToken(combat);
    resetActiveCombatantMoveGauge(combat).catch(error => {
      bmLog.warn("[bloodman] move:gauge reset failed", error);
    });
    resetCombatMovementHistory(combat).catch(error => {
      bmLog.warn("[bloodman] combat move history reset failed", error);
    });
    decrementActiveCombatantTokenHudCounters(combat).catch(error => {
      bmLog.warn("[bloodman] token HUD turn counter update failed", error);
    });
  }
});

Hooks.on("combatTurnChange", (combat) => {
  focusActiveCombatantToken(combat);
  resetActiveCombatantMoveGauge(combat).catch(error => {
    bmLog.warn("[bloodman] move:gauge reset failed", error);
  });
  resetCombatMovementHistory(combat).catch(error => {
    bmLog.warn("[bloodman] combat move history reset failed", error);
  });
  decrementActiveCombatantTokenHudCounters(combat).catch(error => {
    bmLog.warn("[bloodman] token HUD turn counter update failed", error);
  });
});

Hooks.on("combatStart", (combat) => {
  focusActiveCombatantToken(combat);
  resetActiveCombatantMoveGauge(combat).catch(error => {
    bmLog.warn("[bloodman] move:gauge reset failed", error);
  });
  resetCombatMovementHistory(combat).catch(error => {
    bmLog.warn("[bloodman] combat move history reset failed", error);
  });
  decrementActiveCombatantTokenHudCounters(combat).catch(error => {
    bmLog.warn("[bloodman] token HUD turn counter update failed", error);
  });
});

Hooks.on("deleteCombat", () => {
  LAST_COMBAT_MOVE_RESET_KEY = "";
  LAST_COMBAT_MOVE_HISTORY_RESET_KEY = "";
  LAST_TOKEN_HUD_COUNTER_TICK_KEY = "";
});

Hooks.on("preUpdateActor", (actor, updateData, options, userId) => {
  if (actor.type !== "personnage" && actor.type !== "personnage-non-joueur") return;
  const trackingOptions = options && typeof options === "object" ? options : null;

  if (foundry.utils.getProperty(updateData, "img") != null) {
    if (trackingOptions) {
      trackingOptions.bloodmanPreviousActorImage = String(actor.img || "").trim();
      trackingOptions.bloodmanPreviousPrototypeImage = String(
        foundry.utils.getProperty(actor, "prototypeToken.texture.src") || ""
      ).trim();
    }
  }

  normalizeCharacteristicXpUpdates(updateData, actor);
  const updaterRole = game.users?.get(userId)?.role ?? game.user?.role;

  const nextActorImageRaw = foundry.utils.getProperty(updateData, "img");
  if (nextActorImageRaw != null && isAssistantOrHigherRole(updaterRole)) {
    const nextActorImage = String(nextActorImageRaw || "").trim() || "icons/svg/mystery-man.svg";
    foundry.utils.setProperty(updateData, "prototypeToken.texture.src", nextActorImage);
    foundry.utils.setProperty(updateData, "prototypeToken.img", nextActorImage);
    foundry.utils.setProperty(updateData, "token.img", nextActorImage);
  }

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
    const itemBonus = Number(itemBonuses?.[key] || 0);
    const profileBonus = archetypeBonusCharacteristic === key && Number.isFinite(archetypeBonusValue)
      ? archetypeBonusValue
      : 0;
    // State modifiers are characteristic-roll penalties and must not alter PV/PP maxima.
    return Number(base) + itemBonus + profileBonus;
  };

  const phyEffective = getEffective("PHY");
  const espEffective = getEffective("ESP");
  const roleOverride = foundry.utils.getProperty(updateData, "system.npcRole");
  const pvMax = getDerivedPvMax(actor, phyEffective, roleOverride) + Number(storedPvBonus || 0);
  const ppMax = Math.round(espEffective / 5) + Number(storedPpBonus || 0);

  const pvMaxPath = "system.resources.pv.max";
  const ppMaxPath = "system.resources.pp.max";
  const pvCurrentPath = "system.resources.pv.current";
  const ppCurrentPath = "system.resources.pp.current";
  const normalizeVitalPathValue = (path, fallback) => {
    const raw = getUpdatedRawValue(path, fallback);
    if (raw == null) return Math.max(0, Math.floor(toFiniteNumber(fallback, 0)));
    if (typeof raw === "string" && !raw.trim()) {
      return Math.max(0, Math.floor(toFiniteNumber(fallback, 0)));
    }
    return Math.max(0, Math.floor(toFiniteNumber(raw, fallback)));
  };

  if (hasUpdatePath(pvMaxPath)) {
    const fallbackPvMax = actor.system.resources?.pv?.max || 0;
    foundry.utils.setProperty(updateData, pvMaxPath, normalizeVitalPathValue(pvMaxPath, fallbackPvMax));
  }

  if (hasUpdatePath(ppMaxPath)) {
    const fallbackPpMax = actor.system.resources?.pp?.max || 0;
    foundry.utils.setProperty(updateData, ppMaxPath, normalizeVitalPathValue(ppMaxPath, fallbackPpMax));
  }

  const storedPvMax = getUpdatedNumber(pvMaxPath, actor.system.resources?.pv?.max);
  const storedPpMax = getUpdatedNumber(ppMaxPath, actor.system.resources?.pp?.max);
  const finalPvMax = Number.isFinite(storedPvMax) ? storedPvMax : toFiniteNumber(pvMax, 0);
  const finalPpMax = Number.isFinite(storedPpMax) ? storedPpMax : toFiniteNumber(ppMax, 0);
  const allowedPvMax = Math.max(0, finalPvMax);
  const allowedPpMax = Math.max(0, finalPpMax);

  if (foundry.utils.getProperty(updateData, pvCurrentPath) != null) {
    const fallbackPvCurrent = actor.system.resources?.pv?.current || 0;
    const requested = normalizeVitalPathValue(pvCurrentPath, fallbackPvCurrent);
    const nextValue = Math.min(requested, allowedPvMax);
    foundry.utils.setProperty(updateData, pvCurrentPath, Math.max(0, Math.floor(toFiniteNumber(nextValue, fallbackPvCurrent))));
  }

  if (foundry.utils.getProperty(updateData, ppCurrentPath) != null) {
    const fallbackPpCurrent = actor.system.resources?.pp?.current || 0;
    const requested = normalizeVitalPathValue(ppCurrentPath, fallbackPpCurrent);
    const nextValue = Math.min(requested, allowedPpMax);
    foundry.utils.setProperty(updateData, ppCurrentPath, Math.max(0, Math.floor(toFiniteNumber(nextValue, fallbackPpCurrent))));
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

Hooks.on("updateActor", async (actor, changes, _options, userId) => {
  if (actor.type !== "personnage" && actor.type !== "personnage-non-joueur") return;
  const sourceUserId = String(userId || "");
  const currentUserId = String(game.user?.id || "");
  if (sourceUserId && currentUserId && sourceUserId !== currentUserId) return;
  if (!game.user.isGM && !actor.isOwner) return;
  if (foundry.utils.getProperty(changes, "system.resources.move.value") != null) return;
  const hasCharBaseChange = CHARACTERISTICS.some(c => {
    return foundry.utils.getProperty(changes, `system.characteristics.${c.key}.base`) != null;
  });
  const hasNpcRoleChange = foundry.utils.getProperty(changes, "system.npcRole") != null;
  const hasArchetypeBonusChange = foundry.utils.getProperty(changes, "system.profile.archetypeBonusValue") != null
    || foundry.utils.getProperty(changes, "system.profile.archetypeBonusCharacteristic") != null;
  if (!hasCharBaseChange && !hasNpcRoleChange && !hasArchetypeBonusChange) return;

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
    + toFiniteNumber(itemBonuses.PHY, 0)
    + getArchetypeBonus("PHY");
  const espEffective = toFiniteNumber(actor.system.characteristics?.ESP?.base, 0)
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
  const pvCurrent = Number(actor.system?.resources?.pv?.current);
  if (Number.isFinite(pvCurrent)) {
    await syncZeroPvBodyStateForActor(actor, actor.type, pvCurrent <= 0);
  }
  if (actor.isToken) {
    const tokenDoc = actor.token || actor.parent || null;
    if (tokenDoc && Number.isFinite(pvCurrent)) {
      await syncZeroPvStatusForToken(tokenDoc, actor.type, pvCurrent);
    }
    return;
  }
  await syncZeroPvStatusForActor(actor);
});

Hooks.on("updateActor", async (actor, changes, options, userId) => {
  if (actor.type !== "personnage" && actor.type !== "personnage-non-joueur") return;
  if (!game.user.isGM) return;
  if (options?.bloodmanSkipPrototypeImageSync) return;
  if (options?.bloodmanSkipSceneTokenImageSync) return;

  const hasActorImageChange = foundry.utils.getProperty(changes, "img") != null;
  if (!hasActorImageChange) return;

  if (actor.isToken) {
    const tokenDoc = actor.token || actor.parent || null;
    const nextTokenImage = String(actor.img || "").trim() || "icons/svg/mystery-man.svg";
    const previousTokenImage = String(options?.bloodmanPreviousActorImage || "").trim();
    const previousTokenPrototypeImage = String(options?.bloodmanPreviousPrototypeImage || "").trim();
    if (tokenDoc?.update) {
      await tokenDoc.update(
        { "texture.src": nextTokenImage, "img": nextTokenImage },
        { bloodmanSkipActorImageSync: true }
      ).catch(() => null);
    }

    const worldActor = resolveWorldActorFromTokenDocument(tokenDoc);
    if (!worldActor) return;
    const previousActorImage = previousTokenImage || String(worldActor.img || "").trim();
    const previousPrototypeImage = previousTokenPrototypeImage
      || String(foundry.utils.getProperty(worldActor, "prototypeToken.texture.src") || "").trim();
    await worldActor.update(
      {
        img: nextTokenImage,
        "prototypeToken.texture.src": nextTokenImage,
        "prototypeToken.img": nextTokenImage,
        "token.img": nextTokenImage
      },
      { bloodmanSkipPrototypeImageSync: true, bloodmanSkipSceneTokenImageSync: true }
    ).catch(() => null);
    await syncSceneTokenImagesFromActorImage(worldActor, { previousActorImage, previousPrototypeImage });
    return;
  }

  const actorImageSrc = String(actor.img || "").trim();
  if (actorImageSrc) TOKEN_TEXTURE_VALIDITY_CACHE.delete(actorImageSrc);

  const previousActorImage = String(options?.bloodmanPreviousActorImage || "").trim();
  const previousPrototypeImage = String(
    options?.bloodmanPreviousPrototypeImage
    ?? foundry.utils.getProperty(actor, "prototypeToken.texture.src")
    ?? ""
  ).trim();
  const requestedPrototypeImage = String(
    foundry.utils.getProperty(changes, "prototypeToken.texture.src")
    ?? foundry.utils.getProperty(changes, "prototypeToken.img")
    ?? foundry.utils.getProperty(changes, "token.img")
    ?? ""
  ).trim();
  if (
    requestedPrototypeImage
    && requestedPrototypeImage !== actorImageSrc
    && requestedPrototypeImage !== previousPrototypeImage
  ) {
    return;
  }

  await syncPrototypeTokenImageFromActorImage(actor);
  await syncSceneTokenImagesFromActorImage(actor, { previousActorImage, previousPrototypeImage });
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
  const hasTokenImageChange = foundry.utils.getProperty(changes, "texture.src") != null
    || foundry.utils.getProperty(changes, "img") != null;
  const sourceUserId = String(userId || "");
  const currentUserId = String(game.user?.id || "");
  const isSourceUser = sourceUserId ? sourceUserId === currentUserId : Boolean(game.user?.isGM);
  if (game.user?.isGM && hasTokenImageChange && !options?.bloodmanSkipActorImageSync) {
    await syncActorAndPrototypeImageFromTokenImage(tokenDoc);
  }
  const moveCost = Number(options?.bloodmanMoveCost);
  const startedCombat = getStartedActiveCombat();
  const isCombatMove = startedCombat
    && String(options?.bloodmanMoveCombatId || "") === String(startedCombat.id || "")
    && Boolean(getCombatantForToken(startedCombat, tokenDoc));
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

  async resetMovementGaugeToMax() {
    if (!game.user?.isGM) return false;
    if (!this.actor) return false;
    if (this.actor.type !== "personnage" && this.actor.type !== "personnage-non-joueur") return false;

    const gauge = normalizeActorMoveGauge(this.actor, { initializeWhenMissing: true });
    await setActorMoveGauge(this.actor, gauge.max, gauge.max);
    this.render(false);
    return true;
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
    if (options?.bloodmanResetRerollState === true) {
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
    if (!hasActorUpdatePayload(updateData)) return false;
    if (this.actor?.isOwner || game.user?.isGM) {
      return this.actor.update(updateData, options);
    }
    const sent = requestActorSheetUpdate(this.actor, updateData, {
      allowCharacteristicBase: Boolean(options?.bloodmanAllowCharacteristicBase),
      allowVitalResourceUpdate: Boolean(options?.bloodmanAllowVitalResourceUpdate),
      allowAmmoUpdate: Boolean(options?.bloodmanAllowAmmoUpdate)
    });
    if (!sent) safeWarn("Mise a jour impossible: aucun GM ou assistant actif.");
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
    return sent;
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
    if (!sent) safeWarn("Suppression impossible: aucun GM ou assistant actif.");
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

  getItemListColumnCountFromElement(element) {
    const list = element?.matches?.(".item-list")
      ? element
      : element?.closest?.(".item-list");
    if (!list) return 1;
    if (list.classList?.contains("item-list-three-columns")) return 3;
    if (list.classList?.contains("item-list-two-columns")) return 2;
    const rawColumns = Number(list.dataset?.gridColumns || list.getAttribute?.("data-grid-columns") || 1);
    if (!Number.isFinite(rawColumns)) return 1;
    return Math.max(1, Math.floor(rawColumns));
  }

  getItemReorderPayloadFromEvent(eventLike) {
    const event = eventLike?.originalEvent || eventLike;
    const transfer = event?.dataTransfer;
    if (!transfer) return null;
    const types = Array.from(transfer.types || []);
    if (!types.includes("application/x-bloodman-item-reorder")) return null;
    const rawPayload = transfer.getData("application/x-bloodman-item-reorder");
    if (!rawPayload) return null;
    let parsed = null;
    try {
      parsed = JSON.parse(rawPayload);
    } catch (_error) {
      return null;
    }
    const actorId = String(parsed?.actorId || "").trim();
    const actorUuid = String(parsed?.actorUuid || "").trim();
    const itemId = String(parsed?.itemId || "").trim();
    const itemType = String(parsed?.itemType || "").trim().toLowerCase();
    if (!actorId || !itemId || !itemType) return null;
    return { actorId, actorUuid, itemId, itemType };
  }

  clearItemReorderVisualState(rootLike = null) {
    const root = rootLike?.find ? rootLike : this.element;
    if (!root?.length) return;
    root.find(".item-list.is-reorder-target").removeClass("is-reorder-target");
    root.find(".item.is-reorder-drop-before").removeClass("is-reorder-drop-before");
    root.find(".item.is-reorder-drop-after").removeClass("is-reorder-drop-after");
    root.find(".item.is-reorder-dragging").removeClass("is-reorder-dragging");
  }

  getItemReorderSortBefore(eventLike, targetLi, columns = 1) {
    const event = eventLike?.originalEvent || eventLike;
    const target = targetLi instanceof HTMLElement ? targetLi : null;
    if (!target) return true;
    const rect = target.getBoundingClientRect?.();
    if (!rect || !(rect.width > 0) || !(rect.height > 0)) return true;
    const pointerX = Number(event?.clientX);
    const pointerY = Number(event?.clientY);
    if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY)) return true;
    const midX = rect.left + (rect.width / 2);
    const midY = rect.top + (rect.height / 2);
    if (columns <= 1) return pointerY < midY;

    const distanceX = Math.abs(pointerX - midX) / rect.width;
    const distanceY = Math.abs(pointerY - midY) / rect.height;
    if (distanceX >= distanceY) return pointerX < midX;
    return pointerY < midY;
  }

  buildItemReorderUpdates(sourceItem, targetItem, options = {}) {
    if (!sourceItem || !targetItem || !this.actor) return [];
    const sourceId = String(sourceItem.id || "");
    const targetId = String(targetItem.id || "");
    if (!sourceId || !targetId || sourceId === targetId) return [];
    const sortBefore = options.sortBefore !== false;
    const itemType = String(sourceItem.type || "").trim().toLowerCase();
    if (!itemType || itemType !== String(targetItem.type || "").trim().toLowerCase()) return [];

    if (globalThis.SortingHelpers?.performIntegerSort) {
      try {
        const siblings = this.actor.items
          .filter(entry => (
            entry
            && String(entry.type || "").trim().toLowerCase() === itemType
            && String(entry.id || "") !== sourceId
          ))
          .map(entry => entry.toObject());
        return globalThis.SortingHelpers.performIntegerSort(sourceItem, {
          target: targetItem,
          siblings,
          sortBefore,
          sortKey: "sort"
        });
      } catch (_error) {
        // Fallback below if helper fails in synthetic contexts.
      }
    }

    const ordered = this.actor.items
      .filter(entry => String(entry?.type || "").trim().toLowerCase() === itemType && String(entry?.id || "") !== sourceId)
      .sort((left, right) => {
        const leftSort = toFiniteNumber(left?.sort, 0);
        const rightSort = toFiniteNumber(right?.sort, 0);
        if (leftSort !== rightSort) return leftSort - rightSort;
        return String(left?.id || "").localeCompare(String(right?.id || ""));
      });
    if (!ordered.length) return [];

    let insertIndex = ordered.findIndex(entry => String(entry?.id || "") === targetId);
    if (insertIndex < 0) insertIndex = ordered.length - 1;
    if (!sortBefore) insertIndex += 1;
    insertIndex = Math.max(0, Math.min(insertIndex, ordered.length));

    ordered.splice(insertIndex, 0, sourceItem);
    const sortStep = 1000;
    return ordered
      .map((entry, index) => {
        const normalizedSort = (index + 1) * sortStep;
        const currentSort = Math.floor(toFiniteNumber(entry?.sort, 0));
        if (currentSort === normalizedSort) return null;
        return { _id: String(entry?.id || ""), sort: normalizedSort };
      })
      .filter(Boolean);
  }

  async applyActorItemOrderUpdates(updates = []) {
    if (!this.actor || !Array.isArray(updates) || !updates.length) return false;
    const sanitizedUpdates = updates
      .map(entry => {
        const itemId = String(entry?._id || entry?.id || "").trim();
        if (!itemId) return null;
        const sortValue = Math.max(0, Math.floor(toFiniteNumber(entry?.sort, 0)));
        return { _id: itemId, sort: sortValue };
      })
      .filter(Boolean);
    if (!sanitizedUpdates.length) return false;

    if (this.actor?.isOwner || game.user?.isGM) {
      await this.actor.updateEmbeddedDocuments("Item", sanitizedUpdates);
      return true;
    }
    const sent = requestReorderActorItems(this.actor, sanitizedUpdates);
    if (!sent) safeWarn(tl("BLOODMAN.Notifications.ActorUpdateRequiresGM", "Mise a jour impossible: aucun MJ ou assistant actif."));
    return sent;
  }

  onItemReorderDragStart(eventLike) {
    const event = eventLike?.originalEvent || eventLike;
    const li = event?.currentTarget?.closest?.("li.item[data-item-id]");
    const item = this.getItemFromListElement(li);
    if (!li || !item || !event?.dataTransfer) return;

    const payload = {
      actorId: String(this.actor?.id || ""),
      actorUuid: String(this.actor?.uuid || ""),
      itemId: String(item.id || ""),
      itemType: String(item.type || "").trim().toLowerCase()
    };
    if (!payload.actorId || !payload.itemId || !payload.itemType) return;

    try {
      event.dataTransfer.setData("application/x-bloodman-item-reorder", JSON.stringify(payload));
      event.dataTransfer.effectAllowed = "move";
    } catch (_error) {
      return;
    }
    li.classList.add("is-reorder-dragging");
  }

  onItemReorderDragOver(eventLike) {
    const event = eventLike?.originalEvent || eventLike;
    const payload = this.getItemReorderPayloadFromEvent(event);
    if (!payload) return;
    if (payload.actorId !== String(this.actor?.id || "")) return;

    const list = event?.currentTarget;
    if (!(list instanceof HTMLElement)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";

    this.clearItemReorderVisualState();
    list.classList.add("is-reorder-target");
    const targetLi = event?.target?.closest?.("li.item[data-item-id]");
    if (!targetLi || !list.contains(targetLi)) return;
    const targetItem = this.getItemFromListElement(targetLi);
    if (!targetItem || String(targetItem.type || "").trim().toLowerCase() !== payload.itemType) return;

    const columns = this.getItemListColumnCountFromElement(list);
    const sortBefore = this.getItemReorderSortBefore(event, targetLi, columns);
    targetLi.classList.add(sortBefore ? "is-reorder-drop-before" : "is-reorder-drop-after");
  }

  onItemReorderDragEnd() {
    this.clearItemReorderVisualState();
  }

  onItemReorderDragLeave(eventLike) {
    const event = eventLike?.originalEvent || eventLike;
    const list = event?.currentTarget;
    if (!(list instanceof HTMLElement)) return;
    const relatedTarget = event?.relatedTarget;
    if (relatedTarget instanceof HTMLElement && list.contains(relatedTarget)) return;
    list.classList.remove("is-reorder-target");
    list.querySelectorAll(".is-reorder-drop-before").forEach(node => node.classList.remove("is-reorder-drop-before"));
    list.querySelectorAll(".is-reorder-drop-after").forEach(node => node.classList.remove("is-reorder-drop-after"));
  }

  async onItemReorderDrop(eventLike) {
    const event = eventLike?.originalEvent || eventLike;
    const payload = this.getItemReorderPayloadFromEvent(event);
    if (!payload) return;
    if (payload.actorId !== String(this.actor?.id || "")) return;

    const sourceItem = this.actor?.items?.get(payload.itemId) || null;
    if (!sourceItem) return;

    const list = event?.currentTarget;
    if (!(list instanceof HTMLElement)) return;
    event.preventDefault();
    event.stopPropagation();

    let targetLi = event?.target?.closest?.("li.item[data-item-id]");
    if (!targetLi || !list.contains(targetLi)) targetLi = null;
    let targetItem = targetLi ? this.getItemFromListElement(targetLi) : null;
    let sortBefore = false;

    const sourceType = String(sourceItem.type || "").trim().toLowerCase();
    if (!targetItem || String(targetItem.type || "").trim().toLowerCase() !== sourceType) {
      const fallbackTarget = this.actor.items
        .filter(entry => String(entry?.type || "").trim().toLowerCase() === sourceType && String(entry?.id || "") !== String(sourceItem.id || ""))
        .sort((left, right) => {
          const leftSort = toFiniteNumber(left?.sort, 0);
          const rightSort = toFiniteNumber(right?.sort, 0);
          if (leftSort !== rightSort) return leftSort - rightSort;
          return String(left?.id || "").localeCompare(String(right?.id || ""));
        })
        .at(-1);
      targetItem = fallbackTarget || null;
      sortBefore = false;
    } else {
      const columns = this.getItemListColumnCountFromElement(list);
      sortBefore = this.getItemReorderSortBefore(event, targetLi, columns);
    }
    if (!targetItem || String(targetItem.id || "") === String(sourceItem.id || "")) {
      this.clearItemReorderVisualState();
      return;
    }

    const updates = this.buildItemReorderUpdates(sourceItem, targetItem, { sortBefore });
    if (!updates.length) {
      this.clearItemReorderVisualState();
      return;
    }
    const applied = await this.applyActorItemOrderUpdates(updates);
    this.clearItemReorderVisualState();
    if (applied) this.render(false);
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
    const canResetMoveGauge = Boolean(game.user?.isGM);
    const moveResetLabel = tl("BLOODMAN.Resources.MoveResetAction", "Recharger PM");
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

    const getResourceCharacteristic = key => {
      const base = Number(data.actor.system.characteristics?.[key]?.base || 0);
      const itemBonus = Number(itemBonuses[key] || 0);
      const profileBonus = profileBonusCharacteristic === key && Number.isFinite(profileBonusValue)
        ? profileBonusValue
        : 0;
      return base + itemBonus + profileBonus;
    };
    const phy = getResourceCharacteristic("PHY");
    const esp = getResourceCharacteristic("ESP");
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
      dataItem.showAptitudeUseButton = isPlayerActor;
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
      const ammoStock = consumesAmmo
        ? Math.max(0, ammo.stock)
        : 0;
      const ammoType = consumesAmmo ? normalizeAmmoType(ammo.type) : "";
      const loadedAmmo = usesDirectStock
        ? ammoStock
        : getWeaponLoadedAmmo(item, { fallback: ammo.magazine });
      const magazineMissingAmmo = !usesDirectStock && loadedAmmo < magazineCapacity;
      weapon.magazineCapacity = magazineCapacity;
      weapon.ammoType = ammoType;
      weapon.ammoStock = ammoStock;
      weapon.usesDirectStock = usesDirectStock;
      weapon.ammoCapacityDisplay = usesDirectStock ? ammoStock : magazineCapacity;
      weapon.showAmmoState = consumesAmmo;
      weapon.ammoMagazine = loadedAmmo;
      weapon.showReloadButton = consumesAmmo && !usesDirectStock && ammoStock > 0 && magazineMissingAmmo;
      weapon.reloadBlocked = consumesAmmo && !usesDirectStock && ammoStock <= 0;
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
      canResetMoveGauge,
      moveResetLabel,
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

  resizeAutoGrowTextarea(textarea) {
    if (!textarea || String(textarea.tagName || "").toUpperCase() !== "TEXTAREA") return;
    const computed = window.getComputedStyle ? window.getComputedStyle(textarea) : null;
    const parseMetric = value => {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const fontSize = parseMetric(computed?.fontSize) || 14;
    const computedLineHeight = parseMetric(computed?.lineHeight);
    const lineHeight = computedLineHeight > 0 ? computedLineHeight : Math.ceil(fontSize * 1.35);
    const verticalChrome = parseMetric(computed?.paddingTop)
      + parseMetric(computed?.paddingBottom)
      + parseMetric(computed?.borderTopWidth)
      + parseMetric(computed?.borderBottomWidth);

    const defaultRows = Math.max(1, Math.round(toFiniteNumber(textarea.getAttribute("rows"), 2)));
    const minRows = Math.max(1, Math.round(toFiniteNumber(textarea.dataset?.autogrowMinRows, defaultRows)));
    const maxRows = Math.max(minRows, Math.round(toFiniteNumber(textarea.dataset?.autogrowMaxRows, Math.max(minRows + 2, 10))));
    const minHeight = Math.ceil((minRows * lineHeight) + verticalChrome);
    const maxHeight = Math.ceil((maxRows * lineHeight) + verticalChrome);

    textarea.style.height = "auto";
    const contentHeight = Math.max(minHeight, Math.ceil(Number(textarea.scrollHeight) || 0));
    const nextHeight = Math.min(contentHeight, maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
  }

  refreshAutoGrowTextareas(htmlLike = null) {
    const root = htmlLike?.find ? htmlLike : this.element;
    if (!root?.length) return;
    const fields = root.find("textarea[data-autogrow='true']");
    if (!fields.length) return;
    fields.each((_index, textarea) => {
      this.resizeAutoGrowTextarea(textarea);
    });
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
    const scheduleAutoResize = (force = false) => setTimeout(() => this.autoResizeToContent(force), 0);
    const scheduleAutoGrowRefresh = () => setTimeout(() => this.refreshAutoGrowTextareas(html), 0);

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
    html.find("li.item[data-item-id]").attr("draggable", true);
    this.refreshResourceVisuals(html);
    setTimeout(() => this.refreshResourceVisuals(html), 0);
    this.refreshAutoGrowTextareas(html);
    scheduleAutoGrowRefresh();
    scheduleAutoResize(true);

    html.find(".sheet-tabs .item").on("click", () => {
      scheduleAutoGrowRefresh();
      scheduleAutoResize(true);
    });

    html.on("input change", "textarea[data-autogrow='true']", ev => {
      this.resizeAutoGrowTextarea(ev.currentTarget);
      scheduleAutoResize(true);
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

    html.find(".move-reset-btn").click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      await this.resetMovementGaugeToMax();
    });

    html.find(".weapon-roll").click(ev => {
      const li = ev.currentTarget.closest(".item");
      const item = this.getItemFromListElement(li);
      this.rollDamage(item);
    });

    html.find(".weapon-simple-attack").click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      await this.rollSimpleAttack();
    });

    html.find(".weapon-reload").click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const li = ev.currentTarget.closest(".item");
      const item = this.getItemFromListElement(li);
      await this.reloadWeapon(item);
    });

    html.on("dragstart", "li.item[data-item-id]", ev => {
      this.onItemReorderDragStart(ev);
    });

    html.on("dragover", "ol.item-list", ev => {
      this.onItemReorderDragOver(ev);
    });

    html.on("dragleave", "ol.item-list", ev => {
      this.onItemReorderDragLeave(ev);
    });

    html.on("dragend", "li.item[data-item-id]", () => {
      this.onItemReorderDragEnd();
    });

    html.on("drop", "ol.item-list", async ev => {
      await this.onItemReorderDrop(ev);
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

    html.find(".ability-show-gm").click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const li = ev.currentTarget.closest(".item");
      const item = this.getItemFromListElement(li);
      await this.useAptitude(item);
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

  getDropEntries(dropData) {
    return Array.isArray(dropData?.items) && dropData.items.length
      ? dropData.items
      : [dropData];
  }

  async resolveActorTransferEntries(dropData) {
    const entries = this.getDropEntries(dropData);
    const transfers = [];
    for (const entry of entries) {
      const droppedItem = await Item.implementation.fromDropData(entry).catch(() => null);
      if (!droppedItem) continue;
      const sourceActor = droppedItem.actor;
      if (!sourceActor || sourceActor?.id === this.actor?.id) continue;
      transfers.push({ entry, droppedItem, sourceActor });
    }
    return transfers;
  }

  async applyActorToActorItemTransfer(transferEntries = []) {
    if (!transferEntries.length) return null;
    if (!this.actor) return null;
    const ownerLevel = Number(CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3);
    const canManageTarget = game.user?.isGM
      || this.actor?.isOwner
      || (
        typeof this.actor?.testUserPermission === "function"
        && this.actor.testUserPermission(game.user, ownerLevel, { exact: false })
      );
    if (!canManageTarget) {
      ui.notifications?.warn(t("BLOODMAN.Notifications.DropRequiresLimitedPermission"));
      return null;
    }

    const createdItems = [];
    for (const transfer of transferEntries) {
      const droppedItem = transfer?.droppedItem;
      const sourceActor = transfer?.sourceActor;
      if (!droppedItem || !sourceActor) continue;
      if (sourceActor?.id === this.actor?.id) continue;

      const canManageSource = game.user?.isGM
        || sourceActor?.isOwner
        || droppedItem?.isOwner
        || (
          typeof sourceActor?.testUserPermission === "function"
          && sourceActor.testUserPermission(game.user, ownerLevel, { exact: false })
        );
      if (!canManageSource) {
        ui.notifications?.warn(t("BLOODMAN.Notifications.DropRequiresLimitedPermission"));
        continue;
      }

      const sourceData = foundry.utils.deepClone(droppedItem.toObject());
      delete sourceData._id;

      let createdItem = null;
      try {
        const created = await this.actor.createEmbeddedDocuments("Item", [sourceData]);
        createdItem = created?.[0] || null;
      } catch (error) {
        bmLog.warn("[bloodman] actor transfer:create failed", {
          sourceActorId: sourceActor?.id,
          targetActorId: this.actor?.id,
          itemId: droppedItem?.id,
          error
        });
        continue;
      }
      if (!createdItem) continue;

      try {
        await sourceActor.deleteEmbeddedDocuments("Item", [droppedItem.id]);
      } catch (error) {
        bmLog.warn("[bloodman] actor transfer:delete source failed", {
          sourceActorId: sourceActor?.id,
          targetActorId: this.actor?.id,
          itemId: droppedItem?.id,
          error
        });
        try {
          await this.actor.deleteEmbeddedDocuments("Item", [createdItem.id]);
        } catch (_rollbackError) {
          // Best-effort rollback to avoid accidental duplication when source deletion fails.
        }
        continue;
      }

      createdItems.push(createdItem);
    }

    if (!createdItems.length) return null;
    this.render(false);
    return createdItems.length === 1 ? createdItems[0] : createdItems;
  }

  async resolveDropPermissionState(dropData) {
    if (game.user?.isGM) return { allowed: true };
    const entries = this.getDropEntries(dropData);
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
    const entries = this.getDropEntries(dropData);
    let totalCost = 0;
    let hasInvalidPrice = false;

    for (const entry of entries) {
      const droppedItem = await Item.implementation.fromDropData(entry).catch(() => null);
      if (!droppedItem) continue;
      const sourceActor = droppedItem.actor;
      if (sourceActor?.id === this.actor?.id) continue;
      // Actor-to-actor exchange is a free handoff, not a purchase.
      if (sourceActor) continue;
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

  sanitizeDropDialogText(value, maxLength = 160) {
    const plain = String(value ?? "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!plain) return "";
    const cap = Math.max(20, Math.floor(toFiniteNumber(maxLength, 160)));
    if (plain.length <= cap) return plain;
    return `${plain.slice(0, cap - 3).trim()}...`;
  }

  buildDroppedItemSpecificities(item, options = {}) {
    const details = [];
    if (!item) return details;

    const itemType = String(item.type || "").trim().toLowerCase();
    const quantity = Math.max(1, Math.floor(toFiniteNumber(options.quantity, 1)));
    const priceState = options.priceState || this.getDroppedItemUnitPrice(item);

    const typeLabel = itemType ? t(`TYPES.Item.${itemType}`) : "";
    if (typeLabel && typeLabel !== `TYPES.Item.${itemType}`) {
      details.push(`Type : ${typeLabel}`);
    }
    if (quantity > 1) {
      details.push(`Quantite : ${quantity}`);
    }
    if (priceState?.ok && priceState.value > 0) {
      details.push(`Prix unitaire : ${formatCurrencyValue(priceState.value)}`);
    }
    if (itemType === "arme") {
      const damageDie = normalizeRollDieFormula(item.system?.damageDie, "d4");
      if (damageDie) details.push(`Degats : ${damageDie}`);
      const weaponType = getWeaponCategory(item.system?.weaponType);
      if (weaponType === "distance") details.push("Categorie : Distance");
      if (weaponType === "corps") details.push("Categorie : Corps a corps");
      const magazineCapacity = normalizeNonNegativeInteger(item.system?.magazineCapacity, 0);
      if (magazineCapacity > 0) {
        const loadedAmmo = getWeaponLoadedAmmo(item, { fallback: 0 });
        details.push(`Chargeur : ${loadedAmmo} / ${magazineCapacity}`);
      }
    }
    if (itemType === "soin") {
      const healDie = normalizeRollDieFormula(item.system?.healDie, "d4");
      if (healDie) details.push(`Soin : ${healDie}`);
    }
    if (itemType === "protection") {
      const paValue = Math.max(0, Math.floor(toFiniteNumber(item.system?.pa, 0)));
      details.push(`PA : ${paValue}`);
    }
    const noteText = this.sanitizeDropDialogText(item.system?.note || item.system?.notes || "", 130);
    if (noteText) details.push(`Note : ${noteText}`);

    return details;
  }

  async buildDropDecisionPreview(dropData, purchase = null) {
    const entries = this.getDropEntries(dropData);
    const resolvedItems = [];
    for (const entry of entries) {
      const droppedItem = await Item.implementation.fromDropData(entry).catch(() => null);
      if (!droppedItem) continue;
      const sourceActor = droppedItem.actor;
      if (sourceActor?.id === this.actor?.id) continue;
      const quantity = this.getDropItemQuantity(entry, droppedItem);
      const priceState = this.getDroppedItemUnitPrice(droppedItem);
      resolvedItems.push({ droppedItem, sourceActor, quantity, priceState });
    }
    if (!resolvedItems.length) return null;

    const targetName = String(this.actor?.name || "").trim() || t("BLOODMAN.Common.Name");
    const firstItemName = String(resolvedItems[0]?.droppedItem?.name || "").trim() || t("BLOODMAN.Common.Name");
    const intro = tl(
      "BLOODMAN.Dialogs.DropDecision.Intro",
      "Vous vous appretez a glisser '{item}' sur la fiche de '{sheet}'.",
      {
        item: firstItemName,
        sheet: targetName
      }
    );
    const question = tl(
      "BLOODMAN.Dialogs.DropDecision.Question",
      "Voulez-vous deplacer cet objet gratuitement ?"
    );
    const costLabel = tl("BLOODMAN.Dialogs.DropDecision.CostLabel", "Cout");
    const specificsLabel = tl("BLOODMAN.Dialogs.DropDecision.SpecificitiesLabel", "Specificites");

    const specificities = [];
    for (const itemContext of resolvedItems.slice(0, 4)) {
      const itemName = String(itemContext?.droppedItem?.name || "").trim() || t("BLOODMAN.Common.Name");
      const itemDetails = this.buildDroppedItemSpecificities(itemContext.droppedItem, {
        quantity: itemContext.quantity,
        priceState: itemContext.priceState
      });
      if (resolvedItems.length > 1) {
        specificities.push(`${itemName} :`);
        specificities.push(...itemDetails.map(detail => `- ${detail}`));
      } else {
        specificities.push(...itemDetails);
      }
    }
    if (resolvedItems.length > 4) {
      specificities.push(tl(
        "BLOODMAN.Dialogs.DropDecision.MoreItems",
        "+ {count} objet(s) supplementaire(s).",
        { count: resolvedItems.length - 4 }
      ));
    }
    if (!specificities.length) {
      specificities.push(tl("BLOODMAN.Dialogs.DropDecision.NoSpecificities", "Aucune specificite disponible."));
    }

    const totalCost = roundCurrencyValue(Number(purchase?.totalCost || 0));
    return {
      intro,
      question,
      costLabel,
      specificsLabel,
      firstItemName,
      targetName,
      specificities,
      totalCost,
      hasInvalidPrice: Boolean(purchase?.hasInvalidPrice)
    };
  }

  async promptDropDecision(preview) {
    if (!preview || typeof Dialog !== "function") return "fermer";
    const escapeHtml = value => (
      foundry.utils?.escapeHTML
        ? foundry.utils.escapeHTML(String(value ?? ""))
        : String(value ?? "")
    );
    const eyebrow = tl(
      "BLOODMAN.Dialogs.DropDecision.Eyebrow",
      "Deplacement d'objet"
    );
    const title = tl("BLOODMAN.Dialogs.DropDecision.Title", "Transfert d'objet");
    const details = `${preview.costLabel}: ${formatCurrencyValue(preview.totalCost)}`;
    const specificsMarkup = preview.specificities
      .map(line => `<li>${escapeHtml(line)}</li>`)
      .join("");
    const content = `<form class="bm-drop-insufficient-funds">
      <div class="bm-drop-insufficient-shell">
        <div class="bm-drop-insufficient-head">
          <div class="bm-drop-insufficient-icon-wrap" aria-hidden="true">
            <div class="bm-drop-insufficient-icon-ring"><i class="fa-solid fa-triangle-exclamation"></i></div>
          </div>
          <div class="bm-drop-insufficient-head-copy">
            <p class="bm-drop-insufficient-eyebrow">${escapeHtml(eyebrow)}</p>
            <p class="bm-drop-insufficient-intro">${escapeHtml(preview.intro)}</p>
            <p class="bm-drop-insufficient-prompt">${escapeHtml(preview.question)}</p>
          </div>
        </div>
        <p class="bm-drop-insufficient-details">${escapeHtml(details)}</p>
        <p class="bm-drop-insufficient-specificities-title">${escapeHtml(preview.specificsLabel)}</p>
        <ul class="bm-drop-insufficient-specificities">${specificsMarkup}</ul>
      </div>
    </form>`;

    return new Promise(resolve => {
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        resolve(String(value || "fermer"));
      };

      new Dialog(
        {
          title,
          content,
          buttons: {
            buy: {
              label: tl("BLOODMAN.Dialogs.DropDecision.ActionBuy", "Achat"),
              callback: () => finish("achat")
            },
            free: {
              label: tl("BLOODMAN.Dialogs.DropDecision.ActionFree", "Deplacer gratuitement"),
              callback: () => finish("deplacer_gratuitement")
            },
            close: {
              label: tl("BLOODMAN.Dialogs.DropDecision.ActionClose", "Fermer"),
              callback: () => finish("fermer")
            }
          },
          default: "close",
          close: () => finish("fermer")
        },
        {
          classes: ["bloodman-insufficient-funds-dialog", "bloodman-drop-decision-dialog"],
          width: 560
        }
      ).render(true);
    });
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
    const preview = await this.buildDropDecisionPreview(data, purchase);
    if (!preview) {
      return super._onDropItem(event, data);
    }
    const selectedAction = await this.promptDropDecision(preview);
    if (selectedAction === "fermer") return null;

    let previousCurrency = null;
    let deductedBeforeDrop = false;
    const shouldBuy = selectedAction === "achat";
    if (shouldBuy) {
      if (purchase.hasInvalidPrice) {
        ui.notifications?.warn(t("BLOODMAN.Notifications.InvalidPurchasePrice"));
        return null;
      }
      previousCurrency = this.getActorCurrencyCurrentValue();
      if (previousCurrency + 0.000001 < purchase.totalCost) {
        ui.notifications?.warn(t("BLOODMAN.Notifications.NotEnoughCurrency", {
          cost: formatCurrencyValue(purchase.totalCost),
          current: formatCurrencyValue(previousCurrency)
        }));
        return null;
      }
      if (purchase.totalCost > 0) {
        const nextCurrency = roundCurrencyValue(previousCurrency - purchase.totalCost);
        await this.applyActorUpdate({ "system.equipment.monnaiesActuel": nextCurrency });
        deductedBeforeDrop = true;
      }
    }

    const dropEntries = this.getDropEntries(data);
    const actorTransferEntries = await this.resolveActorTransferEntries(data);
    const hasOnlyActorTransfers = actorTransferEntries.length > 0 && actorTransferEntries.length === dropEntries.length;

    try {
      const dropped = hasOnlyActorTransfers
        ? await this.applyActorToActorItemTransfer(actorTransferEntries)
        : await super._onDropItem(event, data);
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
    const entries = this.getDropEntries(data);
    let incomingCarriedItemCount = 0;
    for (const entry of entries) {
      const droppedItem = await Item.implementation.fromDropData(entry).catch(() => null);
      if (!droppedItem || !CARRIED_ITEM_TYPES.has(droppedItem.type)) continue;
      const sourceActor = droppedItem.actor;
      if (sourceActor?.id === this.actor.id) continue;
      incomingCarriedItemCount += 1;
    }
    if (incomingCarriedItemCount <= 0) return false;

    const carriedCount = this.actor.items.filter(item => CARRIED_ITEM_TYPES.has(item.type)).length;
    const carriedItemsLimit = getActorCarriedItemsLimit(this.actor);
    if ((carriedCount + incomingCarriedItemCount) <= carriedItemsLimit) return false;

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
      bmLog.warn("[bloodman] luck:dice3d feedback failed", error);
    }
    const diceSound = String(CONFIG?.sounds?.dice || "").trim();

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content,
      flags: buildChatRollFlags(CHAT_ROLL_TYPES.LUCK, {
        luckRoll: {
          chance: chanceValue,
          roll: luckValue,
          outcome
        }
      }),
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

      const resourceUpdated = await this.applyActorUpdate({ "system.resources.pp.current": Math.max(0, currentPP - CHARACTERISTIC_REROLL_PP_COST) }, {
        bloodmanAllowVitalResourceUpdate: true
      });
      if (!resourceUpdated) return;
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
      capacity
    });
    const ammoStock = Math.max(0, ammoState.stock);
    const currentMagazine = getWeaponLoadedAmmo(item, { fallback: ammoState.magazine });
    const targetCapacity = capacity > 0 ? capacity : (currentMagazine + ammoStock);
    const needed = Math.max(0, targetCapacity - currentMagazine);
    if (needed <= 0) return;
    if (ammoStock <= 0) {
      ui.notifications?.warn(t("BLOODMAN.Notifications.NoAmmo"));
      return;
    }

    const transferred = Math.min(needed, ammoStock);
    const nextStock = Math.max(0, ammoStock - transferred);
    const nextMagazine = capacity > 0
      ? Math.min(capacity, currentMagazine + transferred)
      : Math.max(0, currentMagazine + transferred);

    try {
      await this.applyActorUpdate(
        {
          "system.ammo.stock": nextStock,
          "system.ammo.value": nextStock
        },
        { bloodmanAllowAmmoUpdate: true }
      );
      await item.update({ "system.loadedAmmo": nextMagazine });
    } catch (error) {
      bmLog.warn("[bloodman] weapon reload: loaded ammo update failed", {
        actorId: this.actor?.id,
        itemId: item?.id,
        nextStock,
        nextMagazine,
        error
      });
      safeWarn(tl("BLOODMAN.Notifications.ActorUpdateRequiresGM", "Mise a jour impossible: aucun MJ ou assistant actif."));
    }
    this.render(false);
  }

  async rollSimpleAttack() {
    if (!this.actor) return;
    const sourceName = tl("BLOODMAN.Common.SimpleAttack", "Attaque simple");
    const damageDialog = {
      variant: "simple-attack",
      rememberConfig: false
    };
    if (!game.user?.isGM) {
      damageDialog.fixedFormula = "1d4";
      damageDialog.lockFormula = true;
    }
    const result = await doDirectDamageRoll(this.actor, "1d4", sourceName, {
      itemType: "arme",
      itemName: sourceName,
      damageDialog
    });
    if (!result) return;
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
    const includeRequesterUser = game.user?.isGM;
    emitPowerUsePopup(this.actor, item, {
      fromUseButton: true,
      includeRequesterUser
    });
    this.render(false);
  }

  async useAptitude(item) {
    if (!item || item.type !== "aptitude") return;
    const includeRequesterUser = game.user?.isGM;
    emitPowerUsePopup(this.actor, item, {
      fromUseButton: true,
      includeRequesterUser
    });
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
          flavor: t("BLOODMAN.Rolls.Heal.Gain", { name: this.actor.name, amount: roll.total }),
          flags: buildChatRollFlags(CHAT_ROLL_TYPES.HEAL)
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
      const resourceUpdated = await this.applyActorUpdate({ "system.resources.pp.current": Math.max(0, currentPP - CHARACTERISTIC_REROLL_PP_COST) }, {
        bloodmanAllowVitalResourceUpdate: true
      });
      if (!resourceUpdated) return;
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
      })}<br><small>${damageLabel} + ${context.bonusBrut} | PEN ${context.penetration}${modeTag ? ` | ${modeTag}` : ""} | ${t("BLOODMAN.Common.Reroll")}</small>`,
      flags: buildChatRollFlags(CHAT_ROLL_TYPES.DAMAGE)
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
      if (ENABLE_CHAT_TRANSPORT_FALLBACK && gmIds.length) {
        await ChatMessage.create({
          content: REROLL_REQUEST_CHAT_MARKUP,
          whisper: gmIds,
          flags: { bloodman: { rerollDamageRequest: rerollPayload } }
        }).catch(() => null);
      }
      bmLog.debug("reroll:send", {
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
        flavor: t("BLOODMAN.Rolls.Heal.Gain", { name: this.actor.name, amount: roll.total }),
        flags: buildChatRollFlags(CHAT_ROLL_TYPES.HEAL)
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
    const rollTotal = Number(roll.total || 0);
    const success = rollTotal > effective;
    const characteristicLabelKey = CHARACTERISTICS.find(c => c.key === key)?.labelKey || "";
    const characteristicLabel = characteristicLabelKey ? t(characteristicLabelKey) : key;
    const outcome = t(success ? "BLOODMAN.Rolls.Success" : "BLOODMAN.Rolls.Failure");
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
      flavor: `<b>${outcome}</b> - ${characteristicLabel}<br>${rollTotal}`,
      flags: buildChatRollFlags(CHAT_ROLL_TYPES.EXPERIENCE)
    });
    this.render(false);
  }

  promptGrowthRoll(key) {
    if (this.actor.type !== "personnage") return;
    const labelKey = CHARACTERISTICS.find(c => c.key === key)?.labelKey || "";
    const label = labelKey ? t(labelKey) : key;
    const escapeHtml = value => (
      foundry.utils?.escapeHTML
        ? foundry.utils.escapeHTML(String(value ?? ""))
        : String(value ?? "")
    );
    const fallbackPrompt = `Lancer un jet d'experience pour ${label} ?`;
    const localizedPrompt = tl("BLOODMAN.Dialogs.Growth.Prompt", fallbackPrompt, { label });
    const promptText = String(localizedPrompt || fallbackPrompt)
      .replace(/<\/?strong>/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    const content = `<form class="bm-growth-dialog">
      <div class="bm-growth-shell">
        <div class="bm-growth-head">
          <div class="bm-growth-icon-wrap" aria-hidden="true">
            <div class="bm-growth-icon-ring"><i class="fa-solid fa-arrow-trend-up"></i></div>
          </div>
          <div class="bm-growth-head-copy">
            <p class="bm-growth-eyebrow">${escapeHtml(tl("BLOODMAN.Chat.RollTypes.Experience", "Experience"))}</p>
            <p class="bm-growth-prompt">${escapeHtml(promptText)}</p>
          </div>
        </div>
      </div>
    </form>`;
    new Dialog(
      {
        title: t("BLOODMAN.Dialogs.Growth.Title"),
        content,
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
      },
      {
        classes: ["bloodman-growth-dialog"],
        width: 430
      }
    ).render(true);
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
      const magazineCapacity = normalizeNonNegativeInteger(this.item.system?.magazineCapacity, 0);
      const consumesAmmo = weaponType === "distance" && !toCheckboxBoolean(this.item.system?.infiniteAmmo, false);
      const loadedAmmo = normalizeWeaponLoadedAmmoValue(this.item.system?.loadedAmmo, 0, consumesAmmo ? magazineCapacity : 0);
      data.weaponTypeDistance = weaponType === "distance";
      data.weaponTypeMelee = weaponType === "corps";
      // Weapons predate the damageEnabled flag; treat missing as enabled for backward compatibility.
      data.weaponDamageEnabled = this.item.system?.damageEnabled !== false;
      data.item.system.magazineCapacity = magazineCapacity;
      data.item.system.loadedAmmo = loadedAmmo;
      data.weaponUsesAmmo = consumesAmmo;
      data.weaponUsesMagazine = consumesAmmo && magazineCapacity > 0;
      data.canEditMagazineCapacity = isAssistantOrHigherRole(game.user?.role);
    }
    if (isVoyageXPCostItemType(this.item.type)) {
      if (!data.item.system) data.item.system = {};
      data.item.system.xpVoyageCost = normalizeNonNegativeInteger(this.item.system?.xpVoyageCost, 0);
    }
    if (this.item.type === "pouvoir") {
      if (!data.item.system) data.item.system = {};
      data.item.system.usableEnabled = isPowerUsableEnabled(this.item.system?.usableEnabled);
    }
    const supportsCharacteristicBonuses = CHARACTERISTIC_BONUS_ITEM_TYPES.has(this.item.type);
    const supportsPaBonus = PA_BONUS_ITEM_TYPES.has(this.item.type);
    if (supportsCharacteristicBonuses || supportsPaBonus) {
      if (!data.item.system) data.item.system = {};
      if (this.item.type === "objet" || this.item.type === "protection") {
        const defaultUseEnabled = this.item.type === "protection";
        data.item.system.useEnabled = toCheckboxBoolean(this.item.system?.useEnabled, defaultUseEnabled);
      }
      if (supportsCharacteristicBonuses) {
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
      if (supportsPaBonus) {
        data.item.system.pa = toFiniteNumber(this.item.system?.pa, 0);
      }
      const currentError = String(this.item.system?.erreur ?? "").trim();
      data.item.system.erreur = currentError || null;
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
