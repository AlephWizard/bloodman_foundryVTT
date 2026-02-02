// Helpers pour centraliser les jets (caractéristiques et dégâts)
const BONUS_KEYS = new Set(["MEL", "VIS", "ESP", "PHY", "MOU", "ADR", "PER", "SOC", "SAV"]);

function getItemBonus(actor, key) {
  if (!actor?.items) return 0;
  let total = 0;
  for (const item of actor.items) {
    if (item.type !== "aptitude" && item.type !== "pouvoir") continue;
    if (!item.system?.bonusEnabled) continue;
    if (item.system?.bonuses && Object.prototype.hasOwnProperty.call(item.system.bonuses, key)) {
      const bonus = Number(item.system.bonuses[key]);
      if (Number.isFinite(bonus)) total += bonus;
    }
    const legacyKey = (item.system?.charKey || "").toString().toUpperCase();
    if (legacyKey === key && BONUS_KEYS.has(legacyKey)) {
      const legacyBonus = Number(item.system?.charBonus);
      if (Number.isInteger(legacyBonus)) total += legacyBonus;
    }
  }
  return total;
}

function getEffectiveCharacteristic(actor, key) {
  const base = Number(actor.system.characteristics?.[key]?.base || 0);
  const globalMod = Number(actor.system.modifiers?.all || 0);
  const keyMod = Number(actor.system.modifiers?.[key] || 0);
  const itemBonus = getItemBonus(actor, key);
  return base + globalMod + keyMod + itemBonus;
}

export async function doCharacteristicRoll(actor, key) {
  const effective = getEffectiveCharacteristic(actor, key);

  const r = await new Roll("1d100").roll({ async: true });
  const success = r.total <= effective;
  r.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `<b>${actor.name}</b> – ${key}<br>${r.total} / ${effective} → <b>${success ? "RÉUSSITE" : "ÉCHEC"}</b>`
  });
  return { roll: r, success, effective };
}

async function applyDamageToTargets(sourceActor, total) {
  const targets = Array.from(game.user.targets || []);
  for (const token of targets) {
    const targetActor = token.actor;
    if (!targetActor) continue;
    if (!targetActor.isOwner) {
      ui.notifications?.warn(`Pas de droits pour modifier ${targetActor.name}.`);
      continue;
    }

    const pa = targetActor.items
      .filter(i => i.type === "protection")
      .reduce((sum, i) => sum + Number(i.system.pa || 0), 0);
    const finalDamage = Math.max(0, total - pa);
    const current = Number(targetActor.system.resources?.pv?.current || 0);
    const nextValue = Math.max(0, current - finalDamage);

    await targetActor.update({ "system.resources.pv.current": nextValue });

    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: targetActor }),
      content: `<strong>${targetActor.name}</strong> subit ${finalDamage} dégâts (PA ${pa})`
    });
  }
}

export async function doDamageRoll(actor, item) {
  const die = item.system.damageDie || "d4";
  const rawType = (item.system.weaponType || "poing").toString().toLowerCase();
  const weaponType = rawType.includes("blanche")
    ? "blanche"
    : rawType.includes("tactique")
      ? "tactique"
      : rawType.includes("jet")
        ? "jet"
        : rawType.includes("poing")
          ? "poing"
          : rawType;
  const consumesAmmo = weaponType === "jet" || weaponType === "poing" || weaponType === "tactique";
  if (consumesAmmo) {
    const currentAmmo = Number(actor.system.ammo?.value);
    if (!Number.isFinite(currentAmmo) || currentAmmo <= 0) {
      ui.notifications?.warn("Aucune munition disponible.");
      return null;
    }
  }

  const roll = await new Roll(`1${die}`).roll({ async: true });

  if (consumesAmmo) {
    const currentAmmo = Number(actor.system.ammo?.value);
    const nextValue = Math.max(0, currentAmmo - 1);
    await actor.update({ "system.ammo.value": nextValue });
  }

  roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `<strong>${actor.name}</strong> inflige ${roll.total} dégâts`
  });

  await applyDamageToTargets(actor, roll.total);
  return roll;
}

export async function doHealRoll(actor, item) {
  const die = item.system.healDie || "d4";
  const roll = await new Roll(`1${die}`).roll({ async: true });

  const current = Number(actor.system.resources?.pv?.current || 0);
  const max = Number(actor.system.resources?.pv?.max || 0);
  const nextValue = max > 0 ? Math.min(current + roll.total, max) : current + roll.total;

  await actor.update({ "system.resources.pv.current": nextValue });

  roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `<strong>${actor.name}</strong> récupère ${roll.total} PV`
  });

  if (item?.isOwner) {
    await item.delete();
  }
  return roll;
}

export async function doDirectDamageRoll(actor, formula, sourceName = "") {
  if (!actor) return null;
  const roll = await new Roll(formula).roll({ async: true });

  roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `<strong>${actor.name}</strong> inflige ${roll.total} dégâts${sourceName ? ` (${sourceName})` : ""}`
  });

  await applyDamageToTargets(actor, roll.total);
  return roll;
}

export async function doGrowthRoll(actor, key) {
  const effective = getEffectiveCharacteristic(actor, key);
  const base = Number(actor.system.characteristics?.[key]?.base || 0);

  const roll = await new Roll("1d100").roll({ async: true });
  const success = roll.total > effective;
  const xpPath = `system.characteristics.${key}.xp`;
  const basePath = `system.characteristics.${key}.base`;

  await actor.update({
    [basePath]: base + (success ? 1 : 0),
    [xpPath]: [false, false, false]
  });

  roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `<strong>${actor.name}</strong> Jet d'experience ${key}: ${roll.total} / ${effective} -> ${success ? "REUSSITE" : "ECHEC"}`
  });

  return { roll, success, effective, grew: success };
}
