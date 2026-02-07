/* Bloodman - Macro automate de voyance (diffusion globale)
 * Usage:
 * 1) Creez une macro de type "Script".
 * 2) Collez ce code et executez-la.
 */

(async () => {
  const SYSTEM_SOCKET = "system.bloodman";
  const AUTO_CLOSE_MS = 6500;
  const ANSWER_DELAY_MS = 240;
  const BACKGROUND_SRC = "systems/bloodman/images/des_destin.png";
  const VOYANCE_REQUEST_CHAT_MARKUP = "<span style='display:none'>bloodman-voyance-request</span>";

  const roll = await new Roll("1d20").evaluate({ async: true });
  const total = Number(roll.total || 0);
  const answer = total <= 10 ? "oui" : "non";
  const answerUpper = answer.toUpperCase();
  const requestId = foundry.utils?.randomID ? foundry.utils.randomID() : Math.random().toString(36).slice(2);

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker(),
    flavor: `<strong>Automate de voyance</strong><br>Resultat: <strong>${answerUpper}</strong>`
  });
  const payload = {
    type: "voyanceOverlay",
    requestId,
    answer,
    // Keep text rendering in the crystal ball (no external yes/no assets).
    answerSrc: "",
    backgroundSrc: BACKGROUND_SRC,
    senderId: String(game.user?.id || ""),
    autoCloseMs: AUTO_CLOSE_MS,
    answerDelayMs: ANSWER_DELAY_MS
  };

  const localHandler = globalThis.__bmHandleVoyanceOverlayRequest;
  if (typeof localHandler === "function") {
    await localHandler(payload, "macro-local");
  } else {
    ui.notifications?.warn("Handler voyance indisponible: mettez le systeme Bloodman a jour.");
  }

  if (!game.socket) {
    ui.notifications?.warn("Socket Foundry indisponible: diffusion globale non effectuee.");
  } else {
    game.socket.emit(SYSTEM_SOCKET, payload);
  }
  await ChatMessage.create({
    content: VOYANCE_REQUEST_CHAT_MARKUP,
    flags: { bloodman: { voyanceOverlayRequest: payload } }
  }).catch(() => null);
})();
