export const SYSTEM_ID = "bloodman";
export const SYSTEM_ROOT_PATH = `systems/${SYSTEM_ID}`;
export const SYSTEM_SOCKET = `system.${SYSTEM_ID}`;

export const PLAYER_ACTOR_TYPE = "personnage";
export const NPC_ACTOR_TYPE = "personnage-non-joueur";

export const PLAYER_ACTOR_SHEET_TEMPLATE_PATH = `${SYSTEM_ROOT_PATH}/templates/actor-joueur.html`;
export const NPC_ACTOR_SHEET_TEMPLATE_PATH = `${SYSTEM_ROOT_PATH}/templates/actor-non-joueur.html`;
export const ITEM_SHEET_TEMPLATE_PATH = `${SYSTEM_ROOT_PATH}/templates/item-unified.html`;

export const ACTOR_LOGO_PARTIAL_PATH = `${SYSTEM_ROOT_PATH}/templates/partials/actor-logo.html`;
export const ACTOR_TABS_PARTIAL_PATH = `${SYSTEM_ROOT_PATH}/templates/partials/actor-tabs.html`;
export const SYSTEM_TEMPLATE_PARTIAL_PATHS = Object.freeze([
  ACTOR_LOGO_PARTIAL_PATH,
  ACTOR_TABS_PARTIAL_PATH
]);

export const SYSTEM_ITEM_TYPES = Object.freeze([
  "arme",
  "objet",
  "ration",
  "soin",
  "protection",
  "aptitude",
  "pouvoir"
]);

export const CHAOS_DICE_ICON_SRC = `${SYSTEM_ROOT_PATH}/images/d20_destin.svg`;
export const CHAOS_DICE_ICON_FALLBACK_SRC = "icons/svg/d20.svg";
