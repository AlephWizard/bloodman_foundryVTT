export const CHAT_ROLL_TYPES = Object.freeze({
  GENERIC: "generic",
  CHARACTERISTIC: "characteristic",
  DAMAGE: "damage",
  EXPERIENCE: "experience",
  HEAL: "heal",
  LUCK: "luck"
});

const CHAT_ROLL_TYPE_SET = new Set(Object.values(CHAT_ROLL_TYPES));

export function normalizeChatRollType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return CHAT_ROLL_TYPE_SET.has(normalized) ? normalized : CHAT_ROLL_TYPES.GENERIC;
}

export function buildChatRollFlags(chatRollType, extraBloodman = null) {
  const bloodmanFlags = { chatRollType: normalizeChatRollType(chatRollType) };
  if (extraBloodman && typeof extraBloodman === "object") Object.assign(bloodmanFlags, extraBloodman);
  return { bloodman: bloodmanFlags };
}
