import { doCharacteristicRoll, doDamageRoll, doGrowthRoll, doHealRoll } from "./rollHelpers.mjs";

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
  const modifiers = { label: "", all: 0, HAL: 0 };
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

function buildDefaultAmmoPool() {
  return [{ type: "", value: 0 }];
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

    if (!actor.system.modifiers) {
      updates["system.modifiers"] = buildDefaultModifiers();
    } else if (actor.system.modifiers.HAL == null) {
      updates["system.modifiers.HAL"] = 0;
    }

    if (!actor.system.resources || actor.system.resources.voyage == null || actor.system.resources.move == null) {
      updates["system.resources"] = foundry.utils.mergeObject(
        buildDefaultResources(),
        actor.system.resources || {},
        { inplace: false }
      );
    }

    if (!Array.isArray(actor.system.ammoPool)) updates["system.ammoPool"] = buildDefaultAmmoPool();
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

Hooks.on("preUpdateActor", (actor, updateData) => {
  if (actor.type !== "personnage") return;

  const getUpdatedNumber = (path, fallback) => {
    const value = foundry.utils.getProperty(updateData, path);
    if (value == null) return fallback;
    return Number(value);
  };

  const getEffective = key => {
    const base = getUpdatedNumber(`system.characteristics.${key}.base`, actor.system.characteristics?.[key]?.base || 0);
    const globalMod = getUpdatedNumber("system.modifiers.all", actor.system.modifiers?.all || 0);
    const keyMod = getUpdatedNumber(`system.modifiers.${key}`, actor.system.modifiers?.[key] || 0);
    return Number(base) + Number(globalMod) + Number(keyMod);
  };

  const pvMax = Math.round(getEffective("PHY") / 5);
  const ppMax = Math.round(getEffective("ESP") / 5);

  const pvCurrentPath = "system.resources.pv.current";
  const ppCurrentPath = "system.resources.pp.current";

  if (foundry.utils.getProperty(updateData, pvCurrentPath) != null) {
    const nextValue = Math.min(getUpdatedNumber(pvCurrentPath, 0), pvMax);
    foundry.utils.setProperty(updateData, pvCurrentPath, Math.max(0, nextValue));
  }

  if (foundry.utils.getProperty(updateData, ppCurrentPath) != null) {
    const nextValue = Math.min(getUpdatedNumber(ppCurrentPath, 0), ppMax);
    foundry.utils.setProperty(updateData, ppCurrentPath, Math.max(0, nextValue));
  }
});

Hooks.on("updateActor", async (actor, changes) => {
  if (actor.type !== "personnage") return;
  if (foundry.utils.getProperty(changes, "system.modifiers.label") === "Blessé") return;
  if (foundry.utils.getProperty(changes, "system.resources.move.value") != null) return;
  const hasCharChange = foundry.utils.getProperty(changes, "system.characteristics") != null;
  const hasModChange = foundry.utils.getProperty(changes, "system.modifiers") != null;
  if (!hasCharChange && !hasModChange) return;

  const base = Number(actor.system.characteristics?.MOU?.base || 0);
  const globalMod = Number(actor.system.modifiers?.all || 0);
  const keyMod = Number(actor.system.modifiers?.MOU || 0);
  const effective = base + globalMod + keyMod;
  const moveValue = Math.round(effective / 5);

  await actor.update({ "system.resources.move.value": moveValue });

  const phyEffective = Number(actor.system.characteristics?.PHY?.base || 0)
    + Number(actor.system.modifiers?.all || 0)
    + Number(actor.system.modifiers?.PHY || 0);
  const espEffective = Number(actor.system.characteristics?.ESP?.base || 0)
    + Number(actor.system.modifiers?.all || 0)
    + Number(actor.system.modifiers?.ESP || 0);
  const pvMax = Math.round(phyEffective / 5);
  const ppMax = Math.round(espEffective / 5);
  const pvCurrent = Number(actor.system.resources?.pv?.current || 0);
  const ppCurrent = Number(actor.system.resources?.pp?.current || 0);

  const resourceUpdates = {};
  if (pvCurrent > pvMax) resourceUpdates["system.resources.pv.current"] = pvMax;
  if (ppCurrent > ppMax) resourceUpdates["system.resources.pp.current"] = ppMax;
  if (Object.keys(resourceUpdates).length) await actor.update(resourceUpdates);

  if (Number(actor.system.resources?.pv?.current || 0) <= 0) {
    const isAlready = actor.system.modifiers?.label === "Blessé" && Number(actor.system.modifiers?.HAL || 0) === -30;
    if (!isAlready) {
      await actor.update({
        "system.modifiers.HAL": -30,
        "system.modifiers.label": "Blessé"
      });
    }
  }
});

class BloodmanActorSheet extends ActorSheet {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      classes: ["bloodman", "sheet", "actor"],
      template: "systems/bloodman/templates/actor-personnage.html",
      width: 1050,
      height: 760,
      submitOnChange: true
    });
  }

  getData() {
    const data = super.getData();
    const modifiers = data.actor.system.modifiers || buildDefaultModifiers();

    const characteristics = CHARACTERISTICS.map(c => {
      const base = Number(data.actor.system.characteristics?.[c.key]?.base || 0);
      const xp = Array.isArray(data.actor.system.characteristics?.[c.key]?.xp)
        ? data.actor.system.characteristics[c.key].xp
        : [false, false, false];
      const flat = Number(modifiers.all || 0) + Number(modifiers[c.key] || 0);
      const effective = base + flat;
      const xpReady = xp.every(Boolean);
      return { key: c.key, label: c.label, icon: c.icon, base, effective, xp, xpReady };
    });

    const phy = characteristics.find(c => c.key === "PHY")?.effective ?? 0;
    const esp = characteristics.find(c => c.key === "ESP")?.effective ?? 0;
    const mou = characteristics.find(c => c.key === "MOU")?.effective ?? 0;
    const moveValue = Math.round(mou / 5);

    const resources = foundry.utils.mergeObject(buildDefaultResources(), data.actor.system.resources || {}, {
      inplace: false
    });
    resources.pv.max = Math.round(phy / 5);
    resources.pp.max = Math.round(esp / 5);
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
    const ammo = Array.isArray(data.actor.system.ammoPool) ? data.actor.system.ammoPool : buildDefaultAmmoPool();

    return {
      ...data,
      characteristics,
      modifiers,
      resources,
      profile,
      equipment,
      weapons: this.actor.items.filter(i => i.type === "arme"),
      objects: this.actor.items.filter(i => i.type === "objet"),
      soins: this.actor.items.filter(i => i.type === "soin"),
      protections: this.actor.items.filter(i => i.type === "protection"),
      aptitudes: this.actor.items.filter(i => i.type === "aptitude"),
      pouvoirs: this.actor.items.filter(i => i.type === "pouvoir"),
      ammo
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find(".char-icon").click(ev => {
      const row = ev.currentTarget.closest(".char-row");
      const key = row?.dataset?.key;
      this.tryGrowthRoll(key);
    });

    html.find(".char-roll").click(ev => {
      const key = ev.currentTarget.dataset.key;
      doCharacteristicRoll(this.actor, key);
    });

    html.find(".weapon-roll").click(ev => {
      const li = ev.currentTarget.closest(".item");
      const item = this.actor.items.get(li.dataset.itemId);
      this.rollDamage(item);
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
      if (!ev.currentTarget.checked) return;
      const checks = Array.from(row.querySelectorAll("input[type='checkbox']"));
      const ready = checks.length === 3 && checks.every(input => input.checked);
      if (ready) this.promptGrowthRoll(key);
    });

    html.find(".xp-roll").click(ev => {
      const key = ev.currentTarget.dataset.key;
      this.rollGrowth(key);
    });
  }

  async rollDamage(item) {
    await doDamageRoll(this.actor, item);
  }

  async useItem(item) {
    if (!item) return;
    if (item.type === "soin") await doHealRoll(this.actor, item);
  }

  async rollGrowth(key) {
    if (!key) return;
    await doGrowthRoll(this.actor, key);
  }

  tryGrowthRoll(key) {
    if (!key) return;
    const xp = this.actor.system.characteristics?.[key]?.xp || [];
    const ready = Array.isArray(xp) && xp.length === 3 && xp.every(Boolean);
    if (!ready) return;
    this.promptGrowthRoll(key);
  }

  promptGrowthRoll(key) {
    const label = CHARACTERISTICS.find(c => c.key === key)?.label || key;
    new Dialog({
      title: "G d'expérience",
      content: `<p>Lancer un G d'expérience pour <strong>${label}</strong> ?</p>`,
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
      width: 540,
      height: 260,
      submitOnChange: true
    });
  }
}
