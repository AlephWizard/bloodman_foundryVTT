import { applyDamageToActor, doCharacteristicRoll, doDamageRoll, doDirectDamageRoll, doGrowthRoll, doHealRoll, getWeaponCategory, normalizeWeaponType, postDamageTakenChatMessage } from "./src/dice/roll-helpers.mjs";
import { bmLog } from "./src/core/logger.mjs";
import {
  CHAT_ROLL_TYPES,
  buildChatRollFlags,
  normalizeChatRollType
} from "./src/core/chat-rolls.mjs";
import {
  ITEM_SHEET_TEMPLATE_PATH,
  NPC_ACTOR_SHEET_TEMPLATE_PATH,
  NPC_ACTOR_TYPE,
  PLAYER_ACTOR_SHEET_TEMPLATE_PATH,
  PLAYER_ACTOR_TYPE,
  SYSTEM_ID,
  SYSTEM_ITEM_TYPES,
  SYSTEM_ROOT_PATH,
  SYSTEM_SOCKET
} from "./src/core/constants.mjs";
import {
  normalizeNonNegativeInteger,
  toCheckboxBoolean,
  toFiniteNumber
} from "./src/core/value-normalization.mjs";
import {
  CHARACTERISTICS,
  CHARACTERISTIC_KEYS,
  PLAYER_ZERO_PV_STATE_PRESET_ID,
  STATE_MODIFIER_PATHS,
  STATE_PRESETS,
  STATE_PRESET_BY_ID,
  STATE_PRESET_ORDER
} from "./src/config/actors.mjs";
import { registerBloodmanCoreSettings, initializeBloodmanLoggerFromSettings } from "./src/core/settings.mjs";
import { registerSystemDocumentSheets } from "./src/sheets/register-sheets.mjs";
import { registerBloodmanHandlebarsHelpers } from "./src/sheets/register-handlebars-helpers.mjs";
import { registerBloodmanTemplatePartials } from "./src/sheets/register-template-partials.mjs";
import { createActorItemDndController } from "./src/sheets/actor-item-dnd.mjs";
import { createDropDocumentResolutionController } from "./src/sheets/drop-document-resolution.mjs";
import { createOpenActorSheetController } from "./src/sheets/open-actor-sheets.mjs";
import {
  buildActorSheetBaseData,
  callPrototypeMethod,
  getHandlebarsActorSheetV2Base,
  getHTMLElementFromHtmlLike,
  getSheetElementWrapper,
  getSheetHTMLElement
} from "./src/sheets/sheet-dom.mjs";
import {
  getDocumentUuidOrId,
  isFoundryDocumentLike,
  sanitizeRenderOptions
} from "./src/sheets/render-options.mjs";
import {
  getActivePrivilegedOperatorIds,
  getActiveGMUserIds,
  isAssistantOrHigherRole,
  isCurrentUserPrimaryPrivilegedOperator,
  registerPrivilegedUsersCacheHooks
} from "./src/core/privileged-users.mjs";
import {
  compatFromUuid,
  compatFromUuidSync,
  compatGetDocumentClass,
  foundryVersion,
  getFoundryGeneration,
  getDragEventData,
  getAudioHelper,
  getDialogClass,
  getDialogV2Class,
  getDocumentCollectionClass,
  getLegacyApplicationClass,
  getRollClass,
  createRoll,
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
import { createItemLifecycleHooks } from "./src/hooks/item-lifecycle.mjs";
import { buildActorUpdateHooks } from "./src/hooks/actor-update.mjs";
import { createActorLifecycleHooks } from "./src/hooks/actor-lifecycle.mjs";
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
import { buildDamageSplitPopupHooks } from "./src/hooks/damage-split-popup.mjs";
import { buildPowerUsePopupHooks } from "./src/hooks/power-use-popup.mjs";
import { buildChatRelayHelpers } from "./src/hooks/chat-relay.mjs";
import { buildChatRollDecorationHooks } from "./src/hooks/chat-roll-decoration.mjs";
import { buildChatMessageRoutingHooks } from "./src/hooks/chat-message-routing.mjs";
import { buildTokenCombatHooks } from "./src/hooks/token-combat.mjs";
import { createTokenHudLifecycleHooks } from "./src/hooks/token-hud-lifecycle.mjs";
import { registerTokenCombatHooks } from "./src/hooks/register-token-combat-hooks.mjs";
import {
  buildStartupCombatantNameNormalization,
  buildStartupSceneTokenNormalization,
  buildStartupNormalizationHooks
} from "./src/hooks/startup-normalization.mjs";
import { buildDamageRollFlavorMarkup } from "./src/ui/damage-chat.mjs";
import { buildDropDecisionDialogContent } from "./src/ui/drop-decision-dialog.mjs";
import { createMultilineTextHtmlFormatter } from "./src/ui/multiline-text.mjs";
import {
  collectOpenApplications,
  getApplicationDocumentActor
} from "./src/ui/open-applications.mjs";
import {
  installCreateTypeIconObserver,
  refreshAllCreateTypeIcons,
  registerCreateTypeIconRenderHooks
} from "./src/ui/document-create-type-icons.mjs";
import { createChaosDicePanelController } from "./src/ui/chaos-dice-panel.mjs";
import {
  ACTOR_SHEET_NUMERIC_FOCUS_SELECTOR,
  createActorSheetNumericFocusController
} from "./src/ui/actor-sheet-numeric-focus.mjs";
import { createActorSheetPermissionController } from "./src/ui/actor-sheet-permissions.mjs";
import {
  createBloodmanDialog,
  renderBloodmanDialog
} from "./src/ui/dialog-rendering.mjs";
import {
  getFilePickerClass,
  renderFilePickerSafely
} from "./src/ui/file-picker.mjs";
import {
  configureTokenHudEnhancements,
  decrementTokenHudCountersForActorTurn,
  ensureTokenHudLocalSvgIcons,
  installTokenHudDomObserver,
  installTokenHudRenderPatch,
  refreshTokenHudStatusEffectIconPaths,
  scheduleTokenHudDomEnhancement
} from "./src/ui/token-hud.mjs";
import {
  applyTransparentTokenEffectBackground,
  installTokenEffectBackgroundPatch
} from "./src/ui/token-effect-background.mjs";
import {
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
import { normalizeRollDieFormula, validateRollFormula } from "./src/rules/roll-formula.mjs";
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
import {
  createItemLinkDeletionRules,
  createItemLinkRules,
  resolveItemLinkData
} from "./src/rules/item-links.mjs";
import { createResourceGaugeRules } from "./src/rules/resource-gauge.mjs";
import { createStatePresetRules } from "./src/rules/state-presets.mjs";
import { createPlayerResourceActionRules } from "./src/rules/player-resource-actions.mjs";
import { createZeroPvStatusController } from "./src/rules/zero-pv-status.mjs";
import {
  ACTOR_TOKEN_IMAGE_UPDATE_PATHS,
  TOKEN_IMAGE_UPDATE_PATHS,
  TOKEN_TEXTURE_VALIDITY_CACHE,
  createTokenImageController
} from "./src/rules/token-images.mjs";
import { createItemBucketRules } from "./src/rules/item-buckets.mjs";
import { createItemBonusRules } from "./src/rules/item-bonuses.mjs";
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
import {
  ITEM_SINGLE_USE_COUNT_PATH,
  createItemNormalizationRules
} from "./src/rules/item-normalization.mjs";
import {
  VOYAGE_XP_COST_ITEM_TYPES,
  VOYAGE_XP_SKIP_CREATE_OPTION,
  createItemVoyageXpRules
} from "./src/rules/item-voyage-xp.mjs";
import { createGrowthRollRules } from "./src/rules/growth-roll.mjs";
import { createUiRefreshQueueRules } from "./src/rules/ui-refresh-queue.mjs";
import { installCombatantInitiativePatch } from "./src/rules/combatant-initiative-patch.mjs";
import { createStartupNormalizationRunner } from "./src/rules/startup-normalization.mjs";
import { resolveActorBackpackEnabled } from "./src/rules/backpack.mjs";
import {
  CHARACTERISTIC_BASE_MAX,
  CHARACTERISTIC_BASE_MIN,
  canUserRoleDropMenuItems,
  canUserRoleEditCharacteristics,
  canUserRoleOpenItemSheets,
  clampCharacteristicBaseForRole,
  isCharacteristicBaseRangeRestrictedRole,
  isBasicPlayerRole
} from "./src/rules/user-roles.mjs";
import {
  getCarriedItemInventorySlots,
  normalizeCarriedItemInventorySlots,
  sumCarriedItemInventorySlots
} from "./src/rules/carried-item-slots.mjs";
import { createActorSheetLayoutRules } from "./src/ui/actor-sheet-layout.mjs";
import { createItemSheetControlsController } from "./src/ui/item-sheet-controls.mjs";
import { createItemSheetEquipWithController } from "./src/ui/item-sheet-equip-with.mjs";
import { createItemSheetLayoutController } from "./src/ui/item-sheet-layout.mjs";
import { createItemSheetPricePreviewRules } from "./src/ui/item-sheet-price-preview.mjs";
import { createItemDisplayDataBuilder } from "./src/ui/item-display-data.mjs";
import {
  buildBloodmanSupplementalStatusEffects,
  registerBloodmanSupplementalStatusEffects
} from "./src/rules/status-effects.mjs";
import {
  parseLooseNumericInput as ruleParseLooseNumericInput,
  parseSimpleArithmeticInput as ruleParseSimpleArithmeticInput,
  normalizeSignedModifierInput as ruleNormalizeSignedModifierInput,
  buildItemModifierErrorMessage as ruleBuildItemModifierErrorMessage
} from "./src/rules/numeric-input.mjs";
import {
  planActorUpdateRestrictionByRole,
} from "./src/rules/actor-updates.mjs";
import { t, tl } from "./src/core/localization.mjs";

const BaseActorSheet = getLegacyApplicationClass("ActorSheet");
const BaseItemSheet = getLegacyApplicationClass("ItemSheet");
const ActorsCollection = getDocumentCollectionClass("Actors");
const ItemsCollection = getDocumentCollectionClass("Items");

const SIMPLE_ATTACK_REROLL_ID = "__bloodman-simple-attack__";
let zeroPvStatusController = null;
let tokenImageController = null;
let openActorSheetController = null;
let dropDocumentResolutionController = null;

function getZeroPvStatusController() {
  if (!zeroPvStatusController) {
    zeroPvStatusController = createZeroPvStatusController({
      logger: bmLog,
      getProperty: (source, path) => foundry.utils.getProperty(source, path),
      getGame: () => game,
      getTokenDocumentsForActor,
      setActorStatePresetActive,
      resolveStatePresetSelection,
      applyTransparentTokenEffectBackground,
      playerZeroPvStatePresetId: PLAYER_ZERO_PV_STATE_PRESET_ID
    });
  }
  return zeroPvStatusController;
}

function getTokenImageController() {
  if (!tokenImageController) {
    tokenImageController = createTokenImageController({
      getProperty: (source, path) => foundry.utils.getProperty(source, path),
      expandObject: source => foundry.utils.expandObject(source),
      getGame: () => game,
      getCanvas: () => canvas,
      getTokenActorType,
      isCharacterLikeActorType,
      getTokenDocumentsForActor,
      textureValidityCache: TOKEN_TEXTURE_VALIDITY_CACHE
    });
  }
  return tokenImageController;
}

function getOpenActorSheetController() {
  if (!openActorSheetController) {
    openActorSheetController = createOpenActorSheetController({
      getGame: () => game,
      getDocument: () => globalThis.document,
      getJQuery: () => globalThis.jQuery || globalThis.$,
      collectOpenApplications,
      getApplicationDocumentActor,
      getSheetElementWrapperForApp: getSheetElementWrapper,
      carriedItemLimitBase: CARRIED_ITEM_LIMIT_BASE,
      carriedItemLimitWithBag: CARRIED_ITEM_LIMIT_WITH_BAG,
      characterActorTypes: [PLAYER_ACTOR_TYPE, NPC_ACTOR_TYPE]
    });
  }
  return openActorSheetController;
}

function getDropDocumentResolutionController() {
  if (!dropDocumentResolutionController) {
    dropDocumentResolutionController = createDropDocumentResolutionController({
      getItemDocumentClass: () => Item?.implementation?.fromDropData ? Item.implementation : Item,
      getGame: () => game,
      fromUuid: compatFromUuid
    });
  }
  return dropDocumentResolutionController;
}

function getSimpleAttackRerollLabel() {
  return tl("BLOODMAN.Common.SimpleAttack", "Attaque simple");
}

function safeWarn(message) {
  try {
    ui.notifications?.warn(message);
  } catch (error) {
    bmLog.warn("notify.warn failed", { message, error });
  }
}

function getActorPlayerViewerIds(actor) {
  if (!actor) return [];
  const ownerLevel = Number(CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3);
  return Array.from(game?.users || [])
    .filter(user => {
      if (!user?.active || user?.isGM) return false;
      if (typeof actor?.testUserPermission !== "function") return false;
      return actor.testUserPermission(user, ownerLevel);
    })
    .map(user => String(user?.id || "").trim())
    .filter(Boolean);
}

const formatMultilineTextToHtml = createMultilineTextHtmlFormatter({
  escapeMarkup: escapeChatMarkup,
  cacheMax: 400
});

const ENABLE_CREATE_TYPE_ICON_OBSERVER = false;

function canCurrentUserEditCharacteristics() {
  return canUserRoleEditCharacteristics(game.user?.role);
}

function canCurrentUserDropMenuItems() {
  return canUserRoleDropMenuItems(game.user?.role);
}

function canCurrentUserOpenItemSheets() {
  return canUserRoleOpenItemSheets(game.user?.role);
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

function getTokenActorType(tokenDoc) {
  return getZeroPvStatusController().getTokenActorType(tokenDoc);
}

function isPvBarAttribute(attribute) {
  return getZeroPvStatusController().isPvBarAttribute(attribute);
}

function getTokenBarPvValue(tokenDoc) {
  return getZeroPvStatusController().getTokenBarPvValue(tokenDoc);
}

function getTokenCurrentPv(tokenDoc) {
  return getZeroPvStatusController().getTokenCurrentPv(tokenDoc);
}

function getTokenPvFromUpdate(tokenDoc, changes) {
  return getZeroPvStatusController().getTokenPvFromUpdate(tokenDoc, changes);
}

async function syncZeroPvStatusForToken(tokenDoc, actorType, pvCurrent) {
  return getZeroPvStatusController().syncZeroPvStatusForToken(tokenDoc, actorType, pvCurrent);
}

async function syncNpcDeadStatusToZeroPvForToken(tokenDoc, actorType = "") {
  return getZeroPvStatusController().syncNpcDeadStatusToZeroPvForToken(tokenDoc, actorType);
}

async function syncNpcDeadStatusToZeroPvFromActiveEffect(effectDoc) {
  return getZeroPvStatusController().syncNpcDeadStatusToZeroPvFromActiveEffect(effectDoc);
}
if (!globalThis.__bmSyncZeroPvStatusForToken) {
  globalThis.__bmSyncZeroPvStatusForToken = syncZeroPvStatusForToken;
}

function getTokenDocumentsForActor(actor) {
  return getOpenActorSheetController().getTokenDocumentsForActor(actor);
}

function getActorDocumentInstanceKey(actorDoc) {
  return getOpenActorSheetController().getActorDocumentInstanceKey(actorDoc);
}

function getResolvedActorDocumentCaches() {
  return getOpenActorSheetController().getResolvedActorDocumentCaches();
}

function clearResolvedActorDocumentCaches() {
  return getOpenActorSheetController().clearResolvedActorDocumentCaches();
}

function getActorInstancesById(actorId) {
  return getOpenActorSheetController().getActorInstancesById(actorId);
}

function getOwnedCharacterActorInstances() {
  return getOpenActorSheetController().getOwnedCharacterActorInstances();
}

function getOpenSheetActorInstances() {
  return getOpenActorSheetController().getOpenSheetActorInstances();
}

function getActorSheetMatchKeys(actor) {
  return getOpenActorSheetController().getActorSheetMatchKeys(actor);
}

function getActorSheetDomMatchTokens(actor) {
  return getOpenActorSheetController().getActorSheetDomMatchTokens(actor);
}

function getOpenActorSheetApplicationsForActor(actor) {
  return getOpenActorSheetController().getOpenActorSheetApplicationsForActor(actor);
}

function patchBackpackControlsInRoot(root, enabled) {
  return getOpenActorSheetController().patchBackpackControlsInRoot(root, enabled);
}

function patchOpenActorSheetBackpackControls(app, enabled) {
  return getOpenActorSheetController().patchOpenActorSheetBackpackControls(app, enabled);
}

function patchActorSheetDomBackpackControls(actor, enabled) {
  return getOpenActorSheetController().patchActorSheetDomBackpackControls(actor, enabled);
}

function renderOpenActorSheetsForActor(actor) {
  return getOpenActorSheetController().renderOpenActorSheetsForActor(actor);
}

function updateOpenActorSheetsBackpackState(actor, enabled) {
  return getOpenActorSheetController().updateOpenActorSheetsBackpackState(actor, enabled);
}

function resolveAttackerActorInstancesForDamageApplied(data) {
  return getOpenActorSheetController().resolveAttackerActorInstancesForDamageApplied(data);
}

async function syncZeroPvStatusForActor(actor) {
  return getZeroPvStatusController().syncZeroPvStatusForActor(actor);
}

async function syncInjuredStateStatusForActor(actor, active) {
  return getZeroPvStatusController().syncInjuredStateStatusForActor(actor, active);
}

function resolveInjuredStateActive(label) {
  return getZeroPvStatusController().resolveInjuredStateActive(label);
}

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

function stopHandledDropEvent(eventLike) {
  const nativeEvent = eventLike?.originalEvent || eventLike;
  if (typeof eventLike?.preventDefault === "function") eventLike.preventDefault();
  else nativeEvent?.preventDefault?.();
  if (typeof eventLike?.stopImmediatePropagation === "function") eventLike.stopImmediatePropagation();
  else nativeEvent?.stopImmediatePropagation?.();
  if (typeof eventLike?.stopPropagation === "function") eventLike.stopPropagation();
  else nativeEvent?.stopPropagation?.();
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
  return getZeroPvStatusController().syncZeroPvBodyStateForToken(tokenDoc, actorType, isZeroOrLess);
}

async function syncZeroPvBodyStateForActor(actor, actorType, isZeroOrLess) {
  return getZeroPvStatusController().syncZeroPvBodyStateForActor(actor, actorType, isZeroOrLess);
}

const CARRIED_ITEMS_PER_MAIN_COLUMN = 5;
const CARRIED_MAIN_COLUMN_COUNT = 2;
const CARRIED_BAG_COLUMN_COUNT = 1;
const CARRIED_ITEM_LIMIT_BASE = CARRIED_ITEMS_PER_MAIN_COLUMN * CARRIED_MAIN_COLUMN_COUNT;
const CARRIED_ITEM_LIMIT_WITH_BAG = CARRIED_ITEM_LIMIT_BASE + (CARRIED_ITEMS_PER_MAIN_COLUMN * CARRIED_BAG_COLUMN_COUNT);
const CARRIED_ITEM_LIMIT_ACTOR_TYPES = new Set([PLAYER_ACTOR_TYPE, NPC_ACTOR_TYPE]);
const CARRIED_ITEM_TYPE_LIST = Object.freeze(["arme", "objet", "protection", "ration", "soin"]);
const CARRIED_ITEM_TYPES = new Set(CARRIED_ITEM_TYPE_LIST);
const BAG_ZONE_ITEM_TYPES = new Set(CARRIED_ITEM_TYPE_LIST);
const ITEM_LINK_SUPPORTED_TYPES = new Set(SYSTEM_ITEM_TYPES);
const ITEM_LINK_EQUIPER_AVEC_ACCEPTED_TYPES = SYSTEM_ITEM_TYPES.join(",");
const ITEM_LINK_EQUIPER_AVEC_ACCEPTED_TYPE_SET = new Set(ITEM_LINK_EQUIPER_AVEC_ACCEPTED_TYPES.split(","));
const BAG_ZONE_FLAG_KEY = "inBag";
const CARRY_COLUMN_FLAG_KEY = "carryColumn";
const CARRY_COLUMN_EQUIPMENT = "equipment";
const CARRY_COLUMN_OBJECTS_ONE = "objects-1";
const CARRY_COLUMN_OBJECTS_TWO = "objects-2";
const CARRY_COLUMN_BAG = "bag";
const CARRY_COLUMN_SET = new Set([
  CARRY_COLUMN_EQUIPMENT,
  CARRY_COLUMN_OBJECTS_ONE,
  CARRY_COLUMN_OBJECTS_TWO,
  CARRY_COLUMN_BAG
]);
const CARRY_OBJECT_COLUMNS = [
  CARRY_COLUMN_OBJECTS_ONE,
  CARRY_COLUMN_OBJECTS_TWO
];
const CARRY_COLUMN_CAPACITY = Object.freeze({
  [CARRY_COLUMN_OBJECTS_ONE]: CARRIED_ITEMS_PER_MAIN_COLUMN,
  [CARRY_COLUMN_OBJECTS_TWO]: CARRIED_ITEMS_PER_MAIN_COLUMN,
  [CARRY_COLUMN_BAG]: CARRIED_ITEMS_PER_MAIN_COLUMN
});
const CARRY_COLUMN_FULL_REASON = "colonne pleine";
const CHARACTERISTIC_BONUS_ITEM_TYPES = new Set(["arme", "objet", "protection", "aptitude", "pouvoir"]);
const ITEM_RESOURCE_BONUS_ITEM_TYPES = new Set(["aptitude", "pouvoir"]);
const PA_BONUS_ITEM_TYPES = new Set(["arme", "objet", "protection", "aptitude", "pouvoir"]);
const PRICE_ITEM_TYPES = new Set(SYSTEM_ITEM_TYPES);
const ITEM_BUCKET_TYPES = [...SYSTEM_ITEM_TYPES];
const CHARACTERISTIC_REROLL_PP_COST = 4;
const CHAOS_PER_PLAYER_REROLL = 1;
const CHAOS_COST_NPC_REROLL = 1;
const REROLL_VISIBILITY_MS = 5 * 60 * 1000;
const DAMAGE_REROLL_ALLOWED_ITEM_TYPES = new Set(["arme", "aptitude", "pouvoir"]);
const AUDIO_ENABLED_ITEM_TYPES = new Set(SYSTEM_ITEM_TYPES);
const AUDIO_FILE_EXTENSION_PATTERN = /\.(mp3|ogg|oga|wav|flac|m4a|aac|webm)$/i;
const ITEM_AUDIO_POST_ROLL_DELAY_MS = 450;
const CHAOS_DICE_PANEL_POSITION_SETTING = "chaosDicePanelPosition";
const CHAOS_DICE_VALUE_SETTING = "chaosDice";
const INTERNAL_CANVAS_PATCHES_SETTING = "enableInternalCanvasPatches";
const INTERNAL_COMBATANT_PATCHES_SETTING = "enableInternalCombatantPatches";
const STARTUP_NORMALIZATION_SETTING = "startupNormalizationVersion";
const SHEET_PERFORMANCE_DEBUG_SETTING = "debugSheetPerformance";
const STARTUP_NORMALIZATION_TARGET_VERSION = 1;
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
const CHARACTERISTIC_BASE_INPUT_SELECTOR = "input[name^='system.characteristics.'][name$='.base']";
const AMMO_UPDATE_PATHS = [
  "system.ammo",
  "system.ammo.type",
  "system.ammo.stock",
  "system.ammo.magazine",
  "system.ammo.value",
  "system.ammoPool",
  "system.ammoActiveIndex"
];

const itemTypeFlagRules = createItemTypeFlagRules({
  damageRerollAllowedItemTypes: DAMAGE_REROLL_ALLOWED_ITEM_TYPES,
  voyageXpCostItemTypes: VOYAGE_XP_COST_ITEM_TYPES,
  carriedItemLimitActorTypes: CARRIED_ITEM_LIMIT_ACTOR_TYPES,
  carriedItemLimitBase: CARRIED_ITEM_LIMIT_BASE,
  carriedItemLimitWithBag: CARRIED_ITEM_LIMIT_WITH_BAG,
  resolveBagSlotsEnabled: actor => resolveActorBackpackEnabled(actor, { items: Array.from(actor?.items || []) }).enabled
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
const chaosDicePanelController = createChaosDicePanelController({
  systemId: SYSTEM_ID,
  systemSocket: SYSTEM_SOCKET,
  chaosDiceValueSetting: CHAOS_DICE_VALUE_SETTING,
  chaosDicePanelPositionSetting: CHAOS_DICE_PANEL_POSITION_SETTING,
  chaosRequestChatMarkup: CHAOS_REQUEST_CHAT_MARKUP,
  isChatTransportFallbackEnabled: ENABLE_CHAT_TRANSPORT_FALLBACK,
  getActiveGMUserIds,
  hasSocket,
  socketEmit,
  translate: tl,
  escapeMarkup: escapeChatMarkup,
  showVoyageXpGrantDialog: () => showSelectedVoyageXpGrantDialog(),
  showFullPvRestoreConfirmDialog: () => showSelectedFullPvRestoreConfirmDialog(),
  showFullPpRestoreConfirmDialog: () => showSelectedFullPpRestoreConfirmDialog()
});
const {
  getChaosValue,
  setChaosValue,
  requestChaosDelta,
  updateChaosDiceUI,
  positionChaosDiceUI,
  ensureChaosDiceUI
} = chaosDicePanelController;

function areInternalCanvasPatchesEnabled() {
  try {
    return game.settings.get(SYSTEM_ID, INTERNAL_CANVAS_PATCHES_SETTING) !== false;
  } catch (_error) {
    return true;
  }
}

function areInternalCombatantPatchesEnabled() {
  try {
    return game.settings.get(SYSTEM_ID, INTERNAL_COMBATANT_PATCHES_SETTING) !== false;
  } catch (_error) {
    return true;
  }
}

function readStoredStartupNormalizationVersion() {
  try {
    const raw = Number(game.settings.get(SYSTEM_ID, STARTUP_NORMALIZATION_SETTING));
    if (!Number.isFinite(raw)) return 0;
    return Math.max(0, Math.floor(raw));
  } catch (_error) {
    return 0;
  }
}

async function writeStoredStartupNormalizationVersion(nextVersion) {
  const normalized = Math.max(0, Math.floor(Number(nextVersion) || 0));
  try {
    await game.settings.set(SYSTEM_ID, STARTUP_NORMALIZATION_SETTING, normalized);
    return true;
  } catch (_error) {
    return false;
  }
}

function isSheetPerformanceDebugEnabled() {
  try {
    return game.settings.get(SYSTEM_ID, SHEET_PERFORMANCE_DEBUG_SETTING) === true;
  } catch (_error) {
    return false;
  }
}

function startPerfTimer() {
  return Number(globalThis?.performance?.now?.() ?? Date.now());
}

function endPerfTimer(startedAt) {
  const started = Number(startedAt);
  const now = Number(globalThis?.performance?.now?.() ?? Date.now());
  if (!Number.isFinite(started)) return 0;
  return Math.max(0, now - started);
}

function logSheetPerformance(label, details = {}) {
  if (!isSheetPerformanceDebugEnabled()) return;
  bmLog.info(`perf:${label}`, details);
}

function registerBloodmanRuntimeSettings() {
  if (!game?.settings || typeof game.settings.register !== "function") return;
  const registerSettingIfMissing = (settingKey, config) => {
    const settingPath = `${SYSTEM_ID}.${settingKey}`;
    if (game.settings.settings?.has?.(settingPath)) return false;
    game.settings.register(SYSTEM_ID, settingKey, config);
    return true;
  };

  registerSettingIfMissing(CHAOS_DICE_VALUE_SETTING, {
    name: t("BLOODMAN.Settings.ChaosDiceName"),
    scope: "world",
    config: false,
    type: Number,
    default: 0,
    onChange: value => {
      updateChaosDiceUI(typeof value === "number" ? value : Number(value));
      for (const app of collectOpenApplications()) {
        if (app instanceof BloodmanNpcSheet || app instanceof BloodmanNpcSheetV2) app.render(false);
      }
    }
  });

  registerSettingIfMissing(CHAOS_DICE_PANEL_POSITION_SETTING, {
    name: "Position du panneau des du chaos",
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  registerSettingIfMissing(INTERNAL_CANVAS_PATCHES_SETTING, {
    name: "Bloodman internal canvas patches",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  registerSettingIfMissing(INTERNAL_COMBATANT_PATCHES_SETTING, {
    name: "Bloodman internal combatant patches",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  registerSettingIfMissing(STARTUP_NORMALIZATION_SETTING, {
    name: "Bloodman startup normalization version",
    scope: "world",
    config: false,
    type: Number,
    default: 0
  });

  registerSettingIfMissing(SHEET_PERFORMANCE_DEBUG_SETTING, {
    name: "Bloodman debug sheet performance",
    hint: "Logs actor sheet render and drop timings in the console.",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });
}

const playerResourceActionRules = createPlayerResourceActionRules({
  normalizeNonNegativeInteger,
  translate: tl,
  escapeMarkup: escapeChatMarkup,
  getGame: () => globalThis.game,
  getCanvas: () => globalThis.canvas,
  createChatMessage: data => globalThis.ChatMessage?.create?.(data),
  warn: (...args) => bmLog.warn(...args),
  playerActorType: PLAYER_ACTOR_TYPE
});

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

const itemLinkRules = createItemLinkRules({
  hasUpdatePath,
  getUpdatedPathValue,
  setProperty: foundry.utils.setProperty,
  toCheckboxBoolean
});
const { normalizeItemLinkUpdate } = itemLinkRules;
const itemLinkDeletionRules = createItemLinkDeletionRules({
  resolveItemLinkState,
  getCurrentUser: () => globalThis.game?.user,
  translateWithFallback: tl,
  warn: safeWarn
});
const { cleanupItemLinksAfterDeletion } = itemLinkDeletionRules;

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
const itemBonusRules = createItemBonusRules({
  characteristics: CHARACTERISTICS,
  characteristicBonusItemTypes: CHARACTERISTIC_BONUS_ITEM_TYPES,
  resourceBonusItemTypes: ITEM_RESOURCE_BONUS_ITEM_TYPES,
  isActorItemLinkedChild,
  computeItemCharacteristicBonusTotals,
  computeItemResourceBonusTotals,
  toCheckboxBoolean
});
const {
  getVisibleActorItems,
  getItemBonusTotals,
  getItemResourceBonusTotals
} = itemBonusRules;

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
const actorSheetNumericFocusController = createActorSheetNumericFocusController({
  getSheetHTMLElement,
  getSheetElementWrapper,
  queueUiMicrotask,
  clearUiMicrotask,
  getDocument: () => globalThis.document
});
const actorSheetPermissionController = createActorSheetPermissionController({
  isBasicPlayerRole,
  canCurrentUserEditCharacteristics,
  getUserRole: () => game.user?.role,
  getSheetElementWrapper,
  vitalResourceInputSelector: VITAL_RESOURCE_INPUT_SELECTOR,
  characteristicBaseInputSelector: CHARACTERISTIC_BASE_INPUT_SELECTOR
});
const {
  resolveAutoResizeKey: resolveActorSheetAutoResizeKey,
  resolveTextareaAutoGrowState,
  resolveSheetWindowTargetHeight,
  resolveSheetWindowPosition,
  resolveResponsiveLayoutMode: resolveActorSheetResponsiveLayoutMode
} = actorSheetLayoutRules;
const itemSheetLayoutController = createItemSheetLayoutController({
  resolveTextareaAutoGrowState,
  resolveDeferredRoot,
  queueUiMicrotask,
  clearUiMicrotask,
  getWindow: () => globalThis,
  getDocument: () => globalThis.document,
  getHTMLElementClass: () => globalThis.HTMLElement,
  getHTMLTextAreaElementClass: () => globalThis.HTMLTextAreaElement,
  getResizeObserverClass: () => globalThis.ResizeObserver
});
const itemSheetControlsController = createItemSheetControlsController({
  getFilePickerClass,
  renderFilePickerSafely,
  warn: safeWarn,
  isPriceManagedItemType,
  normalizeNonNegativeInteger,
  resolveSaleManualFlag: resolveItemSaleManualFlag,
  resolveItemPricePreviewUiState,
  playItemAudio: (item, options) => playItemAudio(item, options),
  resolveDeferredRoot,
  queueUiMicrotask,
  clearUiMicrotask
});
const itemSheetEquipWithController = createItemSheetEquipWithController({
  normalizeItemLinkTemplateEntries,
  buildItemLinkTemplateEntryFromItemDocument,
  isItemLinkSupportedType,
  resolveDroppedItemFromDropData: resolveDroppedItemFromDropDataCached,
  getDragEventData,
  fromUuid: compatFromUuid,
  warn: safeWarn,
  translateWithFallback: tl,
  getHTMLElementClass: () => globalThis.HTMLElement
});

let actorItemDndController = null;

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
  getPlayAudio: () => {
    const audioHelper = getAudioHelper();
    return typeof audioHelper?.play === "function" ? (...args) => audioHelper.play(...args) : null;
  },
  logError: (...args) => bmLog.error(...args),
  defaultDelayMs: ITEM_AUDIO_POST_ROLL_DELAY_MS
});
const { playItemAudio } = itemAudioPlaybackRules;

function buildDropDataCacheKey(entry) {
  return getDropDocumentResolutionController().buildDropDataCacheKey(entry);
}

function pruneDropDataCache() {
  return getDropDocumentResolutionController().pruneDropDataCache();
}

async function resolveDroppedItemFromActorDropData(entry) {
  return getDropDocumentResolutionController().resolveDroppedItemFromActorDropData(entry);
}

function resolveDroppedItemFromDropDataCached(entry) {
  return getDropDocumentResolutionController().resolveDroppedItemFromDropDataCached(entry);
}

const dropDecisionRules = createDropDecisionRules({
  parseLooseNumericInput,
  roundCurrencyValue,
  formatCurrencyValue,
  toFiniteNumber,
  normalizeRollDieFormula,
  getWeaponCategory,
  normalizeNonNegativeInteger,
  getWeaponLoadedAmmo,
  fromDropData: resolveDroppedItemFromDropDataCached,
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
  fromDropData: resolveDroppedItemFromDropDataCached,
  roundCurrencyValue,
  getDropItemQuantity: resolveDropItemQuantity,
  getDroppedItemUnitPrice: resolveDroppedItemUnitPrice,
  carriedItemTypes: CARRIED_ITEM_TYPES,
  shouldCountCarriedItem: item => isCarriedItemCountedForBag(item),
  getCarriedItemSlots: item => getCarriedItemInventorySlots(item)
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
  resolvePowerRollPlan,
  resolveItemRerollRollPlan,
  resolveItemUsePlan,
  isObjectUseEnabled,
  buildHealAudioReference
} = itemUseFlowRules;
const growthRollRules = createGrowthRollRules({ toFiniteNumber });
const {
  computeGrowthEffectiveScore,
  resolveGrowthOutcome,
  buildGrowthUpdateData
} = growthRollRules;

function isCharacterLikeActorType(actorType) {
  const normalized = String(actorType || "").trim();
  return normalized === PLAYER_ACTOR_TYPE || normalized === NPC_ACTOR_TYPE;
}

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
  buildDefaultAmmoLine,
  normalizeAmmoType,
  getActorAmmoCapacityLimit,
  normalizeAmmoPool,
  clampAmmoActiveIndex,
  normalizeAmmoState,
  buildActiveAmmoState,
  areAmmoStatesEqual,
  areAmmoPoolStatesEqual,
  hasAmmoUpdatePayload,
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

function getActorAmmoPoolState(actor) {
  const capacity = getActorAmmoCapacityLimit(actor);
  const ammoPool = normalizeAmmoPool(actor?.system?.ammoPool, {
    fallbackAmmo: actor?.system?.ammo
  });
  const ammoActiveIndex = clampAmmoActiveIndex(actor?.system?.ammoActiveIndex, ammoPool, 0);
  const ammo = buildActiveAmmoState({
    ammoPool,
    activeIndex: ammoActiveIndex,
    currentAmmo: actor?.system?.ammo,
    capacity
  });
  return {
    ammoPool,
    ammoActiveIndex,
    ammo
  };
}

function isMissingTokenImage(src) {
  return getTokenImageController().isMissingTokenImage(src);
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

async function canLoadTextureSource(src) {
  return getTokenImageController().canLoadTextureSource(src);
}

async function needsTokenImageRepair(src) {
  return getTokenImageController().needsTokenImageRepair(src);
}

function getSafeTokenTextureFallback(tokenDoc) {
  return getTokenImageController().getSafeTokenTextureFallback(tokenDoc);
}

async function repairTokenTextureSource(tokenLike) {
  return getTokenImageController().repairTokenTextureSource(tokenLike);
}

async function syncPrototypeTokenImageFromActorImage(actor) {
  return getTokenImageController().syncPrototypeTokenImageFromActorImage(actor);
}

async function syncSceneTokenImagesFromActorImage(actor, options = {}) {
  return getTokenImageController().syncSceneTokenImagesFromActorImage(actor, options);
}

function resolveWorldActorFromTokenDocument(tokenDoc) {
  return getTokenImageController().resolveWorldActorFromTokenDocument(tokenDoc);
}

async function syncActorAndPrototypeImageFromTokenImage(tokenDoc) {
  return getTokenImageController().syncActorAndPrototypeImageFromTokenImage(tokenDoc);
}

async function getPrototypeTokenImageNormalizationUpdates(actor) {
  return getTokenImageController().getPrototypeTokenImageNormalizationUpdates(actor);
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
  return playerResourceActionRules.getSelectedPlayerActors(controlledTokens);
}

function formatVoyageXpGrantLine(actorName, amount) {
  return playerResourceActionRules.formatVoyageXpGrantLine(actorName, amount);
}

async function grantVoyageXpToSelectedPlayers(rawAmount, options = {}) {
  return playerResourceActionRules.grantVoyageXpToSelectedPlayers(rawAmount, options);
}

async function postVoyageXpGrantSummary(result) {
  return playerResourceActionRules.postVoyageXpGrantSummary(result);
}

function formatFullPpRestoreLine(actorName, restore = {}) {
  return playerResourceActionRules.formatFullPpRestoreLine(actorName, restore);
}

function formatFullPvRestoreLine(actorName, restore = {}) {
  return playerResourceActionRules.formatFullPvRestoreLine(actorName, restore);
}

async function restoreFullPpToSelectedPlayers(options = {}) {
  return playerResourceActionRules.restoreFullPpToSelectedPlayers(options);
}

async function restoreFullPvToSelectedPlayers(options = {}) {
  return playerResourceActionRules.restoreFullPvToSelectedPlayers(options);
}

async function postFullPpRestoreSummary(result) {
  return playerResourceActionRules.postFullPpRestoreSummary(result);
}

async function postFullPvRestoreSummary(result) {
  return playerResourceActionRules.postFullPvRestoreSummary(result);
}

function resolveItemLinkState(itemOrSystem = null) {
  return resolveItemLinkData(itemOrSystem, { toCheckboxBoolean });
}

function getLinkedParentItemId(item, actorLike = null) {
  const itemId = String(item?.id || item?._id || "").trim();
  const link = resolveItemLinkState(item);
  const parentItemId = String(link?.parentItemId || "").trim();
  if (!parentItemId) return "";
  if (itemId && parentItemId === itemId) return "";
  const actor = actorLike || item?.actor || item?.parent || null;
  if (!actor?.items?.has?.(parentItemId)) return "";
  return parentItemId;
}

function isActorItemLinkedChild(item, actorLike = null) {
  return Boolean(getLinkedParentItemId(item, actorLike));
}

function isItemLinkSupportedType(typeLike) {
  const type = String(typeLike || "").trim().toLowerCase();
  return ITEM_LINK_SUPPORTED_TYPES.has(type);
}

function isCarriedItemCountedForBag(item, actorLike = null) {
  const itemType = String(item?.type || "").trim().toLowerCase();
  if (!CARRIED_ITEM_TYPES.has(itemType)) return false;
  if (isActorItemLinkedChild(item, actorLike)) return false;
  const link = resolveItemLinkState(item);
  return Boolean(link.containerCountsForBag);
}

function resolveLinkedChildOriginalItemType(item) {
  if (!item) return "";
  const link = resolveItemLinkState(item);
  if (!link.parentItemId) return "";
  const rawOriginalType = String(
    item?.system?.link?.originalItemType
    || ""
  ).trim().toLowerCase();
  if (rawOriginalType === "pouvoir" || rawOriginalType === "aptitude") return rawOriginalType;
  return "";
}

function getItemRuntimeType(item) {
  const rawType = String(item?.type || "").trim().toLowerCase();
  if (rawType !== "objet") return rawType;
  const link = resolveItemLinkState(item);
  if (!link.parentItemId) return rawType;

  const originalType = resolveLinkedChildOriginalItemType(item);
  if (originalType) return originalType;

  // Legacy fallback: items remapped to "objet" from "pouvoir" can keep `usableEnabled`.
  const systemData = item?.system && typeof item.system === "object"
    ? item.system
    : {};
  if (
    Object.prototype.hasOwnProperty.call(systemData, "usableEnabled")
    && !Object.prototype.hasOwnProperty.call(systemData, "useEnabled")
  ) {
    return "pouvoir";
  }
  return rawType;
}

function sanitizeItemSourceReferences(entryData, options = {}) {
  const keepSourceReference = options.keepSourceReference === true;
  const source = entryData && typeof entryData === "object"
    ? entryData
    : {};

  if (!keepSourceReference) {
    delete source._templateSourceUuid;
    delete source._templateSourceId;
  }

  if (source.flags?.core && typeof source.flags.core === "object") {
    delete source.flags.core.sourceId;
    if (!Object.keys(source.flags.core).length) delete source.flags.core;
    if (source.flags && !Object.keys(source.flags).length) delete source.flags;
  }

  const linkData = source.system?.link;
  if (linkData && typeof linkData === "object" && Array.isArray(linkData.equiperAvecTemplates)) {
    linkData.equiperAvecTemplates = linkData.equiperAvecTemplates
      .map(templateEntry => {
        if (!templateEntry || typeof templateEntry !== "object") return null;
        const clonedTemplate = foundry.utils.deepClone(templateEntry);
        sanitizeItemSourceReferences(clonedTemplate, { keepSourceReference });
        return clonedTemplate;
      })
      .filter(Boolean);
  }

  return source;
}

function normalizeItemLinkTemplateEntries(value, options = {}) {
  const keepSourceReference = options.keepSourceReference !== false;
  const source = Array.isArray(value) ? value : [];
  const normalizedEntries = [];
  for (const entry of source) {
    if (!entry || typeof entry !== "object") continue;
    const cloned = foundry.utils.deepClone(entry);
    sanitizeItemSourceReferences(cloned, { keepSourceReference });
    const type = String(cloned?.type || "").trim().toLowerCase();
    if (!isItemLinkSupportedType(type)) continue;
    cloned.type = type;
    cloned.name = String(cloned?.name || "").trim() || t("BLOODMAN.Common.Name");
    cloned.img = String(cloned?.img || "").trim() || "icons/svg/item-bag.svg";
    cloned.system = cloned.system && typeof cloned.system === "object"
      ? cloned.system
      : {};
    normalizedEntries.push(cloned);
  }
  return normalizedEntries;
}

function buildItemLinkTemplateEntryFromItemDocument(itemDocument, options = {}) {
  const keepSourceReference = options.keepSourceReference !== false;
  if (!itemDocument) return null;
  const source = typeof itemDocument?.toObject === "function"
    ? itemDocument.toObject()
    : foundry.utils.deepClone(itemDocument);
  if (!source || typeof source !== "object") return null;
  const type = String(source?.type || itemDocument?.type || "").trim().toLowerCase();
  if (!isItemLinkSupportedType(type)) return null;
  const entry = foundry.utils.deepClone(source);
  sanitizeItemSourceReferences(entry, { keepSourceReference });
  entry.type = type;
  entry.name = String(itemDocument?.name || entry?.name || "").trim() || t("BLOODMAN.Common.Name");
  entry.img = String(itemDocument?.img || entry?.img || "").trim() || "icons/svg/item-bag.svg";
  entry.system = entry.system && typeof entry.system === "object"
    ? entry.system
    : {};
  if (keepSourceReference) {
    entry._templateSourceUuid = String(itemDocument?.uuid || entry?._templateSourceUuid || "").trim();
    entry._templateSourceId = String(itemDocument?.id || entry?._id || "").trim();
  } else {
    delete entry._templateSourceUuid;
    delete entry._templateSourceId;
  }
  return entry;
}

function buildItemLinkTemplateDisplayData(entry, index = 0) {
  const type = String(entry?.type || "").trim().toLowerCase();
  const note = String(
    entry?.system?.noteSmall
    || entry?.system?.note
    || entry?.system?.notes
    || ""
  ).trim();
  return {
    index,
    type,
    typeLabel: tl(`TYPES.Item.${type}`, type || t("BLOODMAN.Common.Name")),
    name: String(entry?.name || "").trim() || t("BLOODMAN.Common.Name"),
    img: String(entry?.img || "").trim() || "icons/svg/item-bag.svg",
    shortNote: note,
    shortNoteHtml: formatMultilineTextToHtml(note),
    sourceUuid: String(entry?._templateSourceUuid || "").trim()
  };
}

function buildActorChildCreateDataFromItemTemplate(entry, parentItemId) {
  if (!entry || typeof entry !== "object") return null;
  const childData = foundry.utils.deepClone(entry);
  sanitizeItemSourceReferences(childData, { keepSourceReference: false });
  const type = String(childData?.type || "").trim().toLowerCase();
  if (!isItemLinkSupportedType(type)) return null;

  delete childData._id;
  delete childData.folder;
  delete childData.sort;
  delete childData._stats;
  delete childData._templateSourceUuid;
  delete childData._templateSourceId;

  childData.type = type;
  childData.name = String(childData?.name || "").trim() || t("BLOODMAN.Common.Name");
  childData.img = String(childData?.img || "").trim() || "icons/svg/item-bag.svg";
  childData.system = childData.system && typeof childData.system === "object"
    ? childData.system
    : {};
  childData.system.link = childData.system.link && typeof childData.system.link === "object"
    ? childData.system.link
    : {};
  childData.system.link.parentItemId = String(parentItemId || "").trim();
  childData.system.link.equiperAvecEnabled = false;
  childData.system.link.equiperAvec = [];
  childData.system.link.equiperAvecTemplates = [];
  return childData;
}

function buildRuntimeTypedItem(item, runtimeType) {
  if (!item) return item;
  const normalizedRuntimeType = String(runtimeType || "").trim().toLowerCase();
  const currentType = String(item?.type || "").trim().toLowerCase();
  if (!normalizedRuntimeType || normalizedRuntimeType === currentType) return item;
  return {
    id: item.id,
    name: item.name,
    type: normalizedRuntimeType,
    system: item.system || {},
    actor: item.actor || item.parent || null
  };
}

function resolveItemProtectionLabel(itemLike, options = {}) {
  const type = String(options?.type || itemLike?.type || "").trim().toLowerCase();
  if (!type || !PA_BONUS_ITEM_TYPES.has(type)) return "";
  const rawPa = toFiniteNumber(itemLike?.system?.pa, 0);
  const pa = Math.max(0, Math.floor(rawPa));
  const defaultProtectionEnabled = type === "protection" || rawPa !== 0;
  const protectionEnabled = toCheckboxBoolean(itemLike?.system?.protectionEnabled, defaultProtectionEnabled);
  if (!protectionEnabled || pa <= 0) return "";
  return `PA ${pa}`;
}

function buildLinkedChildDisplayData(childItem, options = {}) {
  const display = buildItemDisplayData(childItem);
  const rawType = String(childItem?.type || display?.type || "").trim().toLowerCase();
  const runtimeType = getItemRuntimeType(childItem) || rawType;
  display.type = runtimeType;
  display.typeLabel = tl(`TYPES.Item.${runtimeType}`, runtimeType || t("BLOODMAN.Common.Name"));
  display.shortNote = String(
    childItem?.system?.noteSmall
    || childItem?.system?.note
    || childItem?.system?.notes
    || ""
  ).trim();
  display.shortNoteHtml = formatMultilineTextToHtml(display.shortNote);
  display.childShowPowerUseButton = false;
  display.childShowAptitudeUseButton = false;
  display.childUseLabel = "";
  display.childUseClass = "";
  display.childRollLabel = "";
  display.childRollClass = "";
  display.childRollMode = "";
  display.childRollAction = "";
  display.childShowAmmoState = false;
  display.childAmmoMagazine = 0;
  display.childAmmoCapacityDisplay = 0;
  display.childShowReloadButton = false;
  display.childReloadBlocked = false;
  display.childProtectionLabel = resolveItemProtectionLabel(childItem, { type: runtimeType });

  const powerUseState = options.powerUseState instanceof Set
    ? options.powerUseState
    : null;
  const isPlayerActor = options.isPlayerActor === true;
  const shouldShowItemReroll = typeof options.shouldShowItemReroll === "function"
    ? options.shouldShowItemReroll
    : () => false;
  const ammo = options.ammo && typeof options.ammo === "object"
    ? options.ammo
    : null;
  const itemId = String(childItem?.id || display?._id || "").trim();

  if (runtimeType === "pouvoir") {
    const usableEnabled = isPowerUsableEnabled(childItem?.system?.usableEnabled);
    const isActivated = usableEnabled && itemId && powerUseState ? powerUseState.has(itemId) : false;
    if (!usableEnabled && itemId && powerUseState) powerUseState.delete(itemId);
    const hasPowerHeal = Boolean(display.displayHealDie);
    const hasPowerDamage = !hasPowerHeal && Boolean(display.displayDamageDie);
    display.childShowPowerUseButton = usableEnabled;
    display.childRollMode = hasPowerHeal ? "heal" : (hasPowerDamage ? "damage" : "none");
    display.childRollAction = "ability";
    display.childRollClass = hasPowerHeal ? "ability-roll bm-btn-heal" : "ability-roll bm-btn-damage";
    const rawPowerLabel = hasPowerHeal
      ? String(display.displayHealDie || "")
      : (hasPowerDamage ? String(display.displayDamageDie || "") : "");
    display.childRollLabel = (usableEnabled && !isActivated) ? "" : rawPowerLabel;
    if (display.childRollLabel && display.childRollMode === "damage") {
      display.showItemReroll = shouldShowItemReroll(itemId);
    }
    return display;
  }

  if (runtimeType === "aptitude") {
    display.childShowAptitudeUseButton = isPlayerActor;
    if (display.displayDamageDie) {
      display.childRollLabel = String(display.displayDamageDie || "");
      display.childRollClass = "ability-roll bm-btn-damage";
      display.childRollMode = "damage";
      display.childRollAction = "ability";
      display.showItemReroll = shouldShowItemReroll(itemId);
    }
    return display;
  }

  if (runtimeType === "arme") {
    const damageDie = String(childItem?.system?.damageDie || "").trim();
    if (damageDie) {
      display.childRollLabel = normalizeRollDieFormula(damageDie, "d4");
      display.childRollClass = "weapon-roll bm-btn-damage";
      display.childRollMode = "damage";
      display.childRollAction = "weapon";
      display.showItemReroll = shouldShowItemReroll(itemId);
    }

    const weaponCategory = getWeaponCategory(childItem?.system?.weaponType);
    const consumesAmmo = weaponCategory === "distance" && !toCheckboxBoolean(childItem?.system?.infiniteAmmo, false);
    const magazineCapacity = normalizeNonNegativeInteger(childItem?.system?.magazineCapacity, 0);
    const usesDirectStock = consumesAmmo && magazineCapacity <= 0;
    const ammoStock = consumesAmmo && ammo ? Math.max(0, Number(ammo.stock || 0)) : 0;
    const loadedAmmo = usesDirectStock
      ? ammoStock
      : getWeaponLoadedAmmo(childItem, { fallback: Number(ammo?.magazine || 0) });
    const magazineMissingAmmo = !usesDirectStock && loadedAmmo < magazineCapacity;
    display.childShowAmmoState = consumesAmmo;
    display.childAmmoMagazine = loadedAmmo;
    display.childAmmoCapacityDisplay = usesDirectStock ? ammoStock : magazineCapacity;
    display.childShowReloadButton = consumesAmmo && !usesDirectStock && ammoStock > 0 && magazineMissingAmmo;
    display.childReloadBlocked = consumesAmmo && !usesDirectStock && ammoStock <= 0;
    return display;
  }

  if (runtimeType === "soin") {
    const healDie = String(childItem?.system?.healDie || "").trim();
    display.childUseLabel = normalizeRollDieFormula(healDie || "d4", "d4");
    display.childUseClass = "item-use bm-btn-heal";
    return display;
  }

  if (runtimeType === "ration") {
    display.childUseLabel = t("BLOODMAN.Common.Eat");
    display.childUseClass = "item-use bm-btn-heal";
    return display;
  }

  if (runtimeType === "objet" && toCheckboxBoolean(childItem?.system?.useEnabled, false)) {
    const objectDamageEnabled = toCheckboxBoolean(
      childItem?.system?.damageEnabled,
      childItem?.system?.damageDie != null
    );
    const objectDamageDie = String(childItem?.system?.damageDie || "").trim();
    if (objectDamageEnabled && objectDamageDie) {
      display.childUseLabel = normalizeRollDieFormula(objectDamageDie, "d4");
      display.childUseClass = "item-use bm-btn-damage";
    } else {
      display.childUseLabel = t("BLOODMAN.Common.Use");
      display.childUseClass = "item-use bm-btn-magic";
    }
    return display;
  }

  return display;
}

function buildEquiperAvecChildrenForParent(actor, parentItem, options = {}) {
  if (!actor || !parentItem) return [];
  const parentId = String(parentItem.id || parentItem._id || "").trim();
  if (!parentId) return [];
  const parentLink = resolveItemLinkState(parentItem);
  if (!parentLink.equiperAvecEnabled) return [];
  const orderedChildren = [];
  const seen = new Set();
  for (const childId of parentLink.equiperAvec || []) {
    const normalizedChildId = String(childId || "").trim();
    if (!normalizedChildId || seen.has(normalizedChildId)) continue;
    const child = actor.items?.get?.(normalizedChildId) || null;
    if (!child) continue;
    if (getLinkedParentItemId(child, actor) !== parentId) continue;
    seen.add(normalizedChildId);
    orderedChildren.push(buildLinkedChildDisplayData(child, options));
  }
  return orderedChildren;
}

function buildEquiperAvecDisplayData(actor, parentItem, options = {}) {
  const link = resolveItemLinkState(parentItem);
  const children = buildEquiperAvecChildrenForParent(actor, parentItem, options);
  return {
    equiperAvecEnabled: Boolean(link.equiperAvecEnabled),
    equiperAvecChildren: children,
    hasEquiperAvecChildren: children.length > 0
  };
}

function getProtectionPA(actor) {
  if (!actor?.items) return 0;
  let total = 0;
  for (const item of actor.items) {
    if (isActorItemLinkedChild(item, actor)) continue;
    const type = String(item?.type || "").trim().toLowerCase();
    if (!PA_BONUS_ITEM_TYPES.has(type)) continue;
    const rawPa = toFiniteNumber(item?.system?.pa, 0);
    const defaultProtectionEnabled = type === "protection" || rawPa !== 0;
    const protectionEnabled = toCheckboxBoolean(item?.system?.protectionEnabled, defaultProtectionEnabled);
    if (!protectionEnabled) continue;
    const pa = Math.floor(rawPa);
    if (Number.isFinite(pa) && pa > 0) total += pa;
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
const damageSplitPopupTracker = createRequestRetentionTracker({ retentionMs: DAMAGE_REQUEST_RETENTION_MS });
const powerUsePopupTracker = createRequestRetentionTracker({ retentionMs: DAMAGE_REQUEST_RETENTION_MS });
const chaosRequestTracker = createRequestRetentionTracker({ retentionMs: DAMAGE_REQUEST_RETENTION_MS });
const rerollRequestTracker = createRequestRetentionTracker({ retentionMs: DAMAGE_REQUEST_RETENTION_MS });
const POWER_USE_POPUP_CHAT_MARKUP = "<span style='display:none'>bloodman-power-use-popup</span>";

const { rememberRequest: rememberDamageRequest, wasRequestProcessed: wasDamageRequestProcessed } = damageRequestTracker;
const { rememberRequest: rememberDamageConfigPopupRequest, wasRequestProcessed: wasDamageConfigPopupRequestProcessed } = damageConfigPopupTracker;
const { rememberRequest: rememberDamageSplitPopupRequest, wasRequestProcessed: wasDamageSplitPopupRequestProcessed } = damageSplitPopupTracker;
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

function buildCharacteristicSummaryFlavor({
  outcome = "",
  characteristicLabel = "",
  rollTotal = 0,
  success = false
} = {}) {
  const statusClass = success ? "success" : "failure";
  return `<div class="bm-char-roll-summary bm-char-roll-summary--${statusClass}">
    <span class="bm-char-roll-status bm-char-roll-status--${statusClass}">${escapeChatMarkup(outcome)}</span>
    <span class="bm-char-roll-summary-separator">-</span>
    <span class="bm-char-roll-summary-label">${escapeChatMarkup(characteristicLabel)}</span>
    <span class="bm-char-roll-summary-separator">-</span>
    <span class="bm-char-roll-summary-total">${escapeChatMarkup(rollTotal)}</span>
  </div>`;
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
  evaluateRoll: formula => createRoll(formula).evaluate()
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
  resolveItemRerollSource: resolveItemRerollSourceState,
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
  escapeHtml: escapeChatMarkup,
  createDialog: createBloodmanDialog,
  wasDamageConfigPopupRequestProcessed,
  rememberDamageConfigPopupRequest,
  logWarn: (...args) => bmLog.warn(...args)
});
const { handleDamageConfigPopupMessage } = damageConfigPopupHooks;
const damageSplitPopupHooks = buildDamageSplitPopupHooks({
  toFiniteNumber,
  t,
  tl,
  getCurrentUser: () => game.user,
  getUsersCollection: () => game.users,
  isAssistantOrHigherRole,
  escapeHtml: escapeChatMarkup,
  createDialog: createBloodmanDialog,
  wasDamageSplitPopupRequestProcessed,
  rememberDamageSplitPopupRequest,
  logWarn: (...args) => bmLog.warn(...args)
});
const { handleDamageSplitPopupMessage } = damageSplitPopupHooks;

const powerUsePopupHooks = buildPowerUsePopupHooks({
  hasSocket,
  socketEmit,
  systemSocket: SYSTEM_SOCKET,
  getCurrentUser: () => game.user,
  getActivePrivilegedOperatorIds,
  getActorPlayerViewerIds,
  normalizeRollDieFormula,
  toBooleanFlag,
  toFiniteNumber,
  enableChatTransportFallback: ENABLE_CHAT_TRANSPORT_FALLBACK,
  createChatMessage: data => ChatMessage.create(data),
  powerUsePopupChatMarkup: POWER_USE_POPUP_CHAT_MARKUP,
  isAssistantOrHigherRole,
  formatMultilineTextToHtml,
  escapeHtml: escapeChatMarkup,
  createDialog: createBloodmanDialog,
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
  toFiniteNumber,
  applyActorItemTransfer: applyActorItemTransferFromSocket,
  getActorById: actorId => game.actors?.get(actorId) || null,
  fromUuid: compatFromUuid
});
const {
  handleVitalResourceUpdateRequest,
  handleActorSheetUpdateRequest,
  handleDeleteItemRequest,
  handleReorderActorItemsRequest,
  handleActorItemTransferRequest
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
  requestReorderActorItems,
  requestActorItemTransfer
} = actorSocketRequestClient;

actorItemDndController = createActorItemDndController({
  getHTMLElementClass: () => globalThis.HTMLElement,
  getSheetElementWrapper,
  getGame: () => globalThis.game,
  getUi: () => globalThis.ui,
  getFoundryGeneration,
  getDragEventData,
  toFiniteNumber,
  startPerfTimer,
  endPerfTimer,
  logSheetPerformance,
  requestReorderActorItems,
  safeWarn,
  translateWithFallback: tl,
  getCarriedItemInventorySlots,
  sumCarriedItemInventorySlots,
  carriedItemTypes: CARRIED_ITEM_TYPES,
  carryColumnSet: CARRY_COLUMN_SET,
  carryColumnCapacity: CARRY_COLUMN_CAPACITY,
  carryColumnEquipment: CARRY_COLUMN_EQUIPMENT,
  carryColumnObjectsOne: CARRY_COLUMN_OBJECTS_ONE,
  carryColumnObjectsTwo: CARRY_COLUMN_OBJECTS_TWO,
  carryColumnBag: CARRY_COLUMN_BAG,
  carryColumnFullReason: CARRY_COLUMN_FULL_REASON
});

async function handleActorBackpackStateChangedMessage(data) {
  const requester = game.users?.get?.(String(data?.requesterId || ""));
  if (!requester || (!requester.isGM && !isAssistantOrHigherRole(requester.role))) return;
  const actor = await resolveActorForSheetRequest({
    actorUuid: data?.actorUuid,
    actorId: data?.actorId,
    actorBaseId: data?.actorBaseId
  });
  const enabled = toBooleanFlag(data?.enabled, false);
  if (actor && typeof actor.updateSource === "function") {
    try {
      const updateData = foundry.utils?.expandObject
        ? foundry.utils.expandObject({ "system.equipment.bagSlotsEnabled": enabled })
        : { system: { equipment: { bagSlotsEnabled: enabled } } };
      actor.updateSource(updateData);
    } catch (_error) {
      // The authoritative Foundry document update may already have arrived.
    }
  }
  updateOpenActorSheetsBackpackState(actor || {
    id: String(data?.actorId || ""),
    uuid: String(data?.actorUuid || ""),
    baseActor: { id: String(data?.actorBaseId || "") }
  }, enabled);
}

async function applyActorItemTransferFromSocket(payload = {}) {
  const targetActor = payload?.targetActor || null;
  const transferEntries = Array.isArray(payload?.transferEntries) ? payload.transferEntries : [];
  if (!targetActor || !transferEntries.length) return null;
  if (isCarriedItemLimitedActorType(targetActor.type)) {
    const incomingSlots = transferEntries
      .map(entry => entry?.droppedItem)
      .filter(item => item && CARRIED_ITEM_TYPES.has(String(item.type || "").trim().toLowerCase()))
      .filter(item => isCarriedItemCountedForBag(item, targetActor))
      .reduce((total, item) => total + getCarriedItemInventorySlots(item), 0);
    if (incomingSlots > 0) {
      const currentSlots = Array.from(targetActor.items || [])
        .filter(item => isCarriedItemCountedForBag(item, targetActor))
        .reduce((total, item) => total + getCarriedItemInventorySlots(item), 0);
      const limit = getActorCarriedItemsLimit(targetActor);
      if (isCarriedItemsLimitExceeded({
        currentCarriedCount: currentSlots,
        incomingCarriedCount: incomingSlots,
        carriedItemsLimit: limit
      })) {
        return null;
      }
    }
  }
  return applyActorToActorItemTransferRule({
    ...payload,
    renderTarget: () => renderOpenActorSheetsForActor(targetActor)
  });
}

const systemSocketHooks = buildSystemSocketHooks({
  systemSocket: SYSTEM_SOCKET,
  hasSocket,
  socketOn,
  socketOff,
  isCurrentUserPrimaryPrivilegedOperator,
  handleDamageConfigPopupMessage,
  handleDamageSplitPopupMessage,
  handlePowerUsePopupMessage,
  handleDamageAppliedMessage,
  handleDamageRerollRequest,
  handleVitalResourceUpdateRequest,
  handleActorSheetUpdateRequest,
  handleDeleteItemRequest,
  handleReorderActorItemsRequest,
  handleActorItemTransferRequest,
  handleActorBackpackStateChangedMessage,
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

async function decrementActiveCombatantTokenHudCounters(combat) {
  if (!game.user?.isGM) return;
  if (!combat?.active) return;
  const resetKey = getCombatMoveResetKey(combat);
  if (!resetKey || resetKey === LAST_TOKEN_HUD_COUNTER_TICK_KEY) return;
  LAST_TOKEN_HUD_COUNTER_TICK_KEY = resetKey;

  const activeCombatant = getActiveCombatant(combat);
  const actor = getCombatantActor(activeCombatant);
  if (!actor || (actor.type !== "personnage" && actor.type !== "personnage-non-joueur")) return;

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

registerCreateTypeIconRenderHooks();

const canvasReadyHooks = buildCanvasReadyHooks({
  installTokenEffectBackgroundPatch,
  installTokenHudRenderPatch,
  installTokenHudDomObserver,
  scheduleTokenHudDomEnhancement,
  applyTransparentTokenEffectBackground,
  refreshBossSoloNpcPvMax,
  repairTokenTextureSource,
  shouldApplyTokenHudPatches: areInternalCanvasPatchesEnabled
});

const tokenHudLifecycleHooks = createTokenHudLifecycleHooks({
  shouldApplyTokenHudPatches: areInternalCanvasPatchesEnabled,
  configureTokenHudEnhancements,
  canvasReadyHooks,
  initializeLoggerFromSettings: initializeBloodmanLoggerFromSettings,
  logger: bmLog,
  installTokenEffectBackgroundPatch,
  ensureTokenHudLocalSvgIcons,
  refreshTokenHudStatusEffectIconPaths,
  installTokenHudRenderPatch,
  installTokenHudDomObserver,
  scheduleTokenHudDomEnhancement
});

Hooks.on("renderTokenHUD", tokenHudLifecycleHooks.onRenderTokenHud);
Hooks.on("canvasReady", tokenHudLifecycleHooks.onCanvasReady);
Hooks.on("controlToken", tokenHudLifecycleHooks.onControlToken);
Hooks.once("ready", tokenHudLifecycleHooks.onReadyTokenHudPatches);

Hooks.once("init", () => {
  registerCreateTypeIconRenderHooks();
  registerBloodmanCoreSettings();
  registerBloodmanMigrationSettings();
  registerBloodmanHandlebarsHelpers();
  void registerBloodmanTemplatePartials({ logger: bmLog });
  registerPrivilegedUsersCacheHooks();
  initializeBloodmanLoggerFromSettings();
  bmLog.info("compat:init", {
    foundryVersion: foundryVersion(),
    generation: getFoundryGeneration()
  });

  registerBloodmanSupplementalStatusEffects(
    CONFIG.statusEffects,
    buildBloodmanSupplementalStatusEffects({ systemRootPath: SYSTEM_ROOT_PATH })
  );
  registerBloodmanRuntimeSettings();

  const actorSheetClass = ResolvedBloodmanActorSheetV2Base ? BloodmanActorSheetV2 : BloodmanActorSheet;
  const npcSheetClass = ResolvedBloodmanActorSheetV2Base ? BloodmanNpcSheetV2 : BloodmanNpcSheet;
  registerSystemDocumentSheets({
    actorSheetClass,
    npcSheetClass,
    itemSheetClass: BloodmanItemSheet,
    actorsCollection: ActorsCollection,
    itemsCollection: ItemsCollection,
    baseActorSheet: BaseActorSheet,
    baseItemSheet: BaseItemSheet,
    logger: bmLog
  });

  if (!areInternalCombatantPatchesEnabled()) {
    bmLog.info("combatant prototype patch disabled by world setting");
  } else {
    const combatantDoc = compatGetDocumentClass("Combatant") || CONFIG?.Combatant?.documentClass;
    const initiativePatchResult = installCombatantInitiativePatch({
      combatantDocumentClass: combatantDoc,
      getCombatantActor,
      isCharacterLikeActorType,
      getInitiativeFormulaForActor,
      getRollClass
    });
    if (!initiativePatchResult.ok) {
      bmLog.warn("combatant initiative patch skipped", initiativePatchResult);
    } else if (initiativePatchResult.reason === "applied") {
      bmLog.info("combatant initiative patch applied");
    }
  }
});

async function applyStartupActorNormalization(actor) {
  if (!actor?.isOwner) return;
  const isCharacter = actor.type === PLAYER_ACTOR_TYPE;
  const isNpc = actor.type === NPC_ACTOR_TYPE;
  if (!isCharacter && !isNpc) return;

  const updates = {};

  if (!actor.system.characteristics) {
    updates["system.characteristics"] = buildDefaultCharacteristics();
  } else {
    for (const characteristicDefinition of CHARACTERISTICS) {
      const characteristicXp = actor.system.characteristics?.[characteristicDefinition.key]?.xp;
      if (!Array.isArray(characteristicXp)) {
        updates[`system.characteristics.${characteristicDefinition.key}.xp`] = [false, false, false];
      }
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
    updates["system.resources.voyage"] = null;
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

  const { ammoPool, ammoActiveIndex, ammo: normalizedAmmo } = getActorAmmoPoolState(actor);
  if (!Array.isArray(actor.system?.ammoPool) || !areAmmoPoolStatesEqual(actor.system?.ammoPool, ammoPool)) {
    updates["system.ammoPool"] = ammoPool;
  }
  if (toFiniteNumber(actor.system?.ammoActiveIndex, 0) !== ammoActiveIndex) {
    updates["system.ammoActiveIndex"] = ammoActiveIndex;
  }
  const hasAmmoShape = actor.system?.ammo
    && actor.system.ammo.stock != null
    && actor.system.ammo.magazine != null
    && actor.system.ammo.value != null;
  if (!hasAmmoShape || !areAmmoStatesEqual(actor.system?.ammo, normalizedAmmo)) {
    updates["system.ammo"] = normalizedAmmo;
  }
  Object.assign(updates, await getPrototypeTokenImageNormalizationUpdates(actor));

  if (Object.keys(updates).length) await actor.update(updates);
  await applyItemResourceBonuses(actor);
  await syncActorDerivedCharacteristicsResources(actor);
}

async function applyStartupActorItemNormalization(actor) {
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

const applyStartupCombatantNameNormalization = buildStartupCombatantNameNormalization({
  getCombats: () => game.combats || [],
  getCombatantDisplayName
});

const applyStartupSceneTokenNormalization = buildStartupSceneTokenNormalization({
  getScenes: () => game.scenes,
  getTokenActorType,
  playerActorType: PLAYER_ACTOR_TYPE,
  npcActorType: NPC_ACTOR_TYPE,
  isCharacterLikeActorType,
  getActorById: actorId => game.actors?.get(actorId) || null,
  getProperty: foundry.utils.getProperty,
  needsTokenImageRepair,
  canLoadTextureSource,
  getTokenCurrentPv,
  syncZeroPvStatusForToken
});

const startupNormalizationHooks = buildStartupNormalizationHooks({
  getActors: () => game.actors,
  applyStartupActorNormalization,
  applyStartupActorItemNormalization,
  applyStartupCombatantNameNormalization,
  applyStartupSceneTokenNormalization,
  refreshBossSoloNpcPvMax
});

const startupNormalizationRunner = createStartupNormalizationRunner({
  targetVersion: STARTUP_NORMALIZATION_TARGET_VERSION,
  readStoredVersion: readStoredStartupNormalizationVersion,
  writeStoredVersion: writeStoredStartupNormalizationVersion,
  runNormalizationPass: startupNormalizationHooks.runStartupNormalizationPass,
  logger: {
    warn: (message, context) => bmLog.warn(message, context)
  }
});

Hooks.once("ready", async () => {
  try {
    refreshAllCreateTypeIcons();
    installCreateTypeIconObserver({ enabled: ENABLE_CREATE_TYPE_ICON_OBSERVER });
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
  const startupNormalizationState = await startupNormalizationRunner.runIfNeeded();
  if (!startupNormalizationState.ran) {
    bmLog.info("startup normalization skipped", {
      storedVersion: startupNormalizationState.storedVersion,
      targetVersion: startupNormalizationState.targetVersion
    });
  }
  if (startupNormalizationState.ran) {
    bmLog.info("startup normalization completed", {
      storedVersion: startupNormalizationState.storedVersion,
      targetVersion: startupNormalizationState.targetVersion,
      completed: startupNormalizationState.completed
    });
  }
  ensureChaosDiceUI();
});

function showSelectedVoyageXpGrantDialog() {
  if (!game.user?.isGM) return;
  if (typeof getDialogClass() !== "function" && typeof getDialogV2Class() !== "function") return;
  const escapeHtml = escapeChatMarkup;
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
  const dialog = createBloodmanDialog(
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
  if (dialog?.render) dialog.render(true);
}

function showSelectedFullPpRestoreConfirmDialog() {
  if (!game.user?.isGM) return;
  if (typeof getDialogClass() !== "function" && typeof getDialogV2Class() !== "function") return;

  const selectedTokens = [...(globalThis.canvas?.tokens?.controlled || [])];
  const selectedCount = Array.isArray(selectedTokens) ? selectedTokens.length : 0;
  const recipients = getSelectedVoyageXpRecipientActors(selectedTokens);
  if (!selectedCount || !recipients.length) {
    void restoreFullPpToSelectedPlayers({ selectedTokens }).then(postFullPpRestoreSummary);
    return;
  }

  const escapeHtml = escapeChatMarkup;
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

  const dialog = createBloodmanDialog(
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
  if (dialog?.render) dialog.render(true);
}

function showSelectedFullPvRestoreConfirmDialog() {
  if (!game.user?.isGM) return;
  if (typeof getDialogClass() !== "function" && typeof getDialogV2Class() !== "function") return;

  const selectedTokens = [...(globalThis.canvas?.tokens?.controlled || [])];
  const selectedCount = Array.isArray(selectedTokens) ? selectedTokens.length : 0;
  const recipients = getSelectedVoyageXpRecipientActors(selectedTokens);
  if (!selectedCount || !recipients.length) {
    void restoreFullPvToSelectedPlayers({ selectedTokens }).then(postFullPvRestoreSummary);
    return;
  }

  const escapeHtml = escapeChatMarkup;
  const titleText = tl("BLOODMAN.Dialogs.FullPVRestore.Title", "Restauration PV");
  const promptText = tl(
    "BLOODMAN.Dialogs.FullPVRestore.Prompt",
    "Restaurer integralement les points de vie (PV) des tokens joueurs selectionnes ?"
  );
  const selectionHint = tl(
    "BLOODMAN.Dialogs.FullPVRestore.SelectionHint",
    "{selected} token(s) selectionne(s), {eligible} token(s) joueur(s) concerne(s).",
    { selected: selectedCount, eligible: recipients.length }
  );
  const confirmLabel = tl("BLOODMAN.Dialogs.FullPVRestore.Confirm", "Restaurer");
  const cancelLabel = tl("BLOODMAN.Common.Cancel", "Annuler");
  const content = `<form class="bm-full-pv-dialog">
    <p>${escapeHtml(promptText)}</p>
    <p><small>${escapeHtml(selectionHint)}</small></p>
  </form>`;

  const dialog = createBloodmanDialog(
    {
      title: titleText,
      content,
      buttons: {
        confirm: {
          label: confirmLabel,
          callback: async () => {
            const result = await restoreFullPvToSelectedPlayers({ selectedTokens });
            await postFullPvRestoreSummary(result);
          }
        },
        cancel: {
          label: cancelLabel
        }
      },
      default: "cancel"
    },
    {
      classes: ["bloodman-damage-dialog", "bloodman-full-pv-dialog"],
      width: 460
    }
  );
  if (dialog?.render) dialog.render(true);
}

const itemNormalizationRules = createItemNormalizationRules({
  normalizeNonNegativeInteger,
  toCheckboxBoolean,
  toBooleanFlag,
  normalizeCarriedItemInventorySlots,
  hasUpdatePath,
  getUpdatedPathValue,
  setProperty: foundry.utils.setProperty,
  validateRollFormula,
  normalizeRollDieFormula,
  translate: t,
  translateWithFallback: tl,
  notifyError: message => ui.notifications?.error(message)
});
const {
  normalizeItemInventorySlotsUpdate,
  normalizeItemRollFormulaFields,
  normalizeItemSingleUseUpdate,
  normalizeSingleUseCountValue,
  notifyInvalidItemRollFormula,
  resolveItemSingleUseDisplayData
} = itemNormalizationRules;

const itemVoyageXpRules = createItemVoyageXpRules({
  normalizeNonNegativeInteger,
  isVoyageXPCostItemType,
  getProperty: foundry.utils.getProperty,
  setProperty: foundry.utils.setProperty,
  translate: t,
  warn: (...args) => bmLog.warn(...args),
  notifyError: message => ui.notifications?.error(message)
});
const {
  applyVoyageXPCostOnCreate,
  normalizeVoyageXpCostOnCreate,
  normalizeVoyageXpCostOnUpdate
} = itemVoyageXpRules;

const itemDerivedSyncHooks = buildItemDerivedSyncHooks({
  applyItemResourceBonuses,
  syncActorDerivedCharacteristicsResources,
  characteristicBonusItemTypes: CHARACTERISTIC_BONUS_ITEM_TYPES,
  bmLog,
  shouldProcessItemMutation: (_item, context = {}) => {
    const sourceUserId = String(context?.userId || context?.options?.userId || "");
    return !sourceUserId || sourceUserId === String(game.user?.id || "");
  }
});

const itemLifecycleHooks = createItemLifecycleHooks({
  getCurrentUserId: () => game.user?.id,
  notifyInvalidAudioSelection: item => {
    ui.notifications?.error(t("BLOODMAN.Notifications.ItemAudioInvalidSelection", { item: getItemAudioName(item) }));
  },
  normalizeItemAudioUpdate,
  normalizeItemLinkUpdate,
  normalizeItemPriceUpdate,
  normalizeWeaponMagazineCapacityUpdate,
  normalizeItemSingleUseUpdate,
  normalizeItemInventorySlotsUpdate,
  normalizeCharacteristicBonusItemUpdate,
  normalizeItemRollFormulaFields,
  notifyInvalidItemRollFormula,
  normalizeVoyageXpCostOnCreate,
  normalizeVoyageXpCostOnUpdate,
  applyVoyageXPCostOnCreate,
  handleItemDerivedSyncHook: (...args) => itemDerivedSyncHooks.handleItemDerivedSyncHook(...args),
  cleanupItemLinksAfterDeletion,
  renderOpenActorSheetsForActor
});

Hooks.on("createItem", itemLifecycleHooks.onCreateItem);
Hooks.on("preCreateItem", itemLifecycleHooks.onPreCreateItem);
Hooks.on("preUpdateItem", itemLifecycleHooks.onPreUpdateItem);

const chatMessageRoutingHooks = buildChatMessageRoutingHooks({
  getProperty: foundry.utils.getProperty,
  handleDamageConfigPopupMessage,
  handleDamageSplitPopupMessage,
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

const chatRenderHookName = getFoundryGeneration() >= 14 || globalThis.foundry?.applications?.api?.ApplicationV2
  ? "renderChatMessageHTML"
  : "renderChatMessage";
Hooks.on(chatRenderHookName, chatRenderHookName === "renderChatMessageHTML"
  ? chatMessageRoutingHooks.onRenderChatMessageHTML
  : chatMessageRoutingHooks.onRenderChatMessage);

Hooks.on("renderHotbar", () => {
  positionChaosDiceUI();
});

Hooks.on("updateItem", itemLifecycleHooks.onUpdateItem);
Hooks.on("deleteItem", itemLifecycleHooks.onDeleteItem);

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

const buildItemDisplayData = createItemDisplayDataBuilder({
  isPowerUsableEnabled,
  formatMultilineTextToHtml,
  resolveItemSingleUseDisplayData,
  normalizeRollDieFormula,
  toCheckboxBoolean
});

function getTransportNpcRefs(actor) {
  const refs = actor?.system?.equipment?.transportNpcs;
  if (!Array.isArray(refs)) return [];
  return refs
    .map(ref => (typeof ref === "string" ? ref.trim() : ""))
    .filter(ref => ref.length > 0);
}

function resolveTransportNpcSync(ref) {
  const normalizedRef = String(ref || "").trim();
  if (!normalizedRef) return null;

  const uuidCandidates = normalizedRef.startsWith("Actor.") || normalizedRef.startsWith("Compendium.")
    ? [normalizedRef]
    : [`Actor.${normalizedRef}`];
  const syncCandidates = [...uuidCandidates, normalizedRef];

  for (const candidate of syncCandidates) {
    if (!candidate.includes(".")) continue;
    const resolved = compatFromUuidSync(candidate);
    if (resolved?.type === "personnage-non-joueur") return resolved;
  }

  const worldActor = game.actors?.get(normalizedRef) || null;
  if (worldActor?.type === "personnage-non-joueur") return worldActor;

  return null;
}

async function resolveTransportNpc(ref) {
  const normalizedRef = String(ref || "").trim();
  if (!normalizedRef) return null;

  const syncResolved = resolveTransportNpcSync(normalizedRef);
  const isDocument = syncResolved?.documentName === "Actor"
    || typeof syncResolved?.toObject === "function"
    || typeof syncResolved?.sheet === "object";
  if (isDocument) return syncResolved;

  const uuidCandidates = normalizedRef.startsWith("Actor.") || normalizedRef.startsWith("Compendium.")
    ? [normalizedRef]
    : [`Actor.${normalizedRef}`];
  for (const candidate of uuidCandidates) {
    const resolved = await compatFromUuid(candidate).catch(() => null);
    if (resolved?.type === "personnage-non-joueur") return resolved;
  }

  return syncResolved;
}

function buildTransportNpcDisplayData(actor) {
  const transportNpcs = [];
  const seen = new Set();
  for (const ref of getTransportNpcRefs(actor)) {
    if (seen.has(ref)) continue;
    seen.add(ref);
    const npc = resolveTransportNpcSync(ref);
    if (!npc) {
      const fallbackName = String(ref || "").trim().split(".").slice(-1)[0] || "PNJ";
      transportNpcs.push({
        ref,
        id: ref,
        name: fallbackName,
        img: "icons/svg/mystery-man.svg",
        missing: true
      });
      continue;
    }
    const id = String(npc.id || npc._id || "").trim() || ref;
    const name = String(npc.name || "").trim() || id;
    const img = String(npc.img || "").trim() || "icons/svg/mystery-man.svg";
    transportNpcs.push({
      ref,
      id,
      name,
      img
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

registerTokenCombatHooks({
  tokenCombatHooks,
  clearResolvedActorDocumentCaches,
  syncNpcDeadStatusToZeroPvFromActiveEffect
});

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
  syncInjuredStateStatusForActor,
  resolveInjuredStateActive,
  tokenTextureValidityCache: TOKEN_TEXTURE_VALIDITY_CACHE,
  resolveWorldActorFromTokenDocument,
  syncSceneTokenImagesFromActorImage,
  syncPrototypeTokenImageFromActorImage,
  bmLog
});

const actorLifecycleHooks = createActorLifecycleHooks({
  clearResolvedActorDocumentCaches,
  onUpdateActorCore: (...args) => actorUpdateHooks.onUpdateActor(...args),
  getProperty: foundry.utils.getProperty,
  getCurrentUser: () => game.user,
  isCurrentUserPrimaryPrivilegedOperator,
  socketEmit,
  systemSocket: SYSTEM_SOCKET,
  resolveActorBackpackEnabled,
  updateOpenActorSheetsBackpackState
});

Hooks.on("updateActor", actorLifecycleHooks.onUpdateActor);
Hooks.on("createActor", actorLifecycleHooks.onActorDocumentCacheInvalidated);
Hooks.on("deleteActor", actorLifecycleHooks.onActorDocumentCacheInvalidated);
Hooks.on("createScene", actorLifecycleHooks.onActorDocumentCacheInvalidated);
Hooks.on("updateScene", actorLifecycleHooks.onActorDocumentCacheInvalidated);
Hooks.on("deleteScene", actorLifecycleHooks.onActorDocumentCacheInvalidated);

class BloodmanActorSheet extends BaseActorSheet {
  constructor(object, options = {}) {
    super(object, options);
    this.captureTokenDocumentReference(options?.token || object?.token || null);
    this.sanitizeStoredSheetOptions();
    this._optimisticBagSlotsEnabled = null;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["bloodman", "sheet", "actor"],
      template: PLAYER_ACTOR_SHEET_TEMPLATE_PATH,
      width: 1195,
      height: 670,
      popOut: true,
      minimizable: true,
      resizable: true,
      submitOnChange: true,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "carac" }]
    });
  }

  get token() {
    return this._bloodmanTokenDocument || super.token;
  }

  _getHeaderButtons() {
    return super._getHeaderButtons();
  }

  captureTokenDocumentReference(candidate) {
    if (isFoundryDocumentLike(candidate)) this._bloodmanTokenDocument = candidate;
  }

  sanitizeStoredSheetOptions() {
    if (!this.options || typeof this.options !== "object") return;
    for (const [key, value] of Object.entries(this.options)) {
      if (!isFoundryDocumentLike(value)) continue;
      if (key === "token") this.captureTokenDocumentReference(value);
      const ref = getDocumentUuidOrId(value);
      if (ref) this.options[`${key}Uuid`] = ref;
      delete this.options[key];
    }
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

  _render(force, options = {}) {
    registerBloodmanHandlebarsHelpers();
    return super._render(force, sanitizeRenderOptions(options));
  }

  render(force, options = {}) {
    registerBloodmanHandlebarsHelpers();
    if (options?.bloodmanResetRerollState === true) {
      this.clearRerollDisplayState();
    }
    this.captureActorSheetNumericFocus();
    this.captureTokenDocumentReference(options?.token || null);
    this.sanitizeStoredSheetOptions();
    return super.render(force, sanitizeRenderOptions(options));
  }

  setPosition(options = {}) {
    const viewportWidth = Math.max(
      Number(globalThis?.innerWidth) || 0,
      Number(globalThis?.document?.documentElement?.clientWidth) || 0,
      0
    );
    const viewportHeight = Math.max(
      Number(globalThis?.innerHeight) || 0,
      Number(globalThis?.document?.documentElement?.clientHeight) || 0,
      0
    );
    const nextPosition = resolveSheetWindowPosition({
      requestedPosition: options,
      currentPosition: this.position,
      defaultOptions: this.options,
      viewportWidth,
      viewportHeight
    });

    const position = super.setPosition(nextPosition);
    this.applyResponsiveActorSheetLayoutState();
    return position;
  }

  async close(options = {}) {
    this.clearRerollDisplayState();
    this.clearPowerUseState();
    this.clearDeferredSheetUiTasks();
    this.clearActorSheetNativeEditHandlers();
    this.disconnectResponsiveActorSheetLayoutObserver();
    this._responsiveActorSheetLayoutState = null;
    this._resourceBubbleRuntimeMap = null;
    clearUiMicrotask(this._pvGaugePulseTimer);
    clearUiMicrotask(this._ppGaugePulseTimer);
    this._pvGaugePulseTimer = null;
    this._ppGaugePulseTimer = null;
    this._lastAutoResizeKey = "";
    this._itemDropInFlightKeys = null;
    this._equiperAvecDropTarget = null;
    this._actorSheetNumericFocusState = null;
    clearUiMicrotask(this._numericFocusRestoreTaskId);
    this._numericFocusRestoreTaskId = null;
    return super.close(options);
  }

  clearDeferredSheetUiTasks() {
    clearUiMicrotask(this._forceEnableSheetTaskId);
    clearUiMicrotask(this._autoResizeTaskId);
    clearUiMicrotask(this._autoGrowRefreshTaskId);
    clearUiMicrotask(this._resourceGaugeRefreshTaskId);
    clearUiMicrotask(this._deferredSheetRenderTaskId);
    this._forceEnableSheetTaskId = null;
    this._autoResizeTaskId = null;
    this._autoGrowRefreshTaskId = null;
    this._resourceGaugeRefreshTaskId = null;
    this._deferredSheetRenderTaskId = null;
    this._queuedAutoResizeForce = false;
    this._queuedAutoGrowRoot = null;
    this._queuedResourceGaugeRoot = null;
    this._queuedDeferredSheetRenderForce = false;
    clearUiMicrotask(this._numericFocusRestoreTaskId);
    this._numericFocusRestoreTaskId = null;
  }

  isActorSheetNumericFocusInput(element) {
    return actorSheetNumericFocusController.isNumericFocusInput(this, element);
  }

  captureActorSheetNumericFocus(eventOrElement = null) {
    return actorSheetNumericFocusController.captureNumericFocus(this, eventOrElement);
  }

  restoreActorSheetNumericFocus(htmlLike = null) {
    return actorSheetNumericFocusController.restoreNumericFocus(this, htmlLike);
  }

  queueActorSheetNumericFocusRestore(htmlLike = null) {
    actorSheetNumericFocusController.queueNumericFocusRestore(this, htmlLike);
  }

  getResponsiveActorSheetRoot(rootLike = null) {
    const root = rootLike?.find ? rootLike[0] : rootLike;
    const elementRoot = typeof HTMLElement !== "undefined" && root instanceof HTMLElement
      ? root
      : getSheetHTMLElement(this);
    if (!elementRoot) return null;
    const sheetRoot = elementRoot.matches?.(".bloodman-sheet")
      ? elementRoot
      : elementRoot.querySelector?.(".bloodman-sheet");
    return typeof HTMLElement !== "undefined" && sheetRoot instanceof HTMLElement ? sheetRoot : null;
  }

  getResponsiveActorSheetObserverTarget(rootLike = null) {
    const sheetRoot = this.getResponsiveActorSheetRoot(rootLike);
    if (!sheetRoot) return null;
    return sheetRoot.closest?.(".app.window-app") || sheetRoot;
  }

  resolveResponsiveActorSheetLayoutMode({
    width = 0,
    height = 0,
    activeTab = ""
  } = {}) {
    return resolveActorSheetResponsiveLayoutMode({ width, height, activeTab });
  }

  applyResponsiveActorSheetLayoutState(rootLike = null) {
    const sheetRoot = this.getResponsiveActorSheetRoot(rootLike);
    const observerTarget = this.getResponsiveActorSheetObserverTarget(rootLike);
    if (!sheetRoot || !observerTarget) return null;
    const width = Math.max(
      Number(observerTarget.clientWidth) || 0,
      Math.round(Number(observerTarget.getBoundingClientRect?.().width) || 0),
      Number(this.position?.width) || 0,
      0
    );
    const height = Math.max(
      Number(observerTarget.clientHeight) || 0,
      Math.round(Number(observerTarget.getBoundingClientRect?.().height) || 0),
      Number(this.position?.height) || 0,
      0
    );
    const activeTab = this.getActivePrimaryTabId();
    const layoutMode = this.resolveResponsiveActorSheetLayoutMode({ width, height, activeTab });
    const measureElementHeight = element => Math.round(
      Math.max(
        Number(element?.getBoundingClientRect?.().height) || 0,
        Number(element?.scrollHeight) || 0,
        Number(element?.offsetHeight) || 0
      )
    );
    const parseCssMetric = value => {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const measureStackedChildrenHeight = container => {
      if (!(container instanceof HTMLElement)) return 0;
      const computed = globalThis.getComputedStyle?.(container) || null;
      let total = 0;
      total += parseCssMetric(computed?.paddingTop);
      total += parseCssMetric(computed?.paddingBottom);
      total += parseCssMetric(computed?.borderTopWidth);
      total += parseCssMetric(computed?.borderBottomWidth);
      const children = Array.from(container.children || []);
      for (const child of children) {
        if (!(child instanceof HTMLElement)) continue;
        const childComputed = globalThis.getComputedStyle?.(child) || null;
        total += Math.max(
          Number(child.scrollHeight) || 0,
          Number(child.offsetHeight) || 0,
          Math.round(Number(child.getBoundingClientRect?.().height) || 0)
        );
        total += parseCssMetric(childComputed?.marginTop);
        total += parseCssMetric(childComputed?.marginBottom);
      }
      return Math.round(total);
    };
    const activeCharacterTab = activeTab === "carac"
      ? sheetRoot.querySelector?.('.tab[data-tab="carac"].active')
      : null;
    const characteristicsCard = activeCharacterTab?.querySelector?.(".characteristics-card");
    const characterSidebar = activeCharacterTab?.querySelector?.(".sidebar");
    const characterPortraitFrame = activeCharacterTab?.querySelector?.(".portrait-frame");
    const characterResourceBadges = activeCharacterTab?.querySelector?.(".resource-badges");
    const characteristicsCardNaturalHeight = characteristicsCard instanceof HTMLElement
      ? Math.max(
        measureElementHeight(characteristicsCard),
        measureStackedChildrenHeight(characteristicsCard),
        measureElementHeight(characteristicsCard.querySelector?.(".characteristics-table")),
        measureElementHeight(characteristicsCard.querySelector?.(".card-header"))
      )
      : 0;
    const characteristicsCardHeight = characteristicsCardNaturalHeight;
    sheetRoot.dataset.bmSheetLayout = layoutMode;
    sheetRoot.dataset.bmActiveTab = activeTab;
    sheetRoot.style.setProperty("--bm-sheet-window-width", `${Math.round(width)}px`);
    sheetRoot.style.setProperty("--bm-sheet-window-height", `${Math.round(height)}px`);
    if (characteristicsCardHeight > 0) {
      sheetRoot.style.setProperty("--bm-carac-card-height", `${characteristicsCardHeight}px`);
    } else {
      sheetRoot.style.removeProperty("--bm-carac-card-height");
    }
    const syncedCharacterPanelHeightTargets = [
      characterSidebar,
      characterPortraitFrame,
      characterResourceBadges,
    ];
    if (characteristicsCardHeight > 0 && activeTab === "carac") {
      const heightValue = `${characteristicsCardHeight}px`;
      for (const target of syncedCharacterPanelHeightTargets) {
        if (!(target instanceof HTMLElement)) continue;
        target.style.setProperty("height", heightValue);
        target.style.setProperty("min-height", heightValue);
        target.style.setProperty("max-height", heightValue);
      }
    } else {
      for (const target of syncedCharacterPanelHeightTargets) {
        if (!(target instanceof HTMLElement)) continue;
        target.style.removeProperty("height");
        target.style.removeProperty("min-height");
        target.style.removeProperty("max-height");
      }
    }
    const state = { layoutMode, width, height, activeTab };
    this._responsiveActorSheetLayoutState = state;
    return state;
  }

  connectResponsiveActorSheetLayoutObserver(html) {
    this.disconnectResponsiveActorSheetLayoutObserver();
    const observerTarget = this.getResponsiveActorSheetObserverTarget(html);
    if (!observerTarget) return;
    this.applyResponsiveActorSheetLayoutState(html);
    const windowResizeHandler = () => {
      this.applyResponsiveActorSheetLayoutState(observerTarget);
    };
    this._responsiveActorSheetWindowResize = windowResizeHandler;
    globalThis?.addEventListener?.("resize", windowResizeHandler);
    if (typeof ResizeObserver !== "function") return;
    this._responsiveActorSheetLayoutObserver = new ResizeObserver(() => {
      this.applyResponsiveActorSheetLayoutState(observerTarget);
    });
    this._responsiveActorSheetLayoutObserver.observe(observerTarget);
  }

  disconnectResponsiveActorSheetLayoutObserver() {
    this._responsiveActorSheetLayoutObserver?.disconnect?.();
    this._responsiveActorSheetLayoutObserver = null;
    if (this._responsiveActorSheetWindowResize) {
      globalThis?.removeEventListener?.("resize", this._responsiveActorSheetWindowResize);
      this._responsiveActorSheetWindowResize = null;
    }
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
      const root = this._queuedAutoGrowRoot?.find ? this._queuedAutoGrowRoot : getSheetElementWrapper(this);
      this._queuedAutoGrowRoot = null;
      this.refreshAutoGrowTextareas(root);
    });
  }

  queueResourceGaugeRefresh(rootLike = null) {
    this._queuedResourceGaugeRoot = resolveDeferredRoot(this._queuedResourceGaugeRoot, rootLike);
    if (this._resourceGaugeRefreshTaskId != null) return;
    this._resourceGaugeRefreshTaskId = queueUiMicrotask(() => {
      this._resourceGaugeRefreshTaskId = null;
      const root = this._queuedResourceGaugeRoot?.find ? this._queuedResourceGaugeRoot : getSheetElementWrapper(this);
      this._queuedResourceGaugeRoot = null;
      this.refreshResourceVisuals(root);
    });
  }

  queueSheetRender(force = false) {
    this._queuedDeferredSheetRenderForce = mergeDeferredForce(this._queuedDeferredSheetRenderForce, force);
    if (this._deferredSheetRenderTaskId != null) return;
    this._deferredSheetRenderTaskId = queueUiMicrotask(() => {
      this._deferredSheetRenderTaskId = null;
      const shouldForce = Boolean(this._queuedDeferredSheetRenderForce);
      this._queuedDeferredSheetRenderForce = false;
      if (!this.rendered) return;
      this.render(shouldForce);
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

  applyActorSheetInteractivePermissions(htmlLike = null) {
    actorSheetPermissionController.applyInteractivePermissions(this, htmlLike);
  }

  clearActorSheetNativeEditHandlers() {
    this._actorSheetNativeEditAbortController?.abort?.();
    this._actorSheetNativeEditAbortController = null;
  }

  connectActorSheetNativeEditHandlers(htmlLike = null) {
    const root = getHTMLElementFromHtmlLike(htmlLike) || getSheetHTMLElement(this);
    if (!root) return;
    this.clearActorSheetNativeEditHandlers();
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    this._actorSheetNativeEditAbortController = controller;
    const listenerOptions = controller ? { capture: true, signal: controller.signal } : true;

    root.addEventListener("click", event => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const button = target?.closest?.(".char-edit-toggle");
      if (!button || !root.contains(button)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      if (!canCurrentUserEditCharacteristics()) return;
      this._characteristicsEditEnabled = !this._characteristicsEditEnabled;
      bmLog.debug("sheet:characteristics-edit-toggle", {
        actorId: this.actor?.id || "",
        role: game.user?.role,
        enabled: Boolean(this._characteristicsEditEnabled)
      });
      this.applyActorSheetInteractivePermissions(htmlLike);
      queueUiMicrotask(() => this.applyActorSheetInteractivePermissions(htmlLike));
    }, listenerOptions);

    root.addEventListener("change", event => {
      const input = event.target instanceof HTMLInputElement ? event.target : null;
      if (!input?.matches?.(CHARACTERISTIC_BASE_INPUT_SELECTOR)) return;
      if (!root.contains(input)) return;
      if (!canCurrentUserEditCharacteristics()) return;
      if (!this._characteristicsEditEnabled) return;
      if (this.actor?.isOwner || game.user?.isGM) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      void this.updateTrustedCharacteristicBaseInput(input);
    }, listenerOptions);
  }

  async updateTrustedCharacteristicBaseInput(input) {
    const path = String(input?.name || "");
    const match = path.match(/^system\.characteristics\.([^\.]+)\.base$/);
    if (!match) return false;
    const characteristicKey = match[1];
    const fallback = toFiniteNumber(this.actor?.system?.characteristics?.[characteristicKey]?.base, CHARACTERISTIC_BASE_MIN);
    const nextValue = clampCharacteristicBaseForRole(game.user?.role, input?.value, fallback);
    input.value = String(nextValue);
    const updated = await this.applyActorUpdate({ [path]: nextValue }, {
      bloodmanAllowCharacteristicBase: true
    });
    if (updated) foundry.utils.setProperty(this.actor, path, nextValue);
    return updated;
  }

  openActorImageFilePicker(fieldPath = "img") {
    if (!this.actor || !isAssistantOrHigherRole(game.user?.role)) return false;
    const field = String(fieldPath || "img").trim() || "img";
    const FilePickerClass = getFilePickerClass();
    if (typeof FilePickerClass !== "function") {
      safeWarn("Selection d'image impossible: FilePicker indisponible.");
      return false;
    }

    const current = String(foundry.utils.getProperty(this.actor, field) || "").trim();
    const picker = new FilePickerClass({
      type: "image",
      current,
      callback: async path => {
        const nextPath = String(path || "").trim();
        if (!nextPath || nextPath === current) return;
        await this.applyActorUpdate({ [field]: nextPath });
      }
    });
    return renderFilePickerSafely(picker, "actor-image-file-picker");
  }

  async deleteActorItem(item) {
    if (!item) return false;
    const itemId = String(item.id || "").trim();
    const actorCandidates = [];
    const seenActorKeys = new Set();
    const addActorCandidate = actorDoc => {
      if (!actorDoc) return;
      const actorId = String(actorDoc.id || "").trim();
      const actorUuid = String(actorDoc.uuid || "").trim();
      const key = `${actorId}|${actorUuid}`;
      if (seenActorKeys.has(key)) return;
      seenActorKeys.add(key);
      actorCandidates.push(actorDoc);
    };
    addActorCandidate(this.actor);
    addActorCandidate(item.parent);
    addActorCandidate(item.actor);
    addActorCandidate(this.actor?.baseActor);
    const worldActorId = String(this.actor?.token?.actorId || this.actor?.id || "").trim();
    if (worldActorId) addActorCandidate(game.actors?.get(worldActorId) || null);

    const tryDeleteFromActor = async actorDoc => {
      if (!actorDoc || !itemId) return false;
      const actorItems = actorDoc.items;
      if (!actorItems?.has?.(itemId)) return false;

      if (typeof actorDoc.deleteEmbeddedDocuments === "function") {
        try {
          await actorDoc.deleteEmbeddedDocuments("Item", [itemId], { render: false });
        } catch (_error) {
          // Fallback below.
        }
      }
      if (!actorItems?.has?.(itemId)) return true;

      const embeddedItem = actorItems?.get?.(itemId);
      if (embeddedItem && typeof embeddedItem.delete === "function") {
        try {
          await embeddedItem.delete();
        } catch (_error) {
          // Socket relay fallback below.
        }
      }
      return !actorItems?.has?.(itemId);
    };

    if (this.actor?.isOwner || item.isOwner || game.user?.isGM) {
      for (const actorDoc of actorCandidates) {
        if (await tryDeleteFromActor(actorDoc)) return true;
      }

      if (typeof item.delete === "function") {
        try {
          await item.delete();
        } catch (_error) {
          // Fallback to GM relay when direct deletion fails on synthetic contexts.
        }
      }
      if (itemId && !this.actor?.items?.has(itemId)) return true;
    }
    const sent = requestDeleteActorItem(this.actor, item);
    if (!sent) safeWarn("Suppression impossible: aucun GM ou assistant actif.");
    return sent;
  }

  getSingleUseItemState(item) {
    const enabled = toBooleanFlag(item?.system?.singleUseEnabled, false);
    const remaining = normalizeSingleUseCountValue(item?.system?.singleUseCount, {
      enabled,
      fallbackEnabled: 1
    });
    return { enabled, remaining };
  }

  async updateSingleUseItemCount(item, nextCount) {
    if (!item) return false;
    const normalizedNext = normalizeSingleUseCountValue(nextCount, {
      enabled: true,
      fallbackEnabled: 1
    });
    const updateData = { [ITEM_SINGLE_USE_COUNT_PATH]: normalizedNext };
    const parentActor = item.parent || item.actor || this.actor || null;

    try {
      if (item?.isOwner || parentActor?.isOwner || game.user?.isGM) {
        await item.update(updateData);
        return true;
      }
    } catch (_error) {
      // Fallbacks below.
    }

    if (item?.id && parentActor?.isOwner && typeof parentActor.updateEmbeddedDocuments === "function") {
      try {
        await parentActor.updateEmbeddedDocuments("Item", [{ _id: item.id, ...updateData }]);
        return true;
      } catch (_error) {
        // Warning below.
      }
    }

    safeWarn(tl(
      "BLOODMAN.Notifications.ItemSingleUseCounterUpdateFailed",
      "Mise a jour impossible du compteur d'usage unique."
    ));
    return false;
  }

  async consumeSingleUseItem(item) {
    const state = this.getSingleUseItemState(item);
    if (!state.enabled) return { enabled: false, consumed: false, exhausted: false, remaining: state.remaining };

    const nextRemaining = Math.max(0, state.remaining - 1);
    if (nextRemaining <= 0) {
      const deleted = await this.deleteActorItem(item);
      return {
        enabled: true,
        consumed: deleted,
        exhausted: deleted,
        remaining: 0
      };
    }

    const updated = await this.updateSingleUseItemCount(item, nextRemaining);
    return {
      enabled: true,
      consumed: updated,
      exhausted: false,
      remaining: updated ? nextRemaining : state.remaining
    };
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
    return actorItemDndController.getItemListColumnCountFromElement(this, element);
  }

  getItemListDropTargetFromEvent(eventLike) {
    return actorItemDndController.getItemListDropTargetFromEvent(this, eventLike);
  }

  shouldSkipItemListContainerDelegate(eventLike) {
    return actorItemDndController.shouldSkipItemListContainerDelegate(this, eventLike);
  }

  getItemListBagZoneFromElement(element) {
    return actorItemDndController.getItemListBagZoneFromElement(this, element);
  }

  getItemListReorderScopeFromElement(element) {
    return actorItemDndController.getItemListReorderScopeFromElement(this, element);
  }

  getItemListAcceptedTypesFromElement(element) {
    return actorItemDndController.getItemListAcceptedTypesFromElement(this, element);
  }

  normalizeCarryColumn(value) {
    return actorItemDndController.normalizeCarryColumn(value);
  }

  isCarryColumnAllowedForItemType(column, itemType, options = {}) {
    return actorItemDndController.isCarryColumnAllowedForItemType(this, column, itemType, options);
  }

  getItemListCarryColumnFromElement(element) {
    return actorItemDndController.getItemListCarryColumnFromElement(this, element);
  }

  getItemListColumnCapacityFromElement(element) {
    return actorItemDndController.getItemListColumnCapacityFromElement(this, element);
  }

  getCarryColumnCapacity(column, options = {}) {
    return actorItemDndController.getCarryColumnCapacity(this, column, options);
  }

  getLegacyItemBagState(item) {
    const flaggedValue = item?.getFlag?.(SYSTEM_ID, BAG_ZONE_FLAG_KEY);
    if (flaggedValue !== undefined) return toCheckboxBoolean(flaggedValue, false);
    return toCheckboxBoolean(item?.system?.inBag, false);
  }

  getExplicitItemCarryColumn(item) {
    if (!item) return "";
    const flaggedValue = item?.getFlag?.(SYSTEM_ID, CARRY_COLUMN_FLAG_KEY);
    return this.normalizeCarryColumn(flaggedValue);
  }

  getItemCarryColumn(item, options = {}) {
    if (!item) return "";
    const bagEnabled = options?.bagEnabledOverride == null
      ? this.isActorBagSlotsEnabled()
      : Boolean(options.bagEnabledOverride);
    const explicitColumn = this.getExplicitItemCarryColumn(item);
    if (
      explicitColumn
      && this.isCarryColumnAllowedForItemType(explicitColumn, item?.type, { bagEnabledOverride: bagEnabled })
    ) {
      return explicitColumn;
    }

    const fallbackById = options?.fallbackById && typeof options.fallbackById === "object"
      ? options.fallbackById
      : null;
    const itemId = String(item.id || "").trim();
    if (fallbackById && itemId && typeof fallbackById[itemId] === "string") {
      const fallbackColumn = this.normalizeCarryColumn(fallbackById[itemId]);
      if (fallbackColumn) return fallbackColumn;
    }

    if (this.getLegacyItemBagState(item) && bagEnabled) return CARRY_COLUMN_BAG;
    const itemType = String(item?.type || "").trim().toLowerCase();
    if (itemType === "arme" || itemType === "protection") return CARRY_COLUMN_EQUIPMENT;
    if (itemType === "objet" || itemType === "ration" || itemType === "soin") return CARRY_COLUMN_OBJECTS_ONE;
    return CARRY_COLUMN_EQUIPMENT;
  }

  isBagZoneSupportedItemType(itemType) {
    const normalizedType = String(itemType || "").trim().toLowerCase();
    return BAG_ZONE_ITEM_TYPES.has(normalizedType);
  }

  isItemInBag(item) {
    const explicitColumn = this.getExplicitItemCarryColumn(item);
    if (explicitColumn) return explicitColumn === CARRY_COLUMN_BAG;
    return this.getLegacyItemBagState(item);
  }

  async setItemCarryColumn(item, column, options = {}) {
    if (!item || !this.isBagZoneSupportedItemType(item.type)) return false;
    const nextColumn = this.normalizeCarryColumn(column);
    if (!nextColumn) return false;
    const bagEnabled = options?.bagEnabledOverride == null
      ? this.isActorBagSlotsEnabled()
      : Boolean(options.bagEnabledOverride);
    if (!this.isCarryColumnAllowedForItemType(nextColumn, item.type, { bagEnabledOverride: bagEnabled })) return false;

    const itemId = String(item.id || "").trim();
    if (!itemId) return false;
    const nextInBag = nextColumn === CARRY_COLUMN_BAG;
    const currentColumn = this.getItemCarryColumn(item);
    const currentInBag = this.isItemInBag(item);
    if (currentColumn === nextColumn && currentInBag === nextInBag) return true;
    const targetCapacity = this.getCarryColumnCapacity(nextColumn, { bagEnabledOverride: bagEnabled });
    if (Number.isFinite(targetCapacity) && targetCapacity > 0) {
      const state = this.getCarriedColumnState({ bagEnabledOverride: bagEnabled });
      const currentTargetItems = (state.columns[nextColumn] || [])
        .filter(entry => String(entry?.id || "").trim() !== itemId);
      const targetSlots = sumCarriedItemInventorySlots(currentTargetItems) + getCarriedItemInventorySlots(item);
      if (targetSlots > targetCapacity) return false;
    }

    const carryFlagPath = `flags.${SYSTEM_ID}.${CARRY_COLUMN_FLAG_KEY}`;
    const bagFlagPath = `flags.${SYSTEM_ID}.${BAG_ZONE_FLAG_KEY}`;
    const payload = {
      _id: itemId,
      [carryFlagPath]: nextColumn,
      [bagFlagPath]: nextInBag
    };

    if (item.isOwner || this.actor?.isOwner || game.user?.isGM) {
      try {
        await item.update({
          [carryFlagPath]: nextColumn,
          [bagFlagPath]: nextInBag
        });
        return true;
      } catch (_error) {
        // Falls through to embedded update fallback.
      }
    }

    if (this.actor?.isOwner || game.user?.isGM) {
      try {
        await this.actor.updateEmbeddedDocuments("Item", [payload]);
        return true;
      } catch (_error) {
        // Falls through to warning below when fallback update is not permitted.
      }
    }

    safeWarn(tl("BLOODMAN.Notifications.ActorUpdateRequiresGM", "Mise a jour impossible: aucun MJ ou assistant actif."));
    return false;
  }

  async setItemBagState(item, inBag) {
    if (!item || !this.isBagZoneSupportedItemType(item.type)) return false;
    const nextInBag = Boolean(inBag);
    const targetColumn = nextInBag ? CARRY_COLUMN_BAG : CARRY_COLUMN_EQUIPMENT;
    return this.setItemCarryColumn(item, targetColumn);
  }

  isActorBagSlotsEnabled(actorLike = null) {
    const actor = actorLike || this.actor;
    if (!actorLike && this._optimisticBagSlotsEnabled !== null) {
      return Boolean(this._optimisticBagSlotsEnabled);
    }
    return resolveActorBackpackEnabled(actor, { items: Array.from(actor?.items || []) }).enabled;
  }

  getCarriedOutsideBagItems(options = {}) {
    const excludeItemId = String(options?.excludeItemId || "").trim();
    const includeUncounted = options?.includeUncounted === true;
    const carriedItems = this.actor?.items
      ?.filter(item => CARRIED_ITEM_TYPES.has(String(item?.type || "").trim().toLowerCase()))
      || [];
    return carriedItems.filter(item => {
      if (!item) return false;
      if (isActorItemLinkedChild(item, this.actor)) return false;
      if (!includeUncounted && !isCarriedItemCountedForBag(item, this.actor)) return false;
      const itemId = String(item.id || "").trim();
      if (excludeItemId && itemId === excludeItemId) return false;
      if (!this.isBagZoneSupportedItemType(item.type)) return true;
      return !this.isItemInBag(item);
    });
  }

  getCarriedColumnState(options = {}) {
    const bagEnabled = options?.bagEnabledOverride == null
      ? this.isActorBagSlotsEnabled()
      : Boolean(options.bagEnabledOverride);
    const sourceItems = Array.isArray(options?.items)
      ? options.items
      : (this.actor?.items || []).filter(item => CARRIED_ITEM_TYPES.has(String(item?.type || "").trim().toLowerCase()));

    const carriedItems = sourceItems
      .filter(item => {
        if (!item || !CARRIED_ITEM_TYPES.has(String(item.type || "").trim().toLowerCase())) return false;
        return !isActorItemLinkedChild(item, this.actor);
      })
      .sort((left, right) => {
        const leftSort = toFiniteNumber(left?.sort, 0);
        const rightSort = toFiniteNumber(right?.sort, 0);
        if (leftSort !== rightSort) return leftSort - rightSort;
        return String(left?.id || "").localeCompare(String(right?.id || ""));
      });

    const columns = {
      [CARRY_COLUMN_EQUIPMENT]: [],
      [CARRY_COLUMN_OBJECTS_ONE]: [],
      [CARRY_COLUMN_OBJECTS_TWO]: [],
      [CARRY_COLUMN_BAG]: []
    };
    const columnUsage = {
      [CARRY_COLUMN_EQUIPMENT]: 0,
      [CARRY_COLUMN_OBJECTS_ONE]: 0,
      [CARRY_COLUMN_OBJECTS_TWO]: 0,
      [CARRY_COLUMN_BAG]: 0
    };
    const byId = {};
    const deferredItems = [];
    const placeInColumn = (item, requestedColumn) => {
      const itemId = String(item?.id || "").trim();
      if (!itemId) return false;
      const column = this.normalizeCarryColumn(requestedColumn) || CARRY_COLUMN_EQUIPMENT;
      const itemType = String(item?.type || "").trim().toLowerCase();
      if (!this.isCarryColumnAllowedForItemType(column, itemType, { bagEnabledOverride: bagEnabled })) return false;
      const capacity = this.getCarryColumnCapacity(column, { bagEnabledOverride: bagEnabled });
      const itemSlots = getCarriedItemInventorySlots(item);
      if (Number.isFinite(capacity) && (columnUsage[column] + itemSlots) > capacity) return false;
      columns[column].push(item);
      columnUsage[column] += itemSlots;
      byId[itemId] = column;
      return true;
    };

    for (const item of carriedItems) {
      const explicitColumn = this.getExplicitItemCarryColumn(item);
      if (!explicitColumn) {
        deferredItems.push(item);
        continue;
      }
      if (!this.isCarryColumnAllowedForItemType(explicitColumn, item?.type, { bagEnabledOverride: bagEnabled })) {
        deferredItems.push(item);
        continue;
      }
      if (!placeInColumn(item, explicitColumn)) deferredItems.push(item);
    }

    for (const item of deferredItems) {
      const itemType = String(item?.type || "").trim().toLowerCase();
      const preferBag = this.getLegacyItemBagState(item);
      if (preferBag && bagEnabled && placeInColumn(item, CARRY_COLUMN_BAG)) continue;

      if (itemType === "arme" || itemType === "protection") {
        placeInColumn(item, CARRY_COLUMN_EQUIPMENT);
        continue;
      }

      const orderedObjectColumns = [...CARRY_OBJECT_COLUMNS].sort((left, right) => columnUsage[left] - columnUsage[right]);
      let placed = false;
      for (const column of orderedObjectColumns) {
        if (placeInColumn(item, column)) {
          placed = true;
          break;
        }
      }
      if (placed) continue;
      if (bagEnabled && placeInColumn(item, CARRY_COLUMN_BAG)) continue;
      placeInColumn(item, CARRY_COLUMN_EQUIPMENT);
    }

    return {
      bagEnabled,
      columns,
      byId
    };
  }

  async normalizeCarryColumnsAfterBagToggle(options = {}) {
    const bagEnabled = options?.bagEnabledOverride == null
      ? this.isActorBagSlotsEnabled()
      : Boolean(options.bagEnabledOverride);
    if (bagEnabled) return false;

    let movedAny = false;
    const state = this.getCarriedColumnState({ bagEnabledOverride: true });
    const bagItems = [...(state.columns[CARRY_COLUMN_BAG] || [])];
    for (const item of bagItems) {
      const refreshed = this.getCarriedColumnState({ bagEnabledOverride: false });
      let targetColumn = CARRY_COLUMN_OBJECTS_ONE;
      if ((refreshed.columns[CARRY_COLUMN_OBJECTS_ONE] || []).length >= this.getCarryColumnCapacity(CARRY_COLUMN_OBJECTS_ONE)) {
        targetColumn = CARRY_COLUMN_OBJECTS_TWO;
      }
      if ((refreshed.columns[targetColumn] || []).length >= this.getCarryColumnCapacity(targetColumn)) {
        targetColumn = CARRY_COLUMN_EQUIPMENT;
      }
      const moved = await this.setItemCarryColumn(item, targetColumn, { bagEnabledOverride: false });
      movedAny = movedAny || moved;
    }
    return movedAny;
  }

  getDropResultItemIds(dropResult) {
    const asArray = Array.isArray(dropResult)
      ? dropResult
      : (dropResult ? [dropResult] : []);
    return asArray
      .map(entry => String(entry?.id || entry?._id || "").trim())
      .filter(Boolean);
  }

  buildEquipmentStateItemPayload(item) {
    if (!item) return null;
    const itemData = item?.toObject?.() || {};
    const itemType = String(item.type || itemData.type || "").trim().toLowerCase();
    const itemSystem = itemData?.system && typeof itemData.system === "object"
      ? itemData.system
      : {};
    return {
      id: String(item.id || itemData._id || "").trim(),
      type: itemType || "objet",
      nom: String(item.name || itemData.name || "").trim(),
      description: String(itemSystem.note || itemSystem.notes || "").trim(),
      "caractéristiques": itemSystem,
      PP: Math.max(0, Math.floor(toFiniteNumber(itemSystem.pp, 0)))
    };
  }

  buildEquipmentStatePayload(options = {}) {
    const bagEnabled = options?.bagEnabledOverride == null
      ? this.isActorBagSlotsEnabled()
      : Boolean(options.bagEnabledOverride);
    const state = this.getCarriedColumnState({ bagEnabledOverride: bagEnabled });
    const equipementItems = (state.columns[CARRY_COLUMN_EQUIPMENT] || [])
      .map(item => this.buildEquipmentStateItemPayload(item))
      .filter(Boolean);
    const objectsColumnOne = (state.columns[CARRY_COLUMN_OBJECTS_ONE] || [])
      .map(item => this.buildEquipmentStateItemPayload(item))
      .filter(Boolean);
    const objectsColumnTwo = (state.columns[CARRY_COLUMN_OBJECTS_TWO] || [])
      .map(item => this.buildEquipmentStateItemPayload(item))
      .filter(Boolean);
    const bagColumn = bagEnabled
      ? (state.columns[CARRY_COLUMN_BAG] || [])
        .map(item => this.buildEquipmentStateItemPayload(item))
        .filter(Boolean)
      : [];

    const ammoState = normalizeAmmoState(
      foundry.utils.mergeObject(buildDefaultAmmo(), this.actor?.system?.ammo || {}, { inplace: false }),
      {
        fallback: buildDefaultAmmo(),
        capacity: getActorAmmoCapacityLimit(this.actor)
      }
    );
    equipementItems.unshift({
      id: "ammo",
      type: "munition",
      nom: String(ammoState.type || "Munitions"),
      description: "",
      "caractéristiques": {
        type: String(ammoState.type || ""),
        stock: Math.max(0, Math.floor(toFiniteNumber(ammoState.stock, 0)))
      },
      PP: 0
    });

    return {
      colonnes: {
        equipement: equipementItems,
        objets: [
          objectsColumnOne,
          objectsColumnTwo,
          bagColumn
        ]
      }
    };
  }

  buildCarryDropErrorResult(reason) {
    return {
      status: "error",
      reason: String(reason || "").trim() || CARRY_COLUMN_FULL_REASON
    };
  }

  buildCarryDropSuccessResult(options = {}) {
    return {
      status: "success",
      updated_state: this.buildEquipmentStatePayload(options)
    };
  }

  async enforceMainCarryOverflowToBag(options = {}) {
    if (!this.actor || !isCarriedItemLimitedActorType(this.actor?.type)) return false;
    const bagEnabled = options?.bagEnabledOverride == null
      ? this.isActorBagSlotsEnabled()
      : Boolean(options.bagEnabledOverride);
    if (!bagEnabled) return false;
    const mainSlotLimit = Math.max(0, Math.floor(toFiniteNumber(CARRIED_ITEM_LIMIT_BASE, 0)));
    if (mainSlotLimit <= 0) return false;

    const outsideItems = this.getCarriedOutsideBagItems();
    const overflowSlots = sumCarriedItemInventorySlots(outsideItems) - mainSlotLimit;
    if (overflowSlots <= 0) return false;

    const state = this.getCarriedColumnState({ bagEnabledOverride: bagEnabled });
    const movableOverflowCandidates = outsideItems.filter(item => {
      const itemId = String(item?.id || "").trim();
      if (!itemId) return false;
      const column = this.normalizeCarryColumn(state?.byId?.[itemId] || this.getItemCarryColumn(item, { fallbackById: state.byId }));
      return column === CARRY_COLUMN_OBJECTS_ONE || column === CARRY_COLUMN_OBJECTS_TWO;
    });
    if (!movableOverflowCandidates.length) return false;

    const preferredIds = new Set(
      (Array.isArray(options?.preferredItemIds) ? options.preferredItemIds : [])
        .map(entry => String(entry || "").trim())
        .filter(Boolean)
    );
    const preferredItems = movableOverflowCandidates.filter(item => preferredIds.has(String(item.id || "").trim()));
    const remainingItems = movableOverflowCandidates
      .filter(item => !preferredIds.has(String(item.id || "").trim()))
      .sort((left, right) => {
        const leftSort = toFiniteNumber(left?.sort, 0);
        const rightSort = toFiniteNumber(right?.sort, 0);
        if (leftSort !== rightSort) return rightSort - leftSort;
        return String(right?.id || "").localeCompare(String(left?.id || ""));
      });
    const overflowItems = [];
    let movedSlotTarget = 0;
    for (const item of [...preferredItems, ...remainingItems]) {
      if (movedSlotTarget >= overflowSlots) break;
      overflowItems.push(item);
      movedSlotTarget += getCarriedItemInventorySlots(item);
    }
    if (!overflowItems.length) return false;

    let movedAny = false;
    for (const item of overflowItems) {
      const moved = await this.setItemCarryColumn(item, CARRY_COLUMN_BAG, { bagEnabledOverride: bagEnabled });
      movedAny = movedAny || moved;
    }
    return movedAny;
  }

  normalizeItemReorderPayload(payloadLike) {
    return actorItemDndController.normalizeItemReorderPayload(this, payloadLike);
  }

  buildItemReorderPayloadFromDocumentDragData(dataLike) {
    return actorItemDndController.buildItemReorderPayloadFromDocumentDragData(this, dataLike);
  }

  isItemReorderPayloadForCurrentActor(payloadLike) {
    return actorItemDndController.isItemReorderPayloadForCurrentActor(this, payloadLike);
  }

  getActiveItemReorderPayloadFromDom() {
    return actorItemDndController.getActiveItemReorderPayloadFromDom(this);
  }

  getGlobalItemReorderPayload() {
    return actorItemDndController.getGlobalItemReorderPayload(this);
  }

  getItemReorderPayloadFromEvent(eventLike) {
    return actorItemDndController.getItemReorderPayloadFromEvent(this, eventLike);
  }

  buildFoundryItemDragPayload(item) {
    return actorItemDndController.buildFoundryItemDragPayload(this, item);
  }

  setDragTransferData(dataTransfer, mimeType, payload) {
    return actorItemDndController.setDragTransferData(this, dataTransfer, mimeType, payload);
  }

  getExternalItemDragTypeFromData(data) {
    return actorItemDndController.getExternalItemDragTypeFromData(this, data);
  }

  getItemDropInFlightKeys() {
    return actorItemDndController.getItemDropInFlightKeys(this);
  }

  buildExternalItemDropKey(data, list = null) {
    return actorItemDndController.buildExternalItemDropKey(this, data, list);
  }

  clearItemReorderVisualState(rootLike = null) {
    return actorItemDndController.clearItemReorderVisualState(this, rootLike);
  }

  getItemReorderSortBefore(eventLike, targetLi, columns = 1) {
    return actorItemDndController.getItemReorderSortBefore(this, eventLike, targetLi, columns);
  }

  buildItemReorderUpdates(sourceItem, targetItem, options = {}) {
    return actorItemDndController.buildItemReorderUpdates(this, sourceItem, targetItem, options);
  }

  async applyActorItemOrderUpdates(updates = []) {
    return actorItemDndController.applyActorItemOrderUpdates(this, updates);
  }

  shouldManuallyRenderAfterUpdate() {
    return actorItemDndController.shouldManuallyRenderAfterUpdate(this);
  }

  async handleCarryColumnDrop({
    eventLike,
    nativeEvent,
    sourceItem,
    list,
    targetColumn
  } = {}) {
    return actorItemDndController.handleCarryColumnDrop(this, {
      eventLike,
      nativeEvent,
      sourceItem,
      list,
      targetColumn
    });
  }

  onItemReorderDragStart(eventLike) {
    return actorItemDndController.onItemReorderDragStart(this, eventLike);
  }

  onItemReorderDragOver(eventLike) {
    return actorItemDndController.onItemReorderDragOver(this, eventLike);
  }

  onExternalItemListDragOver(eventLike, payloadOverride = null) {
    return actorItemDndController.onExternalItemListDragOver(this, eventLike, payloadOverride);
  }

  onItemReorderDragEnd() {
    return actorItemDndController.onItemReorderDragEnd(this);
  }

  onItemReorderDragLeave(eventLike) {
    return actorItemDndController.onItemReorderDragLeave(this, eventLike);
  }

  async onExternalItemListDrop(eventLike) {
    const startedAt = startPerfTimer();
    const nativeEvent = eventLike?.originalEvent || eventLike;
    let data = getDragEventData(nativeEvent);
    const payload = this.getItemReorderPayloadFromEvent(eventLike);
    if ((!data || String(data?.type || "").trim().toLowerCase() !== "item") && payload) {
      data = {
        type: "Item",
        uuid: payload.actorUuid && payload.itemId ? `${payload.actorUuid}.Item.${payload.itemId}` : "",
        id: payload.itemId,
        itemId: payload.itemId,
        itemType: payload.itemType,
        actorId: payload.actorId,
        actorUuid: payload.actorUuid
      };
    }
    const dataType = String(data?.type || "").trim().toLowerCase();
    if (dataType !== "item") return null;
    stopHandledDropEvent(eventLike);

    const list = this.getItemListDropTargetFromEvent(eventLike);
    if (!(list instanceof HTMLElement)) return null;
    const dropKey = this.buildExternalItemDropKey(data, list);
    const inFlightKeys = this.getItemDropInFlightKeys();
    if (inFlightKeys.has(dropKey)) return null;
    inFlightKeys.add(dropKey);

    try {
      const carryColumn = this.getItemListCarryColumnFromElement(list);
      const bagZone = this.getItemListBagZoneFromElement(list);
      const acceptedTypes = this.getItemListAcceptedTypesFromElement(list);
      const droppedItem = await this.resolveDroppedItemDocument(data);
      const droppedType = String(droppedItem?.type || "").trim().toLowerCase();
      const equiperAvecParent = this.getEquiperAvecParentItemFromDropEvent(eventLike, { allowItemRow: true })
        || this.getRememberedEquiperAvecDropTarget()
        || this.getEquiperAvecParentFromListForDroppedItem(list, droppedItem, eventLike);
      if (equiperAvecParent) {
        const parentLink = resolveItemLinkState(equiperAvecParent);
        if (parentLink.equiperAvecEnabled) {
          this.rememberEquiperAvecDropTarget(equiperAvecParent);
          return this.onEquiperAvecDrop(eventLike);
        }
      }
      if (acceptedTypes && droppedType && !acceptedTypes.has(droppedType)) {
        this.clearItemReorderVisualState();
        return this.buildCarryDropErrorResult("type non autorise");
      }
      if (carryColumn === CARRY_COLUMN_BAG && !this.isActorBagSlotsEnabled()) {
        ui.notifications?.warn("Le sac n'est pas actif.");
        this.clearItemReorderVisualState();
        return this.buildCarryDropErrorResult(CARRY_COLUMN_FULL_REASON);
      }

      const beforeIds = new Set((this.actor?.items || [])
        .map(item => String(item?.id || "").trim())
        .filter(Boolean));
      const dropped = await this._onDropItem(eventLike, data);
      if (!dropped) {
        this.clearItemReorderVisualState();
        return null;
      }

      const createdIds = this.getDropResultItemIds(dropped);
      const candidateIds = createdIds.length
        ? createdIds
        : (this.actor?.items || [])
          .map(item => String(item?.id || "").trim())
          .filter(itemId => itemId && !beforeIds.has(itemId));
      let movedAny = false;
      for (const itemId of candidateIds) {
        const item = this.actor?.items?.get(itemId) || null;
        if (!item) continue;
        const type = String(item.type || "").trim().toLowerCase();
        if (acceptedTypes && !acceptedTypes.has(type)) continue;
        if (carryColumn && CARRIED_ITEM_TYPES.has(type)) {
          const moved = await this.setItemCarryColumn(item, carryColumn, {
            bagEnabledOverride: this.isActorBagSlotsEnabled()
          });
          movedAny = movedAny || moved;
        } else if (bagZone && this.isBagZoneSupportedItemType(type)) {
          const moved = await this.setItemBagState(item, bagZone === "yes");
          movedAny = movedAny || moved;
        }
      }
      this.clearItemReorderVisualState();
      if (movedAny && this.shouldManuallyRenderAfterUpdate()) this.render(false);
      logSheetPerformance("actor-sheet.drop.external", {
        actorId: this.actor?.id || "",
        dropKey,
        movedAny,
        itemCount: candidateIds.length,
        durationMs: Number(endPerfTimer(startedAt).toFixed(2))
      });
      return dropped;
    } finally {
      this.clearRememberedEquiperAvecDropTarget();
      inFlightKeys.delete(dropKey);
    }
  }

  async onItemReorderDrop(eventLike) {
    const startedAt = startPerfTimer();
    const nativeEvent = eventLike?.originalEvent || eventLike;
    if (
      this.getEquiperAvecDropContainerFromEvent(eventLike)
      || this.getRememberedEquiperAvecDropTarget()
    ) {
      return this.onEquiperAvecDrop(eventLike);
    }
    const payload = this.getItemReorderPayloadFromEvent(eventLike);
    if (!payload) return this.onExternalItemListDrop(eventLike);
    if (!this.isItemReorderPayloadForCurrentActor(payload)) return this.onExternalItemListDrop(eventLike);
    stopHandledDropEvent(eventLike);
    if (this._itemReorderPayloadClearTimer) {
      clearTimeout(this._itemReorderPayloadClearTimer);
      this._itemReorderPayloadClearTimer = null;
    }

    try {
      const sourceItem = this.actor?.items?.get(payload.itemId) || null;
      if (!sourceItem) return this.onExternalItemListDrop(eventLike);
      const sourceType = String(sourceItem.type || "").trim().toLowerCase();

      const list = this.getItemListDropTargetFromEvent(eventLike);
      if (!(list instanceof HTMLElement)) return this.buildCarryDropErrorResult("operation invalide");
      const carryColumn = this.getItemListCarryColumnFromElement(list);
      if (carryColumn) {
        return this.handleCarryColumnDrop({
          eventLike,
          nativeEvent,
          sourceItem,
          list,
          targetColumn: carryColumn
        });
      }
      const bagZone = this.getItemListBagZoneFromElement(list);
      const acceptedTypes = this.getItemListAcceptedTypesFromElement(list);
      const reorderScope = this.getItemListReorderScopeFromElement(list);
      const isCarryMixedScope = reorderScope === "carry-mixed";
      const useMixedTypeOrdering = isCarryMixedScope && Boolean(bagZone);
      if (acceptedTypes && !acceptedTypes.has(sourceType)) {
        this.clearItemReorderVisualState();
        return this.buildCarryDropErrorResult("type non autorise");
      }
      if (bagZone && !this.isBagZoneSupportedItemType(sourceType)) {
        this.clearItemReorderVisualState();
        return this.buildCarryDropErrorResult("type non autorise");
      }
      if (typeof eventLike?.preventDefault === "function") eventLike.preventDefault();
      else nativeEvent?.preventDefault?.();
      if (typeof eventLike?.stopPropagation === "function") eventLike.stopPropagation();
      else nativeEvent?.stopPropagation?.();

      if (
        bagZone === "no"
        && this.isBagZoneSupportedItemType(sourceType)
        && this.isItemInBag(sourceItem)
        && (
          sumCarriedItemInventorySlots(this.getCarriedOutsideBagItems())
          + (isCarriedItemCountedForBag(sourceItem, this.actor) ? getCarriedItemInventorySlots(sourceItem) : 0)
        ) > CARRIED_ITEM_LIMIT_BASE
      ) {
        this.clearItemReorderVisualState();
        ui.notifications?.warn(t("BLOODMAN.Notifications.MaxCarriedItems", { max: CARRIED_ITEM_LIMIT_BASE }));
        return this.buildCarryDropErrorResult(CARRY_COLUMN_FULL_REASON);
      }

      let bagStateChanged = false;
      if (bagZone) {
        const shouldBeInBag = bagZone === "yes";
        bagStateChanged = this.isItemInBag(sourceItem) !== shouldBeInBag;
        const bagUpdated = await this.setItemBagState(sourceItem, shouldBeInBag);
        if (!bagUpdated) {
          this.clearItemReorderVisualState();
          return this.buildCarryDropErrorResult("deplacement impossible");
        }
      }
      const latestSourceItem = this.actor?.items?.get(String(sourceItem.id || "")) || sourceItem;
      const sourceInBag = bagZone && this.isBagZoneSupportedItemType(sourceType)
        ? bagZone === "yes"
        : this.isItemInBag(latestSourceItem);

      let targetLi = nativeEvent?.target?.closest?.("li.item[data-item-id]");
      if (!targetLi || !list.contains(targetLi)) targetLi = null;
      let targetItem = targetLi ? this.getItemFromListElement(targetLi) : null;
      let sortBefore = false;

      const targetType = String(targetItem?.type || "").trim().toLowerCase();
      const targetIsCompatible = Boolean(targetItem) && (
        useMixedTypeOrdering
          ? this.isBagZoneSupportedItemType(targetType)
          : targetType === sourceType
      );
      const targetAccepted = !acceptedTypes || acceptedTypes.has(targetType);

      if (!targetIsCompatible || !targetAccepted) {
        const fallbackTarget = this.actor.items
          .filter(entry => {
            const entryType = String(entry?.type || "").trim().toLowerCase();
            if (String(entry?.id || "") === String(latestSourceItem.id || "")) return false;
            if (acceptedTypes && !acceptedTypes.has(entryType)) return false;
            if (useMixedTypeOrdering) {
              if (!this.isBagZoneSupportedItemType(entryType)) return false;
              return this.isItemInBag(entry) === sourceInBag;
            }
            if (entryType !== sourceType) return false;
            if (bagZone && this.isBagZoneSupportedItemType(sourceType)) {
              return this.isItemInBag(entry) === sourceInBag;
            }
            return true;
          })
          .sort((left, right) => {
            const leftSort = toFiniteNumber(left?.sort, 0);
            const rightSort = toFiniteNumber(right?.sort, 0);
            if (leftSort !== rightSort) return leftSort - rightSort;
            return String(left?.id || "").localeCompare(String(right?.id || ""));
          })
          .slice(-1)[0];
        targetItem = fallbackTarget || null;
        sortBefore = false;
      } else {
        const columns = this.getItemListColumnCountFromElement(list);
        sortBefore = this.getItemReorderSortBefore(nativeEvent, targetLi, columns);
      }
      if (!targetItem || String(targetItem.id || "") === String(latestSourceItem.id || "")) {
        this.clearItemReorderVisualState();
        if (bagStateChanged && this.shouldManuallyRenderAfterUpdate()) this.render(false);
        return this.buildCarryDropSuccessResult();
      }

      const scopeFilter = useMixedTypeOrdering
        ? entry => {
          const entryType = String(entry?.type || "").trim().toLowerCase();
          if (acceptedTypes && !acceptedTypes.has(entryType)) return false;
          return this.isBagZoneSupportedItemType(entryType) && this.isItemInBag(entry) === sourceInBag;
        }
        : null;
      const updates = this.buildItemReorderUpdates(latestSourceItem, targetItem, {
        sortBefore,
        restrictToItemType: !useMixedTypeOrdering,
        scopeFilter
      });
      if (!updates.length) {
        this.clearItemReorderVisualState();
        if (bagStateChanged && this.shouldManuallyRenderAfterUpdate()) this.render(false);
        return this.buildCarryDropSuccessResult();
      }
      const applied = await this.applyActorItemOrderUpdates(updates);
      this.clearItemReorderVisualState();
      if (applied && this.shouldManuallyRenderAfterUpdate()) this.render(false);
      return this.buildCarryDropSuccessResult();
    } finally {
      logSheetPerformance("actor-sheet.drop.reorder", {
        actorId: this.actor?.id || "",
        durationMs: Number(endPerfTimer(startedAt).toFixed(2))
      });
      this._activeItemReorderPayload = null;
    }
  }

  getEquiperAvecDropContainerFromEvent(eventLike) {
    const nativeEvent = eventLike?.originalEvent || eventLike;
    const currentTarget = eventLike?.currentTarget instanceof HTMLElement
      ? eventLike.currentTarget
      : null;
    if (currentTarget?.matches?.("[data-equiper-avec-drop='true']")) return currentTarget;
    const candidates = this.getDropEventElementCandidates(eventLike);
    for (const candidate of candidates) {
      const container = candidate?.closest?.("[data-equiper-avec-drop='true']");
      if (container instanceof HTMLElement) return container;
    }
    return null;
  }

  getEquiperAvecParentItemFromContainer(container) {
    if (!(container instanceof HTMLElement)) return null;
    const parentItemId = String(container.dataset?.parentItemId || "").trim();
    if (!parentItemId) return null;
    return this.actor?.items?.get(parentItemId) || null;
  }

  getDropEventElementCandidates(eventLike) {
    const nativeEvent = eventLike?.originalEvent || eventLike;
    const candidates = [];
    const addCandidate = candidate => {
      if (candidate instanceof HTMLElement && !candidates.includes(candidate)) candidates.push(candidate);
    };
    addCandidate(eventLike?.currentTarget);
    addCandidate(nativeEvent?.target);
    if (typeof nativeEvent?.composedPath === "function") {
      for (const entry of nativeEvent.composedPath()) addCandidate(entry);
    }
    const clientX = Number(nativeEvent?.clientX);
    const clientY = Number(nativeEvent?.clientY);
    if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
      addCandidate(globalThis.document?.elementFromPoint?.(clientX, clientY));
    }
    return candidates;
  }

  getEquiperAvecParentItemFromDropEvent(eventLike, { allowItemRow = false } = {}) {
    const container = this.getEquiperAvecDropContainerFromEvent(eventLike);
    const containerParent = this.getEquiperAvecParentItemFromContainer(container);
    if (containerParent) return containerParent;
    if (!allowItemRow) return null;

    for (const candidate of this.getDropEventElementCandidates(eventLike)) {
      const row = candidate?.closest?.("li.item[data-item-id]");
      const parentItem = this.getItemFromListElement(row);
      if (!parentItem) continue;
      const parentLink = resolveItemLinkState(parentItem);
      if (parentLink.equiperAvecEnabled) return parentItem;
    }
    const rowFromPoint = this.getEquiperAvecParentItemFromDropCoordinates(eventLike);
    if (rowFromPoint) return rowFromPoint;
    return null;
  }

  getEquiperAvecParentItemFromDropCoordinates(eventLike) {
    const nativeEvent = eventLike?.originalEvent || eventLike;
    const clientX = Number(nativeEvent?.clientX);
    const clientY = Number(nativeEvent?.clientY);
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;

    const list = this.getItemListDropTargetFromEvent(eventLike);
    if (!(list instanceof HTMLElement)) return null;
    const listRect = list.getBoundingClientRect?.();
    if (!listRect || clientX < listRect.left || clientX > listRect.right) return null;

    let nearest = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const row of list.querySelectorAll?.("li.item[data-item-id]") || []) {
      if (!(row instanceof HTMLElement)) continue;
      const rect = row.getBoundingClientRect?.();
      if (!rect || !(rect.width > 0) || !(rect.height > 0)) continue;
      const parentItem = this.getItemFromListElement(row);
      if (!parentItem) continue;
      const parentLink = resolveItemLinkState(parentItem);
      if (!parentLink.equiperAvecEnabled) continue;

      const insideRow = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
      if (insideRow) return parentItem;

      const rowCenterY = rect.top + (rect.height / 2);
      const verticalDistance = Math.abs(clientY - rowCenterY);
      if (verticalDistance < nearestDistance) {
        nearest = parentItem;
        nearestDistance = verticalDistance;
      }
    }
    return nearestDistance <= 18 ? nearest : null;
  }

  rememberEquiperAvecDropTargetFromEvent(eventLike) {
    const parentItem = this.getEquiperAvecParentItemFromDropEvent(eventLike, { allowItemRow: true });
    if (!parentItem) return null;
    return this.rememberEquiperAvecDropTarget(parentItem);
  }

  rememberEquiperAvecDropTarget(parentItem) {
    if (!parentItem) return null;
    this._equiperAvecDropTarget = {
      actorId: String(this.actor?.id || ""),
      itemId: String(parentItem.id || ""),
      at: Date.now()
    };
    return parentItem;
  }

  getRememberedEquiperAvecDropTarget() {
    const remembered = this._equiperAvecDropTarget || null;
    if (!remembered) return null;
    if (Date.now() - Number(remembered.at || 0) > 3000) {
      this.clearRememberedEquiperAvecDropTarget();
      return null;
    }
    if (String(remembered.actorId || "") !== String(this.actor?.id || "")) return null;
    const parentItem = this.actor?.items?.get(String(remembered.itemId || "")) || null;
    if (!parentItem) return null;
    const parentLink = resolveItemLinkState(parentItem);
    return parentLink.equiperAvecEnabled ? parentItem : null;
  }

  clearRememberedEquiperAvecDropTarget() {
    this._equiperAvecDropTarget = null;
  }

  highlightEquiperAvecDropTarget(parentItem) {
    const parentId = String(parentItem?.id || "").trim();
    if (!parentId) return;
    const root = getSheetHTMLElement(this);
    const escapedParentId = typeof globalThis.CSS?.escape === "function"
      ? globalThis.CSS.escape(parentId)
      : parentId.replace(/["\\]/g, "\\$&");
    const selector = `[data-equiper-avec-drop='true'][data-parent-item-id='${escapedParentId}']`;
    root?.querySelector?.(selector)?.classList?.add?.("is-drop-target");
  }

  getEquiperAvecParentFromListForDroppedItem(list, droppedItem, eventLike = null) {
    if (!(list instanceof HTMLElement) || !droppedItem) return null;
    const candidates = [];
    const nativeEvent = eventLike?.originalEvent || eventLike;
    const clientY = Number(nativeEvent?.clientY);
    for (const row of list.querySelectorAll?.("li.item[data-item-id]") || []) {
      if (!(row instanceof HTMLElement)) continue;
      const parentItem = this.getItemFromListElement(row);
      if (!parentItem) continue;
      const parentLink = resolveItemLinkState(parentItem);
      if (!parentLink.equiperAvecEnabled) continue;
      if (!this.isEquiperAvecTypeCompatible(parentItem, droppedItem, this.getDefaultEquiperAvecAcceptedTypes())) continue;
      const rect = row.getBoundingClientRect?.();
      const centerY = rect && Number.isFinite(rect.top) && Number.isFinite(rect.height)
        ? rect.top + (rect.height / 2)
        : 0;
      const distance = Number.isFinite(clientY) ? Math.abs(clientY - centerY) : candidates.length;
      candidates.push({ parentItem, distance });
    }
    candidates.sort((left, right) => left.distance - right.distance);
    return candidates[0]?.parentItem || null;
  }

  async resolveEquiperAvecParentForDrop(eventLike, data = null) {
    if (this._equiperAvecDropInProgress) return null;
    const droppedItem = await this.resolveDroppedItemDocument(data);
    if (!droppedItem) return null;

    const directParent = this.getEquiperAvecParentItemFromDropEvent(eventLike, { allowItemRow: true })
      || this.getRememberedEquiperAvecDropTarget();
    if (directParent) return directParent;

    const list = this.getItemListDropTargetFromEvent(eventLike);
    if (!(list instanceof HTMLElement)) return null;
    const droppedType = String(droppedItem.type || "").trim().toLowerCase();
    const acceptedTypes = this.getItemListAcceptedTypesFromElement(list);
    if (acceptedTypes && acceptedTypes.has(droppedType)) return null;
    return this.getEquiperAvecParentFromListForDroppedItem(list, droppedItem, eventLike);
  }

  getEquiperAvecAcceptedTypes(container) {
    if (!(container instanceof HTMLElement)) return null;
    const raw = String(container.dataset?.acceptedTypes || "").trim().toLowerCase();
    if (!raw) return null;
    return new Set(raw.split(",").map(entry => entry.trim()).filter(Boolean));
  }

  getDefaultEquiperAvecAcceptedTypes() {
    return ITEM_LINK_EQUIPER_AVEC_ACCEPTED_TYPE_SET;
  }

  getLinkedChildItemFromEvent(eventLike) {
    const nativeEvent = eventLike?.originalEvent || eventLike;
    const trigger = eventLike?.currentTarget || nativeEvent?.target || null;
    const row = trigger?.closest?.("[data-linked-child-item-id]") || null;
    const itemId = String(row?.dataset?.linkedChildItemId || "").trim();
    if (!itemId) return null;
    return this.actor?.items?.get(itemId) || null;
  }

  getRerollItemIdFromEvent(eventLike) {
    const nativeEvent = eventLike?.originalEvent || eventLike;
    const trigger = eventLike?.currentTarget || nativeEvent?.target || null;
    const explicitItemId = String(trigger?.dataset?.itemId || "").trim();
    if (explicitItemId) return explicitItemId;
    const li = trigger?.closest?.(".item") || null;
    return String(li?.dataset?.itemId || "").trim();
  }

  resolveRerollSourceForItemId(itemId) {
    return resolveItemRerollSourceState({
      itemId,
      actorItems: this.actor?.items,
      simpleAttackItemId: SIMPLE_ATTACK_REROLL_ID,
      simpleAttackName: getSimpleAttackRerollLabel(),
      resolveItemType: item => getItemRuntimeType(item) || String(item?.type || "").trim().toLowerCase()
    });
  }

  async resolveDroppedItemDocument(data) {
    return resolveDroppedItemFromDropDataCached(data);
  }

  isEquiperAvecTypeCompatible(parentItem, childItem, acceptedTypes = null) {
    if (!parentItem || !childItem) return false;
    const parentType = String(parentItem.type || "").trim().toLowerCase();
    const childType = String(childItem.type || "").trim().toLowerCase();
    if (!isItemLinkSupportedType(parentType)) return false;
    if (!isItemLinkSupportedType(childType)) return false;
    if (acceptedTypes && acceptedTypes.size && !acceptedTypes.has(childType)) return false;
    return true;
  }

  async applyItemLinkUpdates(updates = []) {
    if (!this.actor || !Array.isArray(updates) || !updates.length) return false;
    const sanitized = updates
      .map(update => {
        const itemId = String(update?._id || "").trim();
        if (!itemId) return null;
        return { ...update, _id: itemId };
      })
      .filter(Boolean);
    if (!sanitized.length) return false;

    try {
      await this.actor.updateEmbeddedDocuments("Item", sanitized);
      return true;
    } catch (_error) {
      safeWarn(tl("BLOODMAN.Notifications.ItemLinkUpdateFailed", "Mise a jour impossible des objets equipes."));
      return false;
    }
  }

  async linkChildItemToParent(parentItem, childItem, options = {}) {
    if (!parentItem || !childItem || !this.actor) return false;
    const parentId = String(parentItem.id || "").trim();
    const childId = String(childItem.id || "").trim();
    if (!parentId || !childId) return false;
    if (parentId === childId) {
      if (options.notify !== false) {
        safeWarn(tl("BLOODMAN.Notifications.ItemLinkSelfForbidden", "Un objet ne peut pas s'equiper avec lui-meme."));
      }
      return false;
    }

    const parentLink = resolveItemLinkState(parentItem);
    if (!parentLink.equiperAvecEnabled) {
      if (options.notify !== false) {
        safeWarn(tl("BLOODMAN.Notifications.ItemLinkParentDisabled", "Activez d'abord Equiper avec sur l'objet parent."));
      }
      return false;
    }
    if (!this.isEquiperAvecTypeCompatible(parentItem, childItem, options.acceptedTypes || null)) {
      if (options.notify !== false) {
        safeWarn(tl("BLOODMAN.Notifications.ItemLinkTypeIncompatible", "Type incompatible avec Equiper avec."));
      }
      return false;
    }

    const childLink = resolveItemLinkState(childItem);
    const childType = String(childItem?.type || "").trim().toLowerCase();
    const sourceOriginalType = String(options?.sourceOriginalType || "").trim().toLowerCase();
    const canPersistOriginalType = childType === "objet"
      && (sourceOriginalType === "pouvoir" || sourceOriginalType === "aptitude");
    const previousParentId = getLinkedParentItemId(childItem, this.actor);
    const updates = [];

    if (previousParentId && previousParentId !== parentId) {
      const previousParent = this.actor.items.get(previousParentId);
      if (previousParent) {
        const previousParentLink = resolveItemLinkState(previousParent);
        updates.push({
          _id: previousParentId,
          "system.link.equiperAvec": (previousParentLink.equiperAvec || []).filter(itemId => itemId !== childId)
        });
      }
    }

    const nextParentChildren = (parentLink.equiperAvec || []).filter(itemId => itemId !== childId);
    nextParentChildren.push(childId);
    updates.push({
      _id: parentId,
      "system.link.equiperAvec": nextParentChildren
    });
    const childUpdate = {
      _id: childId,
      "system.link.parentItemId": parentId,
      "system.link.equiperAvecEnabled": false,
      "system.link.equiperAvec": []
    };
    if (canPersistOriginalType) {
      childUpdate["system.link.originalItemType"] = sourceOriginalType;
    }
    updates.push(childUpdate);

    return this.applyItemLinkUpdates(updates);
  }

  async unlinkChildItemFromParent(parentItem, childItem) {
    if (!parentItem || !childItem || !this.actor) return false;
    const parentId = String(parentItem.id || "").trim();
    const childId = String(childItem.id || "").trim();
    if (!parentId || !childId) return false;

    const parentLink = resolveItemLinkState(parentItem);
    const childLink = resolveItemLinkState(childItem);
    const updates = [{
      _id: parentId,
      "system.link.equiperAvec": (parentLink.equiperAvec || []).filter(itemId => itemId !== childId)
    }];

    if (String(childLink.parentItemId || "").trim() === parentId) {
      updates.push({
        _id: childId,
        "system.link.parentItemId": ""
      });
    }
    return this.applyItemLinkUpdates(updates);
  }

  onEquiperAvecDragOver(eventLike) {
    const nativeEvent = eventLike?.originalEvent || eventLike;
    const container = this.getEquiperAvecDropContainerFromEvent(eventLike);
    if (!container) return;
    const parentItem = this.getEquiperAvecParentItemFromContainer(container);
    if (!parentItem) return;
    const parentLink = resolveItemLinkState(parentItem);
    if (!parentLink.equiperAvecEnabled) return;

    if (typeof eventLike?.preventDefault === "function") eventLike.preventDefault();
    else nativeEvent?.preventDefault?.();
    if (nativeEvent?.dataTransfer) nativeEvent.dataTransfer.dropEffect = "move";
    container.classList.add("is-drop-target");
  }

  onEquiperAvecDragLeave(eventLike) {
    const nativeEvent = eventLike?.originalEvent || eventLike;
    const container = this.getEquiperAvecDropContainerFromEvent(eventLike);
    if (!container) return;
    const relatedTarget = nativeEvent?.relatedTarget;
    if (relatedTarget instanceof HTMLElement && container.contains(relatedTarget)) return;
    container.classList.remove("is-drop-target");
  }

  async onEquiperAvecDrop(eventLike) {
    const container = this.getEquiperAvecDropContainerFromEvent(eventLike);
    const parentItem = this.getEquiperAvecParentItemFromDropEvent(eventLike, { allowItemRow: true })
      || this.getRememberedEquiperAvecDropTarget();
    if (!container && !parentItem) {
      this.clearRememberedEquiperAvecDropTarget();
      return false;
    }

    const nativeEvent = eventLike?.originalEvent || eventLike;
    stopHandledDropEvent(eventLike);
    container?.classList?.remove("is-drop-target");

    if (!parentItem) {
      this.clearRememberedEquiperAvecDropTarget();
      return false;
    }
    const parentLink = resolveItemLinkState(parentItem);
    if (!parentLink.equiperAvecEnabled) {
      safeWarn(tl("BLOODMAN.Notifications.ItemLinkParentDisabled", "Activez d'abord Equiper avec sur l'objet parent."));
      this.clearRememberedEquiperAvecDropTarget();
      return false;
    }
    const acceptedTypes = this.getEquiperAvecAcceptedTypes(container) || this.getDefaultEquiperAvecAcceptedTypes();

    const reorderPayload = this.getItemReorderPayloadFromEvent(eventLike);
    if (reorderPayload && this.isItemReorderPayloadForCurrentActor(reorderPayload)) {
      const sourceItem = this.actor?.items?.get(String(reorderPayload.itemId || "").trim()) || null;
      if (!sourceItem) {
        this.clearRememberedEquiperAvecDropTarget();
        return false;
      }
      const linked = await this.linkChildItemToParent(parentItem, sourceItem, { acceptedTypes });
      if (linked) this.queueSheetRender(false);
      this.clearRememberedEquiperAvecDropTarget();
      return linked;
    }

    const data = getDragEventData(nativeEvent);
    if (!data) {
      this.clearRememberedEquiperAvecDropTarget();
      return false;
    }
    const dataType = String(data?.type || "").trim().toLowerCase();
    if (dataType !== "item") {
      this.clearRememberedEquiperAvecDropTarget();
      return false;
    }
    const droppedItem = await this.resolveDroppedItemDocument(data);
    const sourceOriginalType = String(droppedItem?.type || "").trim().toLowerCase();
    if (droppedItem?.actor?.id === this.actor?.id) {
      const linked = await this.linkChildItemToParent(parentItem, droppedItem, {
        acceptedTypes,
        sourceOriginalType
      });
      if (linked) this.queueSheetRender(false);
      this.clearRememberedEquiperAvecDropTarget();
      return linked;
    }

    const beforeIds = new Set((this.actor?.items || []).map(item => String(item?.id || "").trim()).filter(Boolean));
    this._equiperAvecDropInProgress = true;
    let dropped = null;
    try {
      dropped = await this.withDropItemCreateOptions(
        {
          bloodmanPreserveOriginalType: true,
          [VOYAGE_XP_SKIP_CREATE_OPTION]: true
        },
        () => this.callBaseOnDropItem(eventLike, data)
      );
    } finally {
      this._equiperAvecDropInProgress = false;
    }
    if (!dropped) {
      this.clearRememberedEquiperAvecDropTarget();
      return false;
    }

    const createdIds = this.getDropResultItemIds(dropped);
    const candidateIds = createdIds.length
      ? createdIds
      : (this.actor?.items || [])
        .map(item => String(item?.id || "").trim())
        .filter(itemId => itemId && !beforeIds.has(itemId));
    let linkedAny = false;
    for (const candidateId of candidateIds) {
      const createdItem = this.actor?.items?.get(candidateId) || null;
      if (!createdItem) continue;
      const linked = await this.linkChildItemToParent(parentItem, createdItem, {
        acceptedTypes,
        sourceOriginalType,
        notify: !linkedAny
      });
      linkedAny = linkedAny || linked;
    }
    if (linkedAny) this.queueSheetRender(false);
    this.clearRememberedEquiperAvecDropTarget();
    return linkedAny;
  }

  async _updateObject(_event, formData) {
    this.captureActorSheetNumericFocus(_event);
    const allowCharacteristicBase = canCurrentUserEditCharacteristics() && Boolean(this._characteristicsEditEnabled);
    const allowVitalResourceUpdate = VITAL_RESOURCE_PATH_LIST.some(path => hasUpdatePath(formData, path));
    const allowAmmoUpdate = hasAmmoUpdatePayload(formData);
    if (this.actor?.isOwner || game.user?.isGM) {
      return this.actor.update(formData, {
        bloodmanAllowCharacteristicBase: allowCharacteristicBase,
        bloodmanAllowVitalResourceUpdate: allowVitalResourceUpdate,
        bloodmanAllowAmmoUpdate: allowAmmoUpdate
      });
    }

    const sanitized = sanitizeActorUpdateForRole(formData, game.user?.role, {
      actor: this.actor,
      allowCharacteristicBase,
      allowVitalResourceUpdate,
      allowAmmoUpdate,
      enforceCharacteristicBaseRange: this.actor?.type === "personnage"
    });
    if (!hasActorUpdatePayload(sanitized, foundry.utils.flattenObject)) return;
    await this.applyActorUpdate(sanitized, {
      bloodmanAllowCharacteristicBase: allowCharacteristicBase,
      bloodmanAllowVitalResourceUpdate: allowVitalResourceUpdate,
      bloodmanAllowAmmoUpdate: allowAmmoUpdate
    });
  }

  getData(options = {}) {
    const startedAt = startPerfTimer();
    const data = super.getData(options);
    const preparedData = this.prepareBloodmanActorSheetData(data, options);
    logSheetPerformance("actor-sheet.getData", {
      actorId: this.actor?.id || "",
      actorType: this.actor?.type || "",
      durationMs: Number(endPerfTimer(startedAt).toFixed(2))
    });
    return preparedData;
  }

  prepareBloodmanActorSheetData(data, _options = {}) {
    const canToggleCharacteristicsEdit = canCurrentUserEditCharacteristics();
    const canEditTokenImage = isAssistantOrHigherRole(game.user?.role);
    const canManageAmmoLines = Boolean(this.actor?.isOwner || isAssistantOrHigherRole(game.user?.role));
    const canEditAmmoType = canManageAmmoLines;
    const canEditAmmoStock = canManageAmmoLines;
    const ammoStockDecreaseOnly = canEditAmmoStock && !isAssistantOrHigherRole(game.user?.role);
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
    const showSimpleAttackReroll = shouldShowItemReroll(SIMPLE_ATTACK_REROLL_ID);
    const hasPortraitImage = !isMissingTokenImage(String(data.actor?.img || "").trim());

    const visibleActorItems = getVisibleActorItems(this.actor);
    const itemBonuses = getItemBonusTotals(this.actor, { items: visibleActorItems });
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
      label: t(characteristic.labelKey) || characteristic.key,
      selected: profileBonusCharacteristic === characteristic.key
    }));
    const equipment = foundry.utils.mergeObject(buildDefaultEquipment(), data.actor.system.equipment || {}, {
      inplace: false
    });
    equipment.monnaies = String(equipment.monnaies ?? "").trim();
    equipment.monnaiesActuel = normalizeCurrencyCurrentValue(equipment.monnaiesActuel, 0).value;
    const actorBagSlotsEnabled = resolveActorBackpackEnabled(this.actor, { items: visibleActorItems }).enabled;
    if (this._optimisticBagSlotsEnabled !== null && actorBagSlotsEnabled === this._optimisticBagSlotsEnabled) {
      this._optimisticBagSlotsEnabled = null;
    }
    const bagSlotsEnabled = this._optimisticBagSlotsEnabled !== null
      ? Boolean(this._optimisticBagSlotsEnabled)
      : actorBagSlotsEnabled;
    const carriedItemsLimit = bagSlotsEnabled ? CARRIED_ITEM_LIMIT_WITH_BAG : CARRIED_ITEM_LIMIT_BASE;
    const {
      ammoPool,
      ammoActiveIndex,
      ammo
    } = getActorAmmoPoolState(this.actor);
    const ammoLines = ammoPool.map((line, index) => {
      const stock = Math.max(0, Math.floor(toFiniteNumber(line?.stock, 0)));
      const isActive = index === ammoActiveIndex;
      return {
        index,
        type: String(line?.type || ""),
        stock,
        isActive,
        showEmptyState: isActive && stock <= 0,
        stockInputMax: ammoStockDecreaseOnly ? stock : null
      };
    });
    const canRemoveAmmoLine = canManageAmmoLines && ammoLines.length > 1;
    const transportNpcs = buildTransportNpcDisplayData(this.actor);

    const itemBuckets = buildTypedItemBuckets(visibleActorItems);

    const powerUseState = this.getPowerUseState();
    const childDisplayOptions = {
      powerUseState,
      isPlayerActor,
      shouldShowItemReroll,
      ammo
    };
    const aptitudes = itemBuckets.aptitude.map(item => {
      const dataItem = buildItemDisplayData(item);
      dataItem.showAptitudeUseButton = isPlayerActor;
      dataItem.showItemReroll = Boolean(dataItem.displayDamageDie) && shouldShowItemReroll(item.id);
      Object.assign(dataItem, buildEquiperAvecDisplayData(this.actor, item, childDisplayOptions));
      return dataItem;
    });
    const pouvoirs = itemBuckets.pouvoir.map(item => {
      const dataItem = buildItemDisplayData(item);
      const itemId = String(item.id || dataItem._id || "").trim();
      const usableEnabled = isPowerUsableEnabled(item.system?.usableEnabled);
      const isActivated = usableEnabled && itemId ? powerUseState.has(itemId) : false;
      if (!usableEnabled && itemId) powerUseState.delete(itemId);
      const hasPowerHeal = Boolean(dataItem.displayHealDie);
      const hasPowerDamage = !hasPowerHeal && Boolean(dataItem.displayDamageDie);
      dataItem.powerRollMode = hasPowerHeal ? "heal" : (hasPowerDamage ? "damage" : "none");
      dataItem.displayPowerDie = hasPowerHeal ? dataItem.displayHealDie : (hasPowerDamage ? dataItem.displayDamageDie : "");
      dataItem.powerRollClass = hasPowerHeal ? "ability-roll bm-btn-heal" : "ability-roll bm-btn-damage";
      dataItem.showPowerUseButton = usableEnabled;
      dataItem.showPowerRoll = Boolean(dataItem.displayPowerDie) && (!usableEnabled || isActivated);
      dataItem.showItemReroll = dataItem.showPowerRoll
        && dataItem.powerRollMode === "damage"
        && shouldShowItemReroll(item.id);
      Object.assign(dataItem, buildEquiperAvecDisplayData(this.actor, item, childDisplayOptions));
      return dataItem;
    });
    const activePowerIds = new Set(
      itemBuckets.pouvoir
        .map(item => String(item.id || item._id || "").trim())
        .filter(Boolean)
    );
    for (const key of [...powerUseState]) {
      if (!activePowerIds.has(key)) powerUseState.delete(key);
    }
    const aptitudesThreeColumns = aptitudes.length >= 2;
    const pouvoirsThreeColumns = pouvoirs.length >= 2;

    const npcRole = data.actor.system.npcRole || "";

    const sortItemsBySortKey = (left, right) => {
      const leftSort = toFiniteNumber(left?.sort, 0);
      const rightSort = toFiniteNumber(right?.sort, 0);
      if (leftSort !== rightSort) return leftSort - rightSort;
      return String(left?.id || "").localeCompare(String(right?.id || ""));
    };
    const carriedItems = visibleActorItems
      .filter(item => CARRIED_ITEM_TYPES.has(String(item?.type || "").trim().toLowerCase()))
      .sort(sortItemsBySortKey);
    const carriedColumnState = this.getCarriedColumnState({
      bagEnabledOverride: bagSlotsEnabled,
      items: carriedItems
    });
    const buildCarryDisplayItem = item => {
      const displayItem = item.toObject();
      displayItem._id = displayItem._id ?? item.id;
      displayItem.type = String(item.type || displayItem.type || "").trim().toLowerCase();
      displayItem.displayNoteHtml = formatMultilineTextToHtml(
        displayItem.system?.note || displayItem.system?.notes || ""
      );
      displayItem.bagActionLabel = "";
      displayItem.bagActionClass = "";
      displayItem.bagProtectionLabel = resolveItemProtectionLabel(displayItem, { type: displayItem.type });
      displayItem.bagProtectionClass = "item-chip item-meta bm-btn-armor";
      const markValue = String(displayItem.system?.mark || "").trim();
      const noteSmallValue = String(displayItem.system?.noteSmall || "").trim();
      const markIsPa = /^PA\b/i.test(markValue);
      const noteSmallIsPa = /^PA\b/i.test(noteSmallValue);
      displayItem.bagMarkClass = `item-chip item-mark${markIsPa ? " bm-btn-pa" : ""}`;
      displayItem.bagNoteSmallClass = `item-chip item-meta${noteSmallIsPa ? " bm-btn-pa" : ""}`;
      displayItem.bagShowAmmoState = false;
      displayItem.bagAmmoMagazine = 0;
      displayItem.bagAmmoCapacityDisplay = 0;
      displayItem.bagShowReloadButton = false;
      displayItem.bagReloadBlocked = false;
      displayItem.showItemReroll = shouldShowItemReroll(item.id);
      const singleUseDisplay = resolveItemSingleUseDisplayData(displayItem.system || {});
      displayItem.bagShowSingleUseCount = singleUseDisplay.show;
      displayItem.bagSingleUseCountLabel = singleUseDisplay.label;
      displayItem.bagSingleUseCountClass = "item-chip item-meta bm-btn-usage-count";

      if (displayItem.type === "arme") {
        const damageDie = String(displayItem.system?.damageDie || "").trim();
        if (damageDie) {
          displayItem.bagActionLabel = normalizeRollDieFormula(damageDie, "d4");
          displayItem.bagActionClass = "weapon-roll bm-btn-damage";
        }
        const weaponCategory = getWeaponCategory(displayItem.system?.weaponType);
        const consumesAmmo = weaponCategory === "distance" && !toCheckboxBoolean(displayItem.system?.infiniteAmmo, false);
        const magazineCapacity = normalizeNonNegativeInteger(displayItem.system?.magazineCapacity, 0);
        const usesDirectStock = consumesAmmo && magazineCapacity <= 0;
        const ammoStock = consumesAmmo ? Math.max(0, ammo.stock) : 0;
        const loadedAmmo = usesDirectStock
          ? ammoStock
          : getWeaponLoadedAmmo(item, { fallback: ammo.magazine });
        const magazineMissingAmmo = !usesDirectStock && loadedAmmo < magazineCapacity;
        displayItem.bagShowAmmoState = consumesAmmo;
        displayItem.bagAmmoMagazine = loadedAmmo;
        displayItem.bagAmmoCapacityDisplay = usesDirectStock ? ammoStock : magazineCapacity;
        displayItem.bagShowReloadButton = consumesAmmo && !usesDirectStock && ammoStock > 0 && magazineMissingAmmo;
        displayItem.bagReloadBlocked = consumesAmmo && !usesDirectStock && ammoStock <= 0;
      } else if (displayItem.type === "soin") {
        const healDie = String(displayItem.system?.healDie || "").trim();
        displayItem.bagActionLabel = normalizeRollDieFormula(healDie || "d4", "d4");
        displayItem.bagActionClass = "item-use bm-btn-heal";
      } else if (displayItem.type === "ration") {
        displayItem.bagActionLabel = t("BLOODMAN.Common.Eat");
        displayItem.bagActionClass = "item-use bm-btn-heal";
      } else if (displayItem.type === "objet" && toCheckboxBoolean(displayItem.system?.useEnabled, false)) {
        const objectDamageEnabled = toCheckboxBoolean(
          displayItem.system?.damageEnabled,
          displayItem.system?.damageDie != null
        );
        const objectDamageDie = String(displayItem.system?.damageDie || "").trim();
        if (objectDamageEnabled && objectDamageDie) {
          displayItem.bagActionLabel = normalizeRollDieFormula(objectDamageDie, "d4");
          displayItem.bagActionClass = "item-use bm-btn-damage";
        } else {
          displayItem.bagActionLabel = t("BLOODMAN.Common.Use");
          displayItem.bagActionClass = "item-use bm-btn-magic";
        }
      }

      Object.assign(displayItem, buildEquiperAvecDisplayData(this.actor, item, childDisplayOptions));
      return displayItem;
    };
    const equipmentItems = carriedColumnState.columns[CARRY_COLUMN_EQUIPMENT] || [];
    const weaponTypeDistance = t("BLOODMAN.Equipment.WeaponType.Distance");
    const weaponTypeMelee = t("BLOODMAN.Equipment.WeaponType.Melee");
    const weapons = equipmentItems
      .filter(item => String(item?.type || "").trim().toLowerCase() === "arme")
      .map(item => {
        const weapon = item.toObject();
        weapon._id = weapon._id ?? item.id;
        weapon.protectionLabel = resolveItemProtectionLabel(weapon, {
          type: String(weapon.type || item.type || "").trim().toLowerCase()
        });
        weapon.displayNoteHtml = formatMultilineTextToHtml(
          weapon.system?.note || weapon.system?.notes || ""
        );
        weapon.displayDamageFormula = normalizeRollDieFormula(weapon.system?.damageDie, "d4");
        const singleUseDisplay = resolveItemSingleUseDisplayData(weapon.system || {});
        weapon.showSingleUseCount = singleUseDisplay.show;
        weapon.singleUseCountLabel = singleUseDisplay.label;
        weapon.singleUseCountClass = "item-chip item-meta bm-btn-usage-count";
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
        Object.assign(weapon, buildEquiperAvecDisplayData(this.actor, item, childDisplayOptions));
        return weapon;
      });
    const protections = equipmentItems
      .filter(item => String(item?.type || "").trim().toLowerCase() === "protection")
      .map(item => {
        const protection = item.toObject();
        protection._id = protection._id ?? item.id;
        protection.displayNoteHtml = formatMultilineTextToHtml(
          protection.system?.note || protection.system?.notes || ""
        );
        const singleUseDisplay = resolveItemSingleUseDisplayData(protection.system || {});
        protection.showSingleUseCount = singleUseDisplay.show;
        protection.singleUseCountLabel = singleUseDisplay.label;
        protection.singleUseCountClass = "item-chip item-meta bm-btn-usage-count";
        Object.assign(protection, buildEquiperAvecDisplayData(this.actor, item, childDisplayOptions));
        return protection;
      });
    const objectColumnOneItems = (carriedColumnState.columns[CARRY_COLUMN_OBJECTS_ONE] || []).map(buildCarryDisplayItem);
    const objectColumnTwoItems = (carriedColumnState.columns[CARRY_COLUMN_OBJECTS_TWO] || []).map(buildCarryDisplayItem);
    const bagItems = (carriedColumnState.columns[CARRY_COLUMN_BAG] || []).map(buildCarryDisplayItem);
    const carriedItemsCount = sumCarriedItemInventorySlots(
      carriedItems.filter(item => isCarriedItemCountedForBag(item, this.actor))
    );

    return {
      ...data,
      canToggleCharacteristicsEdit,
      characteristicBaseHasBounds,
      characteristicBaseMin: CHARACTERISTIC_BASE_MIN,
      characteristicBaseMax: CHARACTERISTIC_BASE_MAX,
      canEditRestrictedFields,
      canEditXpChecks,
      canEditTokenImage,
      canManageAmmoLines,
      canEditAmmoType,
      canEditAmmoStock,
      ammoStockDecreaseOnly,
      canRemoveAmmoLine,
      canOpenItemSheets,
      canResetMoveGauge,
      moveResetLabel,
      simpleAttackRerollId: SIMPLE_ATTACK_REROLL_ID,
      showSimpleAttackReroll,
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
      bagSlotsToggleDisabled: isBasicPlayerRole(game.user?.role),
      carriedItemsCount,
      carriedItemsLimit,
      weapons,
      protections,
      objectColumnOneItems,
      objectColumnTwoItems,
      bagItems,
      aptitudes,
      pouvoirs,
      itemLinkAcceptedTypes: ITEM_LINK_EQUIPER_AVEC_ACCEPTED_TYPES,
      ammo,
      ammoLines,
      ammoActiveIndex,
      transportNpcs,
      aptitudesThreeColumns,
      pouvoirsThreeColumns
    };
  }

  getAutoResizeKey() {
    const root = getSheetElementWrapper(this);
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
    const root = htmlLike?.find ? htmlLike : getSheetElementWrapper(this);
    if (!root?.length) return;
    const fields = root.find("textarea[data-autogrow='true']");
    if (!fields.length) return;
    fields.each((_index, textarea) => {
      this.resizeAutoGrowTextarea(textarea);
    });
  }

  autoResizeToContent(force = false) {
    if (this._minimized) return;
    const root = getSheetElementWrapper(this);
    if (!root?.length) return;
    const app = root.closest(".window-app");
    if (!app?.length) return;
    const responsiveState = this.applyResponsiveActorSheetLayoutState(root);
    const resizeKey = this.getAutoResizeKey();
    if (!force && resizeKey && resizeKey === this._lastAutoResizeKey) return;
    if (responsiveState?.layoutMode && responsiveState.layoutMode !== "wide") {
      if (resizeKey) this._lastAutoResizeKey = resizeKey;
      return;
    }
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
      configuredMinHeight: this.options?.height ?? this.options?.position?.height,
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
    this.activateBloodmanActorListeners(html);
  }

  activateBloodmanActorListeners(html) {
    const basicPlayer = isBasicPlayerRole(game.user?.role);
    const activatePrimaryTab = tabId => {
      const tab = String(tabId || this._bloodmanActivePrimaryTab || "carac").trim() || "carac";
      this._bloodmanActivePrimaryTab = tab;
      html.find(".sheet-tabs .item").removeClass("active");
      html.find(`.sheet-tabs .item[data-tab='${tab}']`).addClass("active");
      html.find(".sheet-body .tab").removeClass("active");
      html.find(`.sheet-body .tab[data-tab='${tab}']`).addClass("active");
    };
    const currentActiveTab = String(
      html.find(".sheet-tabs .item.active").first().data("tab")
      || html.find(".sheet-body .tab.active").first().data("tab")
      || this._bloodmanActivePrimaryTab
      || "carac"
    ).trim();
    activatePrimaryTab(currentActiveTab);
    const forceEnableSheetUi = () => {
      this.applyActorSheetInteractivePermissions(html);
    };
    forceEnableSheetUi();
    this.connectActorSheetNativeEditHandlers(html);
    clearUiMicrotask(this._forceEnableSheetTaskId);
    this._forceEnableSheetTaskId = queueUiMicrotask(forceEnableSheetUi);
    html.on("focusin keydown input change", ACTOR_SHEET_NUMERIC_FOCUS_SELECTOR, ev => {
      this.captureActorSheetNumericFocus(ev);
    });
    this.queueActorSheetNumericFocusRestore(html);
    this.refreshResourceVisuals(html);
    this.queueResourceGaugeRefresh(html);
    this.refreshAutoGrowTextareas(html);
    this.queueAutoGrowTextareaRefresh(html);
    this.connectResponsiveActorSheetLayoutObserver(html);
    this.queueAutoResizeToContent(true);

    html.find(".sheet-tabs .item").on("click", ev => {
      const tabId = String(ev?.currentTarget?.dataset?.tab || "").trim();
      if (tabId) activatePrimaryTab(tabId);
      queueUiMicrotask(() => this.applyResponsiveActorSheetLayoutState(html));
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
      this.applyActorSheetInteractivePermissions(html);
      queueUiMicrotask(() => this.applyActorSheetInteractivePermissions(html));
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

    html.on("click", "img.portrait[data-edit='img']", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      this.openActorImageFilePicker(ev.currentTarget?.dataset?.edit || "img");
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

    html.on("change", CHARACTERISTIC_BASE_INPUT_SELECTOR, async ev => {
      if (!canCurrentUserEditCharacteristics()) return;
      if (!this._characteristicsEditEnabled) return;
      if (this.actor?.isOwner || game.user?.isGM) return;
      ev.preventDefault();
      ev.stopPropagation();
      await this.updateTrustedCharacteristicBaseInput(ev.currentTarget);
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

    html.find(".weapon-roll").click(async ev => {
      const li = ev.currentTarget.closest(".item");
      const item = this.getItemFromListElement(li);
      const itemType = String(item?.type || "").trim().toLowerCase();
      if (itemType === "objet") {
        await this.useItem(item);
        return;
      }
      this.rollDamage(item);
    });

    html.find(".weapon-simple-attack").click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      await this.rollSimpleAttack();
    });

    html.find(".ammo-line-add").click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      await this.addAmmoLine();
    });

    html.find(".ammo-line-remove").click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      await this.removeActiveAmmoLine();
    });

    html.find(".ammo-line-select").click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const index = Number(ev.currentTarget?.dataset?.index);
      await this.selectAmmoLine(index);
    });

    html.find(".weapon-reload").click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const li = ev.currentTarget.closest(".item");
      const item = this.getItemFromListElement(li);
      await this.reloadWeapon(item);
    });

    actorItemDndController.activateActorItemDndListeners(this, html);

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

    html.find(".equiper-avec-item-open").click(ev => {
      if (!canCurrentUserOpenItemSheets()) return;
      ev.preventDefault();
      ev.stopPropagation();
      const itemId = String(ev.currentTarget?.dataset?.itemId || "").trim();
      if (!itemId) return;
      const item = this.actor?.items?.get(itemId) || null;
      item?.sheet?.render(true);
    });

    html.find(".equiper-avec-remove").click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const childRow = ev.currentTarget?.closest?.("[data-linked-child-item-id]");
      const container = ev.currentTarget?.closest?.("[data-equiper-avec-drop='true']");
      const childId = String(childRow?.dataset?.linkedChildItemId || "").trim();
      const parentId = String(container?.dataset?.parentItemId || "").trim();
      if (!childId || !parentId) return;
      const parentItem = this.actor?.items?.get(parentId) || null;
      const childItem = this.actor?.items?.get(childId) || null;
      if (!parentItem || !childItem) return;
      const unlinked = await this.unlinkChildItemFromParent(parentItem, childItem);
      if (!unlinked) return;
      childRow?.remove?.();
      this.queueSheetRender(false);
    });

    html.find(".equiper-avec-item-use").click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const item = this.getLinkedChildItemFromEvent(ev);
      await this.useItem(item);
    });

    html.find(".equiper-avec-power-use").click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const item = this.getLinkedChildItemFromEvent(ev);
      await this.usePower(item);
    });

    html.find(".equiper-avec-aptitude-use").click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const item = this.getLinkedChildItemFromEvent(ev);
      await this.useAptitude(item);
    });

    html.find(".equiper-avec-ability-roll").click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const item = this.getLinkedChildItemFromEvent(ev);
      const rollAction = String(ev.currentTarget?.dataset?.rollAction || "").trim().toLowerCase();
      if (rollAction === "weapon") {
        this.rollDamage(item);
        return;
      }
      this.rollAbilityDamage(item);
    });

    html.find(".equiper-avec-item-reroll").click(ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const item = this.getLinkedChildItemFromEvent(ev);
      const itemId = String(item?.id || "").trim();
      if (!itemId) return;
      this.rerollItemRoll(itemId);
    });

    html.find(".equiper-avec-item-reroll-clear").click(ev => {
      ev.preventDefault();
      ev.stopPropagation();
      this.clearItemRerollState();
      this.render(false);
    });

    html.find(".equiper-avec-weapon-reload").click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const item = this.getLinkedChildItemFromEvent(ev);
      await this.reloadWeapon(item);
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
      const itemId = this.getRerollItemIdFromEvent(ev);
      this.rerollItemRoll(itemId);
    });

    html.find(".item-reroll-clear").click(ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const itemId = this.getRerollItemIdFromEvent(ev);
      this.clearItemReroll(itemId);
    });

    html.find(".transport-npc-open").click(async ev => {
      const li = ev.currentTarget.closest(".item");
      const ref = li?.dataset?.transportNpcRef;
      const npc = await resolveTransportNpc(ref);
      if (npc?.sheet?.render) {
        npc.sheet.render(true);
        return;
      }
      const byUuid = ref ? await compatFromUuid(ref).catch(() => null) : null;
      if (byUuid?.sheet?.render) byUuid.sheet.render(true);
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
      if (basicPlayer) {
        const currentBagSlotsEnabled = this.isActorBagSlotsEnabled(this.actor);
        html.find(".bag-slots-toggle[data-bag-slots='yes']").prop("checked", currentBagSlotsEnabled);
        html.find(".bag-slots-toggle[data-bag-slots='no']").prop("checked", !currentBagSlotsEnabled);
        return;
      }
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

      this._optimisticBagSlotsEnabled = bagSlotsEnabled;
      const applied = await this.applyActorUpdate({ "system.equipment.bagSlotsEnabled": bagSlotsEnabled });
      if (!applied) {
        this._optimisticBagSlotsEnabled = null;
        const currentBagSlotsEnabled = this.isActorBagSlotsEnabled(this.actor);
        yesInput.prop("checked", currentBagSlotsEnabled);
        noInput.prop("checked", !currentBagSlotsEnabled);
        return;
      }
      socketEmit(SYSTEM_SOCKET, {
        type: "actorBackpackStateChanged",
        requesterId: String(game.user?.id || ""),
        actorUuid: String(this.actor?.uuid || ""),
        actorId: String(this.actor?.id || ""),
        actorBaseId: String(this.actor?.token?.actorId || this.actor?.baseActor?.id || this.actor?.id || ""),
        enabled: bagSlotsEnabled
      });
      updateOpenActorSheetsBackpackState(this.actor, bagSlotsEnabled);
      if (bagSlotsEnabled) {
        const overflowMoved = await this.enforceMainCarryOverflowToBag({ bagEnabledOverride: true });
        if (overflowMoved) this.render(false);
      } else {
        const normalized = await this.normalizeCarryColumnsAfterBagToggle({ bagEnabledOverride: false });
        if (normalized) this.render(false);
      }
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

  getResourceBubbleRuntimeMap() {
    if (!(this._resourceBubbleRuntimeMap instanceof WeakMap)) {
      this._resourceBubbleRuntimeMap = new WeakMap();
    }
    return this._resourceBubbleRuntimeMap;
  }

  buildResourceBubbleConfig(kind = "pv") {
    if (kind === "pp") {
      return {
        count: 30,
        minSize: 2.2,
        maxSize: 6.4,
        minDuration: 2.9,
        maxDuration: 8.9,
        minOpacity: 0.26,
        maxOpacity: 0.68,
        maxDrift: 13.8
      };
    }
    return {
      count: 32,
      minSize: 2.3,
      maxSize: 6.8,
      minDuration: 2.7,
      maxDuration: 8.4,
      minOpacity: 0.29,
      maxOpacity: 0.75,
      maxDrift: 14.4
    };
  }

  randomizeResourceBubbleNode(node, config = {}, circleHeight = 160) {
    if (!(node instanceof HTMLElement)) return;
    const randomBetween = (min, max) => {
      const lo = Number.isFinite(min) ? min : 0;
      const hi = Number.isFinite(max) ? max : lo;
      if (hi <= lo) return lo;
      return lo + (Math.random() * (hi - lo));
    };
    const signedBetween = (min, max) => {
      const value = randomBetween(min, max);
      return Math.random() < 0.5 ? -value : value;
    };

    const minSize = Number.isFinite(config.minSize) ? config.minSize : 1.2;
    const maxSize = Number.isFinite(config.maxSize) ? config.maxSize : 4.2;
    const minDuration = Number.isFinite(config.minDuration) ? config.minDuration : 2.8;
    const maxDuration = Number.isFinite(config.maxDuration) ? config.maxDuration : 8.5;
    const minOpacity = Number.isFinite(config.minOpacity) ? config.minOpacity : 0.14;
    const maxOpacity = Number.isFinite(config.maxOpacity) ? config.maxOpacity : 0.4;
    const maxDrift = Number.isFinite(config.maxDrift) ? config.maxDrift : 13;

    const size = randomBetween(minSize, maxSize);
    const duration = randomBetween(minDuration, maxDuration);
    const extraDelaySpread = randomBetween(0.2, 2.2);
    const delay = -randomBetween(0, duration + extraDelaySpread);
    const opacity = randomBetween(minOpacity, maxOpacity);
    const blur = randomBetween(0, 0.28);
    const x = randomBetween(3, 95);
    const driftA = signedBetween(1.3, maxDrift * 0.42);
    const driftB = signedBetween(2.1, maxDrift * 0.75);
    const driftC = signedBetween(2.6, maxDrift);
    const driftD = signedBetween(1.6, maxDrift * 0.88);
    const scaleStart = randomBetween(0.62, 0.95);
    const scaleMid = randomBetween(0.9, 1.18);
    const scaleEnd = randomBetween(0.68, 0.93);
    const riseBase = (circleHeight * 1.2) + randomBetween(16, 34);
    const rise = -Math.max(58, Math.floor(riseBase));

    node.style.setProperty("--bubble-size", `${size.toFixed(2)}px`);
    node.style.setProperty("--bubble-duration", `${duration.toFixed(2)}s`);
    node.style.setProperty("--bubble-delay", `${delay.toFixed(2)}s`);
    node.style.setProperty("--bubble-opacity", opacity.toFixed(3));
    node.style.setProperty("--bubble-blur", `${blur.toFixed(2)}px`);
    node.style.setProperty("--bubble-x", `${x.toFixed(2)}%`);
    node.style.setProperty("--bubble-drift-a", `${driftA.toFixed(2)}px`);
    node.style.setProperty("--bubble-drift-b", `${driftB.toFixed(2)}px`);
    node.style.setProperty("--bubble-drift-c", `${driftC.toFixed(2)}px`);
    node.style.setProperty("--bubble-drift-d", `${driftD.toFixed(2)}px`);
    node.style.setProperty("--bubble-scale-start", scaleStart.toFixed(3));
    node.style.setProperty("--bubble-scale-mid", scaleMid.toFixed(3));
    node.style.setProperty("--bubble-scale-end", scaleEnd.toFixed(3));
    node.style.setProperty("--bubble-rise", `${rise}px`);
    node.dataset.seeded = "1";
  }

  ensureResourceBubbleLayer(circle, kind, ratio = 0) {
    const circleElement = circle?.get?.(0) ?? circle?.[0] ?? null;
    if (!(circleElement instanceof HTMLElement)) return;
    let layer = circleElement.querySelector(".resource-bubble-layer");
    if (!(layer instanceof HTMLElement)) {
      layer = document.createElement("div");
      layer.className = "resource-bubble-layer";
      layer.setAttribute("aria-hidden", "true");
      circleElement.prepend(layer);
    }

    const config = this.buildResourceBubbleConfig(kind);
    const desiredCount = Math.max(8, Math.floor(toFiniteNumber(config.count, 24)));
    while (layer.children.length < desiredCount) {
      const bubble = document.createElement("span");
      bubble.className = "resource-bubble";
      layer.appendChild(bubble);
    }
    while (layer.children.length > desiredCount) {
      layer.lastElementChild?.remove();
    }

    const runtimeMap = this.getResourceBubbleRuntimeMap();
    const runtime = runtimeMap.get(circleElement) || { tick: 0 };
    runtime.tick = Math.max(0, Math.floor(toFiniteNumber(runtime.tick, 0))) + 1;
    runtimeMap.set(circleElement, runtime);

    const safeRatio = Math.max(0, Math.min(1, toFiniteNumber(ratio, 0)));
    const circleHeight = Math.max(96, Math.round(toFiniteNumber(circleElement.clientHeight, 160)));
    const liquidHeight = Math.max(34, Math.round(circleHeight * Math.max(0.2, safeRatio)));
    const layerRise = -(liquidHeight + 26);
    layer.style.removeProperty("height");
    layer.style.removeProperty("opacity");
    layer.style.setProperty("--bubble-rise", `${layerRise}px`);

    const bubbles = Array.from(layer.children);
    for (let index = 0; index < bubbles.length; index += 1) {
      const bubble = bubbles[index];
      if (!(bubble instanceof HTMLElement)) continue;
      const neverSeeded = bubble.dataset.seeded !== "1";
      const periodicReseed = !neverSeeded && ((runtime.tick + index) % 11 === 0);
      const randomReseed = !neverSeeded && Math.random() < 0.07;
      if (neverSeeded || periodicReseed || randomReseed) {
        this.randomizeResourceBubbleNode(bubble, config, liquidHeight);
      }
    }
  }

  refreshResourceVisuals(html) {
    const root = html?.find ? html : getSheetElementWrapper(this);
    if (!root?.length) return;
    const updateGauge = (kind, currentPath, maxPath) => {
      const currentInput = root.find(`input[name='${currentPath}']`).first();
      const maxInput = root.find(`input[name='${maxPath}']`).first();
      const circle = root.find(`.resource-circle.${kind}`).first();
      if (!currentInput.length || !maxInput.length || !circle.length) return;

      const normalizedMax = Math.max(0, Math.floor(toFiniteNumber(maxInput.val(), 0)));
      const normalizedCurrentRaw = Math.max(0, Math.floor(toFiniteNumber(currentInput.val(), 0)));
      const normalizedCurrent = Math.min(normalizedCurrentRaw, normalizedMax);

      if (String(maxInput.val()) !== String(normalizedMax)) maxInput.val(String(normalizedMax));
      if (String(currentInput.val()) !== String(normalizedCurrent)) currentInput.val(String(normalizedCurrent));

      const gauge = resolveResourceGaugeState(normalizedCurrent, normalizedMax, { useUnitMaxWhenZero: true });
      const ratioKey = `data-${kind}-ratio`;
      const previousRatio = Number(circle.attr(ratioKey));
      const ratio = gauge.ratio;

      circle.css(`--${kind}-fill`, gauge.fill);
      circle.css(`--${kind}-ratio`, ratio.toFixed(4));
      circle.css(`--${kind}-steps`, String(gauge.steps));
      circle.attr(ratioKey, ratio.toFixed(4));

      circle.removeClass("is-empty is-critical is-warning is-healthy");
      circle.addClass(gauge.stateClass);
      this.ensureResourceBubbleLayer(circle, kind, ratio);

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
    const nativeEvent = event?.originalEvent || event;
    const data = getDragEventData(nativeEvent);
    if (String(data?.type || "").trim().toLowerCase() === "item") {
      const itemList = nativeEvent?.target?.closest?.("ol.item-list");
      if (itemList instanceof HTMLElement) return this.onItemReorderDrop(event);
    }
    if (data?.type === "Actor") {
      const handled = await this._onDropTransportNpc(event, data);
      if (handled) return;
    }
    return this.callBaseOnDrop(event);
  }

  callBaseOnDrop(event) {
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
    if (!preview || (typeof getDialogClass() !== "function" && typeof getDialogV2Class() !== "function")) return "fermer";
    const eyebrow = tl(
      "BLOODMAN.Dialogs.DropDecision.Eyebrow",
      "Deplacement d'objet"
    );
    const title = tl("BLOODMAN.Dialogs.DropDecision.Title", "Transfert d'objet");
    const itemLabel = tl("BLOODMAN.Dialogs.DropDecision.ItemLabel", "Objet");
    const destinationLabel = tl("BLOODMAN.Dialogs.DropDecision.TargetLabel", "Destination");
    const warningLabel = tl("BLOODMAN.Dialogs.DropDecision.WarningLabel", "Attention");
    const warningText = tl(
      "BLOODMAN.Dialogs.DropDecision.InvalidPriceWarning",
      "Un ou plusieurs objets ont un prix invalide. L'achat sera bloque."
    );
    const content = buildDropDecisionDialogContent({
      preview,
      labels: {
        eyebrow,
        title,
        itemLabel,
        destinationLabel,
        warningLabel,
        warningText
      },
      formatCurrencyValue
    });

    return new Promise(resolve => {
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        resolve(String(value || "fermer"));
      };

      const dialog = createBloodmanDialog(
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
          width: 720
        }
      );
      if (dialog?.render) dialog.render(true);
      else finish("fermer");
    });
  }

  async _onDropItem(event, data) {
    const startedAt = startPerfTimer();
    const equiperAvecParent = await this.resolveEquiperAvecParentForDrop(event, data);
    if (equiperAvecParent) {
      this.rememberEquiperAvecDropTarget(equiperAvecParent);
      return this.onEquiperAvecDrop(event);
    }

    const permissionState = await this.resolveDropPermissionState(data);
    if (!permissionState.allowed) {
      const notificationKey = resolveDropPermissionNotificationKey(permissionState);
      ui.notifications?.warn(t(notificationKey));
      return null;
    }

    const dropEntries = this.getDropEntries(data);
    const actorTransferEntries = await this.resolveActorTransferEntries(data);
    const hasOnlyActorTransfers = shouldUseActorTransferPath(dropEntries, actorTransferEntries);
    if (hasOnlyActorTransfers) {
      if (!game.user?.isGM) {
        const sent = requestActorItemTransfer(this.actor, actorTransferEntries);
        if (!sent) safeWarn(tl("BLOODMAN.Notifications.ActorUpdateRequiresGM", "Mise a jour impossible: aucun MJ ou assistant actif."));
        return sent ? [] : null;
      }
      const reachedLimit = await this._reachedCarriedItemsLimit(data);
      if (reachedLimit) return null;
      const dropped = await this.applyActorToActorItemTransfer(actorTransferEntries, {
        createItemOptions: { [VOYAGE_XP_SKIP_CREATE_OPTION]: true }
      });
      if (dropped) {
        const overflowMoved = await this.enforceMainCarryOverflowToBag({
          preferredItemIds: this.getDropResultItemIds(dropped)
        });
        if (overflowMoved) this.render(false);
      }
      return dropped;
    }

    const reachedLimit = await this._reachedCarriedItemsLimit(data);
    if (reachedLimit) return null;

    const purchase = await this.resolveDropPurchaseSummary(data);
    const preview = await this.buildDropDecisionPreview(data, purchase);
    if (!preview) {
      return this.callBaseOnDropItem(event, data);
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

    const createItemOptions = shouldBuy
      ? undefined
      : { [VOYAGE_XP_SKIP_CREATE_OPTION]: true };

    try {
      const dropped = await this.withDropItemCreateOptions(createItemOptions, () => this.callBaseOnDropItem(event, data));
      if (!dropped && deductedBeforeDrop && previousCurrency != null) {
        await this.applyActorUpdate({ "system.equipment.monnaiesActuel": previousCurrency });
      }
      if (dropped) {
        const overflowMoved = await this.enforceMainCarryOverflowToBag({
          preferredItemIds: this.getDropResultItemIds(dropped)
        });
        if (overflowMoved) this.render(false);
      }
      logSheetPerformance("actor-sheet.drop.item", {
        actorId: this.actor?.id || "",
        action: shouldBuy ? "buy" : "free",
        durationMs: Number(endPerfTimer(startedAt).toFixed(2))
      });
      return dropped;
    } catch (error) {
      if (deductedBeforeDrop && previousCurrency != null) {
        await this.applyActorUpdate({ "system.equipment.monnaiesActuel": previousCurrency });
      }
      logSheetPerformance("actor-sheet.drop.item-error", {
        actorId: this.actor?.id || "",
        durationMs: Number(endPerfTimer(startedAt).toFixed(2)),
        error: String(error?.message || error || "")
      });
      throw error;
    }
  }

  callBaseOnDropItem(event, data) {
    return super._onDropItem(event, data);
  }

  async withDropItemCreateOptions(createItemOptions, callback) {
    if (typeof callback !== "function") return null;
    const incomingOptions = createItemOptions && typeof createItemOptions === "object"
      ? createItemOptions
      : null;
    const previousOptions = this._dropItemCreateOptions && typeof this._dropItemCreateOptions === "object"
      ? this._dropItemCreateOptions
      : null;
    const nextOptions = previousOptions && incomingOptions
      ? { ...previousOptions, ...incomingOptions }
      : (incomingOptions || previousOptions || null);
    this._dropItemCreateOptions = nextOptions;
    try {
      return await callback();
    } finally {
      this._dropItemCreateOptions = previousOptions;
    }
  }

  getActivePrimaryTabId() {
    const root = getSheetElementWrapper(this);
    const activeTab = String(
      root?.find?.(".sheet-body .tab.active")?.first?.()?.data?.("tab")
      || root?.find?.(".sheet-tabs .item.active")?.first?.()?.data?.("tab")
      || ""
    ).trim().toLowerCase();
    return activeTab;
  }

  normalizeDropItemCreatePayload(itemData, options = {}) {
    const preserveOriginalType = options?.preserveOriginalType === true;
    const activeTab = this.getActivePrimaryTabId();
    const shouldRemapToObject = !preserveOriginalType && activeTab === "equipement";
    const source = Array.isArray(itemData) ? itemData : [itemData];
    const mapped = source.map(entry => {
      const clone = foundry.utils.deepClone(entry || {});
      const type = String(clone?.type || "").trim().toLowerCase();
      if (!shouldRemapToObject) return clone;
      if (type !== "pouvoir" && type !== "aptitude") return clone;
      clone.system = clone.system && typeof clone.system === "object" ? clone.system : {};
      clone.system.link = clone.system.link && typeof clone.system.link === "object"
        ? clone.system.link
        : {};
      clone.system.link.originalItemType = type;
      clone.type = "objet";
      return clone;
    });
    return Array.isArray(itemData) ? mapped : mapped[0];
  }

  extractTemplateChildrenFromDropItemData(itemData) {
    const parent = foundry.utils.deepClone(itemData || {});
    sanitizeItemSourceReferences(parent, { keepSourceReference: false });
    const parentType = String(parent?.type || "").trim().toLowerCase();
    if (!isItemLinkSupportedType(parentType)) {
      return {
        parentData: parent,
        templateEntries: []
      };
    }

    parent.system = parent.system && typeof parent.system === "object"
      ? parent.system
      : {};
    parent.system.link = parent.system.link && typeof parent.system.link === "object"
      ? parent.system.link
      : {};
    const templatesEnabled = toCheckboxBoolean(parent.system?.link?.equiperAvecEnabled, false);
    const templateEntries = templatesEnabled
      ? normalizeItemLinkTemplateEntries(parent.system?.link?.equiperAvecTemplates, { keepSourceReference: false })
      : [];
    parent.system.link.equiperAvecTemplates = [];
    parent.system.link.equiperAvec = [];
    parent.system.link.parentItemId = "";
    parent.system.link.equiperAvecEnabled = templateEntries.length > 0
      ? true
      : toCheckboxBoolean(parent.system.link.equiperAvecEnabled, false);
    return {
      parentData: parent,
      templateEntries
    };
  }

  async createDroppedItemsWithTemplateChildren(itemDataList, createItemOptions = null) {
    if (!this.actor?.createEmbeddedDocuments) return [];
    const source = Array.isArray(itemDataList) ? itemDataList : [itemDataList];
    const createdDocuments = [];
    for (const entry of source) {
      const { parentData, templateEntries } = this.extractTemplateChildrenFromDropItemData(entry);
      const createdParent = await this.actor.createEmbeddedDocuments("Item", [parentData], createItemOptions || undefined);
      const parentItem = Array.isArray(createdParent) ? createdParent[0] : null;
      if (!parentItem) continue;
      createdDocuments.push(parentItem);

      if (!templateEntries.length) continue;

      const childPayload = templateEntries
        .map(templateEntry => buildActorChildCreateDataFromItemTemplate(templateEntry, parentItem.id))
        .filter(Boolean);
      if (!childPayload.length) continue;

      const createdChildren = await this.actor.createEmbeddedDocuments("Item", childPayload, createItemOptions || undefined);
      const childIds = (createdChildren || [])
        .map(child => String(child?.id || "").trim())
        .filter(Boolean);
      createdDocuments.push(...(createdChildren || []));
      if (!childIds.length) continue;

      await parentItem.update({
        "system.link.equiperAvecEnabled": true,
        "system.link.equiperAvec": childIds
      });
    }
    return createdDocuments;
  }

  async _onDropItemCreate(itemData) {
    const createItemOptions = this._dropItemCreateOptions && typeof this._dropItemCreateOptions === "object"
      ? this._dropItemCreateOptions
      : null;
    const preserveOriginalType = Boolean(this._equiperAvecDropInProgress || createItemOptions?.bloodmanPreserveOriginalType);
    const normalizedItemData = this.normalizeDropItemCreatePayload(itemData, { preserveOriginalType });
    const source = (Array.isArray(normalizedItemData) ? normalizedItemData : [normalizedItemData])
      .map(entry => {
        const cloned = foundry.utils.deepClone(entry || {});
        sanitizeItemSourceReferences(cloned, { keepSourceReference: false });
        return cloned;
      });
    const hasTemplateChildren = source.some(entry => {
      const candidate = entry && typeof entry === "object" ? entry : {};
      const link = candidate.system?.link;
      if (!link || typeof link !== "object") return false;
      if (!toCheckboxBoolean(link.equiperAvecEnabled, false)) return false;
      return normalizeItemLinkTemplateEntries(link.equiperAvecTemplates).length > 0;
    });
    if (hasTemplateChildren) {
      return this.createDroppedItemsWithTemplateChildren(source, createItemOptions);
    }
    if (!createItemOptions) {
      return this.callBaseOnDropItemCreate(Array.isArray(normalizedItemData) ? source : source[0]);
    }
    const payload = Array.isArray(normalizedItemData)
      ? source
      : [source[0]];
    return this.actor?.createEmbeddedDocuments?.("Item", payload, createItemOptions);
  }

  callBaseOnDropItemCreate(itemData) {
    return super._onDropItemCreate(itemData);
  }

  async _reachedCarriedItemsLimit(data) {
    if (!isCarriedItemLimitedActorType(this.actor?.type)) return false;
    const entries = this.getDropEntries(data);
    const incomingCarriedItemCount = await computeIncomingCarriedItemCount({
      entries,
      targetActorId: String(this.actor?.id || "")
    });
    if (incomingCarriedItemCount <= 0) return false;

    const carriedCount = this.actor.items
      .filter(item => isCarriedItemCountedForBag(item, this.actor))
      .reduce((total, item) => total + getCarriedItemInventorySlots(item), 0);
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
    let droppedActor = await Actor.implementation.fromDropData(data).catch(() => null);
    if (!droppedActor && data?.uuid) {
      droppedActor = await resolveTransportNpc(data.uuid);
    }
    if (!droppedActor && data?.id) {
      droppedActor = await resolveTransportNpc(data.id);
    }
    if (!droppedActor || droppedActor.type !== "personnage-non-joueur") return true;

    const ref = String(data?.uuid || droppedActor.uuid || droppedActor.id || "").trim();
    if (!ref) return true;

    const refs = getTransportNpcRefs(this.actor);
    if (refs.includes(ref)) return true;
    await this.applyActorUpdate({ "system.equipment.transportNpcs": [...refs, ref] });
    return true;
  }

  async rollLuck() {
    if (this.actor.type !== "personnage") return;

    const roll = await createRoll("2d100").evaluate();
    const results = getRollValuesFromRoll(roll);
    const chanceValue = Number(results[0] || 0);
    const luckValue = Number(results[1] || 0);
    const success = luckValue <= chanceValue;
    const outcome = t(success ? "BLOODMAN.Rolls.Success" : "BLOODMAN.Rolls.Failure");
    const luckLabel = t("BLOODMAN.Common.LuckRoll");
    const actorName = String(this.actor.name || "").trim() || t("BLOODMAN.Common.Name");
    const safeActorName = escapeChatMarkup(actorName);
    const safeLuckLabel = escapeChatMarkup(luckLabel);
    const safeOutcome = escapeChatMarkup(outcome);
    const content = `<p><strong>${safeActorName}</strong> - ${safeLuckLabel} : <strong>${safeOutcome}</strong></p><p><small>D1: <strong>${chanceValue}</strong> | D2: <strong>${luckValue}</strong></small></p>`;
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
    const root = getSheetElementWrapper(this);
    const checkbox = root?.find ? root.find(selector) : null;
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
      await doCharacteristicRoll(this.actor, key, { hidden: hiddenRoll, reroll: true });
      await requestChaosDelta(CHAOS_PER_PLAYER_REROLL);
      this.markCharacteristicReroll(key);
      this.render(false);
      return;
    }

    await setChaosValue(plan.nextChaos);
    await doCharacteristicRoll(this.actor, key, { hidden: hiddenRoll, reroll: true });
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
    const consumption = await this.consumeSingleUseItem(item);
    if (consumption.exhausted) {
      this.clearItemReroll(item.id);
      this.render(false);
      return;
    }
    if (result?.context) {
      result.context.kind = "item-damage";
      result.context.itemType = String(item.type || "arme");
      this.markItemReroll(item.id, result.context);
    }
    this.render(false);
  }

  getAmmoPoolState() {
    return getActorAmmoPoolState(this.actor);
  }

  async addAmmoLine() {
    if (!this.actor || !Boolean(this.actor?.isOwner || isAssistantOrHigherRole(game.user?.role))) return;
    const { ammoPool, ammoActiveIndex } = this.getAmmoPoolState();
    const nextAmmoPool = [...ammoPool, buildDefaultAmmoLine()];
    await this.applyActorUpdate(
      {
        "system.ammoPool": nextAmmoPool,
        "system.ammoActiveIndex": ammoActiveIndex
      },
      { bloodmanAllowAmmoUpdate: true }
    );
    this.render(false);
  }

  async removeActiveAmmoLine() {
    if (!this.actor || !Boolean(this.actor?.isOwner || isAssistantOrHigherRole(game.user?.role))) return;
    const { ammoPool, ammoActiveIndex } = this.getAmmoPoolState();
    if (ammoPool.length <= 1) return;
    const nextAmmoPool = ammoPool.filter((_, index) => index !== ammoActiveIndex);
    const nextAmmoActiveIndex = Math.max(0, Math.min(ammoActiveIndex, nextAmmoPool.length - 1));
    await this.applyActorUpdate(
      {
        "system.ammoPool": nextAmmoPool,
        "system.ammoActiveIndex": nextAmmoActiveIndex
      },
      { bloodmanAllowAmmoUpdate: true }
    );
    this.render(false);
  }

  async selectAmmoLine(index) {
    if (!this.actor || !Number.isInteger(index) || index < 0) return;
    const { ammoPool, ammoActiveIndex } = this.getAmmoPoolState();
    const nextAmmoActiveIndex = clampAmmoActiveIndex(index, ammoPool, ammoActiveIndex);
    if (nextAmmoActiveIndex === ammoActiveIndex) return;
    await this.applyActorUpdate(
      { "system.ammoActiveIndex": nextAmmoActiveIndex },
      { bloodmanAllowAmmoUpdate: true }
    );
    this.render(false);
  }

  async reloadWeapon(item) {
    const ammoState = this.getAmmoPoolState();
    const reloadPlan = resolveWeaponReloadPlan({
      item,
      actorAmmoData: ammoState?.ammo || this.actor?.system?.ammo
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
    const sourceName = getSimpleAttackRerollLabel();
    const damageDialog = {
      variant: "simple-attack",
      rememberConfig: false
    };
    const result = await doDirectDamageRoll(this.actor, "1d4", sourceName, {
      itemId: SIMPLE_ATTACK_REROLL_ID,
      itemType: "arme",
      itemName: sourceName,
      damageDialog
    });
    if (!result) return;
    if (result?.context) {
      result.context.kind = "item-damage";
      result.context.itemId = String(result.context.itemId || SIMPLE_ATTACK_REROLL_ID);
      result.context.itemType = "arme";
      result.context.itemName = String(result.context.itemName || sourceName);
      this.markItemReroll(SIMPLE_ATTACK_REROLL_ID, result.context);
    }
    this.render(false);
  }

  async rollAbilityDamage(item) {
    if (!item) return;
    const runtimeType = getItemRuntimeType(item);
    const runtimeItem = buildRuntimeTypedItem(item, runtimeType);
    if (runtimeType === "pouvoir") {
      const powerPlan = resolvePowerRollPlan({
        item: runtimeItem,
        powerUsableEnabled: isPowerUsableEnabled(item?.system?.usableEnabled),
        powerActivated: this.isPowerActivated(item?.id)
      });
      if (!powerPlan.allowed) return;
      if (powerPlan.mode === "heal") {
        if (!powerPlan.isUsablePower) {
          const used = await applyPowerCost(this.actor, runtimeItem);
          if (!used) return;
        }
        const targetActor = this.resolveHealTargetActor(this.actor);
        if (!targetActor) return;
        const healResult = await doHealRoll(this.actor, item, {
          formula: powerPlan.formula,
          targetActor,
          consumeItem: false
        });
        if (!healResult) return;
        await playItemAudio(item);
        const consumption = await this.consumeSingleUseItem(item);
        if (consumption.exhausted) this.clearItemReroll(item.id);
        if (powerPlan.isUsablePower) this.markPowerActivated(item.id, false);
        this.render(false);
        return;
      }
      const beforeRoll = async () => {
        if (powerPlan.isUsablePower) return true;
        return applyPowerCost(this.actor, runtimeItem);
      };
      const result = await doDirectDamageRoll(this.actor, powerPlan.formula, item.name, {
        beforeRoll,
        itemId: item.id,
        itemType: runtimeType
      });
      if (!result) return;
      await playItemAudio(item);
      const consumption = await this.consumeSingleUseItem(item);
      if (consumption.exhausted) {
        this.clearItemReroll(item.id);
        this.render(false);
        return;
      }
      if (result?.context) {
        result.context.kind = "item-damage";
        result.context.itemType = String(runtimeType || "");
        this.markItemReroll(item.id, result.context);
      }
      this.render(false);
      return;
    }

    const plan = resolveAbilityDamageRollPlan({
      item: runtimeItem,
      powerUsableEnabled: isPowerUsableEnabled(item?.system?.usableEnabled),
      powerActivated: this.isPowerActivated(item?.id)
    });
    if (!plan.allowed) return;
    const beforeRoll = async () => {
      if (plan.isUsablePower) return true;
      return applyPowerCost(this.actor, runtimeItem);
    };
    const result = await doDirectDamageRoll(this.actor, plan.formula, item.name, {
      beforeRoll,
      itemId: item.id,
      itemType: runtimeType || item.type
    });
    if (!result) return;
    await playItemAudio(item);
    const consumption = await this.consumeSingleUseItem(item);
    if (consumption.exhausted) {
      this.clearItemReroll(item.id);
      this.render(false);
      return;
    }
    if (result?.context) {
      result.context.kind = "item-damage";
      result.context.itemType = String(runtimeType || item.type || "");
      this.markItemReroll(item.id, result.context);
    }
    this.render(false);
  }

  async usePower(item, options = {}) {
    const runtimeType = String(options?.runtimeType || getItemRuntimeType(item)).trim().toLowerCase();
    if (!item || runtimeType !== "pouvoir") return;
    const runtimeItem = buildRuntimeTypedItem(item, runtimeType);
    if (!isPowerUsableEnabled(item.system?.usableEnabled)) return;
    const used = await applyPowerCost(this.actor, runtimeItem);
    if (!used) return;
    this.markPowerActivated(item.id, true);
    emitPowerUsePopup(this.actor, item, {
      fromUseButton: true,
      includeRequesterUser: true
    });
    this.render(false);
    return [
      { popup: true, action: "utilisation_aptitude", cote: "joueur" },
      { popup: true, action: "utilisation_aptitude", cote: "GM" }
    ];
  }

  async useAptitude(item, options = {}) {
    const runtimeType = String(options?.runtimeType || getItemRuntimeType(item)).trim().toLowerCase();
    if (!item || runtimeType !== "aptitude") return;
    emitPowerUsePopup(this.actor, item, {
      fromUseButton: true,
      includeRequesterUser: true
    });
    return [
      { popup: true, action: "montrer_GM", cote: "joueur" },
      { popup: true, action: "montrer_GM", cote: "GM" }
    ];
  }

  resolveHealTargetActor(defaultActor = this.actor) {
    const fallbackActor = defaultActor || this.actor || null;
    const targets = Array.from(game.user?.targets || []);
    if (!targets.length) return fallbackActor;
    if (targets.length > 1) {
      ui.notifications?.warn(tl("BLOODMAN.Notifications.HealSingleTargetOnly", "Selectionnez une seule cible pour le soin."));
      return null;
    }
    const token = targets[0];
    const targetActor = token?.actor || token?.document?.actor || token?.object?.actor || null;
    if (!targetActor) {
      ui.notifications?.warn(tl("BLOODMAN.Notifications.HealTargetResolveFailed", "Impossible de resoudre la cible de soin."));
      return null;
    }
    return targetActor;
  }

  async useItem(item) {
    if (!item) return;
    const runtimeType = getItemRuntimeType(item);
    const runtimeItem = buildRuntimeTypedItem(item, runtimeType);
    const usePlan = resolveItemUsePlan({
      item: runtimeItem,
      objectUseEnabled: isObjectUseEnabled(toBooleanFlag(item?.system?.useEnabled))
    });
    if (usePlan.kind === "none") return;

    if (usePlan.kind === "power") {
      await this.usePower(item, { runtimeType });
      return;
    }
    if (usePlan.kind === "heal") {
      const healAudioRef = buildHealAudioReference(item);
      const targetActor = this.resolveHealTargetActor(this.actor);
      if (!targetActor) return;
      const result = await doHealRoll(this.actor, item, {
        targetActor,
        consumeItem: false
      });
      if (result) await playItemAudio(healAudioRef);
      if (!result) return;
      const consumption = await this.consumeSingleUseItem(item);
      if (consumption.exhausted) this.clearItemReroll(item.id);
      this.render(false);
      return;
    }
    if (usePlan.kind === "ration") {
      const consumption = await this.consumeSingleUseItem(item);
      if (consumption.exhausted) this.clearItemReroll(item.id);
      this.render(false);
      return;
    }
    if (usePlan.kind === "object") {
      const objectDamageEnabled = toBooleanFlag(item?.system?.damageEnabled, item?.system?.damageDie != null)
        && Boolean(String(item?.system?.damageDie || "").trim());
      if (objectDamageEnabled) {
        const formula = normalizeRollDieFormula(item.system?.damageDie, "d4");
        const damageResult = await doDirectDamageRoll(this.actor, formula, item.name, {
          itemId: item.id,
          itemType: runtimeType || item.type
        });
        if (!damageResult) return;
      }
      await playItemAudio(item, { delayMs: 0 });
      const consumption = await this.consumeSingleUseItem(item);
      if (consumption.exhausted) {
        this.clearItemReroll(item.id);
      }
      this.render(false);
    }
  }

  async rerollItemRoll(itemId) {
    const rerollSource = this.resolveRerollSourceForItemId(itemId);
    if (!rerollSource) return;
    const { itemId: rerollItemId, itemName, itemType: runtimeType } = rerollSource;
    if (!isDamageRerollItemType(runtimeType)) return;
    const state = this.getItemRerollState();
    const context = normalizeItemRerollContext(state?.damage, runtimeType);
    if (!context || state?.itemId !== rerollItemId) return;
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
      itemId: rerollItemId,
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
    context.totalDamage = totalDamage;
    context.rollResults = rollResults;
    context.targets = allocations;
    const penetrationValue = Math.max(0, Number(context.penetration || 0));
    const hasActiveGM = game.users?.some(user => user.active && user.isGM) || false;
    const rerollTargetNames = allocations
      .map(entry => String(entry?.targetName || "").trim())
      .filter(Boolean);

    const flavorTag = [modeTag, t("BLOODMAN.Common.Reroll")].filter(Boolean).join(" | ");
    roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: buildDamageRollFlavorMarkup({
        attackerName: this.actor?.name || tl("BLOODMAN.Common.Name", "Attaquant"),
        targetNames: rerollTargetNames,
        formula: String(context?.formula || "").trim() || "1d4",
        rollResults,
        bonusBrut: context?.bonusBrut,
        penetration: context?.penetration,
        totalDamage,
        sourceName: itemName || String(context?.itemName || ""),
        modeTag: flavorTag
      }),
      flags: buildChatRollFlags(CHAT_ROLL_TYPES.DAMAGE, { chatRollReroll: true })
    });

    if (!game.user.isGM && hasActiveGM) {
      await relayItemRerollToGMs({
        context,
        itemId: rerollItemId,
        itemType: runtimeType,
        itemName: itemName || String(context.itemName || ""),
        actorId: this.actor.id,
        attackerUserId: game.user?.id || "",
        totalDamage,
        rollResults,
        allocations
      });
      this.markItemReroll(rerollItemId, context);
      this.render(false);
      return;
    }

    await applyLocalItemRerollTargets({
      allocations,
      penetrationValue,
      damageContext: {
        attackerName: this.actor?.name || "",
        sourceName: itemName || String(context?.itemName || ""),
        formula: String(context?.formula || "").trim() || "1d4",
        rollResults,
        bonusBrut: context?.bonusBrut,
        totalDamage
      },
      validationMeta,
      defaultTargetName: "Cible"
    });
    this.markItemReroll(rerollItemId, context);
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
    const normalizedItemId = String(itemId || "").trim();
    if (!normalizedItemId) return;
    const rerollSource = this.resolveRerollSourceForItemId(normalizedItemId);
    const damage = damageContext || this.actor?._lastDamageReroll || null;
    if (damage) {
      if (!damage.itemId) damage.itemId = normalizedItemId;
      damage.kind = String(damage.kind || "item-damage");
      damage.itemType = String(damage.itemType || rerollSource?.itemType || "").toLowerCase();
      if (!damage.itemName && rerollSource?.itemName) damage.itemName = rerollSource.itemName;
      if (damage.kind !== "item-damage" || !isDamageRerollItemType(damage.itemType)) return;
    }
    if (this.actor && damage) this.actor._lastDamageReroll = damage;
    this.setItemRerollState({ itemId: normalizedItemId, at: Date.now(), damage });
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
      const targetActor = this.resolveHealTargetActor(this.actor);
      if (!targetActor) return false;
      const result = await doHealRoll(this.actor, item, {
        formula: plan.formula,
        targetActor,
        consumeItem: false,
        reroll: true
      });
      return Boolean(result);
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
    const base = toFiniteNumber(this.actor.system.characteristics?.[key]?.base, 0);
    const effective = computeGrowthEffectiveScore({
      base
    });

    const roll = await createRoll("1d100").evaluate();
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
      flavor: buildCharacteristicSummaryFlavor({ outcome, characteristicLabel, rollTotal, success }),
      flags: buildChatRollFlags(CHAT_ROLL_TYPES.EXPERIENCE)
    });
    this.render(false);
  }

  promptGrowthRoll(key) {
    if (this.actor.type !== "personnage") return;
    const labelKey = CHARACTERISTICS.find(c => c.key === key)?.labelKey || "";
    const label = labelKey ? t(labelKey) : key;
    const escapeHtml = escapeChatMarkup;
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
    renderBloodmanDialog(
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
    );
  }
}

class BloodmanNpcSheet extends BloodmanActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: NPC_ACTOR_SHEET_TEMPLATE_PATH,
      width: 1195,
      height: 815
    });
  }

  activateListeners(html) {
    super.activateListeners(html);
    this.activateBloodmanNpcListeners(html);
  }

  activateBloodmanNpcListeners(html) {
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

const ResolvedBloodmanActorSheetV2Base = getHandlebarsActorSheetV2Base();
const BloodmanActorSheetV2Base = ResolvedBloodmanActorSheetV2Base || class {};

class BloodmanActorSheetV2 extends BloodmanActorSheetV2Base {
  constructor(options = {}, ...args) {
    const firstArgIsActor = options?.documentName === "Actor" || options?.constructor?.documentName === "Actor";
    const optionData = firstArgIsActor ? (args[0] || {}) : options;
    const document = firstArgIsActor ? options : (optionData?.document || optionData?.object || optionData?.actor || null);
    const normalizedOptions = document
      ? { ...optionData, document }
      : optionData;
    super(normalizedOptions, ...(firstArgIsActor ? args.slice(1) : args));
    this.captureTokenDocumentReference(optionData?.token || document?.token || null);
    this.sanitizeStoredSheetOptions();
  }

  static DEFAULT_OPTIONS = foundry.utils.mergeObject(BloodmanActorSheetV2Base.DEFAULT_OPTIONS || {}, {
    id: "bloodman-actor-{id}",
    classes: ["bloodman", "sheet", "actor"],
    tag: "div",
    position: {
      width: 1195,
      height: 670
    },
    window: {
      contentTag: "form",
      contentClasses: ["bloodman-sheet", "pj-sheet"],
      resizable: true,
      minimizable: true
    },
    form: {
      submitOnChange: true,
      closeOnSubmit: false
    }
  }, { inplace: false });

  static PARTS = {
    sheet: {
      template: PLAYER_ACTOR_SHEET_TEMPLATE_PATH,
      root: true
    }
  };

  get actor() {
    return this.document;
  }

  get token() {
    return this._bloodmanTokenDocument || this.document?.token || null;
  }

  get isEditable() {
    if (this.actor?.type === "personnage") return true;
    return Boolean(super.isEditable);
  }

  sanitizeStoredSheetOptions() {
    if (Object.isFrozen(this.options)) return;
    return BloodmanActorSheet.prototype.sanitizeStoredSheetOptions.call(this);
  }

  async _prepareContext(options = {}) {
    const startedAt = startPerfTimer();
    registerBloodmanHandlebarsHelpers();
    const context = typeof super._prepareContext === "function"
      ? await super._prepareContext(options)
      : {};
    const data = {
      ...buildActorSheetBaseData(this, options),
      ...context,
      actor: this.actor,
      data: this.actor,
      document: this.actor,
      system: this.actor?.system || {}
    };
    const preparedData = this.prepareBloodmanActorSheetData(data, options);
    logSheetPerformance("actor-sheet-v2.prepareContext", {
      actorId: this.actor?.id || "",
      actorType: this.actor?.type || "",
      durationMs: Number(endPerfTimer(startedAt).toFixed(2))
    });
    return preparedData;
  }

  async _onRender(context, options) {
    const startedAt = startPerfTimer();
    const documentSheetV2 = globalThis.foundry?.applications?.api?.DocumentSheetV2;
    if (documentSheetV2?.prototype?._onRender) {
      await documentSheetV2.prototype._onRender.call(this, context, options);
    } else if (typeof super._onRender === "function") {
      await super._onRender(context, options);
    }
    const jq = globalThis.jQuery || globalThis.$;
    const formElement = this.form || this.element;
    this._bloodmanElementWrapper = typeof jq === "function" ? jq(formElement) : formElement;
    this.activateBloodmanActorListeners(this._bloodmanElementWrapper);
    this._debugActorSheetRenderCount = Number(this._debugActorSheetRenderCount || 0) + 1;
    logSheetPerformance("actor-sheet-v2.render", {
      actorId: this.actor?.id || "",
      renderCount: this._debugActorSheetRenderCount,
      durationMs: Number(endPerfTimer(startedAt).toFixed(2))
    });
  }

  _prepareSubmitData(event, form, formData, updateData) {
    const submitData = this._processFormData(event, form, formData);
    if (updateData) {
      foundry.utils.mergeObject(submitData, updateData, { applyOperators: true });
      foundry.utils.mergeObject(submitData, updateData, { applyOperators: false });
    }
    return submitData;
  }

  async _processSubmitData(event, _form, submitData, options = {}) {
    return this._updateObject(event, submitData, options);
  }

  render(forceOrOptions = {}, maybeOptions = {}) {
    registerBloodmanHandlebarsHelpers();
    const legacyOptions = typeof forceOrOptions === "boolean" ? maybeOptions : forceOrOptions;
    const options = typeof forceOrOptions === "boolean"
      ? { ...(maybeOptions || {}), force: forceOrOptions }
      : { ...(forceOrOptions || {}) };
    if (legacyOptions?.bloodmanResetRerollState === true) this.clearRerollDisplayState();
    this.captureActorSheetNumericFocus();
    this.captureTokenDocumentReference(legacyOptions?.token || null);
    this.sanitizeStoredSheetOptions();
    return super.render(sanitizeRenderOptions(options));
  }

  setPosition(options = {}) {
    const viewportWidth = Math.max(
      Number(globalThis?.innerWidth) || 0,
      Number(globalThis?.document?.documentElement?.clientWidth) || 0,
      0
    );
    const viewportHeight = Math.max(
      Number(globalThis?.innerHeight) || 0,
      Number(globalThis?.document?.documentElement?.clientHeight) || 0,
      0
    );
    const minWidth = 320;
    const minHeight = 420;
    const maxWidth = Math.max(minWidth, viewportWidth - 24);
    const maxHeight = Math.max(minHeight, viewportHeight - 32);
    const nextPosition = { ...options };
    const candidateWidth = Number(nextPosition.width ?? this.position?.width ?? this.options?.position?.width);
    const candidateHeight = Number(nextPosition.height ?? this.position?.height ?? this.options?.position?.height);
    const candidateLeft = Number(nextPosition.left ?? this.position?.left);
    const candidateTop = Number(nextPosition.top ?? this.position?.top);

    if (Number.isFinite(candidateWidth)) nextPosition.width = Math.min(Math.max(candidateWidth, minWidth), maxWidth);
    if (Number.isFinite(candidateHeight)) nextPosition.height = Math.min(Math.max(candidateHeight, minHeight), maxHeight);
    if (Number.isFinite(candidateLeft) && Number.isFinite(nextPosition.width)) {
      nextPosition.left = Math.max(12, Math.min(candidateLeft, viewportWidth - nextPosition.width - 12));
    }
    if (Number.isFinite(candidateTop) && Number.isFinite(nextPosition.height)) {
      nextPosition.top = Math.max(12, Math.min(candidateTop, viewportHeight - nextPosition.height - 12));
    }

    const position = super.setPosition(nextPosition);
    this.applyResponsiveActorSheetLayoutState();
    return position;
  }

  async close(options = {}) {
    this.clearRerollDisplayState();
    this.clearPowerUseState();
    this.clearDeferredSheetUiTasks();
    this.clearActorSheetNativeEditHandlers();
    this.disconnectResponsiveActorSheetLayoutObserver();
    this._responsiveActorSheetLayoutState = null;
    this._resourceBubbleRuntimeMap = null;
    clearUiMicrotask(this._pvGaugePulseTimer);
    clearUiMicrotask(this._ppGaugePulseTimer);
    this._pvGaugePulseTimer = null;
    this._ppGaugePulseTimer = null;
    this._lastAutoResizeKey = "";
    this._bloodmanElementWrapper = null;
    this._itemDropInFlightKeys = null;
    this._equiperAvecDropTarget = null;
    this._actorSheetNumericFocusState = null;
    return super.close(options);
  }

  callBaseOnDrop(event) {
    return callPrototypeMethod(BloodmanActorSheetV2Base.prototype, this, "_onDrop", [event]);
  }

  async callBaseOnDropItem(event, data) {
    const item = data?.documentName === "Item"
      ? data
      : await this.resolveDroppedItemDocument(data);
    if (!item) return null;
    if (!this.actor?.isOwner) return null;
    if (this.actor?.uuid === item.parent?.uuid) {
      return callPrototypeMethod(BloodmanActorSheetV2Base.prototype, this, "_onDropItem", [event, item]);
    }
    const keepId = !this.actor?.items?.has?.(item.id);
    const itemData = item.inCompendium && game.items?.fromCompendium
      ? game.items.fromCompendium(item, { clearFolder: true, keepId })
      : item.toObject();
    const created = await this._onDropItemCreate(itemData);
    if (Array.isArray(created)) return created[0] || null;
    return created || null;
  }

  callBaseOnDropItemCreate(itemData) {
    const payload = Array.isArray(itemData) ? itemData : [itemData];
    return this.actor?.createEmbeddedDocuments?.("Item", payload) || null;
  }
}

class BloodmanNpcSheetV2 extends BloodmanActorSheetV2 {
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(BloodmanActorSheetV2.DEFAULT_OPTIONS, {
    id: "bloodman-npc-{id}",
    position: {
      width: 1195,
      height: 815
    },
    window: {
      contentClasses: ["bloodman-sheet", "npc-sheet"]
    }
  }, { inplace: false });

  static PARTS = {
    sheet: {
      template: NPC_ACTOR_SHEET_TEMPLATE_PATH,
      root: true
    }
  };

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.activateBloodmanNpcListeners(this._bloodmanElementWrapper || getSheetElementWrapper(this));
  }
}

function copyActorSheetBehaviorToV2() {
  const excluded = new Set([
    "constructor",
    "_getHeaderButtons",
    "_render",
    "render",
    "setPosition",
    "close",
    "getData",
    "activateListeners",
    "callBaseOnDrop",
    "callBaseOnDropItem",
    "callBaseOnDropItemCreate"
  ]);
  for (const name of Object.getOwnPropertyNames(BloodmanActorSheet.prototype)) {
    if (excluded.has(name)) continue;
    if (Object.prototype.hasOwnProperty.call(BloodmanActorSheetV2.prototype, name)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(BloodmanActorSheet.prototype, name);
    if (descriptor) Object.defineProperty(BloodmanActorSheetV2.prototype, name, descriptor);
  }
  for (const name of Object.getOwnPropertyNames(BloodmanNpcSheet.prototype)) {
    if (name === "constructor" || name === "activateListeners") continue;
    if (Object.prototype.hasOwnProperty.call(BloodmanNpcSheetV2.prototype, name)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(BloodmanNpcSheet.prototype, name);
    if (descriptor) Object.defineProperty(BloodmanNpcSheetV2.prototype, name, descriptor);
  }
}

copyActorSheetBehaviorToV2();

class BloodmanItemSheet extends BaseItemSheet {
  get template() {
    return ITEM_SHEET_TEMPLATE_PATH;
  }

  static getResponsiveSheetSize() {
    return itemSheetLayoutController.getResponsiveSheetSize();
  }

  async getData(options) {
    const data = await super.getData(options);
    const itemType = String(this.item.type || "").trim().toLowerCase();
    if (!data.item.system) data.item.system = {};

    const supportsWeapon = itemType === "arme";
    const supportsPrice = isPriceManagedItemType(itemType);

    const systemData = data.item.system;
    systemData.audioFile = String(this.item.system?.audioFile ?? "").trim();
    const linkData = resolveItemLinkState(this.item);
    const isLinkedChild = Boolean(getLinkedParentItemId(this.item, this.item?.actor || this.item?.parent || null));
    const keepTemplateSourceReference = !this.item?.actor;
    const supportsEquiperAvec = isItemLinkSupportedType(itemType) && !isLinkedChild;
    const supportsBagCount = CARRIED_ITEM_TYPES.has(itemType);
    systemData.link = systemData.link && typeof systemData.link === "object"
      ? systemData.link
      : {};
    systemData.link.parentItemId = linkData.parentItemId;
    systemData.link.equiperAvecEnabled = supportsEquiperAvec
      ? Boolean(linkData.equiperAvecEnabled)
      : false;
    systemData.link.equiperAvec = supportsEquiperAvec
      ? [...linkData.equiperAvec]
      : [];
    systemData.link.containerCountsForBag = supportsBagCount
      ? Boolean(linkData.containerCountsForBag)
      : true;
    const templateEntries = supportsEquiperAvec
      ? normalizeItemLinkTemplateEntries(this.item.system?.link?.equiperAvecTemplates, { keepSourceReference: keepTemplateSourceReference })
      : [];
    systemData.link.equiperAvecTemplates = templateEntries;
    data.itemLinkSupported = isItemLinkSupportedType(itemType);
    data.itemLinkIsLinkedChild = isLinkedChild;
    data.itemLinkSupportsEquiperAvec = supportsEquiperAvec;
    data.itemLinkSupportsBagCount = supportsBagCount;
    data.itemLinkAcceptedTypes = ITEM_LINK_EQUIPER_AVEC_ACCEPTED_TYPES;
    data.itemLinkEquiperAvecTemplates = templateEntries.map((entry, index) => (
      buildItemLinkTemplateDisplayData(entry, index)
    ));
    data.itemLinkHasEquiperAvecTemplates = data.itemLinkEquiperAvecTemplates.length > 0;

    const usableFieldPath = itemType === "pouvoir" ? "system.usableEnabled" : "system.useEnabled";
    let usableValue = false;
    if (itemType === "pouvoir") usableValue = isPowerUsableEnabled(this.item.system?.usableEnabled);
    else if (itemType === "protection") usableValue = toCheckboxBoolean(this.item.system?.useEnabled, true);
    else usableValue = toCheckboxBoolean(this.item.system?.useEnabled, false);
    if (itemType === "pouvoir") systemData.usableEnabled = usableValue;
    else systemData.useEnabled = usableValue;

    if (supportsWeapon) {
      // Weapons predate the damageEnabled flag; treat missing as enabled for backward compatibility.
      systemData.damageEnabled = this.item.system?.damageEnabled !== false;
    } else {
      systemData.damageEnabled = toCheckboxBoolean(this.item.system?.damageEnabled, false);
    }
    systemData.damageDie = String(this.item.system?.damageDie ?? "").trim();

    if (itemType === "soin") {
      systemData.healEnabled = true;
    } else {
      systemData.healEnabled = toCheckboxBoolean(this.item.system?.healEnabled, false);
    }
    systemData.healDie = String(this.item.system?.healDie ?? "").trim();

    const rawWeaponType = normalizeWeaponType(this.item.system?.weaponType);
    const weaponType = rawWeaponType === "corps"
      ? "corps"
      : (rawWeaponType === "distance" ? "distance" : (supportsWeapon ? "distance" : ""));
    const magazineCapacity = normalizeNonNegativeInteger(this.item.system?.magazineCapacity, 0);
    const infiniteAmmo = toCheckboxBoolean(this.item.system?.infiniteAmmo, false);
    const consumesAmmo = weaponType === "distance" && !infiniteAmmo;
    const loadedAmmo = normalizeWeaponLoadedAmmoValue(this.item.system?.loadedAmmo, 0, consumesAmmo ? magazineCapacity : 0);
    data.weaponTypeDistance = weaponType === "distance";
    data.weaponTypeMelee = weaponType === "corps";
    systemData.infiniteAmmo = infiniteAmmo;
    systemData.magazineCapacity = magazineCapacity;
    systemData.loadedAmmo = loadedAmmo;
    data.weaponUsesAmmo = consumesAmmo;
    data.weaponUsesMagazine = consumesAmmo && magazineCapacity > 0;
    data.canEditMagazineCapacity = supportsWeapon && isAssistantOrHigherRole(game.user?.role);

    systemData.xpVoyageCost = normalizeNonNegativeInteger(this.item.system?.xpVoyageCost, 0);
    systemData.powerCostEnabled = toCheckboxBoolean(this.item.system?.powerCostEnabled, false);
    systemData.powerCost = normalizeNonNegativeInteger(this.item.system?.powerCost, 0);
    systemData.singleUseEnabled = toCheckboxBoolean(this.item.system?.singleUseEnabled, false);
    systemData.singleUseCount = normalizeSingleUseCountValue(this.item.system?.singleUseCount, {
      enabled: systemData.singleUseEnabled,
      fallbackEnabled: 1
    });
    systemData.inventorySlots = normalizeCarriedItemInventorySlots(this.item.system?.inventorySlots, 1);
    data.singleUseCountInputDisabled = !systemData.singleUseEnabled;

    systemData.rawBonusEnabled = toCheckboxBoolean(this.item.system?.rawBonusEnabled, false);
    systemData.rawBonuses = {
      pv: toFiniteNumber(this.item.system?.rawBonuses?.pv, 0),
      pp: toFiniteNumber(this.item.system?.rawBonuses?.pp, 0)
    };

    systemData.characteristicBonusEnabled = toCheckboxBoolean(this.item.system?.characteristicBonusEnabled, false);
    const characteristicBonuses = {};
    for (const characteristic of CHARACTERISTICS) {
      characteristicBonuses[characteristic.key] = toFiniteNumber(
        this.item.system?.characteristicBonuses?.[characteristic.key],
        0
      );
    }
    systemData.characteristicBonuses = characteristicBonuses;

    systemData.pa = toFiniteNumber(this.item.system?.pa, 0);
    const defaultProtectionEnabled = itemType === "protection" || Number(systemData.pa || 0) !== 0;
    systemData.protectionEnabled = toCheckboxBoolean(this.item.system?.protectionEnabled, defaultProtectionEnabled);

    systemData.price = String(this.item.system?.price ?? "").trim();
    systemData.salePrice = String(this.item.system?.salePrice ?? "").trim();
    data.itemComputedSellPrice = "";
    data.itemPriceError = "";
    if (supportsPrice) {
      const preview = resolveItemSalePriceState(systemData.price, systemData.salePrice);
      data.itemComputedSellPrice = preview.salePrice;
      data.itemPriceError = preview.errorMessage;
      systemData.salePrice = preview.salePrice;
    }

    const currentError = String(this.item.system?.erreur ?? "").trim();
    systemData.erreur = currentError || null;

    data.itemNoteFieldPath = "system.note";
    data.itemNoteValue = String(this.item.system?.note ?? this.item.system?.notes ?? "");
    data.itemUsableFieldPath = usableFieldPath;
    data.itemUsableValue = usableValue;

    data.damageInputDisabled = !systemData.damageEnabled;
    data.powerCostInputDisabled = !systemData.powerCostEnabled;
    data.protectionInputDisabled = !systemData.protectionEnabled;
    data.rawBonusInputDisabled = !systemData.rawBonusEnabled;
    data.characteristicBonusInputDisabled = !systemData.characteristicBonusEnabled;
    data.healInputDisabled = !systemData.healEnabled;
    return data;
  }

  static get defaultOptions() {
    const responsiveSize = this.getResponsiveSheetSize();
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["bloodman", "sheet", "item"],
      width: responsiveSize.width,
      height: responsiveSize.height,
      resizable: true,
      submitOnChange: true
    });
  }

  render(force, options = {}) {
    const now = Number(globalThis?.performance?.now?.() ?? Date.now());
    const suppressUntil = Number(this._suppressItemSheetRenderUntil || 0);
    if (!force && suppressUntil > now) {
      this.updateResponsiveSheetScale();
      return this;
    }
    return super.render(force, options);
  }

  setPosition(options = {}) {
    const nextPosition = itemSheetLayoutController.resolvePositionOptions(this, options);
    const position = super.setPosition(nextPosition);
    this.updateResponsiveSheetScale();
    return position;
  }

  async close(options = {}) {
    this.clearQueuedPricePreviewRefresh();
    this.clearQueuedItemSheetAutoGrowRefresh();
    this.disconnectResponsiveSheetScaleObserver();
    return super.close(options);
  }

  openItemAudioFilePicker() {
    return itemSheetControlsController.openItemAudioFilePicker(this);
  }

  getResponsiveSheetScaleTarget(rootLike = null) {
    return itemSheetLayoutController.getResponsiveSheetScaleTarget(this, rootLike);
  }

  getResponsiveSheetObserverTarget(rootLike = null) {
    return itemSheetLayoutController.getResponsiveSheetObserverTarget(this, rootLike);
  }

  resolveResponsiveItemSheetLayoutState(width = 0, height = 0) {
    return itemSheetLayoutController.resolveResponsiveItemSheetLayoutState(width, height);
  }

  applyResponsiveItemSheetLayoutState(rootLike = null, metrics = {}) {
    return itemSheetLayoutController.applyResponsiveItemSheetLayoutState(this, rootLike, metrics);
  }

  updateResponsiveSheetScale(rootLike = null) {
    return itemSheetLayoutController.updateResponsiveSheetScale(this, rootLike);
  }

  connectResponsiveSheetScaleObserver(html) {
    return itemSheetLayoutController.connectResponsiveSheetScaleObserver(this, html);
  }

  disconnectResponsiveSheetScaleObserver() {
    return itemSheetLayoutController.disconnectResponsiveSheetScaleObserver(this);
  }

  clearQueuedItemSheetAutoGrowRefresh() {
    return itemSheetLayoutController.clearQueuedItemSheetAutoGrowRefresh(this);
  }

  resizeItemSheetAutoGrowTextarea(textarea) {
    return itemSheetLayoutController.resizeItemSheetAutoGrowTextarea(this, textarea);
  }

  refreshItemSheetAutoGrowTextareas(htmlLike = null) {
    return itemSheetLayoutController.refreshItemSheetAutoGrowTextareas(this, htmlLike);
  }

  queueItemSheetAutoGrowTextareaRefresh(rootLike = null) {
    return itemSheetLayoutController.queueItemSheetAutoGrowTextareaRefresh(this, rootLike);
  }

  clearQueuedPricePreviewRefresh() {
    return itemSheetControlsController.clearQueuedPricePreviewRefresh(this);
  }

  queuePricePreviewRefresh(rootLike = null) {
    return itemSheetControlsController.queuePricePreviewRefresh(this, rootLike);
  }

  syncPricePreviewSaleManualState(htmlLike = null) {
    return itemSheetControlsController.syncPricePreviewSaleManualState(this, htmlLike);
  }

  activateListeners(html) {
    super.activateListeners(html);
    itemSheetControlsController.activateAudioFilePickerListeners(this, html);
    this.activatePricePreviewListeners(html);
    this.connectResponsiveSheetScaleObserver(html);
    this.refreshItemSheetAutoGrowTextareas(html);
    this.queueItemSheetAutoGrowTextareaRefresh(html);
    itemSheetEquipWithController.activateItemSheetEquiperAvecListeners(this, html);

    html.on("input change", "textarea[data-autogrow='true']", ev => {
      this.resizeItemSheetAutoGrowTextarea(ev.currentTarget);
    });

  }

  buildItemSheetDragPayload() {
    return itemSheetEquipWithController.buildItemSheetDragPayload(this);
  }

  setItemSheetDragTransferData(dataTransfer, mimeType, payload) {
    return itemSheetEquipWithController.setItemSheetDragTransferData(dataTransfer, mimeType, payload);
  }

  onItemSheetDragStart(eventLike) {
    return itemSheetEquipWithController.onItemSheetDragStart(this, eventLike);
  }

  async _onChangeInput(event) {
    const target = event?.currentTarget instanceof HTMLElement
      ? event.currentTarget
      : (event?.target instanceof HTMLElement ? event.target : null);
    if (!(target instanceof HTMLInputElement) || !target.classList.contains("bm-switch-input")) {
      return super._onChangeInput(event);
    }

    const fieldName = String(target.name || "").trim();
    if (!fieldName) return;

    event?.preventDefault?.();
    event?.stopPropagation?.();

    const nextValue = Boolean(target.checked);
    let updateData = { [fieldName]: nextValue };
    try {
      if (typeof this._getSubmitData === "function") {
        const fullSubmitData = this._getSubmitData({ [fieldName]: nextValue });
        if (fullSubmitData && typeof fullSubmitData === "object") {
          updateData = fullSubmitData;
        }
      }
    } catch (_error) {
      // Fallback to the switch-only update when submit data extraction fails.
    }
    this._suppressItemSheetRenderUntil = Number(globalThis?.performance?.now?.() ?? Date.now()) + 400;

    try {
      if (typeof this.item?.updateSource === "function") {
        this.item.updateSource(foundry.utils.expandObject(updateData));
      }
    } catch (_error) {
      // Non-fatal optimistic local update.
    }

    await this.item.update(updateData, { render: false });
    this.syncItemSheetSwitchDependentUi(fieldName, nextValue);
    this.updateResponsiveSheetScale();
  }

  syncItemSheetSwitchDependentUi(changedField = "", nextValue = false, htmlLike = null) {
    return itemSheetControlsController.syncSwitchDependentUi(this, changedField, nextValue, htmlLike);
  }

  getItemSheetEquiperAvecDropContainerFromEvent(eventLike) {
    return itemSheetEquipWithController.getItemSheetEquiperAvecDropContainerFromEvent(eventLike);
  }

  getItemSheetEquiperAvecAcceptedTypes(container) {
    return itemSheetEquipWithController.getItemSheetEquiperAvecAcceptedTypes(container);
  }

  getItemSheetEquiperAvecTemplateEntries() {
    return itemSheetEquipWithController.getItemSheetEquiperAvecTemplateEntries(this);
  }

  getItemSheetEquiperAvecTemplateIndexFromEvent(eventLike) {
    return itemSheetEquipWithController.getItemSheetEquiperAvecTemplateIndexFromEvent(eventLike);
  }

  async resolveDroppedItemDocument(data) {
    return itemSheetEquipWithController.resolveDroppedItemDocument(data);
  }

  isItemSheetEquiperAvecTypeAccepted(itemType, acceptedTypes = null) {
    return itemSheetEquipWithController.isItemSheetEquiperAvecTypeAccepted(itemType, acceptedTypes);
  }

  async updateItemSheetEquiperAvecTemplates(nextTemplates, options = {}) {
    return itemSheetEquipWithController.updateItemSheetEquiperAvecTemplates(this, nextTemplates, options);
  }

  async addItemSheetEquiperAvecTemplateFromDocument(itemDocument, acceptedTypes = null) {
    return itemSheetEquipWithController.addItemSheetEquiperAvecTemplateFromDocument(this, itemDocument, acceptedTypes);
  }

  async removeItemSheetEquiperAvecTemplateByIndex(index) {
    return itemSheetEquipWithController.removeItemSheetEquiperAvecTemplateByIndex(this, index);
  }

  async onItemSheetEquiperAvecDrop(eventLike) {
    return itemSheetEquipWithController.onItemSheetEquiperAvecDrop(this, eventLike);
  }

  refreshPricePreview(htmlLike = null) {
    return itemSheetControlsController.refreshPricePreview(this, htmlLike);
  }

  activatePricePreviewListeners(html) {
    return itemSheetControlsController.activatePricePreviewListeners(this, html);
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
    if (!result) return;
    await playItemAudio(this.item);

    const singleUseEnabled = toBooleanFlag(this.item?.system?.singleUseEnabled, false);
    if (!singleUseEnabled) return;
    const remaining = normalizeSingleUseCountValue(this.item?.system?.singleUseCount, {
      enabled: true,
      fallbackEnabled: 1
    });
    const nextRemaining = Math.max(0, remaining - 1);
    if (nextRemaining <= 0) {
      try {
        await this.item.delete();
      } catch (_error) {
        safeWarn(tl(
          "BLOODMAN.Notifications.ItemDeleteRequiresGM",
          "Suppression impossible: aucun MJ ou assistant actif."
        ));
      }
      return;
    }

    try {
      await this.item.update({ [ITEM_SINGLE_USE_COUNT_PATH]: nextRemaining });
    } catch (_error) {
      safeWarn(tl(
        "BLOODMAN.Notifications.ItemSingleUseCounterUpdateFailed",
        "Mise a jour impossible du compteur d'usage unique."
      ));
    }
  }
}

