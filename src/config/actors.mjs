export const PLAYER_ZERO_PV_STATE_PRESET_ID = "body-injured";

export const CHARACTERISTICS = [
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

export const CHARACTERISTIC_KEYS = new Set(CHARACTERISTICS.map(characteristic => characteristic.key));

export const STATE_MODIFIER_PATHS = [
  "system.modifiers.all",
  "system.modifiers.label",
  ...CHARACTERISTICS.map(characteristic => `system.modifiers.${characteristic.key}`)
];

export const STATE_PRESETS = [
  {
    id: "psychic-1",
    category: "psychic",
    name: "NIV 1 : INQUIETUDE (12h)",
    shortName: "INQUIETUDE",
    duration: "12h",
    description: "",
    modifierAll: -2,
    modifierByKey: {}
  },
  {
    id: "psychic-2",
    category: "psychic",
    name: "NIV 2 : ANGOISSE (24h)",
    shortName: "ANGOISSE",
    duration: "24h",
    description: "",
    modifierAll: -4,
    modifierByKey: {}
  },
  {
    id: "psychic-3",
    category: "psychic",
    name: "NIV 3 : EFFROI (72h)",
    shortName: "EFFROI",
    duration: "72h",
    description: "",
    modifierAll: -6,
    modifierByKey: {}
  },
  {
    id: "psychic-4",
    category: "psychic",
    name: "NIV 4 : PANIQUE (168h)",
    shortName: "PANIQUE",
    duration: "168h",
    description: "",
    modifierAll: -8,
    modifierByKey: {}
  },
  {
    id: "psychic-5",
    category: "psychic",
    name: "NIV 5 : DELIRES (720h)",
    shortName: "DELIRES",
    duration: "720h",
    description: "",
    modifierAll: -10,
    modifierByKey: {}
  },
  {
    id: "psychic-6",
    category: "psychic",
    name: "NIV 6 : ALIENATION (87600h)",
    shortName: "ALIENATION",
    duration: "87600h",
    description: "",
    modifierAll: -12,
    modifierByKey: {}
  },
  {
    id: "psychic-7",
    category: "psychic",
    name: "NIV 7 : FOLIE",
    shortName: "FOLIE",
    duration: "",
    description: "Vous devenez fou.",
    modifierAll: 0,
    modifierByKey: {}
  },
  {
    id: PLAYER_ZERO_PV_STATE_PRESET_ID,
    category: "body",
    name: "BLESSE",
    shortName: "BLESSE",
    duration: "",
    description: "",
    modifierAll: -30,
    modifierByKey: {}
  },
  {
    id: "body-hunger",
    category: "body",
    name: "FAIM",
    shortName: "FAIM",
    duration: "",
    description: "",
    modifierAll: 0,
    modifierByKey: { MOU: -10, PHY: -10, ADR: -10, SOC: -10 }
  },
  {
    id: "body-thirst",
    category: "body",
    name: "SOIF",
    shortName: "SOIF",
    duration: "",
    description: "",
    modifierAll: 0,
    modifierByKey: { MOU: -20, PHY: -20, ADR: -20, SOC: -20 }
  },
  {
    id: "body-drowsy",
    category: "body",
    name: "SOMNOLENT",
    shortName: "SOMNOLENT",
    duration: "",
    description: "",
    modifierAll: 0,
    modifierByKey: { MOU: -40, PHY: -40, ADR: -40 }
  },
  {
    id: "body-sick",
    category: "body",
    name: "MALADE",
    shortName: "MALADE",
    duration: "",
    description: "",
    modifierAll: -10,
    modifierByKey: {}
  },
  {
    id: "body-hypothermia",
    category: "body",
    name: "HYPOTHERMIE",
    shortName: "HYPOTHERMIE",
    duration: "",
    description: "",
    modifierAll: 0,
    modifierByKey: { MEL: -30, MOU: -30, PHY: -30, ADR: -30 }
  },
  {
    id: "body-hyperthermia",
    category: "body",
    name: "HYPERTHERMIE",
    shortName: "HYPERTHERMIE",
    duration: "",
    description: "",
    modifierAll: 0,
    modifierByKey: { MEL: -30, MOU: -30, PHY: -30, ADR: -30 }
  }
];

export const STATE_PRESET_BY_ID = new Map(STATE_PRESETS.map(preset => [preset.id, preset]));
export const STATE_PRESET_ORDER = STATE_PRESETS.map(preset => preset.id);
