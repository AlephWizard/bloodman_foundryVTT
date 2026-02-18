import { getDamagePayloadField as sharedGetDamagePayloadField } from "./damage-payload-fields.mjs";

export function buildDamageTargetResolution({
  getDamagePayloadField,
  compatFromUuid,
  getGame,
  getCanvas
} = {}) {
  const readPayloadField = typeof getDamagePayloadField === "function"
    ? getDamagePayloadField
    : sharedGetDamagePayloadField;
  const resolveFromUuid = typeof compatFromUuid === "function"
    ? compatFromUuid
    : async () => null;
  const resolveGame = typeof getGame === "function" ? getGame : () => globalThis.game;
  const resolveCanvas = typeof getCanvas === "function" ? getCanvas : () => globalThis.canvas;

  async function resolveDamageTokenDocument(data) {
    if (!data) return null;
    const gameRef = resolveGame();
    const canvasRef = resolveCanvas();

    const tokenUuid = String(readPayloadField(data, ["tokenUuid", "tokenuuid", "token_uuid"]) || "");
    if (tokenUuid) {
      const resolved = await resolveFromUuid(tokenUuid);
      const tokenDoc = resolved?.document || resolved || null;
      if (tokenDoc) return tokenDoc;
    }

    const sceneId = String(readPayloadField(data, ["sceneId", "sceneid", "scene_id"]) || "");
    const tokenId = String(readPayloadField(data, ["tokenId", "tokenid", "token_id"]) || "");
    if (sceneId && tokenId) {
      const scene = gameRef?.scenes?.get(sceneId);
      const tokenDoc = scene?.tokens?.get(tokenId) || null;
      if (tokenDoc) return tokenDoc;
    }

    if (tokenId) {
      const activeTokenDoc = canvasRef?.scene?.tokens?.get(tokenId) || null;
      if (activeTokenDoc) return activeTokenDoc;
      for (const scene of gameRef?.scenes || []) {
        const candidate = scene?.tokens?.get(tokenId);
        if (candidate) return candidate;
      }
    }

    const actorId = String(readPayloadField(data, ["actorId", "actorid", "actor_id"]) || "");
    if (!actorId) return null;

    const targetNameRaw = String(readPayloadField(data, ["targetName", "targetname", "target_name"]) || "")
      .trim()
      .toLowerCase();
    const scenes = sceneId
      ? [gameRef?.scenes?.get(sceneId)].filter(Boolean)
      : Array.from(gameRef?.scenes || []);
    const actorMatches = [];
    for (const scene of scenes) {
      for (const tokenDoc of scene?.tokens || []) {
        if (String(tokenDoc?.actorId || "") !== actorId) continue;
        actorMatches.push(tokenDoc);
      }
    }
    if (actorMatches.length === 1) return actorMatches[0];

    if (targetNameRaw) {
      const named = actorMatches.filter(tokenDoc => {
        const tokenName = String(tokenDoc?.name || "").trim().toLowerCase();
        const actorName = String(tokenDoc?.actor?.name || "").trim().toLowerCase();
        return tokenName === targetNameRaw || actorName === targetNameRaw;
      });
      if (named.length === 1) return named[0];
    }
    return null;
  }

  async function resolveDamageActors(tokenDoc, data) {
    const gameRef = resolveGame();
    let tokenActor = tokenDoc?.actor || null;
    if (!tokenActor && tokenDoc && typeof tokenDoc.getActor === "function") {
      tokenActor = await tokenDoc.getActor().catch(() => null);
    }
    if (!tokenActor && tokenDoc?.object?.actor) tokenActor = tokenDoc.object.actor;

    const actorUuid = String(readPayloadField(data, ["actorUuid", "actoruuid", "actor_uuid"]) || "");
    const actorId = String(readPayloadField(data, ["actorId", "actorid", "actor_id"]) || "");
    const uuidActor = actorUuid ? await resolveFromUuid(actorUuid) : null;
    const worldActor = actorId ? gameRef?.actors?.get(actorId) : null;
    return { tokenActor, uuidActor, worldActor };
  }

  return {
    resolveDamageTokenDocument,
    resolveDamageActors
  };
}
