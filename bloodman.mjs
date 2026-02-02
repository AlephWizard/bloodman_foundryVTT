import { doCharacteristicRoll, doDamageRoll, doDirectDamageRoll, doGrowthRoll, doHealRoll } from "./rollHelpers.mjs";

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
    pv: { current: 0, max: 0 },
    pp: { current: 0, max: 0 },
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

Hooks.once("init", () => {
  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("bloodman", BloodmanActorSheet, {
    types: ["personnage"],
    makeDefault: true
  });

  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("bloodman", BloodmanItemSheet, {
    types: ["arme", "objet", "soin", "protection", "aptitude", "pouvoir"],
    makeDefault: true
  });
});

Hooks.once("ready", async () => {
  for (const actor of game.actors) {
    if (actor.type !== "personnage") continue;

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
    if (actor.prototypeToken && actor.prototypeToken.actorLink === false) {
      updates["prototypeToken.actorLink"] = true;
    }

    if (Object.keys(updates).length) await actor.update(updates);
  }

  if (game.user.isGM) {
    for (const scene of game.scenes) {
      for (const token of scene.tokens) {
        if (token.actorLink) continue;
        if (token.actor?.type !== "personnage") continue;
        await token.update({ actorLink: true });
      }
    }
  }
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

Hooks.on("preCreateToken", (doc) => {
  if (doc.actor?.type !== "personnage") return;
  doc.updateSource({ actorLink: true });
});

Hooks.on("preUpdateActor", (actor, updateData) => {
  if (actor.type !== "personnage") return;

  const getUpdatedNumber = (path, fallback) => {
    const value = foundry.utils.getProperty(updateData, path);
    if (value == null) return fallback;
    return Number(value);
  };

  const itemBonuses = getItemBonusTotals(actor);
  const getEffective = key => {
    const base = getUpdatedNumber(`system.characteristics.${key}.base`, actor.system.characteristics?.[key]?.base || 0);
    const globalMod = getUpdatedNumber("system.modifiers.all", actor.system.modifiers?.all || 0);
    const keyMod = getUpdatedNumber(`system.modifiers.${key}`, actor.system.modifiers?.[key] || 0);
    const itemBonus = Number(itemBonuses?.[key] || 0);
    return Number(base) + Number(globalMod) + Number(keyMod) + itemBonus;
  };

  const pvMax = Math.round(getEffective("PHY") / 5);
  const ppMax = Math.round(getEffective("ESP") / 5);
  const storedPvMax = getUpdatedNumber("system.resources.pv.max", actor.system.resources?.pv?.max);
  const storedPpMax = getUpdatedNumber("system.resources.pp.max", actor.system.resources?.pp?.max);
  const finalPvMax = Number.isFinite(storedPvMax) ? storedPvMax : pvMax;
  const finalPpMax = Number.isFinite(storedPpMax) ? storedPpMax : ppMax;

  const pvCurrentPath = "system.resources.pv.current";
  const ppCurrentPath = "system.resources.pp.current";

  if (foundry.utils.getProperty(updateData, pvCurrentPath) != null) {
    const nextValue = Math.min(getUpdatedNumber(pvCurrentPath, 0), finalPvMax);
    foundry.utils.setProperty(updateData, pvCurrentPath, Math.max(0, nextValue));
  }

  if (foundry.utils.getProperty(updateData, ppCurrentPath) != null) {
    const nextValue = Math.min(getUpdatedNumber(ppCurrentPath, 0), finalPpMax);
    foundry.utils.setProperty(updateData, ppCurrentPath, Math.max(0, nextValue));
  }
});

Hooks.on("updateActor", async (actor, changes) => {
  if (actor.type !== "personnage") return;
  if (foundry.utils.getProperty(changes, "system.resources.move.value") != null) return;
  const hasCharChange = foundry.utils.getProperty(changes, "system.characteristics") != null;
  const hasModChange = foundry.utils.getProperty(changes, "system.modifiers") != null;
  if (!hasCharChange && !hasModChange) return;

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
  const derivedPvMax = Math.round(phyEffective / 5);
  const derivedPpMax = Math.round(espEffective / 5);
  const pvMax = Number.isFinite(actor.system.resources?.pv?.max) ? Number(actor.system.resources.pv.max) : derivedPvMax;
  const ppMax = Number.isFinite(actor.system.resources?.pp?.max) ? Number(actor.system.resources.pp.max) : derivedPpMax;
  const pvCurrent = Number(actor.system.resources?.pv?.current || 0);
  const ppCurrent = Number(actor.system.resources?.pp?.current || 0);

  const resourceUpdates = {};
  const pvMaxChange = foundry.utils.getProperty(changes, "system.resources.pv.max") != null;
  const ppMaxChange = foundry.utils.getProperty(changes, "system.resources.pp.max") != null;
  if (!pvMaxChange && derivedPvMax !== pvMax) resourceUpdates["system.resources.pv.max"] = derivedPvMax;
  if (!ppMaxChange && derivedPpMax !== ppMax) resourceUpdates["system.resources.pp.max"] = derivedPpMax;
  if (pvCurrent > pvMax) resourceUpdates["system.resources.pv.current"] = pvMax;
  if (ppCurrent > ppMax) resourceUpdates["system.resources.pp.current"] = ppMax;
  if (Object.keys(resourceUpdates).length) await actor.update(resourceUpdates);

});

class BloodmanActorSheet extends ActorSheet {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      classes: ["bloodman", "sheet", "actor"],
      template: "systems/bloodman/templates/actor-personnage.html",
      width: 1050,
      height: 760,
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

    const resources = foundry.utils.mergeObject(buildDefaultResources(), data.actor.system.resources || {}, {
      inplace: false
    });
    if (resources.pv.max == null || Number.isNaN(Number(resources.pv.max))) {
      resources.pv.max = Math.round(phy / 5);
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

    return {
      ...data,
      characteristics,
      totalPoints,
      modifiers,
      resources,
      profile,
      equipment,
      weapons: itemBuckets.arme,
      objects: itemBuckets.objet,
      soins: itemBuckets.soin,
      protections: itemBuckets.protection,
      aptitudes: itemBuckets.aptitude,
      pouvoirs: itemBuckets.pouvoir,
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

    html.find(".xp-check input").change(ev => {
      const row = ev.currentTarget.closest(".char-row");
      const key = row?.dataset?.key;
      if (!key) return;
      const checks = Array.from(row.querySelectorAll("input[type='checkbox']"));
      const ready = checks.length === 3 && checks.every(input => input.checked);
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

class BloodmanItemSheet extends ItemSheet {
  get template() {
    return `systems/bloodman/templates/item-${this.item.type}.html`;
  }

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      classes: ["bloodman", "sheet", "item"],
      width: 640,
      height: 260,
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
    const die = (this.item.system.damageDie || "d4").toString();
    const formula = /^\d/.test(die) ? die : `1${die}`;
    await doDirectDamageRoll(this.item.actor, formula, this.item.name);
  }
}
