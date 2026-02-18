export function createDefaultDataBuilders({ characteristics = [] } = {}) {
  const characteristicList = Array.isArray(characteristics) ? characteristics : [];

  function buildDefaultCharacteristics() {
    const result = {};
    for (const characteristic of characteristicList) {
      const key = String(characteristic?.key || "").trim();
      if (!key) continue;
      result[key] = { base: 50, xp: [false, false, false] };
    }
    return result;
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
      bagSlotsEnabled: false
    };
  }

  return {
    buildDefaultCharacteristics,
    buildDefaultModifiers,
    buildDefaultResources,
    buildDefaultProfile,
    buildDefaultEquipment
  };
}
