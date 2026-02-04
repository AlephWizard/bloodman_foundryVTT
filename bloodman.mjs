import { applyDamageToActor, doCharacteristicRoll, doDamageRoll, doDirectDamageRoll, doGrowthRoll, doHealRoll, getWeaponCategory, normalizeWeaponType } from "./rollHelpers.mjs";

const CHARACTERISTICS = [
  { key: "MEL", label: "MÊLÉE", icon: "fa-hand-fist" },
  { key: "VIS", label: "VISÉE", icon: "fa-crosshairs" },
  { key: "ESP", label: "ESPRIT", icon: "fa-brain" },
  { key: "PHY", label: "PHYSIQUE", icon: "fa-heart-pulse" },
  { key: "MOU", label: "MOUVEMENT", icon: "fa-person-running" },
  { key: "ADR", label: "ADRESSE", icon: "fa-hand" },
  { key: "PER", label: "PERCEPTION", icon: "fa-eye" },
  { key: "SOC", label: "SOCIAL", icon: "fa-users" },
  { key: "SAV", label: "SAVOIR", icon: "fa-book-open" }
];

const SYSTEM_SOCKET = "system.bloodman";

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
    transports: ""
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


function registerDamageSocketHandlers() {
  if (globalThis.__bmDamageSocketReady || !game.socket) return;
  game.socket.on(SYSTEM_SOCKET, async data => {
    if (!data || data.type !== "applyDamage") return;
    if (!game.user.isGM) return;
    const token = data.tokenUuid ? await fromUuid(data.tokenUuid) : null;
    const targetActor = token?.actor || (data.actorId ? game.actors.get(data.actorId) : null);
    if (!targetActor) return;
    const share = Number(data.damage);
    if (!Number.isFinite(share) || share <= 0) return;
    await applyDamageToActor(targetActor, share);
  });
  globalThis.__bmDamageSocketReady = true;
}

Hooks.once("init", () => {
  game.settings.register("bloodman", "chaosDice", {
    name: "Des du chaos",
    scope: "world",
    config: false,
    type: Number,
    default: 0,
    onChange: value => {
      updateChaosDiceUI(typeof value === "number" ? value : Number(value));
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
    types: ["arme", "objet", "soin", "protection", "aptitude", "pouvoir"],
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
        await item.update({ "system.weaponType": "arme à distance" });
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
    ui.notifications?.warn("Pas assez de points de puissance pour lancer ce pouvoir.");
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<strong>${actor.name}</strong> inflige 0 dégâts (${item.name})`
    });
    return false;
  }
  const nextValue = Math.max(0, current - cost);
  await actor.update({ "system.resources.pp.current": nextValue });
  return true;
}

function buildItemDisplayData(item) {
  const data = item.toObject();
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

Hooks.on("preCreateToken", (doc) => {
  const actorType = doc.actor?.type;
  if (actorType === "personnage") doc.updateSource({ actorLink: true });
  if (actorType === "personnage-non-joueur") doc.updateSource({ actorLink: false });
});

Hooks.on("preUpdateActor", (actor, updateData) => {
  if (actor.type !== "personnage" && actor.type !== "personnage-non-joueur") return;

  const getUpdatedNumber = (path, fallback) => {
    const value = foundry.utils.getProperty(updateData, path);
    if (value == null) return fallback;
    return Number(value);
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
  const finalPvMax = Number.isFinite(storedPvMax) ? storedPvMax : pvMax;
  const finalPpMax = Number.isFinite(storedPpMax) ? storedPpMax : ppMax;
  const allowedPvMax = Math.max(0, finalPvMax);
  const allowedPpMax = Math.max(0, finalPpMax);

  const pvCurrentPath = "system.resources.pv.current";
  const ppCurrentPath = "system.resources.pp.current";

  if (foundry.utils.getProperty(updateData, pvCurrentPath) != null) {
    const nextValue = Math.min(getUpdatedNumber(pvCurrentPath, 0), allowedPvMax);
    foundry.utils.setProperty(updateData, pvCurrentPath, Math.max(0, nextValue));
  }

  if (foundry.utils.getProperty(updateData, ppCurrentPath) != null) {
    const nextValue = Math.min(getUpdatedNumber(ppCurrentPath, 0), allowedPpMax);
    foundry.utils.setProperty(updateData, ppCurrentPath, Math.max(0, nextValue));
  }
});

Hooks.on("updateActor", async (actor, changes) => {
  if (actor.type !== "personnage" && actor.type !== "personnage-non-joueur") return;
  if (foundry.utils.getProperty(changes, "system.resources.move.value") != null) return;
  const hasCharChange = foundry.utils.getProperty(changes, "system.characteristics") != null;
  const hasModChange = foundry.utils.getProperty(changes, "system.modifiers") != null;
  const hasNpcRoleChange = foundry.utils.getProperty(changes, "system.npcRole") != null;
  if (!hasCharChange && !hasModChange && !hasNpcRoleChange) return;

  const itemBonuses = getItemBonusTotals(actor);
  const base = Number(actor.system.characteristics?.MOU?.base || 0);
  const globalMod = Number(actor.system.modifiers?.all || 0);
  const keyMod = Number(actor.system.modifiers?.MOU || 0);
  const effective = base + globalMod + keyMod + Number(itemBonuses.MOU || 0);
  const moveValue = Math.round(effective / 5);

  await actor.update({ "system.resources.move.value": moveValue });

  const phyEffective = Number(actor.system.characteristics?.PHY?.base || 0)
    + Number(actor.system.modifiers?.all || 0)
    + Number(actor.system.modifiers?.PHY || 0)
    + Number(itemBonuses.PHY || 0);
  const espEffective = Number(actor.system.characteristics?.ESP?.base || 0)
    + Number(actor.system.modifiers?.all || 0)
    + Number(actor.system.modifiers?.ESP || 0)
    + Number(itemBonuses.ESP || 0);
  const derivedPvMax = getDerivedPvMax(actor, phyEffective);
  const derivedPpMax = Math.round(espEffective / 5);
  const storedPvBonus = Number(actor.system.resources?.pv?.itemBonus || 0);
  const storedPpBonus = Number(actor.system.resources?.pp?.itemBonus || 0);
  const derivedPvTotal = derivedPvMax + storedPvBonus;
  const derivedPpTotal = derivedPpMax + storedPpBonus;
  const pvMax = Number.isFinite(actor.system.resources?.pv?.max) ? Number(actor.system.resources.pv.max) : derivedPvTotal;
  const ppMax = Number.isFinite(actor.system.resources?.pp?.max) ? Number(actor.system.resources.pp.max) : derivedPpTotal;
  const pvCurrent = Number(actor.system.resources?.pv?.current || 0);
  const ppCurrent = Number(actor.system.resources?.pp?.current || 0);
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
      template: "systems/bloodman/templates/actor-personnage.html",
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

    const itemBonuses = getItemBonusTotals(data.actor);
    const characteristics = CHARACTERISTICS.map(c => {
      const base = Number(data.actor.system.characteristics?.[c.key]?.base || 0);
      const xp = Array.isArray(data.actor.system.characteristics?.[c.key]?.xp)
        ? data.actor.system.characteristics[c.key].xp
        : [false, false, false];
      const flat = Number(modifiers.all || 0) + Number(modifiers[c.key] || 0);
      const itemBonus = Number(itemBonuses[c.key] || 0);
      const effective = base + flat + itemBonus;
      const xpReady = xp.every(Boolean);
      return { key: c.key, label: c.label, icon: c.icon, base, effective, itemBonus, xp, xpReady };
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
    if (resources.pv.max == null || Number.isNaN(Number(resources.pv.max))) {
      resources.pv.max = pvBase;
    }
    if (resources.pp.max == null || Number.isNaN(Number(resources.pp.max))) {
      resources.pp.max = Math.round(esp / 5);
    }
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

    const itemBuckets = {
      arme: [],
      objet: [],
      soin: [],
      protection: [],
      aptitude: [],
      pouvoir: []
    };
    for (const item of this.actor.items) {
      if (itemBuckets[item.type]) itemBuckets[item.type].push(item);
    }

    const aptitudes = itemBuckets.aptitude.map(buildItemDisplayData);
    const pouvoirs = itemBuckets.pouvoir.map(buildItemDisplayData);

    const npcRole = data.actor.system.npcRole || "";

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
      weapons: itemBuckets.arme,
      objects: itemBuckets.objet,
      soins: itemBuckets.soin,
      protections: itemBuckets.protection,
      aptitudes,
      pouvoirs,
      ammo
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find(".char-icon").click(ev => {
      const row = ev.currentTarget.closest(".char-row");
      const key = row?.dataset?.key;
      this.handleCharacteristicRoll(key);
    });

    html.find(".char-roll").click(ev => {
      const key = ev.currentTarget.dataset.key;
      this.handleCharacteristicRoll(key);
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

  async handleCharacteristicRoll(key) {
    if (!key) return;
    await doCharacteristicRoll(this.actor, key);
    await this.markXpProgress(key);
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
    await doDamageRoll(this.actor, item);
  }

  async rollAbilityDamage(item) {
    if (!item) return;
    const canRoll = await applyPowerCost(this.actor, item);
    if (!canRoll) return;
    const die = (item.system.damageDie || "d4").toString();
    const formula = /^\d/.test(die) ? die : `1${die}`;
    await doDirectDamageRoll(this.actor, formula, item.name);
  }

  async useItem(item) {
    if (!item) return;
    if (item.type === "soin") await doHealRoll(this.actor, item);
  }

  async rollGrowth(key) {
    if (!key) return;
    await doGrowthRoll(this.actor, key);
  }

  promptGrowthRoll(key) {
    const label = CHARACTERISTICS.find(c => c.key === key)?.label || key;
    new Dialog({
      title: "Jet d'expérience",
      content: `<p>Lancer un jet d'expérience pour <strong>${label}</strong> ?</p>`,
      buttons: {
        roll: {
          label: "Lancer",
          callback: async () => this.rollGrowth(key)
        },
        cancel: {
          label: "Annuler"
        }
      },
      default: "roll"
    }).render(true);
  }
}

class BloodmanNpcSheet extends BloodmanActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: "systems/bloodman/templates/actor-personnage-non-joueur.html"
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
      ui.notifications?.warn("Cette aptitude/pouvoir n'est pas lié à un acteur.");
      return;
    }
    const canRoll = await applyPowerCost(this.item.actor, this.item);
    if (!canRoll) return;
    const die = (this.item.system.damageDie || "d4").toString();
    const formula = /^\d/.test(die) ? die : `1${die}`;
    await doDirectDamageRoll(this.item.actor, formula, this.item.name);
  }
}
