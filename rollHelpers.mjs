// Helpers pour centraliser les jets (caractéristiques et dégâts)
export async function doCharacteristicRoll(actor, key) {
  const base = Number(actor.system.characteristics?.[key]?.base || 0);
  const globalMod = Number(actor.system.modifiers?.all || 0);
  const keyMod = Number(actor.system.modifiers?.[key] || 0);
  const effective = base + globalMod + keyMod;

  const r = await new Roll("1d100").roll({ async: true });
  const success = r.total <= effective;
  r.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `<b>${actor.name}</b> – ${key}<br>${r.total} / ${effective} → <b>${success ? "RÉUSSITE" : "ÉCHEC"}</b>`
  });
  return { roll: r, success, effective };
}

export async function doDamageRoll(actor, item) {
  const die = item.system.damageDie || "d4";
  const roll = await new Roll(`1${die}`).roll({ async: true });

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
  const consumesAmmo = weaponType !== "blanche";
  if (consumesAmmo) {
    const ammo = actor.system.ammoPool?.[0];
    const currentAmmo = ammo ? Number(ammo.value) : NaN;
    if (Number.isFinite(currentAmmo) && currentAmmo > 0) {
      const nextValue = Math.max(0, currentAmmo - 1);
      await actor.update({ "system.ammoPool.0.value": nextValue });
    }
  }

  roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `<strong>${actor.name}</strong> inflige ${roll.total} dégâts`
  });

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
    const finalDamage = Math.max(0, roll.total - pa);
    const current = Number(targetActor.system.resources?.pv?.current || 0);
    const nextValue = Math.max(0, current - finalDamage);

    await targetActor.update({ "system.resources.pv.current": nextValue });

    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: targetActor }),
      content: `<strong>${targetActor.name}</strong> subit ${finalDamage} dégâts (PA ${pa})`
    });
  }
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

export async function doGrowthRoll(actor, key) {
  const base = Number(actor.system.characteristics?.[key]?.base || 0);
  const globalMod = Number(actor.system.modifiers?.all || 0);
  const keyMod = Number(actor.system.modifiers?.[key] || 0);
  const effective = base + globalMod + keyMod;

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
    flavor: `<strong>${actor.name}</strong> G d'expérience ${key}: ${roll.total} / ${effective} → ${success ? "RÉUSSITE" : "ÉCHEC"}`
  });

  return { roll, success, effective, grew: success };
}
