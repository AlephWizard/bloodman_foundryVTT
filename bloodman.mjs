import { applyDamageToActor, doCharacteristicRoll, doDamageRoll, doDirectDamageRoll, doGrowthRoll, doHealRoll, getWeaponCategory, normalizeWeaponType } from "./rollHelpers.mjs";

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

const SYSTEM_SOCKET = "system.bloodman";
const CARRIED_ITEM_LIMIT = 10;
const CARRIED_ITEM_TYPES = new Set(["objet", "ration", "soin"]);
const CHARACTERISTIC_REROLL_PP_COST = 4;
const CHAOS_PER_PLAYER_REROLL = 1;
const CHAOS_COST_NPC_REROLL = 1;
const REROLL_VISIBILITY_MS = 5 * 60 * 1000;

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
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

function buildDefaultResources() {
  return {
    pv: { current: 0, max: 0, itemBonus: 0 },
    pp: { current: 0, max: 0, itemBonus: 0 },
    voyage: { current: 0, max: 0 },
    move: { value: 0 }
  };
}

function buildDefaultAmmo() {
  return { type: "", value: 0 };
}

function buildDefaultProfile() {
  return {
    archetype: "",
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

function getPlayerCountOnScene() {
  const scene = globalThis.canvas?.scene || game.scenes?.active;
  if (!scene) {
    const activePlayers = game.users?.filter(user => user.active && !user.isGM).length || 0;
    return Math.max(1, activePlayers);
  }
  const tokens = scene.tokens?.contents || Array.from(scene.tokens || []);
  const actorIds = new Set();
  for (const token of tokens) {
    const actor = token.actor;
    if (actor?.type === "personnage") actorIds.add(actor.id);
  }
  const count = actorIds.size;
  if (count > 0) return count;
  const activePlayers = game.users?.filter(user => user.active && !user.isGM).length || 0;
  return Math.max(1, activePlayers);
}

function getDerivedPvMax(actor, phyEffective, roleOverride) {
  if (actor?.type !== "personnage-non-joueur") return Math.round(phyEffective / 5);
  const role = ((roleOverride ?? actor.system?.npcRole) || "").toString();
  if (role === "sbire") return Math.round(phyEffective / 10);
  if (role === "sbire-fort") return Math.round(phyEffective / 5);
  if (role === "boss-seul") return Math.round(phyEffective / 5) * getPlayerCountOnScene();
  return Math.round(phyEffective / 5);
}

const PROCESSED_DAMAGE_REQUESTS = new Map();

function rememberDamageRequest(requestId) {
  if (!requestId) return;
  const now = Date.now();
  PROCESSED_DAMAGE_REQUESTS.set(requestId, now);
  for (const [key, value] of PROCESSED_DAMAGE_REQUESTS.entries()) {
    if (now - value > 2 * 60 * 1000) PROCESSED_DAMAGE_REQUESTS.delete(key);
  }
}

function wasDamageRequestProcessed(requestId) {
  if (!requestId) return false;
  return PROCESSED_DAMAGE_REQUESTS.has(requestId);
}

async function handleIncomingDamageRequest(data, source = "socket") {
  if (!data || !game.user.isGM) return;
  const requestId = typeof data.requestId === "string" ? data.requestId : "";
  if (requestId && wasDamageRequestProcessed(requestId)) return;
  if (requestId) rememberDamageRequest(requestId);

  console.debug("[bloodman] damage:recv", { source, ...data });

  let tokenDoc = null;
  if (data.tokenUuid) {
    const resolved = await fromUuid(data.tokenUuid).catch(() => null);
    tokenDoc = resolved?.document || resolved || null;
  }
  if (!tokenDoc && data.sceneId && data.tokenId) {
    const scene = game.scenes?.get(data.sceneId);
    tokenDoc = scene?.tokens?.get(data.tokenId) || null;
  }
  if (!tokenDoc && data.tokenId) {
    tokenDoc = canvas?.scene?.tokens?.get(data.tokenId) || null;
  }
  if (!tokenDoc && data.tokenId) {
    for (const scene of game.scenes || []) {
      const candidate = scene?.tokens?.get(data.tokenId);
      if (candidate) {
        tokenDoc = candidate;
        break;
      }
    }
  }
  let tokenActor = tokenDoc?.actor || null;
  if (!tokenActor && tokenDoc && typeof tokenDoc.getActor === "function") {
    tokenActor = await tokenDoc.getActor().catch(() => null);
  }
  if (!tokenActor && tokenDoc?.object?.actor) tokenActor = tokenDoc.object.actor;
  const uuidActor = data.actorUuid ? await fromUuid(data.actorUuid).catch(() => null) : null;
  const worldActor = data.actorId ? game.actors.get(data.actorId) : null;
  const share = Number(data.damage);
  if (!Number.isFinite(share) || share <= 0) return;
  const tokenIsLinked = data.targetActorLink === true || tokenDoc?.actorLink === true;
  const fallbackCurrent = Number(data.targetPvCurrent);
  const fallbackPA = Number(data.targetPA);
  const fallbackName = (data.targetName || tokenDoc?.name || "Cible").toString();

  if (tokenDoc && !tokenIsLinked) {
    const tokenDeltaCurrent = Number(foundry.utils.getProperty(tokenDoc, "delta.system.resources.pv.current"));
    const tokenActorDataCurrent = Number(foundry.utils.getProperty(tokenDoc, "actorData.system.resources.pv.current"));
    const tokenActorCurrent = Number(tokenActor?.system?.resources?.pv?.current);
    const current = Number.isFinite(fallbackCurrent)
      ? fallbackCurrent
      : (Number.isFinite(tokenActorCurrent)
        ? tokenActorCurrent
        : (Number.isFinite(tokenDeltaCurrent) ? tokenDeltaCurrent : tokenActorDataCurrent));
    if (!Number.isFinite(current)) return;
    const pa = Number.isFinite(fallbackPA) ? fallbackPA : 0;
    const finalDamage = Math.max(0, share - pa);
    const nextValue = Math.max(0, current - finalDamage);
    console.debug("[bloodman] damage:apply token-unlinked", { current, pa, share, finalDamage, nextValue, tokenId: tokenDoc.id });
    try {
      await tokenDoc.update({ "delta.system.resources.pv.current": nextValue });
    } catch (error) {
      console.error("[bloodman] damage:update tokenDoc failed", error);
    }
    if (tokenActor) {
      const actorCurrent = Number(tokenActor.system?.resources?.pv?.current);
      if (!Number.isFinite(actorCurrent) || actorCurrent !== nextValue) {
        try {
          await tokenActor.update({ "system.resources.pv.current": nextValue });
        } catch (error) {
          console.error("[bloodman] damage:update tokenActor failed", error);
        }
      }
    }
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker(),
      content: t("BLOODMAN.Rolls.Damage.Take", { name: fallbackName, amount: finalDamage, pa })
    });
    return;
  }

  if (tokenActor) {
    console.debug("[bloodman] damage:apply token-actor", { share, actorId: tokenActor.id, actorName: tokenActor.name });
    await applyDamageToActor(tokenActor, share);
    return;
  }
  if (uuidActor) {
    console.debug("[bloodman] damage:apply uuid-actor", { share, actorId: uuidActor.id, actorName: uuidActor.name });
    await applyDamageToActor(uuidActor, share);
    return;
  }
  if (worldActor) {
    console.debug("[bloodman] damage:apply world-actor", { share, actorId: worldActor.id, actorName: worldActor.name });
    await applyDamageToActor(worldActor, share);
    return;
  }
  if (Number.isFinite(fallbackCurrent)) {
    const pa = Number.isFinite(fallbackPA) ? fallbackPA : 0;
    const finalDamage = Math.max(0, share - pa);
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker(),
      content: t("BLOODMAN.Rolls.Damage.Take", { name: fallbackName, amount: finalDamage, pa })
    });
    return;
  }
  safeWarn(t("BLOODMAN.Notifications.DamageTargetResolveFailed"));
}


function registerDamageSocketHandlers() {
  if (globalThis.__bmDamageSocketReady || !game.socket) return;
  game.socket.on(SYSTEM_SOCKET, async data => {
    if (!data) return;
    if (!game.user.isGM) return;
    if (data.type === "adjustChaosDice") {
      const delta = Number(data.delta);
      if (!Number.isFinite(delta) || delta === 0) return;
      await setChaosValue(getChaosValue() + delta);
      return;
    }
    if (data.type !== "applyDamage") return;
    await handleIncomingDamageRequest(data, "socket");
  });
  globalThis.__bmDamageSocketReady = true;
}

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

  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("bloodman", BloodmanActorSheet, {
    types: ["personnage"],
    makeDefault: true
  });
  Actors.registerSheet("bloodman", BloodmanNpcSheet, {
    types: ["personnage-non-joueur"],
    makeDefault: true
  });

  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("bloodman", BloodmanItemSheet, {
    types: ["arme", "objet", "ration", "soin", "protection", "aptitude", "pouvoir"],
    makeDefault: true
  });
});

Hooks.once("ready", async () => {
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

    if (!actor.system.resources || actor.system.resources.voyage == null || actor.system.resources.move == null) {
      updates["system.resources"] = foundry.utils.mergeObject(
        buildDefaultResources(),
        actor.system.resources || {},
        { inplace: false }
      );
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
      const protoSrc = foundry.utils.getProperty(actor.prototypeToken, "texture.src");
      if (isMissingTokenImage(protoSrc) && actor.img) {
        updates["prototypeToken.texture.src"] = actor.img;
      }
    }

    if (Object.keys(updates).length) await actor.update(updates);
    await applyItemResourceBonuses(actor);

    for (const item of actor.items) {
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
    for (const scene of game.scenes) {
      for (const token of scene.tokens) {
        const actorType = token.actor?.type;
        if (actorType === "personnage" && !token.actorLink) {
          await token.update({ actorLink: true });
        }
        if (actorType === "personnage-non-joueur" && token.actorLink) {
          await token.update({ actorLink: false });
        }
        if (actorType === "personnage" || actorType === "personnage-non-joueur") {
          const tokenSrc = foundry.utils.getProperty(token, "texture.src");
          if (isMissingTokenImage(tokenSrc) && token.actor?.img) {
            await token.update({ "texture.src": token.actor.img });
          }
        }
      }
    }
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
  if (!game.socket) return;
  game.socket.emit(SYSTEM_SOCKET, { type: "adjustChaosDice", delta: numeric });
}

function updateChaosDiceUI(value) {
  const root = document.getElementById("bm-chaos-dice");
  if (!root) return;
  const display = root.querySelector(".bm-chaos-value");
  if (display) display.textContent = String(clampChaosValue(value));
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

Hooks.on("createItem", (item) => {
  if (!item?.actor) return;
  if (item.type !== "aptitude" && item.type !== "pouvoir") return;
  applyItemResourceBonuses(item.actor);
});

Hooks.on("createChatMessage", async (message) => {
  if (!game.user.isGM) return;
  const payload = foundry.utils.getProperty(message, "flags.bloodman.damageRequest");
  if (!payload) return;
  await handleIncomingDamageRequest(payload, "chat");
  if (message.isOwner) await message.delete().catch(() => null);
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

  if (Object.keys(updates).length) await actor.update(updates);
}

async function applyPowerCost(actor, item) {
  if (!actor || !item) return true;
  if (item.type !== "pouvoir") return true;
  if (!item.system?.damageEnabled || !item.system?.powerCostEnabled) return true;
  if (!actor.isOwner) return false;
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
  await actor.update({ "system.resources.pp.current": nextValue });
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
    data.displayDamageDie = /^\d/.test(rawDie) ? rawDie : `1${rawDie}`;
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
  const actorType = doc.actor?.type;
  if (actorType === "personnage") doc.updateSource({ actorLink: true });
  if (actorType === "personnage-non-joueur") doc.updateSource({ actorLink: false });
});

Hooks.on("preUpdateActor", (actor, updateData) => {
  if (actor.type !== "personnage" && actor.type !== "personnage-non-joueur") return;

  const getUpdatedNumber = (path, fallback) => {
    const value = foundry.utils.getProperty(updateData, path);
    if (value == null) return toFiniteNumber(fallback, 0);
    return toFiniteNumber(value, fallback);
  };

  const itemBonuses = getItemBonusTotals(actor);
  const storedPvBonus = getUpdatedNumber("system.resources.pv.itemBonus", actor.system.resources?.pv?.itemBonus || 0);
  const storedPpBonus = getUpdatedNumber("system.resources.pp.itemBonus", actor.system.resources?.pp?.itemBonus || 0);
  const getEffective = key => {
    const base = getUpdatedNumber(`system.characteristics.${key}.base`, actor.system.characteristics?.[key]?.base || 0);
    const globalMod = getUpdatedNumber("system.modifiers.all", actor.system.modifiers?.all || 0);
    const keyMod = getUpdatedNumber(`system.modifiers.${key}`, actor.system.modifiers?.[key] || 0);
    const itemBonus = Number(itemBonuses?.[key] || 0);
    return Number(base) + Number(globalMod) + Number(keyMod) + itemBonus;
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
});

Hooks.on("updateActor", async (actor, changes) => {
  if (actor.type !== "personnage" && actor.type !== "personnage-non-joueur") return;
  if (foundry.utils.getProperty(changes, "system.resources.move.value") != null) return;
  const hasCharBaseChange = CHARACTERISTICS.some(c => {
    return foundry.utils.getProperty(changes, `system.characteristics.${c.key}.base`) != null;
  });
  const hasModChange = foundry.utils.getProperty(changes, "system.modifiers") != null;
  const hasNpcRoleChange = foundry.utils.getProperty(changes, "system.npcRole") != null;
  if (!hasCharBaseChange && !hasModChange && !hasNpcRoleChange) return;

  const itemBonuses = getItemBonusTotals(actor);
  const base = toFiniteNumber(actor.system.characteristics?.MOU?.base, 0);
  const globalMod = toFiniteNumber(actor.system.modifiers?.all, 0);
  const keyMod = toFiniteNumber(actor.system.modifiers?.MOU, 0);
  const effective = base + globalMod + keyMod + toFiniteNumber(itemBonuses.MOU, 0);
  const moveValue = Math.round(effective / 5);

  await actor.update({ "system.resources.move.value": moveValue });

  const phyEffective = toFiniteNumber(actor.system.characteristics?.PHY?.base, 0)
    + toFiniteNumber(actor.system.modifiers?.all, 0)
    + toFiniteNumber(actor.system.modifiers?.PHY, 0)
    + toFiniteNumber(itemBonuses.PHY, 0);
  const espEffective = toFiniteNumber(actor.system.characteristics?.ESP?.base, 0)
    + toFiniteNumber(actor.system.modifiers?.all, 0)
    + toFiniteNumber(actor.system.modifiers?.ESP, 0)
    + toFiniteNumber(itemBonuses.ESP, 0);
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

class BloodmanActorSheet extends ActorSheet {
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

  getData() {
    const data = super.getData();
    const modifiers = data.actor.system.modifiers || buildDefaultModifiers();
    const rerollKey = this._lastCharacteristicRollKey || "";
    const characteristicRerollActive = this.isRerollWindowActive(this._lastCharacteristicRollAt);
    const itemRerollActive = this.isRerollWindowActive(this._lastItemReroll?.at);
    const activeRerollKey = characteristicRerollActive ? rerollKey : "";
    const lastItemRerollId = itemRerollActive ? (this._lastItemReroll?.itemId || "") : "";
    const isPlayerActor = data.actor.type === "personnage";
    const isNpcActor = data.actor.type === "personnage-non-joueur";
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
      const effective = base + flat + itemBonus;
      const xpReady = xp.every(Boolean);
      const showReroll = canUseCharacteristicReroll && activeRerollKey === c.key;
      const showRerollClear = isPlayerActor && showReroll;
      return { key: c.key, label, icon: c.icon, base, effective, itemBonus, xp, xpReady, showReroll, showRerollClear };
    });
    const totalPoints = characteristics.reduce((sum, c) => sum + Number(c.base || 0), 0);

    const phy = characteristics.find(c => c.key === "PHY")?.effective ?? 0;
    const esp = characteristics.find(c => c.key === "ESP")?.effective ?? 0;
    const mou = characteristics.find(c => c.key === "MOU")?.effective ?? 0;
    const moveValue = Math.round(mou / 5);
    const pvBase = getDerivedPvMax(this.actor, phy);

    const resources = foundry.utils.mergeObject(buildDefaultResources(), data.actor.system.resources || {}, {
      inplace: false
    });
    resources.pv.max = Math.max(0, toFiniteNumber(resources.pv.max, pvBase));
    resources.pp.max = Math.max(0, toFiniteNumber(resources.pp.max, Math.round(esp / 5)));
    resources.pv.current = Math.max(0, Math.min(toFiniteNumber(resources.pv.current, 0), resources.pv.max));
    resources.pp.current = Math.max(0, Math.min(toFiniteNumber(resources.pp.current, 0), resources.pp.max));
    resources.move.value = moveValue;

    const moveChar = characteristics.find(c => c.key === "MOU");
    if (moveChar) {
      moveChar.moveValue = moveValue;
      moveChar.showMoveValue = true;
    }

    const profile = foundry.utils.mergeObject(buildDefaultProfile(), data.actor.system.profile || {}, {
      inplace: false
    });
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
      heal.showItemReroll = shouldShowItemReroll(item.id);
      return heal;
    });
    const carriedItemsCount = itemBuckets.objet.length + itemBuckets.soin.length + itemBuckets.ration.length;
    const equipmentTwoColumns = carriedItemsCount >= 6;

    return {
      ...data,
      characteristics,
      totalPoints,
      modifiers,
      resources,
      profile,
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
      equipmentTwoColumns
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

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
      const item = this.actor.items.get(li.dataset.itemId);
      this.rollDamage(item);
    });

    html.find(".ability-roll").click(ev => {
      const li = ev.currentTarget.closest(".item");
      const item = this.actor.items.get(li.dataset.itemId);
      this.rollAbilityDamage(item);
    });

    html.find(".item-delete").click(ev => {
      const li = ev.currentTarget.closest(".item");
      const item = this.actor.items.get(li.dataset.itemId);
      if (!item) return;
      item.delete();
    });

    html.find(".item-edit").click(ev => {
      const li = ev.currentTarget.closest(".item");
      const item = this.actor.items.get(li.dataset.itemId);
      item?.sheet?.render(true);
    });

    html.find(".item-use").click(ev => {
      const li = ev.currentTarget.closest(".item");
      const item = this.actor.items.get(li.dataset.itemId);
      this.useItem(item);
    });

    html.find(".item-reroll").click(ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const li = ev.currentTarget.closest(".item");
      const itemId = li?.dataset?.itemId;
      this.rerollItemRoll(itemId);
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
      await this.actor.update({ "system.equipment.transportNpcs": nextRefs });
    });

    html.find(".xp-check input").change(async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const input = ev.currentTarget;
      const row = input.closest(".char-row");
      const key = row?.dataset?.key;
      const index = Number(input.dataset.index);
      if (!key || !Number.isFinite(index)) return;
      const xp = Array.isArray(this.actor.system.characteristics?.[key]?.xp)
        ? [...this.actor.system.characteristics[key].xp]
        : [false, false, false];
      xp[index] = Boolean(input.checked);
      await this.actor.update({ [`system.characteristics.${key}.xp`]: xp });
      const ready = xp.length === 3 && xp.every(Boolean);
      if (ready) setTimeout(() => this.promptGrowthRoll(key), 0);
    });

    html.find(".xp-roll").click(ev => {
      const key = ev.currentTarget.dataset.key;
      this.rollGrowth(key);
    });
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
    await this.actor.update({ "system.equipment.transportNpcs": [...refs, ref] });
    return true;
  }

  async rollLuck() {
    if (this.actor.type !== "personnage") return;

    const roll = await new Roll("2d100").evaluate();
    const results = roll?.dice?.[0]?.results || [];
    const chanceValue = Number(results[0]?.result || 0);
    const luckValue = Number(results[1]?.result || 0);
    const success = luckValue <= chanceValue;
    const outcome = t(success ? "BLOODMAN.Rolls.Success" : "BLOODMAN.Rolls.Failure");

    roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: t("BLOODMAN.Rolls.Luck.Chat", {
        name: this.actor.name,
        chance: chanceValue,
        roll: luckValue,
        result: outcome
      })
    });
  }

  async handleCharacteristicRoll(key) {
    if (!key) return;
    this.markCharacteristicReroll(key);
    await doCharacteristicRoll(this.actor, key);
    await this.markXpProgress(key);
    this.render(false);
  }

  async rerollCharacteristic(key) {
    if (!key) return;

    if (this.actor.type === "personnage") {
      if (this._lastCharacteristicRollKey !== key || !this.isRerollWindowActive(this._lastCharacteristicRollAt)) return;
      const currentPP = toFiniteNumber(this.actor.system.resources?.pp?.current, 0);
      if (!Number.isFinite(currentPP) || currentPP < CHARACTERISTIC_REROLL_PP_COST) {
        ui.notifications?.warn(t("BLOODMAN.Notifications.NotEnoughPPReroll", { cost: CHARACTERISTIC_REROLL_PP_COST }));
        return;
      }

      await this.actor.update({ "system.resources.pp.current": Math.max(0, currentPP - CHARACTERISTIC_REROLL_PP_COST) });
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
    const xp = Array.isArray(this.actor.system.characteristics?.[key]?.xp)
      ? [...this.actor.system.characteristics[key].xp]
      : [false, false, false];
    const index = xp.findIndex(value => !value);
    if (index === -1) return;
    xp[index] = true;
    await this.actor.update({ [`system.characteristics.${key}.xp`]: xp });
    if (xp.length === 3 && xp.every(Boolean)) this.promptGrowthRoll(key);
  }

  async rollDamage(item) {
    if (!item) return;
    const result = await doDamageRoll(this.actor, item);
    if (!result) return;
    this.markItemReroll(item.id);
    this.render(false);
  }

  async rollAbilityDamage(item) {
    if (!item) return;
    const canRoll = await applyPowerCost(this.actor, item);
    if (!canRoll) return;
    const die = (item.system.damageDie || "d4").toString();
    const formula = /^\d/.test(die) ? die : `1${die}`;
    const result = await doDirectDamageRoll(this.actor, formula, item.name);
    if (!result) return;
    this.markItemReroll(item.id);
    this.render(false);
  }

  async useItem(item) {
    if (!item) return;
    if (item.type === "soin") {
      const result = await doHealRoll(this.actor, item);
      if (result && this.actor.items.get(item.id)) this.markItemReroll(item.id);
    }
    if (item.type === "ration" && item.isOwner) await item.delete();
  }

  async rerollItemRoll(itemId) {
    if (!itemId) return;
    const item = this.actor.items.get(itemId);
    if (!item) return;
    const isPlayerActor = this.actor.type === "personnage";
    const isNpcActor = this.actor.type === "personnage-non-joueur";

    if (isPlayerActor) {
      if (this._lastItemReroll?.itemId !== itemId || !this.isRerollWindowActive(this._lastItemReroll?.at)) return;
      const currentPP = toFiniteNumber(this.actor.system.resources?.pp?.current, 0);
      if (currentPP < CHARACTERISTIC_REROLL_PP_COST) {
        ui.notifications?.warn(t("BLOODMAN.Notifications.NotEnoughPPReroll", { cost: CHARACTERISTIC_REROLL_PP_COST }));
        return;
      }
      await this.actor.update({ "system.resources.pp.current": Math.max(0, currentPP - CHARACTERISTIC_REROLL_PP_COST) });
      const rolled = await this.performItemRerollRoll(item);
      if (!rolled) return;
      await requestChaosDelta(CHAOS_PER_PLAYER_REROLL);
      this.markItemReroll(item.id);
      this.render(false);
      return;
    }

    if (!isNpcActor || !game.user.isGM) return;
    if (this._lastItemReroll?.itemId !== itemId || !this.isRerollWindowActive(this._lastItemReroll?.at)) return;
    const currentChaos = getChaosValue();
    if (currentChaos < CHAOS_COST_NPC_REROLL) {
      ui.notifications?.warn(t("BLOODMAN.Notifications.NotEnoughChaosReroll"));
      this.render(false);
      return;
    }
    const rolled = await this.performItemRerollRoll(item);
    if (!rolled) return;
    await setChaosValue(currentChaos - CHAOS_COST_NPC_REROLL);
    this.markItemReroll(item.id);
    this.render(false);
  }

  isRerollWindowActive(timestamp) {
    const value = Number(timestamp);
    if (!Number.isFinite(value) || value <= 0) return false;
    return Date.now() - value < REROLL_VISIBILITY_MS;
  }

  scheduleRerollExpiry(kind) {
    const timerKey = kind === "item" ? "_itemRerollTimer" : "_charRerollTimer";
    if (this[timerKey]) {
      clearTimeout(this[timerKey]);
      this[timerKey] = null;
    }

    const timestamp = kind === "item" ? this._lastItemReroll?.at : this._lastCharacteristicRollAt;
    if (!this.isRerollWindowActive(timestamp)) return;
    const remaining = Math.max(0, REROLL_VISIBILITY_MS - (Date.now() - Number(timestamp)));
    this[timerKey] = setTimeout(() => {
      if (kind === "item") this._lastItemReroll = null;
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

  markItemReroll(itemId) {
    if (!itemId) return;
    this._lastItemReroll = { itemId, at: Date.now() };
    this.scheduleRerollExpiry("item");
  }

  async performItemRerollRoll(item) {
    if (!item) return false;

    if (item.type === "arme") {
      const die = (item.system?.damageDie || "d4").toString();
      const formula = /^\d/.test(die) ? die : `1${die}`;
      const result = await doDirectDamageRoll(this.actor, formula, item.name);
      return Boolean(result);
    }

    if (item.type === "aptitude" || item.type === "pouvoir") {
      if (!item.system?.damageEnabled || !item.system?.damageDie) return false;
      const die = item.system.damageDie.toString();
      const formula = /^\d/.test(die) ? die : `1${die}`;
      const result = await doDirectDamageRoll(this.actor, formula, item.name);
      return Boolean(result);
    }

    if (item.type === "soin") {
      const die = (item.system?.healDie || "d4").toString();
      const formula = /^\d/.test(die) ? die : `1${die}`;
      const roll = await new Roll(formula).evaluate();
      const current = toFiniteNumber(this.actor.system.resources?.pv?.current, 0);
      const max = toFiniteNumber(this.actor.system.resources?.pv?.max, current);
      const nextValue = max > 0 ? Math.min(current + roll.total, max) : current + roll.total;
      await this.actor.update({ "system.resources.pv.current": nextValue });
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
    await doGrowthRoll(this.actor, key);
  }

  promptGrowthRoll(key) {
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
      this.actor.update({ "system.npcRole": nextRole });
    });
  }
}

class BloodmanItemSheet extends ItemSheet {
  get template() {
    return `systems/bloodman/templates/item-${this.item.type}.html`;
  }

  async getData(options) {
    const data = await super.getData(options);
    if (this.item.type === "arme") {
      const weaponType = getWeaponCategory(this.item.system?.weaponType);
      data.weaponTypeDistance = weaponType === "distance";
      data.weaponTypeMelee = weaponType === "corps";
    }
    return data;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["bloodman", "sheet", "item"],
      width: 640,
      height: 480,
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
    const canRoll = await applyPowerCost(this.item.actor, this.item);
    if (!canRoll) return;
    const die = (this.item.system.damageDie || "d4").toString();
    const formula = /^\d/.test(die) ? die : `1${die}`;
    await doDirectDamageRoll(this.item.actor, formula, this.item.name);
  }
}
