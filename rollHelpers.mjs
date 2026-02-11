// Helpers pour centraliser les jets (caractéristiques et dégâts)
const BONUS_KEYS = new Set(["MEL", "VIS", "ESP", "PHY", "MOU", "ADR", "PER", "SOC", "SAV"]);
const BONUS_ITEM_TYPES = new Set(["aptitude", "pouvoir"]);
const SYSTEM_SOCKET = "system.bloodman";
const DAMAGE_REQUEST_CHAT_MARKUP = "<span style='display:none'>bloodman-damage-request</span>";
const DAMAGE_CONFIG_POPUP_CHAT_MARKUP = "<span style='display:none'>bloodman-damage-config-popup</span>";
const DAMAGE_DIALOG_CONFIG_USER_FLAG = "damageDialogConfig";
const DAMAGE_CONFIG_POPUP_SOCKET_TYPE = "damageConfigPopup";
const DAMAGE_CONFIG_OPTIONS = [
  { label: "1D4", formula: "1d4" },
  { label: "1D6", formula: "1d6" },
  { label: "1D8", formula: "1d8" },
  { label: "2D4", formula: "2d4" },
  { label: "1D10", formula: "1d10" },
  { label: "1D12", formula: "1d12" },
  { label: "2D6", formula: "2d6" },
  { label: "1D10+1D4", formula: "1d10+1d4" },
  { label: "2D8", formula: "2d8" },
  { label: "1D10+1D8", formula: "1d10+1d8" },
  { label: "2D10", formula: "2d10" },
  { label: "2D12", formula: "2d12" }
];

function t(key, data = null) {
  if (!globalThis.game?.i18n) return key;
  return data ? game.i18n.format(key, data) : game.i18n.localize(key);
}

function tl(key, fallback, data = null) {
  if (!globalThis.game?.i18n) return fallback || key;
  const localized = data ? game.i18n.format(key, data) : game.i18n.localize(key);
  // Foundry returns the key itself if the localization entry is missing.
  if (!localized || localized === key) return fallback || key;
  return localized;
}

function safeWarn(message) {
  try {
    ui.notifications?.warn(message);
  } catch (error) {
    console.warn("[bloodman] notify.warn failed", message, error);
  }
}

function isBonusItem(item) {
  return BONUS_ITEM_TYPES.has(item?.type);
}

export function normalizeWeaponType(value) {
  const raw = (value ?? "").toString().toLowerCase();
  if (!raw) return "";
  if (raw === "distance" || raw.includes("distance")) return "distance";
  if (raw === "corps" || raw.includes("corps") || raw.includes("blanche") || raw.includes("mêlée") || raw.includes("melee")) return "corps";
  if (raw.includes("tactique") || raw.includes("jet") || raw.includes("poing")) return "distance";
  return (value ?? "").toString().trim();
}

export function getWeaponCategory(value) {
  const normalized = normalizeWeaponType(value);
  if (normalized === "corps") return "corps";
  return "distance";
}

function getItemBonus(actor, key) {
  void actor;
  void key;
  return 0;
}

function getRawDamageBonus(actor) {
  if (!actor?.items) return 0;
  let total = 0;
  for (const item of actor.items) {
    if (!isBonusItem(item)) continue;
    if (!item.system?.rawBonusEnabled) continue;
    const bonus = Number(item.system?.rawBonuses?.deg);
    if (Number.isFinite(bonus)) total += bonus;
  }
  return total;
}

function normalizeCharacteristicKey(value) {
  const key = String(value || "").trim().toUpperCase();
  return BONUS_KEYS.has(key) ? key : "";
}

function normalizeArchetypeBonusValue(value, fallback = 0) {
  if (value == null || value === "") return Math.trunc(Number(fallback) || 0);
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.trunc(numeric);
}

function getArchetypeBonus(actor, key) {
  const profile = actor?.system?.profile || {};
  const selectedKey = normalizeCharacteristicKey(profile.archetypeBonusCharacteristic);
  if (!selectedKey || selectedKey !== normalizeCharacteristicKey(key)) return 0;
  return normalizeArchetypeBonusValue(profile.archetypeBonusValue, 0);
}

function getEffectiveCharacteristic(actor, key) {
  const base = Number(actor.system.characteristics?.[key]?.base || 0);
  const globalMod = Number(actor.system.modifiers?.all || 0);
  const keyMod = Number(actor.system.modifiers?.[key] || 0);
  const itemBonus = getItemBonus(actor, key);
  const archetypeBonus = getArchetypeBonus(actor, key);
  return base + globalMod + keyMod + itemBonus + archetypeBonus;
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

function getTokenDocument(tokenLike) {
  if (!tokenLike) return null;
  return tokenLike.document || tokenLike;
}

function getTokenActor(tokenLike) {
  if (!tokenLike) return null;
  return tokenLike.actor || tokenLike.document?.actor || tokenLike.object?.actor || null;
}

function getTokenCurrentPv(tokenLike) {
  const tokenDocument = getTokenDocument(tokenLike);
  const actor = getTokenActor(tokenLike);
  const actorCurrent = Number(actor?.system?.resources?.pv?.current);
  if (Number.isFinite(actorCurrent)) return actorCurrent;
  const deltaCurrent = Number(foundry.utils.getProperty(tokenDocument, "delta.system.resources.pv.current"));
  if (Number.isFinite(deltaCurrent)) return deltaCurrent;
  const actorDataCurrent = Number(foundry.utils.getProperty(tokenDocument, "actorData.system.resources.pv.current"));
  if (Number.isFinite(actorDataCurrent)) return actorDataCurrent;
  return NaN;
}

function getActiveGMIds() {
  return game.users?.filter(user => user.isGM && user.active).map(user => user.id) || [];
}

function isAssistantOrHigherRole(role) {
  const assistantRole = Number(CONST?.USER_ROLES?.ASSISTANT ?? 3);
  return Number(role ?? 0) >= assistantRole;
}

function getDamageConfigPopupViewerIds(requesterUserId = "") {
  const ids = new Set();
  const requesterId = String(requesterUserId || "").trim();
  if (requesterId) ids.add(requesterId);
  for (const user of game.users || []) {
    if (!user?.active) continue;
    const userId = String(user.id || "").trim();
    if (!userId) continue;
    if (user.isGM || isAssistantOrHigherRole(user.role)) ids.add(userId);
  }
  return [...ids];
}

function emitDamageConfigPopup(actor, sourceName, config, options = {}) {
  if (!game.socket) return false;
  const requesterUserId = String(game.user?.id || "").trim();
  const viewerIds = getDamageConfigPopupViewerIds(requesterUserId);
  if (!viewerIds.length) return false;
  if (viewerIds.length === 1 && viewerIds[0] === requesterUserId) return false;

  const requestId = String(options.requestId || generateRandomId()).trim() || generateRandomId();
  const eventId = generateRandomId();
  const action = String(options.action || "open").trim().toLowerCase() || "open";
  const useChatFallback = options.useChatFallback === true;
  const payload = {
    type: DAMAGE_CONFIG_POPUP_SOCKET_TYPE,
    eventId,
    requestId,
    action,
    requesterUserId,
    viewerIds,
    actorId: String(actor?.id || ""),
    actorName: String(actor?.name || "").trim(),
    sourceName: String(sourceName || "").trim(),
    config: {
      degats: String(config?.degats || "").trim().toUpperCase(),
      formula: normalizeDamageFormula(config?.formula),
      bonusBrut: toNonNegativeInt(config?.bonusBrut, 0),
      penetration: toNonNegativeInt(config?.penetration, 0),
      rollKeepHighest: config?.rollKeepHighest === true
    }
  };
  try {
    game.socket.emit(SYSTEM_SOCKET, payload);
  } catch (error) {
    console.error("[bloodman] damage:config popup socket emit failed", error);
  }
  const observerIds = viewerIds.filter(id => id && id !== requesterUserId);
  if (useChatFallback && observerIds.length && typeof ChatMessage?.create === "function") {
    void ChatMessage.create({
      content: DAMAGE_CONFIG_POPUP_CHAT_MARKUP,
      whisper: observerIds,
      flags: { bloodman: { damageConfigPopup: payload } }
    }).catch(error => {
      console.error("[bloodman] damage:config popup chat fallback failed", error);
    });
  }
  return true;
}

function hasActorUpdatePayload(updateData) {
  if (!updateData || typeof updateData !== "object") return false;
  return Object.keys(foundry.utils.flattenObject(updateData)).length > 0;
}

function requestActorSheetUpdate(actor, updateData, options = {}) {
  if (!actor || !game.socket || !hasActorUpdatePayload(updateData)) return false;
  try {
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
  } catch (error) {
    console.error("[bloodman] actor:update socket emit failed", error);
    return false;
  }
  return true;
}

function getSocketActorBaseId(actor) {
  return String(actor?.token?.actorId || actor?.parent?.actorId || actor?.baseActor?.id || actor?.id || "");
}

function requestDeleteActorItem(actor, item) {
  if (!actor || !item || !game.socket) return false;
  try {
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
  } catch (error) {
    console.error("[bloodman] item:delete socket emit failed", error);
    return false;
  }
  return true;
}

async function updateActorWithFallback(actor, updateData, options = {}) {
  if (!actor || !hasActorUpdatePayload(updateData)) return null;
  const allowCharacteristicBase = Boolean(options.allowCharacteristicBase);
  const allowVitalResourceUpdate = Boolean(options.allowVitalResourceUpdate);
  if (actor.isOwner || game.user?.isGM) {
    return actor.update(updateData, {
      bloodmanAllowCharacteristicBase: allowCharacteristicBase,
      bloodmanAllowVitalResourceUpdate: allowVitalResourceUpdate
    });
  }
  const sent = requestActorSheetUpdate(actor, updateData, {
    allowCharacteristicBase,
    allowVitalResourceUpdate
  });
  if (!sent) {
    safeWarn(tl("BLOODMAN.Notifications.ActorUpdateRequiresGM", "Mise a jour impossible: aucun MJ actif."));
  }
  return null;
}

async function deleteItemWithFallback(item, actor = null) {
  if (!item) return false;
  const parentActor = actor || item.actor || null;
  if (item.isOwner || parentActor?.isOwner || game.user?.isGM) {
    try {
      await item.delete();
    } catch (error) {
      console.warn("[bloodman] item:delete direct failed, fallback to socket", error);
    }
    const itemId = String(item.id || "");
    if (itemId && !parentActor?.items?.has(itemId)) return true;
  }
  const sent = requestDeleteActorItem(parentActor, item);
  if (!sent) {
    safeWarn(tl("BLOODMAN.Notifications.ItemDeleteRequiresGM", "Suppression impossible: aucun MJ actif."));
  }
  return sent;
}

function toNonNegativeInt(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.floor(numeric));
}

function generateRandomId() {
  return foundry.utils?.randomID ? foundry.utils.randomID() : Math.random().toString(36).slice(2);
}

function getChaosValue() {
  return Math.max(0, Math.floor(Number(game.settings.get("bloodman", "chaosDice") || 0)));
}

async function setChaosValue(nextValue) {
  if (!game.user.isGM) return;
  const clamped = Math.max(0, Math.floor(Number(nextValue) || 0));
  await game.settings.set("bloodman", "chaosDice", clamped);
}

function normalizeDamageFormula(formula) {
  const raw = String(formula || "").trim().toLowerCase().replace(/\s+/g, "");
  if (!raw) return "";
  return raw.replace(/^d(\d+)$/, "1d$1");
}

function getDamageOptionByFormula(formula) {
  const normalized = normalizeDamageFormula(formula);
  if (!normalized) return null;
  return DAMAGE_CONFIG_OPTIONS.find(option => option.formula === normalized) || null;
}

function getDefaultDamageOption(formula) {
  return getDamageOptionByFormula(formula) || DAMAGE_CONFIG_OPTIONS[0];
}

function getRememberedDamageDialogConfig() {
  const raw = game.user?.getFlag?.("bloodman", DAMAGE_DIALOG_CONFIG_USER_FLAG);
  if (!raw || typeof raw !== "object") return null;
  const option = getDamageOptionByFormula(raw.formula);
  return {
    formula: option?.formula || "",
    bonusBrut: toNonNegativeInt(raw.bonusBrut, 0),
    penetration: toNonNegativeInt(raw.penetration, 0),
    rollKeepHighest: raw.rollKeepHighest === true
  };
}

async function rememberDamageDialogConfig(config = {}) {
  if (!game.user?.setFlag) return;
  const option = getDamageOptionByFormula(config.formula);
  const payload = {
    formula: option?.formula || "",
    bonusBrut: toNonNegativeInt(config.bonusBrut, 0),
    penetration: toNonNegativeInt(config.penetration, 0),
    rollKeepHighest: config.rollKeepHighest === true,
    updatedAt: Date.now()
  };
  try {
    await game.user.setFlag("bloodman", DAMAGE_DIALOG_CONFIG_USER_FLAG, payload);
  } catch (error) {
    console.warn("[bloodman] damage:remember config failed", error);
  }
}

function getRollValues(roll) {
  const values = [];
  for (const die of roll?.dice || []) {
    for (const result of die?.results || []) {
      const value = Number(result?.result);
      if (Number.isFinite(value)) values.push(value);
    }
  }
  return values;
}

function buildKeepHighestRollTag(firstTotal, secondTotal, keptTotal) {
  if (!Number.isFinite(firstTotal) || !Number.isFinite(secondTotal) || !Number.isFinite(keptTotal)) return "";
  const label = tl("BLOODMAN.Dialogs.DamageConfig.RollHighestLabel", "2 jets, garder le plus haut");
  return `${label}: ${firstTotal} / ${secondTotal} -> ${keptTotal}`;
}

async function evaluateDamageRoll(config = {}) {
  const formula = normalizeDamageFormula(config?.formula) || "1d4";
  const rollKeepHighest = Boolean(config?.rollKeepHighest);
  if (!rollKeepHighest) {
    const roll = await new Roll(formula).evaluate();
    return {
      roll,
      rollResults: getRollValues(roll),
      rawTotal: Number(roll.total) || 0,
      rollKeepHighest: false,
      modeTag: ""
    };
  }

  const firstRoll = await new Roll(formula).evaluate();
  const secondRoll = await new Roll(formula).evaluate();
  const firstTotal = Number(firstRoll.total) || 0;
  const secondTotal = Number(secondRoll.total) || 0;
  const keepFirst = firstTotal >= secondTotal;
  const keptRoll = keepFirst ? firstRoll : secondRoll;
  const keptTotal = keepFirst ? firstTotal : secondTotal;
  return {
    roll: keptRoll,
    rollResults: getRollValues(keptRoll),
    rawTotal: keptTotal,
    rollKeepHighest: true,
    modeTag: buildKeepHighestRollTag(firstTotal, secondTotal, keptTotal),
    firstTotal,
    secondTotal
  };
}

async function evaluateConfiguredDamageOutcome(config = {}) {
  const rollEval = await evaluateDamageRoll(config);
  const bonus = toNonNegativeInt(config?.bonusBrut, 0);
  return {
    roll: rollEval.roll,
    rollResults: Array.isArray(rollEval.rollResults) ? rollEval.rollResults : [],
    totalDamage: Math.max(0, Number(rollEval.rawTotal || 0) + bonus),
    modeTag: String(rollEval.modeTag || "")
  };
}

function buildDamageApplyOptions(actor, config, outcome, options = {}) {
  const sourceName = String(options.sourceName || "");
  const totalDamage = Number.isFinite(Number(options.totalDamage))
    ? Number(options.totalDamage)
    : Number(outcome?.totalDamage || 0);
  return {
    ...config,
    rollResults: Array.isArray(outcome?.rollResults) ? outcome.rollResults : [],
    attackerId: actor?.id || "",
    attackerName: actor?.name || "",
    sourceName,
    inputPayload: options.inputPayload,
    rollId: String(options.rollId || ""),
    itemId: String(options.itemId || ""),
    itemType: String(options.itemType || ""),
    itemName: String(options.itemName || sourceName),
    totalDamage
  };
}

function buildDamageRollContextResult(actor, config, outcome, options = {}) {
  const sourceName = String(options.sourceName || "");
  return buildDamageContext(actor, config, {
    rollId: String(options.rollId || ""),
    itemId: String(options.itemId || ""),
    itemType: String(options.itemType || ""),
    itemName: String(options.itemName || sourceName),
    totalDamage: Number.isFinite(Number(options.totalDamage))
      ? Number(options.totalDamage)
      : Number(outcome?.totalDamage || 0),
    targets: Array.isArray(options.targets) ? options.targets : []
  });
}

async function promptDamageConfiguration({
  actor,
  sourceName = "",
  defaultFormula = "1d4",
  defaultBonus = 0,
  defaultPenetration = 0,
  defaultRollKeepHighest = false
} = {}) {
  const rememberedConfig = getRememberedDamageDialogConfig();
  const selectedDefault = getDamageOptionByFormula(rememberedConfig?.formula) || getDefaultDamageOption(defaultFormula);
  const initialBonus = rememberedConfig
    ? toNonNegativeInt(rememberedConfig.bonusBrut, toNonNegativeInt(defaultBonus, 0))
    : toNonNegativeInt(defaultBonus, 0);
  const initialPenetration = rememberedConfig
    ? toNonNegativeInt(rememberedConfig.penetration, toNonNegativeInt(defaultPenetration, 0))
    : toNonNegativeInt(defaultPenetration, 0);
  const initialRollKeepHighest = rememberedConfig
    ? rememberedConfig.rollKeepHighest === true
    : Boolean(defaultRollKeepHighest);
  const titleSource = sourceName ? ` (${sourceName})` : "";
  const damageDieLabel = tl("BLOODMAN.Items.DamageDieLabel", "De de degat");
  const settingsLabel = tl("BLOODMAN.Dialogs.DamageConfig.SettingsLabel", "Reglages du jet");
  const rollHighestLabel = tl("BLOODMAN.Dialogs.DamageConfig.RollHighestLabel", "2 jets, garder le plus haut");
  const rollHighestHint = tl(
    "BLOODMAN.Dialogs.DamageConfig.RollHighestHint",
    "Lance la formule deux fois puis conserve le meilleur resultat."
  );
  // Prevent the trailing "+" from wrapping to a new line in narrow layouts.
  const rawBonusLabel = tl("BLOODMAN.Dialogs.DamageConfig.RawBonusLabel", "Degats bruts +").replace(/\s\+$/, "&nbsp;+");
  const penetrationLabel = tl("BLOODMAN.Dialogs.DamageConfig.PenetrationLabel", "Penetration +").replace(/\s\+$/, "&nbsp;+");

  const options = DAMAGE_CONFIG_OPTIONS
    .map(option => `<option value="${option.formula}" ${option.formula === selectedDefault.formula ? "selected" : ""}>${option.label}</option>`)
    .join("");

  const content = `<form class="bm-damage-config">
    <div class="bm-damage-config-shell">
      <div class="bm-damage-config-head">
        <div class="bm-damage-config-icon-wrap" aria-hidden="true">
          <div class="bm-damage-config-icon-ring">
            <i class="fa-solid fa-skull"></i>
          </div>
        </div>
        <div class="bm-damage-config-head-copy">
          <p class="bm-damage-config-eyebrow">${settingsLabel}</p>
          <p class="bm-damage-config-hint">${tl("BLOODMAN.Dialogs.DamageConfig.Title", "Configuration du jet de degats")}</p>
        </div>
      </div>
      <div class="bm-damage-config-grid">
        <div class="bm-damage-config-row bm-damage-config-row-wide">
          <label>${damageDieLabel}</label>
          <select name="degats">${options}</select>
        </div>
        <div class="bm-damage-config-row bm-damage-config-inline">
          <label>${rawBonusLabel}</label>
          <input type="number" name="bonus_brut" min="0" step="1" value="${initialBonus}" />
        </div>
        <div class="bm-damage-config-row bm-damage-config-inline">
          <label>${penetrationLabel}</label>
          <input type="number" name="penetration" min="0" step="1" value="${initialPenetration}" />
        </div>
      </div>
      <label class="bm-damage-config-toggle">
        <input type="checkbox" name="roll_keep_highest" ${initialRollKeepHighest ? "checked" : ""} />
        <span class="bm-damage-config-toggle-indicator" aria-hidden="true">2x</span>
        <span class="bm-damage-config-toggle-copy">
          <span class="bm-damage-config-toggle-title">${rollHighestLabel}</span>
          <span class="bm-damage-config-toggle-hint">${rollHighestHint}</span>
        </span>
      </label>
    </div>
  </form>`;

  const popupRequestId = generateRandomId();
  const initialPopupConfig = {
    degats: selectedDefault.label,
    formula: selectedDefault.formula,
    bonusBrut: initialBonus,
    penetration: initialPenetration,
    rollKeepHighest: initialRollKeepHighest
  };
  let lastPopupConfig = { ...initialPopupConfig };
  let popupUpdateTimer = null;
  let popupUpdatePendingConfig = null;
  const emitPopupState = (nextConfig, action = "update", { useChatFallback = false } = {}) => {
    const payloadConfig = {
      degats: String(nextConfig?.degats || initialPopupConfig.degats || "").trim().toUpperCase(),
      formula: normalizeDamageFormula(nextConfig?.formula || initialPopupConfig.formula || "1d4"),
      bonusBrut: toNonNegativeInt(nextConfig?.bonusBrut, initialPopupConfig.bonusBrut),
      penetration: toNonNegativeInt(nextConfig?.penetration, initialPopupConfig.penetration),
      rollKeepHighest: nextConfig?.rollKeepHighest === true
    };
    lastPopupConfig = payloadConfig;
    emitDamageConfigPopup(actor, sourceName, payloadConfig, {
      requestId: popupRequestId,
      action,
      useChatFallback
    });
  };
  const flushPopupUpdate = ({ useChatFallback = true } = {}) => {
    if (!popupUpdatePendingConfig) return;
    const pending = popupUpdatePendingConfig;
    popupUpdatePendingConfig = null;
    if (popupUpdateTimer) {
      clearTimeout(popupUpdateTimer);
      popupUpdateTimer = null;
    }
    emitPopupState(pending, "update", { useChatFallback });
  };
  const schedulePopupUpdate = nextConfig => {
    popupUpdatePendingConfig = nextConfig;
    if (popupUpdateTimer) return;
    popupUpdateTimer = setTimeout(() => {
      popupUpdateTimer = null;
      if (!popupUpdatePendingConfig) return;
      const pending = popupUpdatePendingConfig;
      popupUpdatePendingConfig = null;
      emitPopupState(pending, "update", { useChatFallback: true });
    }, 120);
  };

  // Mirror the opened configuration dialog to GM/assistant observers.
  emitPopupState(initialPopupConfig, "open", { useChatFallback: true });

  return new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      if (popupUpdateTimer) {
        clearTimeout(popupUpdateTimer);
        popupUpdateTimer = null;
      }
      popupUpdatePendingConfig = null;
      resolve(value);
    };

    new Dialog(
      {
        title: `${tl("BLOODMAN.Dialogs.DamageConfig.Title", "Configuration du jet de degats")}${titleSource}`,
        content,
        render: html => {
          const readCurrentConfig = () => {
            const selectedFormula = normalizeDamageFormula(html.find("select[name='degats']").val());
            const option = getDamageOptionByFormula(selectedFormula) || getDefaultDamageOption(selectedFormula);
            return {
              degats: option?.label || selectedFormula.toUpperCase(),
              formula: option?.formula || selectedFormula,
              bonusBrut: toNonNegativeInt(html.find("input[name='bonus_brut']").val(), initialBonus),
              penetration: toNonNegativeInt(html.find("input[name='penetration']").val(), initialPenetration),
              rollKeepHighest: Boolean(html.find("input[name='roll_keep_highest']").is(":checked"))
            };
          };
          html.on("input change", "select[name='degats'], input[name='bonus_brut'], input[name='penetration'], input[name='roll_keep_highest']", () => {
            schedulePopupUpdate(readCurrentConfig());
          });
        },
        buttons: {
          roll: {
            label: tl("BLOODMAN.Common.Roll", "Lancer"),
            callback: html => {
              const selectedFormula = normalizeDamageFormula(html.find("select[name='degats']").val());
              const option = getDamageOptionByFormula(selectedFormula);
              if (!option) {
                safeWarn(tl("BLOODMAN.Notifications.InvalidDamageFormula", "Selection de degats invalide."));
                return false;
              }

              const bonusRaw = html.find("input[name='bonus_brut']").val();
              const penetrationRaw = html.find("input[name='penetration']").val();
              const rollKeepHighest = Boolean(html.find("input[name='roll_keep_highest']").is(":checked"));
              const bonus = Number(bonusRaw);
              const penetration = Number(penetrationRaw);
              if (!Number.isFinite(bonus) || bonus < 0) {
                safeWarn(tl("BLOODMAN.Notifications.InvalidRawDamageBonus", "La valeur Degats bruts + doit etre un nombre entier >= 0."));
                return false;
              }
              if (!Number.isFinite(penetration) || penetration < 0) {
                safeWarn(tl("BLOODMAN.Notifications.InvalidPenetration", "La valeur Penetration + doit etre un nombre entier >= 0."));
                return false;
              }

              const config = {
                degats: option.label,
                formula: option.formula,
                bonusBrut: Math.floor(bonus),
                penetration: Math.floor(penetration),
                rollKeepHighest,
                attaquant_id: actor?.id || ""
              };
              void rememberDamageDialogConfig(config);
              flushPopupUpdate({ useChatFallback: true });
              emitPopupState(config, "update", { useChatFallback: true });
              finish(config);
            }
          }
        },
        default: "roll",
        close: () => {
          flushPopupUpdate({ useChatFallback: true });
          emitPopupState(lastPopupConfig, "close", { useChatFallback: true });
          finish(null);
        }
      },
      {
        classes: ["bloodman-damage-dialog"],
        width: 500
      }
    ).render(true);
  });
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

function buildDamageRequestPayload(token, damage, options = {}) {
  const tokenDocument = getTokenDocument(token);
  const targetActor = getTokenActor(token);
  const requestId = generateRandomId();
  const tokenUuid = tokenDocument?.uuid;
  const tokenId = tokenDocument?.id || token?.id;
  const sceneId = tokenDocument?.parent?.id || token?.scene?.id || tokenDocument?.scene?.id || canvas?.scene?.id;
  const worldActorId = tokenDocument?.actorId || targetActor?.id || "";
  const actorId = worldActorId || targetActor?.id;
  const worldActorUuid = worldActorId ? game.actors?.get(worldActorId)?.uuid : "";
  const actorUuid = worldActorUuid || targetActor?.uuid;
  const targetActorLink = Boolean(tokenDocument?.actorLink);
  const targetName = resolveCombatTargetName(tokenDocument?.name || token?.name, targetActor?.name, "");
  const targetPvCurrent = Number(getTokenCurrentPv(token));
  const targetPA = Number(getProtectionPA(targetActor));
  const penetration = toNonNegativeInt(options.penetration, 0);
  const bonusBrut = toNonNegativeInt(options.bonusBrut, 0);
  const damageFormula = normalizeDamageFormula(options.formula);
  const damageLabel = String(options.degats || "").trim().toUpperCase();
  const attackerId = String(options.attaquant_id || options.attackerId || "").trim();
  const attackerName = String(options.attackerName || "").trim();
  const rollResults = Array.isArray(options.rollResults) ? options.rollResults : [];
  const rollKeepHighest = options.rollKeepHighest === true;
  const attackerUserId = String(options.attackerUserId || game.user?.id || "").trim();
  const rollId = String(options.rollId || "").trim();
  const itemId = String(options.itemId || "").trim();
  const itemName = String(options.itemName || "").trim();
  const itemType = String(options.itemType || "").trim();
  const totalDamage = Number(options.totalDamage);

  return {
    requestId,
    type: "applyDamage",
    kind: "item-damage",
    rollId,
    itemId,
    itemName,
    itemType,
    totalDamage,
    tokenUuid,
    tokenId,
    sceneId,
    actorId,
    actorUuid,
    targetActorLink,
    targetName,
    targetPvCurrent,
    targetPA,
    damage,
    penetration,
    bonusBrut,
    damageFormula,
    damageLabel,
    attackerUserId,
    attackerId,
    attackerName,
    rollResults,
    rollKeepHighest,
    degats: damageLabel || damageFormula.toUpperCase(),
    bonus_brut: bonusBrut,
    cible_id: tokenId || actorId || "",
    attaquant_id: attackerId
  };
}

function buildDamageBackendInput(actor, config) {
  const targetIds = Array.from(game.user.targets || []).map(token => token?.id).filter(Boolean);
  return {
    degats: config.degats,
    bonus_brut: config.bonusBrut,
    roll_keep_highest: Boolean(config.rollKeepHighest),
    penetration: config.penetration,
    cible_id: targetIds[0] || "",
    attaquant_id: actor?.id || ""
  };
}

function buildDamageContext(actor, config, {
  rollId = "",
  itemId = "",
  itemType = "",
  itemName = "",
  totalDamage = 0,
  targets = []
} = {}) {
  return {
    kind: "item-damage",
    rollId,
    itemId: String(itemId || ""),
    itemType: String(itemType || ""),
    itemName: String(itemName || ""),
    attackerId: actor?.id || "",
    attackerUserId: game.user?.id || "",
    formula: config.formula,
    degats: config.degats,
    bonusBrut: config.bonusBrut,
    rollKeepHighest: Boolean(config.rollKeepHighest),
    penetration: config.penetration,
    totalDamage,
    targets: Array.isArray(targets) ? targets : []
  };
}

export async function doCharacteristicRoll(actor, key) {
  const effective = getEffectiveCharacteristic(actor, key);

  const r = await new Roll("1d100").evaluate();
  const rollTotal = Number(r.total) || 0;
  const isCritSuccess = rollTotal >= 1 && rollTotal <= 5;
  const isCritFailure = rollTotal >= 96 && rollTotal <= 100;
  const success = isCritSuccess ? true : isCritFailure ? false : rollTotal <= effective;
  const outcome = t(success ? "BLOODMAN.Rolls.Success" : "BLOODMAN.Rolls.Failure");
  r.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `<b>${outcome}</b><br>${rollTotal}`
  });
  return { roll: r, success, effective, critical: isCritSuccess ? "success" : isCritFailure ? "failure" : "" };
}

async function requestDamageFromGM(token, damage, options = {}) {
  if (!game.socket) return false;
  const payload = buildDamageRequestPayload(token, damage, options);
  console.debug("[bloodman] damage:send", payload);
  try {
    game.socket.emit(SYSTEM_SOCKET, payload);
  } catch (error) {
    console.error("[bloodman] damage:socket emit failed", error);
    return false;
  }

  const gmIds = getActiveGMIds();
  if (gmIds.length) {
    try {
      await ChatMessage.create({
        content: DAMAGE_REQUEST_CHAT_MARKUP,
        whisper: gmIds,
        flags: { bloodman: { damageRequest: payload } }
      });
    } catch (error) {
      console.error("[bloodman] damage:fallback chat failed", error);
      // Socket delivery already succeeded; keep reroll context available to players.
    }
  }
  return true;
}

export async function applyDamageToActor(targetActor, damage, options = {}) {
  if (!targetActor) return null;
  const share = Number(damage);
  if (!Number.isFinite(share) || share <= 0) return null;
  const penetration = toNonNegativeInt(options.penetration, 0);
  const paInitial = getProtectionPA(targetActor);
  const paEffective = Math.max(0, paInitial - penetration);
  const finalDamage = Math.max(0, share - paEffective);
  const current = Number(targetActor.system.resources?.pv?.current || 0);
  const nextValue = Math.max(0, current - finalDamage);
  const displayName = resolveCombatTargetName(options?.targetName, targetActor?.name, targetActor?.name || "Cible");

  await updateActorWithFallback(
    targetActor,
    { "system.resources.pv.current": nextValue },
    { allowVitalResourceUpdate: true }
  );

  ChatMessage.create({
    speaker: { alias: displayName },
    content: t("BLOODMAN.Rolls.Damage.Take", { name: displayName, amount: finalDamage, pa: paEffective })
  });

  return {
    finalDamage,
    penetration,
    pa: paEffective,
    paInitial,
    paEffective,
    hpBefore: current,
    hpAfter: nextValue
  };
}

function buildDamageFlavor(actor, amount, config, sourceName = "", tag = "") {
  const source = sourceName ? ` (${sourceName})` : "";
  const note = tag ? ` | ${tag}` : "";
  return `${t("BLOODMAN.Rolls.Damage.Deal", { name: actor.name, amount, source })}<br><small>${config.degats} + ${config.bonusBrut} | PEN ${config.penetration}${note}</small>`;
}

function buildDamageContextTargetEntry(token, targetActor, share, options = {}) {
  const tokenDoc = getTokenDocument(token);
  const targetName = String(options.targetName || resolveCombatTargetName(
    tokenDoc?.name || token?.name,
    targetActor?.name,
    "Cible"
  ));
  const entry = {
    tokenId: String(tokenDoc?.id || token?.id || ""),
    tokenUuid: String(tokenDoc?.uuid || ""),
    sceneId: String(tokenDoc?.parent?.id || tokenDoc?.scene?.id || canvas?.scene?.id || ""),
    actorId: String(tokenDoc?.actorId || targetActor?.id || ""),
    targetActorLink: Boolean(tokenDoc?.actorLink),
    targetName,
    share: Number.isFinite(Number(share)) ? Number(share) : 0,
    hpBefore: options.hpBefore ?? null,
    hpAfter: options.hpAfter ?? null,
    pending: options.pending === true
  };
  if (options.finalDamage != null) entry.finalDamage = options.finalDamage;
  return entry;
}

async function applyDamageToTargets(sourceActor, total, options = {}) {
  const targets = Array.from(game.user.targets || []);
  if (!targets.length) {
    safeWarn(t("BLOODMAN.Notifications.NoTargetSelected"));
    return { outputs: [], contextTargets: [] };
  }
  const hasActiveGM = game.users?.some(user => user.active && user.isGM) || false;
  const penetration = toNonNegativeInt(options.penetration, 0);
  const outputs = [];
  const contextTargets = [];
  const rollId = String(options.rollId || "");
  const itemId = String(options.itemId || "");
  const itemName = String(options.itemName || "");
  const totalDamage = Number.isFinite(Number(options.totalDamage)) ? Number(options.totalDamage) : total;

  const promptDamageSplit = async (totalDamage, targetTokens) => {
    if (targetTokens.length <= 1) return null;
    const base = Math.floor(totalDamage / targetTokens.length);
    const remainder = totalDamage - base * targetTokens.length;
    const defaults = targetTokens.map((token, index) => {
      const targetActor = getTokenActor(token);
      const displayName = resolveCombatTargetName(
        token?.name || token?.document?.name,
        targetActor?.name,
        "Cible"
      );
      return {
      id: token.id,
      name: displayName,
      value: base + (index < remainder ? 1 : 0)
      };
    });

    const byName = new Map();
    for (const entry of defaults) {
      const count = byName.get(entry.name) || 0;
      byName.set(entry.name, count + 1);
    }
    for (const [name, count] of byName.entries()) {
      if (count <= 1) continue;
      let index = 0;
      for (const entry of defaults) {
        if (entry.name !== name) continue;
        index += 1;
        entry.name = `${name} #${index}`;
      }
    }

    const rows = defaults
      .map(
        entry => `<div class="split-row">
          <label>${entry.name}</label>
          <input type="number" min="0" step="1" data-target-id="${entry.id}" value="${entry.value}" />
        </div>`
      )
      .join("");

    const content = `<form class="damage-split">
      <p>${t("BLOODMAN.Dialogs.DamageSplit.Prompt", { damage: totalDamage, targets: targetTokens.length })}</p>
      <div class="split-grid">${rows}</div>
    </form>`;

    return new Promise(resolve => {
      let resolved = false;
      const finish = value => {
        if (resolved) return;
        resolved = true;
        resolve(value);
      };

      new Dialog({
        title: t("BLOODMAN.Dialogs.DamageSplit.Title"),
        content,
        buttons: {
          apply: {
            label: t("BLOODMAN.Common.Apply"),
            callback: html => {
              const allocations = {};
              let sum = 0;
              html.find("input[data-target-id]").each((_, input) => {
                const value = Number(input.value);
                const safe = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
                allocations[input.dataset.targetId] = safe;
                sum += safe;
              });
              if (sum !== totalDamage) {
                ui.notifications?.warn(t("BLOODMAN.Notifications.DamageSplitTotal", { total: totalDamage }));
                return false;
              }
              finish(allocations);
            }
          },
          cancel: {
            label: t("BLOODMAN.Common.Cancel"),
            callback: () => finish(null)
          }
        },
        default: "apply",
        close: () => finish(null)
      }).render(true);
    });
  };

  let allocations = null;
  if (targets.length > 1) {
    allocations = await promptDamageSplit(total, targets);
    if (!allocations) return { outputs: [], contextTargets: [] };
  }

  for (const token of targets) {
    const share = allocations ? Number(allocations[token.id] || 0) : total;
    if (!Number.isFinite(share) || share <= 0) continue;
    if (!game.user.isGM && hasActiveGM) {
      const ok = await requestDamageFromGM(token, share, {
        ...options,
        rollId,
        itemId,
        itemName,
        totalDamage,
        penetration
      });
      if (!ok) {
        safeWarn(tl("BLOODMAN.Notifications.DamageRequestFailed", "Le message de degats n'a pas pu etre transmis au MJ."));
      } else {
        const targetActor = getTokenActor(token);
        contextTargets.push(buildDamageContextTargetEntry(token, targetActor, share, { pending: true }));
      }
      continue;
    }
    const targetActor = getTokenActor(token);
    if (!targetActor) continue;
    if (!targetActor.isOwner && !game.user.isGM) {
      safeWarn(t("BLOODMAN.Notifications.NoActiveGMApplyDamage"));
      continue;
    }
    const targetName = resolveCombatTargetName(
      token?.name || token?.document?.name,
      targetActor?.name,
      "Cible"
    );
    const result = await applyDamageToActor(targetActor, share, { targetName, penetration });
    if (!result) {
      safeWarn(tl("BLOODMAN.Notifications.DamageApplyFailed", "Impossible d'appliquer les degats a la cible."));
      continue;
    }
    const tokenDoc = getTokenDocument(token);
    contextTargets.push(buildDamageContextTargetEntry(token, targetActor, share, {
      targetName,
      hpBefore: result.hpBefore,
      hpAfter: result.hpAfter,
      finalDamage: result.finalDamage,
      pending: false
    }));
    if (typeof globalThis.__bmSyncZeroPvStatusForToken === "function") {
      const actorType = targetActor?.type || tokenDoc?.actor?.type || "";
      if (tokenDoc && actorType && Number.isFinite(result.hpAfter)) {
        await globalThis.__bmSyncZeroPvStatusForToken(tokenDoc, actorType, result.hpAfter);
      }
    }

    const output = {
      degats_selectionnes: String(options.degats || options.damageLabel || options.formula || "").toUpperCase(),
      jet_de: Array.isArray(options.rollResults) ? options.rollResults : [],
      bonus_brut: toNonNegativeInt(options.bonusBrut, 0),
      penetration: result.penetration,
      armure_initiale: result.paInitial,
      armure_effective: result.paEffective,
      degats_totaux: result.finalDamage,
      points_de_vie_avant: result.hpBefore,
      points_de_vie_apres: result.hpAfter,
      icones_a_afficher: [],
      erreur: null
    };

    if (Number.isFinite(result.hpAfter) && result.hpAfter <= 0) {
      output.icones_a_afficher.push(targetActor.type === "personnage-non-joueur" ? "mort" : "sang");
    }
    if (result.finalDamage >= 5) output.icones_a_afficher.push("degats_forts");

    if (!Number.isFinite(output.points_de_vie_apres)) {
      output.erreur = tl("BLOODMAN.Notifications.DamageApplyFailed", "Impossible d'appliquer les degats a la cible.");
    }
    console.debug("[bloodman] damage:output", output);
    outputs.push(output);

  }
  return { outputs, contextTargets };
}

export async function doDamageRoll(actor, item) {
  if (item?.system?.damageEnabled === false) {
    ui.notifications?.warn(tl("BLOODMAN.Notifications.WeaponDamageDisabled", "Cette arme n'a pas de dé de dégâts."));
    return null;
  }
  const die = item.system.damageDie || "d4";
  const weaponType = getWeaponCategory(item.system?.weaponType);
  const infiniteAmmo = Boolean(item.system.infiniteAmmo);
  const consumesAmmo = weaponType === "distance" && !infiniteAmmo;
  if (consumesAmmo) {
    const currentAmmo = Number(actor.system.ammo?.value);
    if (!Number.isFinite(currentAmmo) || currentAmmo <= 0) {
      ui.notifications?.warn(t("BLOODMAN.Notifications.NoAmmo"));
      return null;
    }
  }

  const rawDie = die.toString();
  const defaultFormula = normalizeDamageFormula(rawDie) || "1d4";
  const defaultBonus = getRawDamageBonus(actor);
  const config = await promptDamageConfiguration({
    actor,
    sourceName: item?.name || "",
    defaultFormula,
    defaultBonus,
    defaultPenetration: 0
  });
  if (!config) return null;

  const backendInput = buildDamageBackendInput(actor, config);
  console.debug("[bloodman] damage:input", backendInput);

  const rollId = generateRandomId();
  const damageOutcome = await evaluateConfiguredDamageOutcome(config);
  const roll = damageOutcome.roll;
  const totalDamage = damageOutcome.totalDamage;
  const sourceName = item?.name || "";

  if (consumesAmmo) {
    const currentAmmo = Number(actor.system.ammo?.value);
    const nextValue = Math.max(0, currentAmmo - 1);
    await updateActorWithFallback(actor, { "system.ammo.value": nextValue });
  }

  roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: buildDamageFlavor(actor, totalDamage, config, sourceName, damageOutcome.modeTag)
  });

  const applyResult = await applyDamageToTargets(
    actor,
    totalDamage,
    buildDamageApplyOptions(actor, config, damageOutcome, {
      sourceName,
      inputPayload: backendInput,
      rollId,
      itemId: item?.id || "",
      itemType: item?.type || "",
      itemName: sourceName,
      totalDamage
    })
  );
  return {
    roll,
    context: buildDamageRollContextResult(actor, config, damageOutcome, {
      rollId,
      itemId: item?.id || "",
      itemType: item?.type || "",
      itemName: sourceName,
      sourceName,
      totalDamage,
      targets: applyResult?.contextTargets || []
    })
  };
}

export async function doHealRoll(actor, item) {
  const die = item.system.healDie || "d4";
  const formula = normalizeDamageFormula(die) || "1d4";
  const roll = await new Roll(formula).evaluate();

  const current = Number(actor.system.resources?.pv?.current || 0);
  const max = Number(actor.system.resources?.pv?.max || 0);
  const nextValue = max > 0 ? Math.min(current + roll.total, max) : current + roll.total;

  await updateActorWithFallback(
    actor,
    { "system.resources.pv.current": nextValue },
    { allowVitalResourceUpdate: true }
  );

  roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: t("BLOODMAN.Rolls.Heal.Gain", { name: actor.name, amount: roll.total })
  });

  await deleteItemWithFallback(item, actor);
  return roll;
}

export async function doDirectDamageRoll(actor, formula, sourceName = "", options = {}) {
  if (!actor) return null;
  const defaultFormula = normalizeDamageFormula(formula) || "1d4";
  const defaultBonus = getRawDamageBonus(actor);
  const config = await promptDamageConfiguration({
    actor,
    sourceName,
    defaultFormula,
    defaultBonus,
    defaultPenetration: 0
  });
  if (!config) return null;

  if (typeof options.beforeRoll === "function") {
    let allowed = false;
    try {
      allowed = Boolean(await options.beforeRoll(config));
    } catch (error) {
      console.error("[bloodman] damage:beforeRoll failed", error);
      allowed = false;
    }
    if (!allowed) return null;
  }

  const backendInput = buildDamageBackendInput(actor, config);
  console.debug("[bloodman] damage:input", backendInput);

  const rollId = generateRandomId();
  const damageOutcome = await evaluateConfiguredDamageOutcome(config);
  const roll = damageOutcome.roll;
  const totalDamage = damageOutcome.totalDamage;
  const resolvedSource = sourceName || "";

  roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: buildDamageFlavor(actor, totalDamage, config, resolvedSource, damageOutcome.modeTag)
  });

  const applyResult = await applyDamageToTargets(
    actor,
    totalDamage,
    buildDamageApplyOptions(actor, config, damageOutcome, {
      sourceName: resolvedSource,
      inputPayload: backendInput,
      rollId,
      itemId: String(options?.itemId || ""),
      itemType: String(options?.itemType || ""),
      itemName: resolvedSource,
      totalDamage
    })
  );
  return {
    roll,
    context: buildDamageRollContextResult(actor, config, damageOutcome, {
      rollId,
      itemId: String(options?.itemId || ""),
      itemType: String(options?.itemType || ""),
      itemName: resolvedSource,
      sourceName: resolvedSource,
      totalDamage,
      targets: applyResult?.contextTargets || []
    })
  };
}

export async function doGrowthRoll(actor, key) {
  const effective = getEffectiveCharacteristic(actor, key);
  const base = Number(actor.system.characteristics?.[key]?.base || 0);

  const roll = await new Roll("1d100").evaluate();
  const success = roll.total > effective;
  const xpPath = `system.characteristics.${key}.xp`;
  const basePath = `system.characteristics.${key}.base`;

  await updateActorWithFallback(
    actor,
    {
      [basePath]: base + (success ? 1 : 0),
      [xpPath]: [false, false, false]
    },
    { allowCharacteristicBase: true }
  );

  roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: t("BLOODMAN.Rolls.Growth.Chat", {
      name: actor.name,
      key,
      roll: roll.total,
      effective,
      result: t(success ? "BLOODMAN.Rolls.Success" : "BLOODMAN.Rolls.Failure")
    })
  });

  return { roll, success, effective, grew: success };
}

