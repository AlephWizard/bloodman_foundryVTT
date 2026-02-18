function resolveActorFromUuidDocument(candidate) {
  if (candidate?.documentName === "Actor") return candidate;
  if (candidate?.actor?.documentName === "Actor") return candidate.actor;
  return null;
}

export function buildSocketActorResolutionHelpers({
  compatFromUuid,
  getActorById
} = {}) {
  async function resolveActorForSocketPayload(data) {
    const actorBaseId = String(data?.actorBaseId || "");
    const actorId = String(data?.actorId || "");
    const worldActorId = actorBaseId || actorId;
    const worldActor = worldActorId ? (getActorById?.(worldActorId) || null) : null;
    const actorUuid = String(data?.actorUuid || "");
    if (actorUuid) {
      const resolved = await compatFromUuid(actorUuid);
      const candidate = resolved?.document || resolved || null;
      const actor = resolveActorFromUuidDocument(candidate);
      if (actor) {
        // Linked character token updates must target the world actor.
        if (actor.type === "personnage" && worldActor) return worldActor;
        if (actor.type === "personnage" && actor.isToken && Boolean(actor.token?.actorLink) && worldActor) return worldActor;
        return actor;
      }
    }
    return worldActor;
  }

  async function resolveActorForVitalResourceUpdate(data) {
    return resolveActorForSocketPayload(data);
  }

  async function resolveActorForSheetRequest(data) {
    return resolveActorForSocketPayload(data);
  }

  return {
    resolveActorForSocketPayload,
    resolveActorForVitalResourceUpdate,
    resolveActorForSheetRequest
  };
}
