export function buildChatRelayHelpers({
  getCurrentUser,
  getMessagesCollection,
  toFiniteNumber,
  scheduleTimeout,
  getProperty,
  isHtmlElement
} = {}) {
  const resolveCurrentUser = typeof getCurrentUser === "function"
    ? getCurrentUser
    : () => globalThis.game?.user;
  const resolveMessagesCollection = typeof getMessagesCollection === "function"
    ? getMessagesCollection
    : () => globalThis.game?.messages;
  const parseFiniteNumber = typeof toFiniteNumber === "function"
    ? toFiniteNumber
    : (value, fallback = 0) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
    };
  const runTimeout = typeof scheduleTimeout === "function"
    ? scheduleTimeout
    : (callback, timeout) => setTimeout(callback, timeout);
  const readProperty = typeof getProperty === "function"
    ? getProperty
    : (object, path) => {
      if (!object || !path) return undefined;
      return String(path).split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), object);
    };
  const isDomElement = typeof isHtmlElement === "function"
    ? isHtmlElement
    : value => {
      if (!value) return false;
      if (typeof globalThis.HTMLElement === "function") return value instanceof globalThis.HTMLElement;
      return Boolean(value?.style && value?.classList);
    };

  function isCurrentUserChatMessageAuthor(message) {
    const localUserId = String(resolveCurrentUser()?.id || "").trim();
    const messageUserId = String(message?.user?.id || message?.user || message?.author?.id || "").trim();
    if (localUserId && messageUserId) return localUserId === messageUserId;
    return Boolean(message?.isAuthor);
  }

  function scheduleTransientChatMessageDeletion(message, delayMs = 250) {
    const messageId = String(message?.id || "").trim();
    if (!messageId) return;
    if (!isCurrentUserChatMessageAuthor(message)) return;
    const timeout = Math.max(0, Math.floor(parseFiniteNumber(delayMs, 250)));
    runTimeout(() => {
      const existing = resolveMessagesCollection()?.get(messageId);
      if (!existing) return;
      if (!isCurrentUserChatMessageAuthor(existing)) return;
      existing.delete().catch(() => null);
    }, timeout);
  }

  function isTransportRelayChatMessage(message) {
    const bloodmanFlags = readProperty(message, "flags.bloodman") || {};
    if (!bloodmanFlags || typeof bloodmanFlags !== "object") return false;
    if (bloodmanFlags.damageConfigPopup) return true;
    if (bloodmanFlags.powerUsePopup) return true;
    if (bloodmanFlags.damageRequest) return true;
    if (bloodmanFlags.chaosDeltaRequest) return true;
    if (bloodmanFlags.rerollDamageRequest) return true;

    const content = String(message?.content || "").toLowerCase();
    if (!content) return false;
    return content.includes("bloodman-damage-config-popup")
      || content.includes("bloodman-power-use-popup")
      || content.includes("bloodman-damage-request")
      || content.includes("bloodman-chaos-request")
      || content.includes("bloodman-reroll-request");
  }

  function hideTransientRelayChatMessage(htmlLike) {
    const root = htmlLike?.[0] || htmlLike;
    if (!isDomElement(root)) return;
    root.style.display = "none";
    root.classList.add("bm-chat-relay-hidden");
  }

  return {
    isCurrentUserChatMessageAuthor,
    scheduleTransientChatMessageDeletion,
    isTransportRelayChatMessage,
    hideTransientRelayChatMessage
  };
}
