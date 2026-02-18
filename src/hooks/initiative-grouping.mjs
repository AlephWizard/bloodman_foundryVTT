export function buildInitiativeGroupingHooks({
  initiativeGroupBufferMs,
  getProperty,
  getCombatantDisplayName,
  escapeChatMarkup,
  getGame,
  createChatMessage
} = {}) {
  const resolveMs = Number.isFinite(Number(initiativeGroupBufferMs))
    ? Number(initiativeGroupBufferMs)
    : 180;
  const readProperty = typeof getProperty === "function"
    ? getProperty
    : (object, path) => {
      if (!object || !path) return undefined;
      return String(path).split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), object);
    };
  const resolveGame = typeof getGame === "function" ? getGame : () => globalThis.game;
  const writeChatMessage = typeof createChatMessage === "function"
    ? createChatMessage
    : async data => ChatMessage.create(data);
  const formatCombatantDisplayName = typeof getCombatantDisplayName === "function"
    ? getCombatantDisplayName
    : combatant => combatant?.name || "";
  const escapeMarkup = typeof escapeChatMarkup === "function"
    ? escapeChatMarkup
    : value => String(value ?? "");
  const initiativeGroupBuffer = new Map();

  function isInitiativeRollMessage(message) {
    if (!message) return false;
    if (readProperty(message, "flags.bloodman.initiativeGroupSummary")) return false;
    const coreFlag = readProperty(message, "flags.core.initiativeRoll");
    if (coreFlag != null) return Boolean(coreFlag);
    if (!message.speaker?.combatant) return false;
    if (!Array.isArray(message.rolls) || message.rolls.length === 0) return false;
    const flavor = String(message.flavor || "").toLowerCase();
    return flavor.includes("initiative");
  }

  function getInitiativeRollTotalFromMessage(message, combat) {
    const roll = Array.isArray(message?.rolls) && message.rolls.length ? message.rolls[0] : null;
    const total = Number(roll?.total);
    if (Number.isFinite(total)) return total;
    const combatantId = message?.speaker?.combatant;
    const combatant = combatantId ? combat?.combatants?.get(combatantId) : null;
    const initiative = Number(combatant?.initiative);
    return Number.isFinite(initiative) ? initiative : 0;
  }

  function getInitiativeNameFromMessage(message, combat) {
    const combatantId = message?.speaker?.combatant;
    const combatant = combatantId ? combat?.combatants?.get(combatantId) : null;
    if (combatant) return formatCombatantDisplayName(combatant) || combatant.name || message?.speaker?.alias || "Combattant";
    return message?.speaker?.alias || message?.alias || "Combattant";
  }

  async function flushInitiativeGroupBuffer(key) {
    const entry = initiativeGroupBuffer.get(key);
    if (!entry) return;
    initiativeGroupBuffer.delete(key);
    if (entry.timer) clearTimeout(entry.timer);

    const messages = entry.messages.filter(message => message && !message.deleted);
    if (messages.length <= 1) return;

    const gameRef = resolveGame();
    const combat = gameRef?.combats?.get(entry.combatId) || gameRef?.combat || null;
    const rows = messages.map(message => ({
      name: getInitiativeNameFromMessage(message, combat),
      total: getInitiativeRollTotalFromMessage(message, combat)
    }));
    rows.sort((a, b) => Number(b.total) - Number(a.total));

    const contentRows = rows
      .map(row => {
        const safeName = escapeMarkup(row.name);
        const safeTotal = escapeMarkup(String(row.total));
        return `<li><b>${safeName}</b> : ${safeTotal}</li>`;
      })
      .join("");
    await writeChatMessage({
      speaker: { alias: combat?.name || "Initiative" },
      content: `<div class="bm-initiative-group"><p><b>Initiatives (Lancer pour tous)</b></p><ul>${contentRows}</ul></div>`,
      flags: { bloodman: { initiativeGroupSummary: true } }
    }).catch(() => null);

    for (const message of messages) {
      if (!message?.id || !message.isOwner) continue;
      await message.delete().catch(() => null);
    }
  }

  function queueInitiativeRollMessage(message) {
    const gameRef = resolveGame();
    const combatId = String(message?.speaker?.combat || gameRef?.combat?.id || "");
    if (!combatId) return;
    const key = `${combatId}:${gameRef?.user?.id || ""}`;
    const existing = initiativeGroupBuffer.get(key);
    if (existing) {
      existing.messages.push(message);
      if (existing.timer) clearTimeout(existing.timer);
      existing.timer = setTimeout(() => {
        flushInitiativeGroupBuffer(key);
      }, resolveMs);
      return;
    }
    const timer = setTimeout(() => {
      flushInitiativeGroupBuffer(key);
    }, resolveMs);
    initiativeGroupBuffer.set(key, { combatId, messages: [message], timer });
  }

  return {
    isInitiativeRollMessage,
    queueInitiativeRollMessage,
    flushInitiativeGroupBuffer
  };
}
