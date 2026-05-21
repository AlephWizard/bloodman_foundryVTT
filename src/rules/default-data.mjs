export function createDefaultDataBuilders({ characteristics = [] } = {}) {
  const characteristicList = Array.isArray(characteristics) ? characteristics : [];
  const DEFAULT_CHARACTERISTIC_BASE = 30;

  function buildDefaultCharacteristics() {
    const result = {};
    for (const characteristic of characteristicList) {
      const key = String(characteristic?.key || "").trim();
      if (!key) continue;
      result[key] = { base: DEFAULT_CHARACTERISTIC_BASE, xp: [false, false, false] };
    }
    return result;
  }

  function buildMissingCharacteristicUpdates(currentCharacteristics) {
    const updates = {};
    if (!currentCharacteristics || typeof currentCharacteristics !== "object") {
      updates["system.characteristics"] = buildDefaultCharacteristics();
      return updates;
    }

    for (const characteristic of characteristicList) {
      const key = String(characteristic?.key || "").trim();
      if (!key) continue;
      const current = currentCharacteristics[key];
      if (!current || typeof current !== "object") {
        updates[`system.characteristics.${key}`] = { base: DEFAULT_CHARACTERISTIC_BASE, xp: [false, false, false] };
        continue;
      }
      const numericBase = Number(current.base);
      if (current.base == null || !Number.isFinite(numericBase)) {
        updates[`system.characteristics.${key}.base`] = DEFAULT_CHARACTERISTIC_BASE;
      }
      if (!Array.isArray(current.xp)) {
        updates[`system.characteristics.${key}.xp`] = [false, false, false];
      }
    }

    return updates;
  }

  function buildDefaultModifiers() {
    const result = { label: "", all: 0 };
    for (const characteristic of characteristicList) {
      const key = String(characteristic?.key || "").trim();
      if (!key) continue;
      result[key] = 0;
    }
    return result;
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
      carriedItemsMax: 10
    };
  }

  return {
    buildDefaultCharacteristics,
    buildMissingCharacteristicUpdates,
    buildDefaultModifiers,
    buildDefaultResources,
    buildDefaultProfile,
    buildDefaultEquipment
  };
}
