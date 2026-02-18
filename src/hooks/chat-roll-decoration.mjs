function defaultGetProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path).split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), object);
}

export function buildChatRollDecorationHooks({
  getGame,
  getCanvas,
  getProperty,
  normalizeChatRollType,
  chatRollTypes,
  t,
  tl,
  escapeChatMarkup,
  isHtmlElement
} = {}) {
  const resolveGame = typeof getGame === "function" ? getGame : () => globalThis.game;
  const resolveCanvas = typeof getCanvas === "function" ? getCanvas : () => globalThis.canvas;
  const readProperty = typeof getProperty === "function" ? getProperty : defaultGetProperty;
  const normalizeType = typeof normalizeChatRollType === "function"
    ? normalizeChatRollType
    : value => String(value || "").trim().toLowerCase();
  const types = chatRollTypes || {
    GENERIC: "generic",
    CHARACTERISTIC: "characteristic",
    DAMAGE: "damage",
    EXPERIENCE: "experience",
    HEAL: "heal",
    LUCK: "luck"
  };
  const translate = typeof t === "function" ? t : key => key;
  const translateWithFallback = typeof tl === "function" ? tl : (_key, fallback) => fallback;
  const escapeMarkup = typeof escapeChatMarkup === "function" ? escapeChatMarkup : value => String(value ?? "");
  const isDomElement = typeof isHtmlElement === "function"
    ? isHtmlElement
    : value => {
      if (!value) return false;
      if (typeof globalThis.HTMLElement === "function") return value instanceof globalThis.HTMLElement;
      return Boolean(value?.querySelector && value?.classList);
    };

  function getChatSpeakerTokenDocument(message) {
    if (!message) return null;
    const tokenId = String(message?.speaker?.token || "");
    if (!tokenId) return null;
    const canvasRef = resolveCanvas();
    const gameRef = resolveGame();
    const sceneId = String(message?.speaker?.scene || canvasRef?.scene?.id || "");
    const scene = sceneId ? gameRef?.scenes?.get(sceneId) : canvasRef?.scene;
    if (!scene) return null;
    return scene.tokens?.get(tokenId) || scene.tokens?.contents?.find(token => token.id === tokenId) || null;
  }

  function getChatSpeakerActor(message) {
    const gameRef = resolveGame();
    const actorId = String(message?.speaker?.actor || "");
    if (actorId) {
      const actor = gameRef?.actors?.get(actorId) || null;
      if (actor) return actor;
    }
    const tokenDoc = getChatSpeakerTokenDocument(message);
    return tokenDoc?.actor || (tokenDoc?.actorId ? gameRef?.actors?.get(tokenDoc.actorId) : null) || null;
  }

  function resolveChatTokenImage(actor, tokenDoc) {
    const tokenSrc = String(readProperty(tokenDoc, "texture.src") || "").trim();
    if (tokenSrc) return tokenSrc;
    const prototypeSrc = String(readProperty(actor, "prototypeToken.texture.src") || "").trim();
    if (prototypeSrc) return prototypeSrc;
    const actorImage = String(actor?.img || "").trim();
    if (actorImage) return actorImage;
    return "icons/svg/mystery-man.svg";
  }

  function normalizeChatCssColor(value, fallback = "#2f66d9") {
    const raw = String(value || "").trim();
    if (!raw) return fallback;
    const supportsApi = Boolean(globalThis.CSS && typeof globalThis.CSS.supports === "function");
    if (!supportsApi) return raw;
    return globalThis.CSS.supports("color", raw) ? raw : fallback;
  }

  function resolveChatAccentColor(message) {
    const gameRef = resolveGame();
    const userId = String(message?.user?.id || message?.user || "");
    const author = (userId ? gameRef?.users?.get(userId) : null) || message?.author || null;
    const raw = author?.color;
    if (typeof raw === "string" && raw.trim()) return normalizeChatCssColor(raw.trim());
    const cssValue = typeof raw?.css === "string"
      ? raw.css
      : (typeof raw?.css === "function" ? raw.css() : "");
    if (cssValue) return normalizeChatCssColor(cssValue);
    const fallback = String(raw || "").trim();
    if (fallback && fallback !== "[object Object]") return normalizeChatCssColor(fallback);
    return "#2f66d9";
  }

  function resolveChatPseudoName(actor, message) {
    const candidates = [
      readProperty(actor, "system.profile.pseudonyme"),
      readProperty(actor, "system.profile.pseudo"),
      actor?.name,
      message?.speaker?.alias,
      message?.alias
    ];
    for (const candidate of candidates) {
      const label = String(candidate || "").trim();
      if (label) return label;
    }
    return translate("BLOODMAN.Common.Name");
  }

  function resolveChatRollType(message) {
    const flaggedType = normalizeType(readProperty(message, "flags.bloodman.chatRollType"));
    if (flaggedType !== types.GENERIC) return flaggedType;
    if (readProperty(message, "flags.bloodman.luckRoll")) return types.LUCK;
    return types.GENERIC;
  }

  function resolveChatRollTypeLabel(chatRollType) {
    const type = normalizeType(chatRollType);
    if (type === types.CHARACTERISTIC) return translateWithFallback("BLOODMAN.Chat.RollTypes.Characteristic", "Caracteristique");
    if (type === types.DAMAGE) return translateWithFallback("BLOODMAN.Chat.RollTypes.Damage", "Degats");
    if (type === types.EXPERIENCE) return translateWithFallback("BLOODMAN.Chat.RollTypes.Experience", "Experience");
    if (type === types.HEAL) return translateWithFallback("BLOODMAN.Chat.RollTypes.Heal", "Soin");
    if (type === types.LUCK) return translateWithFallback("BLOODMAN.Chat.RollTypes.Luck", "Chance");
    return translateWithFallback("BLOODMAN.Chat.RollTypes.Generic", "Jet");
  }

  function toChatRollTypeClassSuffix(chatRollType) {
    const type = normalizeType(chatRollType);
    return /^[a-z0-9-]+$/.test(type) ? type : types.GENERIC;
  }

  function shouldDecorateChatRollMessage(message, actor) {
    if (!message) return false;
    const hasRoll = Array.isArray(message?.rolls) && message.rolls.length > 0;
    const hasLuckFlag = Boolean(readProperty(message, "flags.bloodman.luckRoll"));
    const hasChatRollTypeFlag = Boolean(String(readProperty(message, "flags.bloodman.chatRollType") || "").trim());
    if (!hasRoll && !hasLuckFlag && !hasChatRollTypeFlag) return false;
    const actorType = String(actor?.type || "");
    return actorType === "personnage" || actorType === "personnage-non-joueur" || hasLuckFlag || hasChatRollTypeFlag;
  }

  function decorateBloodmanChatRollMessage(message, html) {
    const root = html?.[0] || html;
    if (!isDomElement(root)) return;
    if (root.classList.contains("bm-chat-roll")) return;

    const actor = getChatSpeakerActor(message);
    if (!shouldDecorateChatRollMessage(message, actor)) return;
    const contentEl = root.querySelector(".message-content");
    if (!contentEl) return;
    if (contentEl.querySelector(".bm-chat-roll-frame")) return;

    const tokenDoc = getChatSpeakerTokenDocument(message);
    const tokenImage = resolveChatTokenImage(actor, tokenDoc);
    const pseudo = resolveChatPseudoName(actor, message);
    const accent = resolveChatAccentColor(message);
    const chatRollType = resolveChatRollType(message);
    const chatRollTypeClass = toChatRollTypeClassSuffix(chatRollType);
    const chatRollTypeLabel = resolveChatRollTypeLabel(chatRollType);

    const escapedPseudo = escapeMarkup(pseudo);
    const escapedImage = escapeMarkup(tokenImage);
    const escapedAccent = escapeMarkup(accent);
    const escapedTypeLabel = escapeMarkup(chatRollTypeLabel);
    const originalContent = contentEl.innerHTML;

    contentEl.innerHTML = `<div class="bm-chat-roll-frame" style="--bm-chat-roll-author-accent:${escapedAccent};">
    <div class="bm-chat-roll-head">
      <span class="bm-chat-roll-accent-band" aria-hidden="true"></span>
      <div class="bm-chat-roll-token"><img src="${escapedImage}" alt="${escapedPseudo}" /></div>
      <div class="bm-chat-roll-pseudo-wrap">
        <div class="bm-chat-roll-pseudo">${escapedPseudo}</div>
        <div class="bm-chat-roll-type">${escapedTypeLabel}</div>
      </div>
    </div>
    <div class="bm-chat-roll-inner bm-chat-roll-native">${originalContent}</div>
  </div>`;
    root.classList.add("bm-chat-roll", `bm-chat-roll--${chatRollTypeClass}`);
    root.dataset.bmChatRollType = chatRollTypeClass;
  }

  return {
    decorateBloodmanChatRollMessage,
    normalizeChatCssColor,
    resolveChatRollTypeLabel
  };
}
