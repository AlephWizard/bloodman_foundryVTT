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
import {
  compatFromUuid,
  compatFromUuidSync,
  compatGetDocumentClass,
  foundryVersion,
  getFoundryGeneration,
  getDragEventData,
  hasSocket,
  socketEmit,
  socketOn,
  socketOff
} from "./src/compat/index.mjs";
import {
  registerBloodmanMigrationSettings,
  runBloodmanMigrations
} from "./src/migrations/index.mjs";
import { buildCanvasReadyHooks } from "./src/hooks/canvas-ready.mjs";
import { buildItemDerivedSyncHooks } from "./src/hooks/item-derived-sync.mjs";
import { buildActorUpdateHooks } from "./src/hooks/actor-update.mjs";
import { buildActorPreUpdateHooks } from "./src/hooks/actor-pre-update.mjs";
import { buildActorUpdateSanitizer } from "./src/hooks/actor-update-sanitize.mjs";
import { buildActorSocketRequestHandlers } from "./src/hooks/actor-socket-requests.mjs";
import { buildActorSocketRequestClient } from "./src/hooks/actor-socket-request-client.mjs";
import { buildSystemSocketHooks } from "./src/hooks/system-socket.mjs";
import { buildDamageRerollHooks } from "./src/hooks/damage-reroll.mjs";
import { buildDamageRequestHooks } from "./src/hooks/damage-request.mjs";
import { buildDamageAppliedMessageHelpers } from "./src/hooks/damage-applied-message.mjs";
import { buildInitiativeGroupingHooks } from "./src/hooks/initiative-grouping.mjs";
import { buildDamageConfigPopupHooks } from "./src/hooks/damage-config-popup.mjs";
import { buildPowerUsePopupHooks } from "./src/hooks/power-use-popup.mjs";
import { buildChatRelayHelpers } from "./src/hooks/chat-relay.mjs";
import { buildChatRollDecorationHooks } from "./src/hooks/chat-roll-decoration.mjs";
import { buildChatMessageRoutingHooks } from "./src/hooks/chat-message-routing.mjs";
import { buildTokenCombatHooks } from "./src/hooks/token-combat.mjs";
import {
  toFiniteNumber as ruleToFiniteNumber,
  normalizeCharacteristicKey as ruleNormalizeCharacteristicKey,
  normalizeArchetypeBonusValue as ruleNormalizeArchetypeBonusValue,
  computeArchetypeCharacteristicBonus as ruleComputeArchetypeCharacteristicBonus,
  computeDerivedPvMax,
  computeItemCharacteristicBonusTotals,
  computeNormalizedMoveGauge,
  computeItemResourceBonusTotals,
  computeItemResourceBonusUpdateData,
  computeResourceCharacteristicEffectiveScores,
  computeDerivedResourceSyncUpdateData
} from "./src/rules/derived-resources.mjs";
import { buildMovementCombatRules } from "./src/rules/movement-combat.mjs";
import {
  hasActorUpdatePayload,
  normalizeVitalResourceValue as normalizeRuleVitalResourceValue
} from "./src/rules/actor-requests.mjs";
import { buildSocketActorResolutionHelpers } from "./src/rules/socket-actor-resolution.mjs";
import { createRequestRetentionTracker } from "./src/rules/request-dedupe.mjs";
import { buildDamageTargetResolution } from "./src/rules/damage-target-resolution.mjs";
import { buildDamageRerollUtils } from "./src/rules/damage-reroll-utils.mjs";
import { buildDamageCurrentHelpers } from "./src/rules/damage-current.mjs";
import { getDamagePayloadField, toBooleanFlag } from "./src/rules/damage-payload-fields.mjs";
import { normalizeRollDieFormula } from "./src/rules/roll-formula.mjs";
import { buildPowerCostRules } from "./src/rules/power-cost.mjs";
import { createItemPriceRules } from "./src/rules/item-price.mjs";
import { createWeaponAmmoRules } from "./src/rules/weapon-ammo.mjs";
import { createWeaponReloadRules } from "./src/rules/weapon-reload.mjs";
import { createItemAudioRules } from "./src/rules/item-audio.mjs";
import { createItemModifierRules } from "./src/rules/item-modifiers.mjs";
import { createEquipmentCurrencyRules } from "./src/rules/equipment-currency.mjs";
import { createAmmoStateRules } from "./src/rules/ammo-state.mjs";
import { createDefaultDataBuilders } from "./src/rules/default-data.mjs";
import { createUpdatePathHelpers } from "./src/rules/update-paths.mjs";
import { createResourceGaugeRules } from "./src/rules/resource-gauge.mjs";
import { createStatePresetRules } from "./src/rules/state-presets.mjs";
import { createItemBucketRules } from "./src/rules/item-buckets.mjs";
import { createItemAudioPlaybackRules } from "./src/rules/item-audio-playback.mjs";
import { createItemTypeFlagRules } from "./src/rules/item-type-flags.mjs";
import { validateNumericEquality as ruleValidateNumericEquality, createNumericValidationLogger } from "./src/rules/numeric-validation.mjs";
import { createDropDecisionRules } from "./src/rules/drop-decision.mjs";
import { createDropEvaluationRules } from "./src/rules/drop-evaluation.mjs";
import { createActorItemTransferRules } from "./src/rules/actor-item-transfer.mjs";
import { createDropFlowRules } from "./src/rules/drop-flow.mjs";
import { createCharacteristicRerollRules } from "./src/rules/characteristic-reroll.mjs";
import { createItemRerollFlowRules } from "./src/rules/item-reroll-flow.mjs";
import { createItemRerollExecutionRules } from "./src/rules/item-reroll-execution.mjs";
import { createItemUseFlowRules } from "./src/rules/item-use-flow.mjs";
import { createGrowthRollRules } from "./src/rules/growth-roll.mjs";
import { createUiRefreshQueueRules } from "./src/rules/ui-refresh-queue.mjs";
import { createActorSheetLayoutRules } from "./src/ui/actor-sheet-layout.mjs";
import { createItemSheetPricePreviewRules } from "./src/ui/item-sheet-price-preview.mjs";
import {
  parseLooseNumericInput as ruleParseLooseNumericInput,
  parseSimpleArithmeticInput as ruleParseSimpleArithmeticInput,
  normalizeSignedModifierInput as ruleNormalizeSignedModifierInput,
  buildItemModifierErrorMessage as ruleBuildItemModifierErrorMessage
} from "./src/rules/numeric-input.mjs";
import {
  planActorUpdateRestrictionByRole,
} from "./src/rules/actor-updates.mjs";

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

function getNpcDeadStatusFamilyIds(deadEffect = null) {
  const defeatedRaw = String(CONFIG.specialStatusEffects?.DEFEATED || "").trim();
  const deadCandidates = defeatedRaw
    ? [defeatedRaw, ...NPC_ZERO_PV_STATUS_CANDIDATES]
    : [...NPC_ZERO_PV_STATUS_CANDIDATES];
  return buildStatusFamilyIds(deadEffect || getDeadStatusEffect(), deadCandidates);
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
  if (!Number.isFinite(numeric)) return true;
  return Math.abs(numeric) < 0.0001;
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

  const bleedingFamily = buildStatusFamilyIds(bleeding, PLAYER_ZERO_PV_STATUS_CANDIDATES);
  const deadFamily = getNpcDeadStatusFamilyIds(dead);

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

async function syncNpcDeadStatusToZeroPvForToken(tokenDoc, actorType = "") {
  if (!tokenDoc) return false;
  const resolvedActorType = String(actorType || getTokenActorType(tokenDoc) || "").trim();
  if (resolvedActorType !== "personnage-non-joueur") return false;

  const deadFamily = getNpcDeadStatusFamilyIds();
  if (!deadFamily.length || !tokenHasStatusInFamily(tokenDoc, deadFamily)) return false;
  const pvCurrent = getTokenCurrentPv(tokenDoc);
  if (!Number.isFinite(pvCurrent) || pvCurrent <= 0) return false;

  try {
    if (tokenDoc.actorLink === true) {
      const actor = tokenDoc.actor || (tokenDoc.actorId ? game.actors?.get(tokenDoc.actorId) : null);
      if (!actor?.update) return false;
      await actor.update({ "system.resources.pv.current": 0 });
    } else {
      await tokenDoc.update({ "delta.system.resources.pv.current": 0 });
    }
  } catch (error) {
    bmLog.warn("[bloodman] npc dead status HP sync failed", {
      tokenId: tokenDoc.id,
      actorType: resolvedActorType,
      error
    });
    return false;
  }

  await syncZeroPvStatusForToken(tokenDoc, resolvedActorType, 0);
  return true;
}

async function syncNpcDeadStatusToZeroPvFromActiveEffect(effectDoc) {
  if (!game.user?.isGM || !effectDoc) return false;
  const actor = effectDoc.parent && String(effectDoc.parent.documentName || "") === "Actor"
    ? effectDoc.parent
    : null;
  if (!actor || actor.type !== "personnage-non-joueur") return false;

  if (actor.isToken) {
    const tokenDoc = actor.token || actor.parent || null;
    if (!tokenDoc) return false;
    return syncNpcDeadStatusToZeroPvForToken(tokenDoc, actor.type);
  }

  const deadFamily = getNpcDeadStatusFamilyIds();
  if (!deadFamily.length || !actorHasStatusInFamily(actor, deadFamily)) return false;
  const pvCurrent = Number(actor.system?.resources?.pv?.current);
  if (!Number.isFinite(pvCurrent) || pvCurrent <= 0) return false;
  await actor.update({ "system.resources.pv.current": 0 });
  await syncZeroPvStatusForActor(actor);
  return true;
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
const statePresetRules = createStatePresetRules({
  statePresets: STATE_PRESETS,
  statePresetById: STATE_PRESET_BY_ID,
  statePresetOrder: STATE_PRESET_ORDER,
  characteristics: CHARACTERISTICS,
  toFiniteNumber,
  setProperty: foundry.utils.setProperty,
  translate: t,
  translateWithFallback: tl
});
const {
  buildStatePresetLabelFromIds,
  resolveStatePresetSelection,
  buildStateModifierUpdateFromLabel,
  applyStateModifierUpdateToData,
  buildStatePresetModifierLabel,
  buildStatePresetTooltip,
  buildStatePresetDisplayData,
  buildInvalidStatePresetMessage
} = statePresetRules;

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
const ITEM_RESOURCE_BONUS_ITEM_TYPES = new Set(["aptitude", "pouvoir"]);
const PA_BONUS_ITEM_TYPES = new Set(["protection", "aptitude", "pouvoir"]);
const VOYAGE_XP_COST_ITEM_TYPES = new Set(["aptitude", "pouvoir"]);
const VOYAGE_XP_SKIP_CREATE_OPTION = "bloodmanSkipVoyageXPCost";
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
const VITAL_RESOURCE_PATH_LIST = Array.from(VITAL_RESOURCE_PATHS);
const VITAL_RESOURCE_INPUT_SELECTOR = VITAL_RESOURCE_PATH_LIST
  .map(path => `input[name='${path}']`)
  .join(", ");
const AMMO_UPDATE_PATHS = [
  "system.ammo",
  "system.ammo.type",
  "system.ammo.stock",
  "system.ammo.magazine",
  "system.ammo.value"
];

const itemTypeFlagRules = createItemTypeFlagRules({
  damageRerollAllowedItemTypes: DAMAGE_REROLL_ALLOWED_ITEM_TYPES,
  voyageXpCostItemTypes: VOYAGE_XP_COST_ITEM_TYPES,
  carriedItemLimitActorTypes: CARRIED_ITEM_LIMIT_ACTOR_TYPES,
  carriedItemLimitBase: CARRIED_ITEM_LIMIT_BASE,
  carriedItemLimitWithBag: CARRIED_ITEM_LIMIT_WITH_BAG
});
const {
  isDamageRerollItemType,
  isVoyageXPCostItemType,
  isCarriedItemLimitedActorType,
  isBagSlotsEnabled,
  getActorCarriedItemsLimit
} = itemTypeFlagRules;

const validateNumericEquality = ruleValidateNumericEquality;
const numericValidationLogger = createNumericValidationLogger({
  debug: (...args) => bmLog.debug(...args),
  warn: (...args) => bmLog.warn(...args)
});
const { logNumericValidation: logDamageRerollValidation } = numericValidationLogger;
const DAMAGE_REQUEST_RETENTION_MS = 2 * 60 * 1000;
const ENABLE_CHAT_TRANSPORT_FALLBACK = false;
const CHAOS_REQUEST_CHAT_MARKUP = "<span style='display:none'>bloodman-chaos-request</span>";
const REROLL_REQUEST_CHAT_MARKUP = "<span style='display:none'>bloodman-reroll-request</span>";
const INITIATIVE_GROUP_BUFFER_MS = 180;
const TOKEN_MOVE_LIMIT_EPSILON = 0.0001;
let LAST_COMBAT_MOVE_RESET_KEY = "";
let LAST_COMBAT_MOVE_HISTORY_RESET_KEY = "";
let LAST_TOKEN_HUD_COUNTER_TICK_KEY = "";
function resetCombatRuntimeKeys() {
  LAST_COMBAT_MOVE_RESET_KEY = "";
  LAST_COMBAT_MOVE_HISTORY_RESET_KEY = "";
  LAST_TOKEN_HUD_COUNTER_TICK_KEY = "";
}
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
  return ruleToFiniteNumber(value, fallback);
}

function normalizeNonNegativeInteger(value, fallback = 0) {
  return Math.max(0, Math.floor(toFiniteNumber(value, fallback)));
}

const parseLooseNumericInput = ruleParseLooseNumericInput;
const parseSimpleArithmeticInput = ruleParseSimpleArithmeticInput;
const normalizeSignedModifierInput = (rawValue, fallback = 0) => (
  ruleNormalizeSignedModifierInput(rawValue, fallback, toFiniteNumber, parseLooseNumericInput)
);
const buildItemModifierErrorMessage = ruleBuildItemModifierErrorMessage;
const updatePathHelpers = createUpdatePathHelpers({
  getProperty: foundry.utils.getProperty
});
const { hasUpdatePath, getUpdatedPathValue } = updatePathHelpers;
const defaultDataBuilders = createDefaultDataBuilders({
  characteristics: CHARACTERISTICS
});
const {
  buildDefaultCharacteristics,
  buildDefaultModifiers,
  buildDefaultResources,
  buildDefaultProfile,
  buildDefaultEquipment
} = defaultDataBuilders;

const equipmentCurrencyRules = createEquipmentCurrencyRules({
  parseSimpleArithmeticInput,
  toFiniteNumber,
  currencyCurrentMax: CURRENCY_CURRENT_MAX,
  hasUpdatePath,
  getUpdatedPathValue,
  buildDefaultEquipment,
  mergeObject: foundry.utils.mergeObject,
  setProperty: foundry.utils.setProperty,
  translate: t
});
const {
  roundCurrencyValue,
  normalizeCurrencyCurrentValue,
  formatCurrencyValue,
  buildInvalidCurrencyCurrentMessage,
  normalizeActorEquipmentCurrencyUpdateData
} = equipmentCurrencyRules;

const resourceGaugeRules = createResourceGaugeRules({
  toFiniteNumber
});
const { resolveResourceGaugeState, applyResourceGaugeState } = resourceGaugeRules;

const itemBucketRules = createItemBucketRules({
  itemBucketTypes: ITEM_BUCKET_TYPES,
  carriedItemTypes: CARRIED_ITEM_TYPES
});
const { buildTypedItemBuckets, getActorItemCounts } = itemBucketRules;

function waitMs(ms) {
  const delay = Math.max(0, Math.floor(toFiniteNumber(ms, 0)));
  if (!delay) return Promise.resolve();
  return new Promise(resolve => setTimeout(resolve, delay));
}

function queueUiMicrotask(callback) {
  if (typeof callback !== "function") return null;
  return setTimeout(() => {
    try {
      callback();
    } catch (error) {
      bmLog.warn("ui microtask failed", { error });
    }
  }, 0);
}

function clearUiMicrotask(taskId) {
  if (taskId == null) return;
  clearTimeout(taskId);
}

const itemAudioRules = createItemAudioRules({
  audioEnabledItemTypes: AUDIO_ENABLED_ITEM_TYPES,
  audioFileExtensionPattern: AUDIO_FILE_EXTENSION_PATTERN,
  getProperty: foundry.utils.getProperty,
  setProperty: foundry.utils.setProperty,
  translate: t
});
const {
  isAudioEnabledItemType,
  normalizeItemAudioFile,
  getItemAudioName,
  normalizeItemAudioUpdate
} = itemAudioRules;

const itemPriceRules = createItemPriceRules({
  priceItemTypes: PRICE_ITEM_TYPES,
  getProperty: foundry.utils.getProperty,
  setProperty: foundry.utils.setProperty,
  translate: t
});
const {
  isPriceManagedItemType,
  resolveItemPricePreviewState,
  resolveItemSalePriceState,
  isItemSalePriceManual,
  normalizeItemPriceUpdate
} = itemPriceRules;
const itemSheetPricePreviewRules = createItemSheetPricePreviewRules({
  resolveItemPricePreviewState,
  isItemSalePriceManual
});
const {
  resolveSaleManualFlag: resolveItemSaleManualFlag,
  resolveItemPricePreviewUiState
} = itemSheetPricePreviewRules;
const uiRefreshQueueRules = createUiRefreshQueueRules();
const {
  mergeDeferredForce,
  resolveDeferredRoot
} = uiRefreshQueueRules;
const actorSheetLayoutRules = createActorSheetLayoutRules({ toFiniteNumber });
const {
  resolveAutoResizeKey: resolveActorSheetAutoResizeKey,
  resolveTextareaAutoGrowState,
  resolveSheetWindowTargetHeight
} = actorSheetLayoutRules;

const weaponAmmoRules = createWeaponAmmoRules({
  normalizeNonNegativeInteger,
  normalizeWeaponType,
  toCheckboxBoolean,
  getWeaponCategory,
  getProperty: foundry.utils.getProperty,
  setProperty: foundry.utils.setProperty
});
const {
  normalizeWeaponLoadedAmmoValue,
  getWeaponLoadedAmmo,
  normalizeWeaponMagazineCapacityUpdate
} = weaponAmmoRules;

const itemModifierRules = createItemModifierRules({
  characteristicBonusItemTypes: CHARACTERISTIC_BONUS_ITEM_TYPES,
  paBonusItemTypes: PA_BONUS_ITEM_TYPES,
  characteristics: CHARACTERISTICS,
  toCheckboxBoolean,
  normalizeSignedModifierInput,
  buildItemModifierErrorMessage,
  deepClone: foundry.utils.deepClone,
  expandObject: foundry.utils.expandObject,
  mergeObject: foundry.utils.mergeObject,
  getProperty: foundry.utils.getProperty,
  setProperty: foundry.utils.setProperty
});
const { normalizeCharacteristicBonusItemUpdate } = itemModifierRules;

const itemAudioPlaybackRules = createItemAudioPlaybackRules({
  isAudioEnabledItemType,
  normalizeItemAudioFile,
  getItemAudioName,
  waitMs,
  translate: t,
  notifyError: message => ui.notifications?.error(message),
  getPlayAudio: () => (typeof AudioHelper?.play === "function" ? (...args) => AudioHelper.play(...args) : null),
  logError: (...args) => bmLog.error(...args),
  defaultDelayMs: ITEM_AUDIO_POST_ROLL_DELAY_MS
});
const { playItemAudio } = itemAudioPlaybackRules;

const dropDecisionRules = createDropDecisionRules({
  parseLooseNumericInput,
  roundCurrencyValue,
  formatCurrencyValue,
  toFiniteNumber,
  normalizeRollDieFormula,
  getWeaponCategory,
  normalizeNonNegativeInteger,
  getWeaponLoadedAmmo,
  fromDropData: entry => Item.implementation.fromDropData(entry),
  translate: t,
  translateWithFallback: tl
});
const {
  getDropItemQuantity: resolveDropItemQuantity,
  getDropEntries: resolveDropEntries,
  getDroppedItemUnitPrice: resolveDroppedItemUnitPrice,
  buildDropDecisionPreview: buildDropDecisionPreviewData,
  resolveDropPreviewItems
} = dropDecisionRules;
const dropEvaluationRules = createDropEvaluationRules({
  fromDropData: entry => Item.implementation.fromDropData(entry),
  roundCurrencyValue,
  getDropItemQuantity: resolveDropItemQuantity,
  getDroppedItemUnitPrice: resolveDroppedItemUnitPrice,
  carriedItemTypes: CARRIED_ITEM_TYPES
});
const {
  resolveActorTransferEntries: resolveActorTransferEntriesFromDrop,
  resolveDropPermissionState: resolveDropPermissionStateFromEntries,
  resolveDropPurchaseSummary: resolveDropPurchaseSummaryFromEntries,
  computeIncomingCarriedItemCount
} = dropEvaluationRules;
const dropFlowRules = createDropFlowRules({
  toFiniteNumber,
  roundCurrencyValue
});
const {
  resolveDropPermissionNotificationKey,
  isDropDecisionClosed,
  isDropDecisionBuy,
  resolveDropPurchaseState,
  shouldUseActorTransferPath,
  isCarriedItemsLimitExceeded
} = dropFlowRules;
const actorItemTransferRules = createActorItemTransferRules({
  translate: t,
  warn: message => ui.notifications?.warn(message),
  deepClone: foundry.utils.deepClone,
  logWarn: (...args) => bmLog.warn(...args)
});
const { applyActorToActorItemTransfer: applyActorToActorItemTransferRule } = actorItemTransferRules;
const characteristicRerollRules = createCharacteristicRerollRules({ toFiniteNumber });
const {
  resolveCharacteristicRerollPlan,
  resolveCharacteristicXpProgress
} = characteristicRerollRules;
const itemUseFlowRules = createItemUseFlowRules({
  toFiniteNumber,
  normalizeRollDieFormula
});
const {
  resolveAbilityDamageRollPlan,
  resolveItemRerollRollPlan,
  resolveItemUsePlan,
  resolveHealUseMode,
  resolveManualHealNextValue,
  isObjectUseEnabled,
  buildHealAudioReference
} = itemUseFlowRules;
const growthRollRules = createGrowthRollRules({ toFiniteNumber });
const {
  computeGrowthEffectiveScore,
  resolveGrowthOutcome,
  buildGrowthUpdateData
} = growthRollRules;

const ammoStateRules = createAmmoStateRules({
  normalizeNonNegativeInteger,
  toCheckboxBoolean,
  getWeaponCategory,
  hasUpdatePath,
  getUpdatedPathValue,
  unsetUpdatePath,
  setProperty: foundry.utils.setProperty,
  mergeObject: foundry.utils.mergeObject
});
const {
  buildDefaultAmmo,
  normalizeAmmoType,
  getActorAmmoCapacityLimit,
  normalizeAmmoState,
  areAmmoStatesEqual,
  normalizeActorAmmoUpdateData
} = ammoStateRules;
const weaponReloadRules = createWeaponReloadRules({
  normalizeNonNegativeInteger,
  toCheckboxBoolean,
  getWeaponCategory,
  normalizeAmmoState,
  buildDefaultAmmo,
  getWeaponLoadedAmmo
});
const { resolveWeaponReloadPlan } = weaponReloadRules;

function isMissingTokenImage(src) {
  return !src || src === "icons/svg/mystery-man.svg";
}

function normalizeCharacteristicKey(value) {
  return ruleNormalizeCharacteristicKey(value, CHARACTERISTIC_KEYS);
}

function normalizeArchetypeBonusValue(value, fallback = 0) {
  return ruleNormalizeArchetypeBonusValue(value, fallback);
}

function getArchetypeCharacteristicBonus(profile, characteristicKey) {
  return ruleComputeArchetypeCharacteristicBonus({
    profile,
    characteristicKey,
    characteristicKeys: CHARACTERISTIC_KEYS
  });
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

function formatFullPpRestoreLine(actorName, restore = {}) {
  const name = String(actorName || tl("TYPES.Actor.personnage", "Joueur")).trim() || "Joueur";
  const maxPp = normalizeNonNegativeInteger(restore?.maxPp, 0);
  const previousPp = normalizeNonNegativeInteger(restore?.previousPp, 0);
  if (restore?.changed === false) {
    const fallback = `${name} a deja tous ses PP (${maxPp}/${maxPp}).`;
    return tl("BLOODMAN.Notifications.FullPPRestoreAlreadyFullLine", fallback, { actor: name, max: maxPp });
  }
  const fallback = `${name} : PP ${previousPp} -> ${maxPp}.`;
  return tl("BLOODMAN.Notifications.FullPPRestoreLine", fallback, {
    actor: name,
    before: previousPp,
    after: maxPp,
    max: maxPp
  });
}

async function restoreFullPpToSelectedPlayers(options = {}) {
  const selectedTokens = Array.isArray(options.selectedTokens)
    ? options.selectedTokens
    : (globalThis.canvas?.tokens?.controlled || []);
  if (!selectedTokens.length) {
    return {
      selectedTokens,
      restores: [],
      failures: [],
      reason: "no-selection"
    };
  }

  const recipients = getSelectedVoyageXpRecipientActors(selectedTokens);
  if (!recipients.length) {
    return {
      selectedTokens,
      restores: [],
      failures: [],
      reason: "no-recipients"
    };
  }

  const restores = [];
  const failures = [];
  for (const actor of recipients) {
    const actorName = String(actor?.name || tl("TYPES.Actor.personnage", "Joueur")).trim() || "Joueur";
    if (!actor?.update) {
      failures.push({ actorName });
      continue;
    }
    const maxPp = normalizeNonNegativeInteger(actor.system?.resources?.pp?.max, 0);
    const previousPp = normalizeNonNegativeInteger(actor.system?.resources?.pp?.current, 0);
    const nextPp = maxPp;
    if (previousPp === nextPp) {
      restores.push({ actorName, previousPp, maxPp, changed: false });
      continue;
    }

    try {
      await actor.update(
        { "system.resources.pp.current": nextPp },
        { bloodmanAllowVitalResourceUpdate: true }
      );
      restores.push({ actorName, previousPp, maxPp, changed: true });
    } catch (error) {
      bmLog.warn("[bloodman] full PP restore failed", {
        actorId: actor?.id,
        actorName,
        previousPp,
        maxPp,
        error
      });
      failures.push({ actorName });
    }
  }

  return {
    selectedTokens,
    restores,
    failures,
    reason: restores.length ? "ok" : "all-failed"
  };
}

async function postFullPpRestoreSummary(result) {
  if (!result) return false;
  const escapeHtml = value => (foundry.utils?.escapeHTML ? foundry.utils.escapeHTML(String(value || "")) : String(value || ""));
  const titleText = tl("BLOODMAN.Dialogs.FullPPRestore.Title", "Restauration PP");
  const lines = [];

  if (result.reason === "no-selection") {
    lines.push(tl("BLOODMAN.Notifications.FullPPRestoreNoSelection", "Selectionnez au moins un token joueur pour restaurer les PP."));
  } else if (result.reason === "no-recipients") {
    lines.push(tl("BLOODMAN.Notifications.FullPPRestoreNoRecipients", "Aucun token joueur selectionne pour restaurer les PP."));
  } else if (result.reason === "all-failed") {
    lines.push(tl("BLOODMAN.Notifications.FullPPRestoreAllFailed", "Aucune restauration de PP n'a pu etre appliquee."));
  } else {
    for (const restore of result.restores || []) {
      lines.push(formatFullPpRestoreLine(restore.actorName, restore));
    }
    const failureCount = Number(result.failures?.length || 0);
    if (failureCount > 0) {
      lines.push(
        tl(
          "BLOODMAN.Notifications.FullPPRestorePartialFailure",
          "{count} restauration(s) de PP n'ont pas pu etre appliquees.",
          { count: failureCount }
        )
      );
    }
  }

  const contentLines = lines.map(line => `<p>${escapeHtml(line)}</p>`).join("");
  const content = `<div class="bm-full-pp-restore-log"><p><strong>${escapeHtml(titleText)}</strong></p>${contentLines}</div>`;
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
  return computeDerivedPvMax({
    actorType: actor?.type,
    npcRole: (roleOverride ?? actor?.system?.npcRole) || "",
    phyEffective,
    playerCount: getPlayerCountOnScene()
  });
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

const damageRequestTracker = createRequestRetentionTracker({ retentionMs: DAMAGE_REQUEST_RETENTION_MS });
const damageConfigPopupTracker = createRequestRetentionTracker({ retentionMs: DAMAGE_REQUEST_RETENTION_MS });
const powerUsePopupTracker = createRequestRetentionTracker({ retentionMs: DAMAGE_REQUEST_RETENTION_MS });
const chaosRequestTracker = createRequestRetentionTracker({ retentionMs: DAMAGE_REQUEST_RETENTION_MS });
const rerollRequestTracker = createRequestRetentionTracker({ retentionMs: DAMAGE_REQUEST_RETENTION_MS });
const POWER_USE_POPUP_CHAT_MARKUP = "<span style='display:none'>bloodman-power-use-popup</span>";

const { rememberRequest: rememberDamageRequest, wasRequestProcessed: wasDamageRequestProcessed } = damageRequestTracker;
const { rememberRequest: rememberDamageConfigPopupRequest, wasRequestProcessed: wasDamageConfigPopupRequestProcessed } = damageConfigPopupTracker;
const { rememberRequest: rememberPowerUsePopupRequest, wasRequestProcessed: wasPowerUsePopupRequestProcessed } = powerUsePopupTracker;
const { rememberRequest: rememberChaosRequest, wasRequestProcessed: wasChaosRequestProcessed } = chaosRequestTracker;
const { rememberRequest: rememberRerollRequest, wasRequestProcessed: wasRerollRequestProcessed } = rerollRequestTracker;

const chatRelayHelpers = buildChatRelayHelpers({
  getCurrentUser: () => game.user,
  getMessagesCollection: () => game.messages,
  toFiniteNumber,
  scheduleTimeout: (callback, timeout) => setTimeout(callback, timeout),
  getProperty: foundry.utils.getProperty,
  isHtmlElement: value => {
    if (typeof HTMLElement === "function") return value instanceof HTMLElement;
    return Boolean(value?.style && value?.classList);
  }
});
const {
  scheduleTransientChatMessageDeletion,
  isTransportRelayChatMessage,
  hideTransientRelayChatMessage
} = chatRelayHelpers;

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
const chatRollDecorationHooks = buildChatRollDecorationHooks({
  getGame: () => game,
  getCanvas: () => canvas,
  getProperty: foundry.utils.getProperty,
  normalizeChatRollType,
  chatRollTypes: CHAT_ROLL_TYPES,
  t,
  tl,
  escapeChatMarkup,
  isHtmlElement: value => {
    if (typeof HTMLElement === "function") return value instanceof HTMLElement;
    return Boolean(value?.querySelector && value?.classList);
  }
});
const { decorateBloodmanChatRollMessage } = chatRollDecorationHooks;

const initiativeGroupingHooks = buildInitiativeGroupingHooks({
  initiativeGroupBufferMs: INITIATIVE_GROUP_BUFFER_MS,
  getProperty: foundry.utils.getProperty,
  getCombatantDisplayName,
  escapeChatMarkup,
  getGame: () => game,
  createChatMessage: data => ChatMessage.create(data)
});
const { isInitiativeRollMessage, queueInitiativeRollMessage } = initiativeGroupingHooks;

function isPowerUsableEnabled(value) {
  if (value == null || value === "") return true;
  return toBooleanFlag(value);
}

const damageRerollUtils = buildDamageRerollUtils({
  getDamagePayloadField,
  toBooleanFlag,
  resolveCombatTargetName,
  getTokenCurrentPv,
  getCanvas: () => canvas,
  toFiniteNumber,
  normalizeRollDieFormula,
  evaluateRoll: formula => new Roll(formula).evaluate()
});
const {
  normalizeRerollTarget,
  normalizeRerollTargets,
  buildFallbackRerollTargets,
  getRerollTargetKey,
  isSameRerollTarget,
  isDamageRerollContextReady,
  buildRerollAllocations,
  estimateRerollHpBefore,
  buildLocalTokenRerollResult,
  computeExpectedHpAfter,
  buildItemDamageRerollPayload,
  getRollValuesFromRoll,
  evaluateRerollDamageFormula
} = damageRerollUtils;

const damageTargetResolution = buildDamageTargetResolution({
  getDamagePayloadField,
  compatFromUuid,
  getGame: () => game,
  getCanvas: () => canvas
});
const { resolveDamageTokenDocument, resolveDamageActors } = damageTargetResolution;
const itemRerollFlowRules = createItemRerollFlowRules({
  toFiniteNumber,
  normalizeRerollTargets,
  buildFallbackRerollTargets,
  isDamageRerollItemType
});
const {
  normalizeItemRerollContext,
  isItemRerollContextValid,
  shouldBlockByRerollWindow,
  resolveItemRerollTargets,
  resolveItemRerollResourcePlan
} = itemRerollFlowRules;
const itemRerollExecutionRules = createItemRerollExecutionRules({
  normalizeRerollTarget,
  normalizeRerollTargets,
  resolveDamageTokenDocument,
  toBooleanFlag,
  getActorById: actorId => game.actors?.get(actorId) || null,
  getProtectionPA,
  getTokenCurrentPv,
  estimateRerollHpBefore,
  validateNumericEquality,
  getTokenActorType,
  syncZeroPvStatusForToken,
  resolveCombatTargetName,
  applyDamageToActor,
  buildLocalTokenRerollResult,
  postDamageTakenChatMessage,
  computeExpectedHpAfter,
  logDamageRerollValidation,
  buildItemDamageRerollPayload,
  hasSocket,
  socketEmit,
  systemSocket: SYSTEM_SOCKET,
  getActiveGMUserIds,
  enableChatTransportFallback: ENABLE_CHAT_TRANSPORT_FALLBACK,
  createChatMessage: data => ChatMessage.create(data),
  rerollRequestChatMarkup: REROLL_REQUEST_CHAT_MARKUP,
  logDebug: (...args) => bmLog.debug(...args),
  createRequestId: () => (foundry.utils?.randomID ? foundry.utils.randomID() : Math.random().toString(36).slice(2))
});
const {
  relayItemRerollToGMs,
  applyLocalItemRerollTargets
} = itemRerollExecutionRules;
const damageCurrentHelpers = buildDamageCurrentHelpers({
  getProperty: foundry.utils.getProperty
});
const { resolveDamageCurrent } = damageCurrentHelpers;

const damageAppliedMessageHelpers = buildDamageAppliedMessageHelpers({
  hasSocket,
  socketEmit,
  systemSocket: SYSTEM_SOCKET,
  toFiniteNumber,
  resolveCombatTargetName,
  bmLog
});
const { emitDamageAppliedMessage } = damageAppliedMessageHelpers;
const damageConfigPopupHooks = buildDamageConfigPopupHooks({
  toFiniteNumber,
  t,
  getCurrentUser: () => game.user,
  getUsersCollection: () => game.users,
  isAssistantOrHigherRole,
  escapeHtml: value => (foundry.utils?.escapeHTML ? foundry.utils.escapeHTML(String(value || "")) : String(value || "")),
  dialogClass: Dialog,
  wasDamageConfigPopupRequestProcessed,
  rememberDamageConfigPopupRequest,
  logWarn: (...args) => bmLog.warn(...args)
});
const { handleDamageConfigPopupMessage } = damageConfigPopupHooks;

const powerUsePopupHooks = buildPowerUsePopupHooks({
  hasSocket,
  socketEmit,
  systemSocket: SYSTEM_SOCKET,
  getCurrentUser: () => game.user,
  getActivePrivilegedOperatorIds,
  normalizeRollDieFormula,
  toBooleanFlag,
  toFiniteNumber,
  enableChatTransportFallback: ENABLE_CHAT_TRANSPORT_FALLBACK,
  createChatMessage: data => ChatMessage.create(data),
  powerUsePopupChatMarkup: POWER_USE_POPUP_CHAT_MARKUP,
  isAssistantOrHigherRole,
  formatMultilineTextToHtml,
  escapeHtml: value => (foundry.utils?.escapeHTML ? foundry.utils.escapeHTML(String(value || "")) : String(value || "")),
  dialogClass: Dialog,
  wasPowerUsePopupRequestProcessed,
  rememberPowerUsePopupRequest,
  logWarn: (...args) => bmLog.warn(...args),
  logError: (...args) => bmLog.error(...args)
});
const { emitPowerUsePopup, handlePowerUsePopupMessage } = powerUsePopupHooks;

const damageRerollHooks = buildDamageRerollHooks({
  toFiniteNumber,
  validateNumericEquality,
  resolveAttackerActorInstancesForDamageApplied,
  normalizeRerollTarget,
  getRerollTargetKey,
  isSameRerollTarget,
  getActorInstancesById,
  wasRerollRequestProcessed,
  rememberRerollRequest,
  isDamageRerollItemType,
  normalizeRerollTargets,
  resolveDamageTokenDocument,
  toBooleanFlag,
  getTokenCurrentPv,
  getProtectionPA,
  resolveCombatTargetName,
  applyDamageToActor,
  postDamageTakenChatMessage,
  getTokenActorType,
  syncZeroPvStatusForToken,
  logDamageRerollValidation,
  emitDamageAppliedMessage,
  bmLog
});
const { handleDamageAppliedMessage, handleDamageRerollRequest } = damageRerollHooks;

const damageRequestHooks = buildDamageRequestHooks({
  toFiniteNumber,
  wasDamageRequestProcessed,
  rememberDamageRequest,
  resolveDamageTokenDocument,
  resolveDamageActors,
  resolveDamageCurrent,
  resolveCombatTargetName,
  postDamageTakenChatMessage,
  emitDamageAppliedMessage,
  applyDamageToActor,
  safeWarn,
  t,
  bmLog
});
const { handleIncomingDamageRequest } = damageRequestHooks;

const socketActorResolutionHelpers = buildSocketActorResolutionHelpers({
  compatFromUuid,
  getActorById: actorId => game.actors?.get(actorId) || null
});
const { resolveActorForVitalResourceUpdate, resolveActorForSheetRequest } = socketActorResolutionHelpers;

const actorUpdateSanitizer = buildActorUpdateSanitizer({
  deepClone: foundry.utils.deepClone,
  planActorUpdateRestrictionByRole,
  isBasicPlayerRole,
  isAssistantOrHigherRole,
  stripUnauthorizedCharacteristicBaseUpdates,
  stripUpdatePaths,
  vitalResourcePathList: VITAL_RESOURCE_PATH_LIST,
  stateModifierPaths: STATE_MODIFIER_PATHS,
  actorTokenImageUpdatePaths: ACTOR_TOKEN_IMAGE_UPDATE_PATHS,
  ammoUpdatePaths: AMMO_UPDATE_PATHS,
  normalizeActorAmmoUpdateData,
  normalizeCharacteristicXpUpdates,
  normalizeCharacteristicBaseUpdatesForRole
});
const { applyActorUpdateRestrictionPlan, sanitizeActorUpdateForRole } = actorUpdateSanitizer;
const actorSocketRequestHandlers = buildActorSocketRequestHandlers({
  canUserRoleEditCharacteristics,
  vitalResourcePaths: VITAL_RESOURCE_PATHS,
  resolveActorForVitalResourceUpdate,
  resolveActorForSheetRequest,
  normalizeVitalResourceValue: normalizeRuleVitalResourceValue,
  sanitizeActorUpdateForRole,
  hasActorUpdatePayload,
  flattenObject: foundry.utils.flattenObject,
  toFiniteNumber
});
const {
  handleVitalResourceUpdateRequest,
  handleActorSheetUpdateRequest,
  handleDeleteItemRequest,
  handleReorderActorItemsRequest
} = actorSocketRequestHandlers;
const actorSocketRequestClient = buildActorSocketRequestClient({
  systemSocket: SYSTEM_SOCKET,
  hasSocket,
  socketEmit,
  toFiniteNumber,
  vitalResourcePaths: VITAL_RESOURCE_PATHS,
  hasActorUpdatePayload,
  flattenObject: foundry.utils.flattenObject
});
const {
  getSocketActorBaseId,
  requestVitalResourceUpdate,
  requestActorSheetUpdate,
  requestDeleteActorItem,
  requestReorderActorItems
} = actorSocketRequestClient;
const systemSocketHooks = buildSystemSocketHooks({
  systemSocket: SYSTEM_SOCKET,
  hasSocket,
  socketOn,
  socketOff,
  isCurrentUserPrimaryPrivilegedOperator,
  handleDamageConfigPopupMessage,
  handlePowerUsePopupMessage,
  handleDamageAppliedMessage,
  handleDamageRerollRequest,
  handleVitalResourceUpdateRequest,
  handleActorSheetUpdateRequest,
  handleDeleteItemRequest,
  handleReorderActorItemsRequest,
  wasChaosRequestProcessed,
  rememberChaosRequest,
  setChaosValue,
  getChaosValue,
  handleIncomingDamageRequest
});
const { registerDamageSocketHandlers } = systemSocketHooks;
if (globalThis.game?.ready) registerDamageSocketHandlers();

function getCombatantActor(combatant) {
  return combatant?.token?.actor || combatant?.actor || null;
}

const movementCombatRules = buildMovementCombatRules({
  toFiniteNumber,
  getItemBonusTotals,
  getActorArchetypeBonus,
  computeNormalizedMoveGauge,
  normalizeNonNegativeInteger,
  validateNumericEquality,
  requestActorSheetUpdate,
  safeWarn,
  getProperty: foundry.utils.getProperty,
  getGame: () => game,
  getCanvas: () => canvas
});
const {
  getActorEffectiveMovementScore,
  normalizeActorMoveGauge,
  setActorMoveGauge,
  getTokenMoveDistanceInCells,
  getStartedActiveCombat,
  getCombatantForToken
} = movementCombatRules;

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

const canvasReadyHooks = buildCanvasReadyHooks({
  installTokenEffectBackgroundPatch,
  installTokenHudRenderPatch,
  installTokenHudDomObserver,
  scheduleTokenHudDomEnhancement,
  applyTransparentTokenEffectBackground,
  refreshBossSoloNpcPvMax,
  repairTokenTextureSource
});

Hooks.on("renderTokenHUD", (hud, html) => {
  try {
    configureTokenHudEnhancements(hud, html);
  } catch (error) {
    bmLog.warn("token HUD enhancement skipped", { error });
  }
});

Hooks.on("canvasReady", async () => {
  await canvasReadyHooks.onCanvasReady();
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
  registerBloodmanMigrationSettings();
  registerPrivilegedUsersCacheHooks();
  initializeBloodmanLoggerFromSettings();
  bmLog.info("compat:init", {
    foundryVersion: foundryVersion(),
    generation: getFoundryGeneration()
  });
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

  const combatantDoc = compatGetDocumentClass("Combatant") || CONFIG?.Combatant?.documentClass;
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
  try {
    await runBloodmanMigrations();
  } catch (error) {
    bmLog.error("migration runner failed", { error });
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
  if (hasSocket()) socketEmit(SYSTEM_SOCKET, { type: "adjustChaosDice", delta: numeric, requestId });
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

function showSelectedFullPpRestoreConfirmDialog() {
  if (!game.user?.isGM) return;
  if (typeof Dialog !== "function") return;

  const selectedTokens = [...(globalThis.canvas?.tokens?.controlled || [])];
  const selectedCount = Array.isArray(selectedTokens) ? selectedTokens.length : 0;
  const recipients = getSelectedVoyageXpRecipientActors(selectedTokens);
  if (!selectedCount || !recipients.length) {
    void restoreFullPpToSelectedPlayers({ selectedTokens }).then(postFullPpRestoreSummary);
    return;
  }

  const escapeHtml = value => (foundry.utils?.escapeHTML ? foundry.utils.escapeHTML(String(value || "")) : String(value || ""));
  const titleText = tl("BLOODMAN.Dialogs.FullPPRestore.Title", "Restauration PP");
  const promptText = tl(
    "BLOODMAN.Dialogs.FullPPRestore.Prompt",
    "Restaurer integralement les points de puissance (PP) des tokens joueurs selectionnes ?"
  );
  const selectionHint = tl(
    "BLOODMAN.Dialogs.FullPPRestore.SelectionHint",
    "{selected} token(s) selectionne(s), {eligible} token(s) joueur(s) concerne(s).",
    { selected: selectedCount, eligible: recipients.length }
  );
  const confirmLabel = tl("BLOODMAN.Dialogs.FullPPRestore.Confirm", "Restaurer");
  const cancelLabel = tl("BLOODMAN.Common.Cancel", "Annuler");
  const content = `<form class="bm-full-pp-dialog">
    <p>${escapeHtml(promptText)}</p>
    <p><small>${escapeHtml(selectionHint)}</small></p>
  </form>`;

  const dialog = new Dialog(
    {
      title: titleText,
      content,
      buttons: {
        confirm: {
          label: confirmLabel,
          callback: async () => {
            const result = await restoreFullPpToSelectedPlayers({ selectedTokens });
            await postFullPpRestoreSummary(result);
          }
        },
        cancel: {
          label: cancelLabel
        }
      },
      default: "cancel"
    },
    {
      classes: ["bloodman-damage-dialog", "bloodman-full-pp-dialog"],
      width: 460
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
  const xpAriaLabel = escapeChatMarkup(tl("BLOODMAN.Dialogs.VoyageXPGrant.Title", "Attribution XP voyage"));
  const fullPpAriaLabel = escapeChatMarkup(tl("BLOODMAN.Dialogs.FullPPRestore.Title", "Restauration PP"));
  const plusAriaLabel = escapeChatMarkup("Augmenter les des du chaos");
  const minusAriaLabel = escapeChatMarkup("Diminuer les des du chaos");
  container.innerHTML = `
    <button type="button" class="bm-chaos-xp-btn" aria-label="${xpAriaLabel}">XP</button>
    <div class="bm-chaos-row">
      <button type="button" class="bm-chaos-btn bm-chaos-plus" aria-label="${plusAriaLabel}">+</button>
      <div class="bm-chaos-icon" aria-hidden="true">
        <img src="${CHAOS_DICE_ICON_SRC}" data-fallback-src="${CHAOS_DICE_ICON_FALLBACK_SRC}" alt="" />
        <span class="bm-chaos-value">0</span>
      </div>
      <button type="button" class="bm-chaos-btn bm-chaos-minus" aria-label="${minusAriaLabel}">-</button>
    </div>
    <button type="button" class="bm-chaos-full-pp-btn" aria-label="${fullPpAriaLabel}">FULL PP</button>
  `;

  target.appendChild(container);

  const xp = container.querySelector(".bm-chaos-xp-btn");
  const fullPp = container.querySelector(".bm-chaos-full-pp-btn");
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

  fullPp?.addEventListener("click", () => {
    showSelectedFullPpRestoreConfirmDialog();
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

async function applyVoyageXPCostOnCreate(actor, item, options = null) {
  if (!actor || !item) return;
  if (Boolean(options?.[VOYAGE_XP_SKIP_CREATE_OPTION])) return;
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

const itemDerivedSyncHooks = buildItemDerivedSyncHooks({
  applyItemResourceBonuses,
  syncActorDerivedCharacteristicsResources,
  characteristicBonusItemTypes: CHARACTERISTIC_BONUS_ITEM_TYPES,
  bmLog
});

Hooks.on("createItem", async (item, options, userId) => {
  if (!item?.actor) return;

  const sourceUserId = String(userId || options?.userId || "");
  if (sourceUserId && sourceUserId !== game.user?.id) return;

  await applyVoyageXPCostOnCreate(item.actor, item, options);
  await itemDerivedSyncHooks.handleItemDerivedSyncHook(item, "createItem");
});

Hooks.on("preCreateItem", (item, createData, options) => {
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
  if (Boolean(options?.[VOYAGE_XP_SKIP_CREATE_OPTION])) return;

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

const chatMessageRoutingHooks = buildChatMessageRoutingHooks({
  getProperty: foundry.utils.getProperty,
  handleDamageConfigPopupMessage,
  handlePowerUsePopupMessage,
  isCurrentUserPrimaryPrivilegedOperator,
  isInitiativeRollMessage,
  queueInitiativeRollMessage,
  wasChaosRequestProcessed,
  rememberChaosRequest,
  setChaosValue,
  getChaosValue,
  handleIncomingDamageRequest,
  handleDamageRerollRequest,
  scheduleTransientChatMessageDeletion,
  isTransportRelayChatMessage,
  hideTransientRelayChatMessage,
  decorateBloodmanChatRollMessage,
  logWarn: (...args) => bmLog.warn(...args)
});

Hooks.on("createChatMessage", async (message) => {
  await chatMessageRoutingHooks.onCreateChatMessage(message);
});

Hooks.on("renderChatMessage", chatMessageRoutingHooks.onRenderChatMessage);

Hooks.on("renderChatMessageHTML", chatMessageRoutingHooks.onRenderChatMessageHTML);

Hooks.on("renderHotbar", () => {
  positionChaosDiceUI();
});

Hooks.on("updateItem", (item) => {
  void itemDerivedSyncHooks.handleItemDerivedSyncHook(item, "updateItem");
});

Hooks.on("deleteItem", (item) => {
  void itemDerivedSyncHooks.handleItemDerivedSyncHook(item, "deleteItem");
});

function getItemBonusTotals(actor) {
  return computeItemCharacteristicBonusTotals({
    items: actor?.items,
    characteristics: CHARACTERISTICS,
    characteristicBonusItemTypes: CHARACTERISTIC_BONUS_ITEM_TYPES,
    isBonusEnabled: value => toCheckboxBoolean(value, false)
  });
}

function getItemResourceBonusTotals(actor) {
  return computeItemResourceBonusTotals({
    items: actor?.items,
    resourceBonusItemTypes: ITEM_RESOURCE_BONUS_ITEM_TYPES
  });
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
  const updates = computeItemResourceBonusUpdateData({
    totals,
    currentPv,
    currentPp,
    currentPvMax,
    currentPpMax,
    storedPv,
    storedPp
  });

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
  // State modifiers apply to characteristic checks only, not vital resource maxima.
  const { phyEffective, espEffective } = computeResourceCharacteristicEffectiveScores({
    phyBase: actor.system.characteristics?.PHY?.base,
    espBase: actor.system.characteristics?.ESP?.base,
    phyItemBonus: itemBonuses?.PHY,
    espItemBonus: itemBonuses?.ESP,
    archetypeBonusCharacteristic,
    archetypeBonusValue
  });
  const derivedPvMax = getDerivedPvMax(actor, phyEffective);
  const storedPvBonus = toFiniteNumber(actor.system.resources?.pv?.itemBonus, 0);
  const storedPpBonus = toFiniteNumber(actor.system.resources?.pp?.itemBonus, 0);
  const { updates } = computeDerivedResourceSyncUpdateData({
    derivedPvMax,
    espEffective,
    storedPvBonus,
    storedPpBonus,
    currentPvMax: actor.system.resources?.pv?.max,
    currentPpMax: actor.system.resources?.pp?.max,
    currentPv: actor.system.resources?.pv?.current,
    currentPp: actor.system.resources?.pp?.current,
    clampMaxToZero: true
  });
  if (Object.keys(updates).length) {
    await actor.update(updates, { bloodmanAllowVitalResourceUpdate: true });
  }

  const gauge = normalizeActorMoveGauge(actor, { itemBonuses, initializeWhenMissing: true });
  await setActorMoveGauge(actor, gauge.value, gauge.max);
}

const powerCostRules = buildPowerCostRules({
  requestActorSheetUpdate,
  notifyInsufficientPowerPoints: message => ui.notifications?.error(message),
  canDirectlyUpdateActor: actor => Boolean(actor?.isOwner || game.user?.isGM),
  deepClone: foundry.utils.deepClone,
  setProperty: foundry.utils.setProperty
});
const { applyPowerCost } = powerCostRules;

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
  const byUuid = uuidRef ? compatFromUuidSync(uuidRef) : null;
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

const tokenCombatHooks = buildTokenCombatHooks({
  bmLog,
  getTokenActorType,
  isMissingTokenImage,
  getSafeTokenTextureFallback,
  repairTokenTextureSource,
  applyTransparentTokenEffectBackground,
  refreshBossSoloNpcPvMax,
  getCombatantDisplayName,
  focusActiveCombatantToken,
  resetActiveCombatantMoveGauge,
  resetCombatMovementHistory,
  decrementActiveCombatantTokenHudCounters,
  resetCombatRuntimeKeys,
  isAssistantOrHigherRole,
  stripUpdatePaths,
  tokenImageUpdatePaths: TOKEN_IMAGE_UPDATE_PATHS,
  getStartedActiveCombat,
  getCombatantForToken,
  normalizeActorMoveGauge,
  getTokenMoveDistanceInCells,
  tokenMoveLimitEpsilon: TOKEN_MOVE_LIMIT_EPSILON,
  safeWarn,
  t,
  setActorMoveGauge,
  syncActorAndPrototypeImageFromTokenImage,
  syncCombatantNameForToken,
  getTokenPvFromUpdate,
  getTokenCurrentPv,
  syncZeroPvStatusForToken,
  syncNpcDeadStatusToZeroPvForToken
});

Hooks.on("preCreateToken", tokenCombatHooks.onPreCreateToken);
Hooks.on("drawToken", tokenCombatHooks.onDrawToken);
Hooks.on("refreshToken", tokenCombatHooks.onRefreshToken);
Hooks.on("createToken", tokenCombatHooks.onCreateToken);
Hooks.on("deleteToken", tokenCombatHooks.onDeleteToken);
Hooks.on("preCreateCombatant", tokenCombatHooks.onPreCreateCombatant);
Hooks.on("updateCombat", tokenCombatHooks.onUpdateCombat);
Hooks.on("combatTurnChange", tokenCombatHooks.onCombatTurnChange);
Hooks.on("combatStart", tokenCombatHooks.onCombatStart);
Hooks.on("deleteCombat", tokenCombatHooks.onDeleteCombat);

const actorPreUpdateHooks = buildActorPreUpdateHooks({
  toFiniteNumber,
  isAssistantOrHigherRole,
  isBasicPlayerRole,
  planActorUpdateRestrictionByRole,
  applyActorUpdateRestrictionPlan,
  stripUpdatePaths,
  normalizeCharacteristicXpUpdates,
  normalizeActorAmmoUpdateData,
  normalizeActorEquipmentCurrencyUpdateData,
  buildInvalidCurrencyCurrentMessage,
  normalizeCharacteristicBaseUpdatesForRole,
  buildInvalidStatePresetMessage,
  buildStateModifierUpdateFromLabel,
  applyStateModifierUpdateToData,
  getItemBonusTotals,
  normalizeArchetypeBonusValue,
  normalizeCharacteristicKey,
  getDerivedPvMax,
  t
});

Hooks.on("preUpdateActor", actorPreUpdateHooks.onPreUpdateActor);

const actorUpdateHooks = buildActorUpdateHooks({
  characteristics: CHARACTERISTICS,
  normalizeArchetypeBonusValue,
  normalizeCharacteristicKey,
  getItemBonusTotals,
  normalizeActorMoveGauge,
  setActorMoveGauge,
  getDerivedPvMax,
  syncZeroPvBodyStateForActor,
  syncZeroPvStatusForToken,
  syncZeroPvStatusForActor,
  tokenTextureValidityCache: TOKEN_TEXTURE_VALIDITY_CACHE,
  resolveWorldActorFromTokenDocument,
  syncSceneTokenImagesFromActorImage,
  syncPrototypeTokenImageFromActorImage,
  bmLog
});

Hooks.on("updateActor", async (actor, changes, options, userId) => {
  await actorUpdateHooks.onUpdateActor(actor, changes, options, userId);
});

Hooks.on("preUpdateToken", tokenCombatHooks.onPreUpdateToken);
Hooks.on("updateToken", tokenCombatHooks.onUpdateToken);
Hooks.on("createActiveEffect", async effectDoc => {
  await syncNpcDeadStatusToZeroPvFromActiveEffect(effectDoc);
});
Hooks.on("updateActiveEffect", async effectDoc => {
  await syncNpcDeadStatusToZeroPvFromActiveEffect(effectDoc);
});

class BloodmanActorSheet extends BaseActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["bloodman", "sheet", "actor"],
      template: "systems/bloodman/templates/actor-joueur.html",
      width: 1070,
      height: 630,
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
    this.clearDeferredSheetUiTasks();
    clearUiMicrotask(this._pvGaugePulseTimer);
    clearUiMicrotask(this._ppGaugePulseTimer);
    this._pvGaugePulseTimer = null;
    this._ppGaugePulseTimer = null;
    this._lastAutoResizeKey = "";
    return super.close(options);
  }

  clearDeferredSheetUiTasks() {
    clearUiMicrotask(this._forceEnableSheetTaskId);
    clearUiMicrotask(this._autoResizeTaskId);
    clearUiMicrotask(this._autoGrowRefreshTaskId);
    clearUiMicrotask(this._resourceGaugeRefreshTaskId);
    this._forceEnableSheetTaskId = null;
    this._autoResizeTaskId = null;
    this._autoGrowRefreshTaskId = null;
    this._resourceGaugeRefreshTaskId = null;
    this._queuedAutoResizeForce = false;
    this._queuedAutoGrowRoot = null;
    this._queuedResourceGaugeRoot = null;
  }

  queueAutoResizeToContent(force = false) {
    this._queuedAutoResizeForce = mergeDeferredForce(this._queuedAutoResizeForce, force);
    if (this._autoResizeTaskId != null) return;
    this._autoResizeTaskId = queueUiMicrotask(() => {
      this._autoResizeTaskId = null;
      const shouldForce = Boolean(this._queuedAutoResizeForce);
      this._queuedAutoResizeForce = false;
      this.autoResizeToContent(shouldForce);
    });
  }

  queueAutoGrowTextareaRefresh(rootLike = null) {
    this._queuedAutoGrowRoot = resolveDeferredRoot(this._queuedAutoGrowRoot, rootLike);
    if (this._autoGrowRefreshTaskId != null) return;
    this._autoGrowRefreshTaskId = queueUiMicrotask(() => {
      this._autoGrowRefreshTaskId = null;
      const root = this._queuedAutoGrowRoot?.find ? this._queuedAutoGrowRoot : this.element;
      this._queuedAutoGrowRoot = null;
      this.refreshAutoGrowTextareas(root);
    });
  }

  queueResourceGaugeRefresh(rootLike = null) {
    this._queuedResourceGaugeRoot = resolveDeferredRoot(this._queuedResourceGaugeRoot, rootLike);
    if (this._resourceGaugeRefreshTaskId != null) return;
    this._resourceGaugeRefreshTaskId = queueUiMicrotask(() => {
      this._resourceGaugeRefreshTaskId = null;
      const root = this._queuedResourceGaugeRoot?.find ? this._queuedResourceGaugeRoot : this.element;
      this._queuedResourceGaugeRoot = null;
      this.refreshResourceVisuals(root);
    });
  }

  async applyActorUpdate(updateData, options = {}) {
    if (!hasActorUpdatePayload(updateData, foundry.utils.flattenObject)) return false;
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
    let firstCandidate = null;
    for (const item of this.actor.items) {
      if (!item) continue;
      if (rawType && String(item.type || "").trim().toLowerCase() !== rawType) continue;
      if (String(item.name || "").trim() !== nameText) continue;
      if (!firstCandidate) firstCandidate = item;
      if (rawId && String(item.id || "") === rawId) return item;
    }
    return firstCandidate;
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
    if (!hasActorUpdatePayload(sanitized, foundry.utils.flattenObject)) return;
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
    const hasPortraitImage = !isMissingTokenImage(String(data.actor?.img || "").trim());

    const itemBonuses = getItemBonusTotals(this.actor);
    const characteristics = CHARACTERISTICS.map(c => {
      const label = t(c.labelKey) || c.key;
      const base = Number(data.actor.system.characteristics?.[c.key]?.base || 0);
      const xp = Array.isArray(data.actor.system.characteristics?.[c.key]?.xp)
        ? data.actor.system.characteristics[c.key].xp
        : [false, false, false];
      const hiddenRoll = toCheckboxBoolean(data.actor.system.characteristics?.[c.key]?.hiddenRoll, false);
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
        hiddenRoll,
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
    const objectSectionItemsCount = itemBuckets.objet.length + itemBuckets.soin.length + itemBuckets.ration.length;
    const carriedItemsCount = this.actor.items.filter(item => CARRIED_ITEM_TYPES.has(item.type)).length;
    const equipmentThreeColumns = objectSectionItemsCount >= 2;

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
      hasPortraitImage,
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
      carriedItemsCount,
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
    return resolveActorSheetAutoResizeKey({
      activeTab,
      itemCounts,
      transportCount
    });
  }

  resizeAutoGrowTextarea(textarea) {
    if (!textarea || String(textarea.tagName || "").toUpperCase() !== "TEXTAREA") return;
    textarea.style.height = "auto";
    const computedStyle = window.getComputedStyle ? window.getComputedStyle(textarea) : null;
    const layout = resolveTextareaAutoGrowState({
      style: computedStyle,
      rows: textarea.getAttribute("rows"),
      minRows: textarea.dataset?.autogrowMinRows,
      maxRows: textarea.dataset?.autogrowMaxRows,
      scrollHeight: textarea.scrollHeight
    });
    textarea.style.height = `${layout.nextHeight}px`;
    textarea.style.overflowY = layout.overflowY;
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
    const targetHeight = resolveSheetWindowTargetHeight({
      configuredMinHeight: this.options?.height,
      formNaturalHeight,
      headerHeight
    });
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
          .find(VITAL_RESOURCE_INPUT_SELECTOR)
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
    clearUiMicrotask(this._forceEnableSheetTaskId);
    this._forceEnableSheetTaskId = queueUiMicrotask(forceEnableSheetUi);
    html.find("li.item[data-item-id]").attr("draggable", true);
    this.refreshResourceVisuals(html);
    this.queueResourceGaugeRefresh(html);
    this.refreshAutoGrowTextareas(html);
    this.queueAutoGrowTextareaRefresh(html);
    this.queueAutoResizeToContent(true);

    html.find(".sheet-tabs .item").on("click", () => {
      this.queueAutoGrowTextareaRefresh(html);
      this.queueAutoResizeToContent(true);
    });

    html.on("input change", "textarea[data-autogrow='true']", ev => {
      this.resizeAutoGrowTextarea(ev.currentTarget);
      this.queueAutoResizeToContent(true);
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

    html.on("change", VITAL_RESOURCE_INPUT_SELECTOR, async ev => {
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

    html.on("input change", VITAL_RESOURCE_INPUT_SELECTOR, () => {
      this.queueResourceGaugeRefresh(html);
    });

    html.find(".luck-roll").click(ev => {
      ev.preventDefault();
      ev.stopPropagation();
      this.rollLuck();
    });

    html.find(".char-icon").click(ev => {
      const row = ev.currentTarget.closest(".char-row");
      const key = row?.dataset?.key;
      this.handleCharacteristicRoll(key, { hidden: this.isCharacteristicRollHidden(key) });
    });

    html.find(".char-roll").click(ev => {
      const key = ev.currentTarget.dataset.key;
      this.handleCharacteristicRoll(key, { hidden: this.isCharacteristicRollHidden(key) });
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
      this.queueAutoResizeToContent();
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
    const data = getDragEventData(event);
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
    return resolveDropItemQuantity(dropData, droppedItem);
  }

  getDropEntries(dropData) {
    return resolveDropEntries(dropData);
  }

  async resolveActorTransferEntries(dropData) {
    const entries = this.getDropEntries(dropData);
    return resolveActorTransferEntriesFromDrop({
      entries,
      targetActorId: String(this.actor?.id || "")
    });
  }

  async applyActorToActorItemTransfer(transferEntries = [], options = {}) {
    const ownerLevel = Number(CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3);
    return applyActorToActorItemTransferRule({
      targetActor: this.actor,
      transferEntries,
      currentUser: game.user,
      ownerLevel,
      isGM: Boolean(game.user?.isGM),
      renderTarget: () => this.render(false),
      createItemOptions: options?.createItemOptions
    });
  }

  async resolveDropPermissionState(dropData) {
    const entries = this.getDropEntries(dropData);
    return resolveDropPermissionStateFromEntries({
      entries,
      targetActorId: String(this.actor?.id || ""),
      currentUser: game.user,
      isGM: Boolean(game.user?.isGM),
      canDropMenuItems: canCurrentUserDropMenuItems(),
      limitedLevel: Number(CONST?.DOCUMENT_OWNERSHIP_LEVELS?.LIMITED ?? 1)
    });
  }

  getDroppedItemUnitPrice(item) {
    return resolveDroppedItemUnitPrice(item);
  }

  async resolveDropPurchaseSummary(dropData) {
    const entries = this.getDropEntries(dropData);
    return resolveDropPurchaseSummaryFromEntries({
      entries,
      targetActorId: String(this.actor?.id || "")
    });
  }

  sanitizeDropDialogText(value, maxLength = 160) {
    return dropDecisionRules.sanitizeDropDialogText(value, maxLength);
  }

  buildDroppedItemSpecificities(item, options = {}) {
    return dropDecisionRules.buildDroppedItemSpecificities(item, options);
  }

  async buildDropDecisionPreview(dropData, purchase = null) {
    const entries = this.getDropEntries(dropData);
    const resolvedItems = await resolveDropPreviewItems({
      entries,
      targetActorId: String(this.actor?.id || "")
    });
    const targetName = String(this.actor?.name || "").trim() || t("BLOODMAN.Common.Name");
    return buildDropDecisionPreviewData({
      resolvedItems,
      purchase,
      targetName,
    });
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
      const notificationKey = resolveDropPermissionNotificationKey(permissionState);
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
    if (isDropDecisionClosed(selectedAction)) return null;

    let previousCurrency = null;
    let deductedBeforeDrop = false;
    const shouldBuy = isDropDecisionBuy(selectedAction);
    if (shouldBuy) {
      previousCurrency = this.getActorCurrencyCurrentValue();
      const purchaseState = resolveDropPurchaseState({
        purchase,
        currentCurrency: previousCurrency
      });
      if (purchaseState.reason === "invalid-price") {
        ui.notifications?.warn(t("BLOODMAN.Notifications.InvalidPurchasePrice"));
        return null;
      }
      if (purchaseState.reason === "insufficient-funds") {
        ui.notifications?.warn(t("BLOODMAN.Notifications.NotEnoughCurrency", {
          cost: formatCurrencyValue(purchaseState.totalCost),
          current: formatCurrencyValue(purchaseState.currentCurrency)
        }));
        return null;
      }
      if (purchaseState.shouldDeduct) {
        await this.applyActorUpdate({ "system.equipment.monnaiesActuel": purchaseState.nextCurrency });
        deductedBeforeDrop = true;
      }
    }

    const dropEntries = this.getDropEntries(data);
    const actorTransferEntries = await this.resolveActorTransferEntries(data);
    const hasOnlyActorTransfers = shouldUseActorTransferPath(dropEntries, actorTransferEntries);
    const createItemOptions = shouldBuy
      ? undefined
      : { [VOYAGE_XP_SKIP_CREATE_OPTION]: true };

    try {
      const dropped = hasOnlyActorTransfers
        ? await this.applyActorToActorItemTransfer(actorTransferEntries, { createItemOptions })
        : await this.withDropItemCreateOptions(createItemOptions, () => super._onDropItem(event, data));
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

  async withDropItemCreateOptions(createItemOptions, callback) {
    if (typeof callback !== "function") return null;
    const nextOptions = createItemOptions && typeof createItemOptions === "object"
      ? createItemOptions
      : null;
    const previousOptions = this._dropItemCreateOptions || null;
    this._dropItemCreateOptions = nextOptions;
    try {
      return await callback();
    } finally {
      this._dropItemCreateOptions = previousOptions;
    }
  }

  async _onDropItemCreate(itemData) {
    const createItemOptions = this._dropItemCreateOptions && typeof this._dropItemCreateOptions === "object"
      ? this._dropItemCreateOptions
      : null;
    if (!createItemOptions) {
      return super._onDropItemCreate(itemData);
    }
    const payload = Array.isArray(itemData)
      ? itemData
      : [itemData];
    return this.actor?.createEmbeddedDocuments?.("Item", payload, createItemOptions);
  }

  async _reachedCarriedItemsLimit(data) {
    if (!isCarriedItemLimitedActorType(this.actor?.type)) return false;
    const entries = this.getDropEntries(data);
    const incomingCarriedItemCount = await computeIncomingCarriedItemCount({
      entries,
      targetActorId: String(this.actor?.id || "")
    });
    if (incomingCarriedItemCount <= 0) return false;

    const carriedCount = this.actor.items.filter(item => CARRIED_ITEM_TYPES.has(item.type)).length;
    const carriedItemsLimit = getActorCarriedItemsLimit(this.actor);
    if (!isCarriedItemsLimitExceeded({
      currentCarriedCount: carriedCount,
      incomingCarriedCount: incomingCarriedItemCount,
      carriedItemsLimit
    })) return false;

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

  isCharacteristicRollHidden(key) {
    if (this.actor?.type !== "personnage-non-joueur") return false;
    const characteristicKey = String(key || "").trim();
    if (!characteristicKey) return false;
    const selector = `input[name='system.characteristics.${characteristicKey}.hiddenRoll']`;
    const checkbox = this.element?.find ? this.element.find(selector) : null;
    if (checkbox?.length) return checkbox.first().is(":checked");
    return toCheckboxBoolean(this.actor?.system?.characteristics?.[characteristicKey]?.hiddenRoll, false);
  }

  async handleCharacteristicRoll(key, options = {}) {
    if (!key) return;
    this.markCharacteristicReroll(key);
    await doCharacteristicRoll(this.actor, key, { hidden: options?.hidden === true });
    if (this.actor.type === "personnage") {
      await this.markXpProgress(key);
    }
    this.render(false);
  }

  async rerollCharacteristic(key) {
    const plan = resolveCharacteristicRerollPlan({
      actorType: this.actor?.type,
      requestedKey: key,
      lastRollKey: this._lastCharacteristicRollKey,
      isRerollWindowActive: this.isRerollWindowActive(this._lastCharacteristicRollAt),
      isGM: Boolean(game.user?.isGM),
      currentPP: toFiniteNumber(this.actor?.system?.resources?.pp?.current, 0),
      currentChaos: this.actor?.type === "personnage-non-joueur" ? getChaosValue() : 0,
      ppCost: CHARACTERISTIC_REROLL_PP_COST,
      npcChaosCost: CHAOS_COST_NPC_REROLL
    });
    if (!plan.mode) return;
    const hiddenRoll = this.isCharacteristicRollHidden(key);

    if (!plan.allowed) {
      if (plan.reason === "not-enough-pp") {
        ui.notifications?.warn(t("BLOODMAN.Notifications.NotEnoughPPReroll", { cost: CHARACTERISTIC_REROLL_PP_COST }));
      } else if (plan.reason === "not-enough-chaos") {
        ui.notifications?.warn(t("BLOODMAN.Notifications.NotEnoughChaosReroll"));
        this.render(false);
      }
      return;
    }

    if (plan.mode === "player") {
      const resourceUpdated = await this.applyActorUpdate({ "system.resources.pp.current": plan.nextPP }, {
        bloodmanAllowVitalResourceUpdate: true
      });
      if (!resourceUpdated) return;
      await doCharacteristicRoll(this.actor, key, { hidden: hiddenRoll });
      await requestChaosDelta(CHAOS_PER_PLAYER_REROLL);
      this.markCharacteristicReroll(key);
      this.render(false);
      return;
    }

    await setChaosValue(plan.nextChaos);
    await doCharacteristicRoll(this.actor, key, { hidden: hiddenRoll });
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
    const progress = resolveCharacteristicXpProgress({
      xpValue: this.actor?.system?.characteristics?.[key]?.xp,
      defaultSlots: 3
    });
    if (!progress.updated) return;
    await this.applyActorUpdate({ [`system.characteristics.${key}.xp`]: progress.xp });
    foundry.utils.setProperty(this.actor, `system.characteristics.${key}.xp`, progress.xp);
    if (progress.shouldPromptGrowth) this.promptGrowthRoll(key);
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
    const reloadPlan = resolveWeaponReloadPlan({
      item,
      actorAmmoData: this.actor?.system?.ammo
    });
    if (!reloadPlan.ok) {
      if (reloadPlan.reason === "no-ammo") {
        ui.notifications?.warn(t("BLOODMAN.Notifications.NoAmmo"));
      }
      return;
    }

    try {
      await this.applyActorUpdate(
        {
          "system.ammo.stock": reloadPlan.nextStock,
          "system.ammo.value": reloadPlan.nextStock
        },
        { bloodmanAllowAmmoUpdate: true }
      );
      await item.update({ "system.loadedAmmo": reloadPlan.nextMagazine });
    } catch (error) {
      bmLog.warn("[bloodman] weapon reload: loaded ammo update failed", {
        actorId: this.actor?.id,
        itemId: item?.id,
        nextStock: reloadPlan.nextStock,
        nextMagazine: reloadPlan.nextMagazine,
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
    const plan = resolveAbilityDamageRollPlan({
      item,
      powerUsableEnabled: isPowerUsableEnabled(item?.system?.usableEnabled),
      powerActivated: this.isPowerActivated(item?.id)
    });
    if (!plan.allowed || !item) return;
    const beforeRoll = async () => {
      if (plan.isUsablePower) return true;
      return applyPowerCost(this.actor, item);
    };
    const result = await doDirectDamageRoll(this.actor, plan.formula, item.name, {
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
    const usePlan = resolveItemUsePlan({
      item,
      objectUseEnabled: isObjectUseEnabled(toBooleanFlag(item?.system?.useEnabled))
    });
    if (usePlan.kind === "none" || !item) return;

    if (usePlan.kind === "power") {
      await this.usePower(item);
      return;
    }
    if (usePlan.kind === "heal") {
      const healAudioRef = buildHealAudioReference(item);
      const healMode = resolveHealUseMode({
        actorIsOwner: Boolean(this.actor?.isOwner),
        isGM: Boolean(game.user?.isGM)
      });
      if (healMode === "owner-roll") {
        const result = await doHealRoll(this.actor, item);
        if (result) await playItemAudio(healAudioRef);
        if (result && this.actor.items.get(item.id)) this.render(false);
      } else {
        const formula = normalizeRollDieFormula(item.system?.healDie, "d4");
        const roll = await new Roll(formula).evaluate();
        const healState = resolveManualHealNextValue({
          current: this.actor?.system?.resources?.pv?.current,
          max: this.actor?.system?.resources?.pv?.max,
          rollTotal: roll.total
        });
        await this.applyActorUpdate({ "system.resources.pv.current": healState.next }, {
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
    if (usePlan.kind === "ration") {
      await this.deleteActorItem(item);
      this.render(false);
      return;
    }
    if (usePlan.kind === "object") {
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
    const context = normalizeItemRerollContext(state?.damage, item.type);
    if (!context || state?.itemId !== itemId) return;
    if (!isItemRerollContextValid(context)) return;
    if (shouldBlockByRerollWindow(this.actor?.type, this.isRerollWindowActive(state?.at))) return;
    const targetResolution = resolveItemRerollTargets({
      contextTargets: context.targets,
      selectedTargets: Array.from(game.user.targets || []),
      requestedTotalDamage: Number(context.totalDamage || 0)
    });
    let targets = targetResolution.targets;
    if (targetResolution.fallbackUsed) context.targets = targets;
    if (!targets.length) {
      ui.notifications?.warn(t("BLOODMAN.Notifications.NoTargetSelected"));
      return;
    }
    if (!this.isDamageRerollReady({ ...context, targets })) {
      ui.notifications?.warn("Relance indisponible : le dernier jet de degats n'est pas encore confirme.");
      this.render(false);
      return;
    }

    const validationMeta = {
      rollId: context.rollId,
      itemId,
      itemType: context.itemType
    };

    const resourcePlan = resolveItemRerollResourcePlan({
      actorType: this.actor?.type,
      isGM: Boolean(game.user?.isGM),
      currentPP: toFiniteNumber(this.actor?.system?.resources?.pp?.current, 0),
      currentChaos: this.actor?.type === "personnage-non-joueur" ? getChaosValue() : 0,
      ppCost: CHARACTERISTIC_REROLL_PP_COST,
      npcChaosCost: CHAOS_COST_NPC_REROLL
    });
    if (!resourcePlan.mode) return;

    if (resourcePlan.mode === "player") {
      if (!resourcePlan.allowed) {
        ui.notifications?.warn(t("BLOODMAN.Notifications.NotEnoughPPReroll", { cost: CHARACTERISTIC_REROLL_PP_COST }));
        return;
      }
      const resourceUpdated = await this.applyActorUpdate({ "system.resources.pp.current": resourcePlan.nextPP }, {
        bloodmanAllowVitalResourceUpdate: true
      });
      if (!resourceUpdated) return;
      const nextPP = toFiniteNumber(this.actor.system.resources?.pp?.current, 0);
      const expectedPP = resourcePlan.nextPP;
      logDamageRerollValidation("resource-player-pp", {
        ...validationMeta,
        before: resourcePlan.currentPP,
        after: nextPP,
        expected: expectedPP,
        cost: CHARACTERISTIC_REROLL_PP_COST,
        okResource: validateNumericEquality(nextPP, expectedPP)
      });
      await requestChaosDelta(CHAOS_PER_PLAYER_REROLL);
    } else {
      if (!resourcePlan.allowed) {
        ui.notifications?.warn(t("BLOODMAN.Notifications.NotEnoughChaosReroll"));
        this.render(false);
        return;
      }
      await setChaosValue(resourcePlan.nextChaos);
      const nextChaos = getChaosValue();
      const expectedChaos = resourcePlan.nextChaos;
      logDamageRerollValidation("resource-gm-chaos", {
        ...validationMeta,
        before: resourcePlan.currentChaos,
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
      await relayItemRerollToGMs({
        context,
        itemId,
        itemType: item.type,
        itemName: item.name,
        actorId: this.actor.id,
        attackerUserId: game.user?.id || "",
        totalDamage,
        rollResults,
        allocations
      });
      this.markItemReroll(itemId, context);
      this.render(false);
      return;
    }

    await applyLocalItemRerollTargets({
      allocations,
      penetrationValue,
      validationMeta,
      defaultTargetName: "Cible"
    });

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
    const plan = resolveItemRerollRollPlan({ item });
    if (plan.mode === "damage") {
      const result = await doDirectDamageRoll(this.actor, plan.formula, item.name, { itemId: item.id, itemType: item.type });
      return Boolean(result);
    }
    if (plan.mode === "heal") {
      const roll = await new Roll(plan.formula).evaluate();
      const healState = resolveManualHealNextValue({
        current: this.actor?.system?.resources?.pv?.current,
        max: this.actor?.system?.resources?.pv?.max,
        rollTotal: roll.total
      });
      await this.applyActorUpdate({ "system.resources.pv.current": healState.next }, {
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
    const effective = computeGrowthEffectiveScore({
      base,
      modifierAll: this.actor?.system?.modifiers?.all,
      modifierKey: this.actor?.system?.modifiers?.[key],
      itemBonus: itemBonuses?.[key],
      archetypeBonus
    });

    const roll = await new Roll("1d100").evaluate();
    const outcomeState = resolveGrowthOutcome({
      rollTotal: Number(roll.total || 0),
      effectiveScore: effective
    });
    const rollTotal = outcomeState.rollTotal;
    const success = outcomeState.success;
    const characteristicLabelKey = CHARACTERISTICS.find(c => c.key === key)?.labelKey || "";
    const characteristicLabel = characteristicLabelKey ? t(characteristicLabelKey) : key;
    const outcome = t(success ? "BLOODMAN.Rolls.Success" : "BLOODMAN.Rolls.Failure");
    const xpPath = `system.characteristics.${key}.xp`;
    const basePath = `system.characteristics.${key}.base`;
    const growthUpdate = buildGrowthUpdateData({
      base,
      success,
      xpSlots: 3
    });
    await this.applyActorUpdate({
      [basePath]: growthUpdate.nextBase,
      [xpPath]: growthUpdate.nextXp
    }, {
      bloodmanAllowCharacteristicBase: true
    });
    foundry.utils.setProperty(this.actor, basePath, growthUpdate.nextBase);
    foundry.utils.setProperty(this.actor, xpPath, growthUpdate.nextXp);

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

  async close(options = {}) {
    this.clearQueuedPricePreviewRefresh();
    return super.close(options);
  }

  clearQueuedPricePreviewRefresh() {
    clearUiMicrotask(this._pricePreviewRefreshTaskId);
    this._pricePreviewRefreshTaskId = null;
    this._queuedPricePreviewRoot = null;
  }

  queuePricePreviewRefresh(rootLike = null) {
    this._queuedPricePreviewRoot = resolveDeferredRoot(this._queuedPricePreviewRoot, rootLike);
    if (this._pricePreviewRefreshTaskId != null) return;
    this._pricePreviewRefreshTaskId = queueUiMicrotask(() => {
      this._pricePreviewRefreshTaskId = null;
      const root = this._queuedPricePreviewRoot?.find ? this._queuedPricePreviewRoot : this.element;
      this._queuedPricePreviewRoot = null;
      this.refreshPricePreview(root);
    });
  }

  syncPricePreviewSaleManualState(htmlLike = null) {
    if (!isPriceManagedItemType(this.item?.type)) return false;
    const root = htmlLike?.find ? htmlLike : this.element;
    if (!root?.length) return false;
    const priceInput = root.find("input[name='system.price']").first();
    const saleInput = root.find("input[name='system.salePrice']").first();
    if (!priceInput.length || !saleInput.length) return false;
    const manual = resolveItemSaleManualFlag(priceInput.val(), saleInput.val());
    saleInput.attr("data-sale-manual", manual ? "true" : "false");
    return manual;
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

  activatePricePreviewListeners(html) {
    if (!isPriceManagedItemType(this.item?.type)) return;
    const refresh = () => this.queuePricePreviewRefresh(html);
    html.on("input change blur", "input[name='system.price']", () => {
      refresh();
    });
    html.on("input change blur", "input[name='system.salePrice']", () => {
      this.syncPricePreviewSaleManualState(html);
      refresh();
    });
    this.syncPricePreviewSaleManualState(html);
    this.refreshPricePreview(html);
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
