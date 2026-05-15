function defaultNormalizeNonNegativeInteger(value, fallback = 0) {
  const numeric = Number(value);
  const fallbackNumeric = Number(fallback);
  const safeFallback = Number.isFinite(fallbackNumeric) ? fallbackNumeric : 0;
  if (!Number.isFinite(numeric)) return Math.max(0, Math.floor(safeFallback));
  return Math.max(0, Math.floor(numeric));
}

function defaultTranslate(_key, fallback, data = {}) {
  return String(fallback || "").replace(/\{([^}]+)\}/g, (_match, key) => String(data?.[key] ?? ""));
}

function defaultEscapeMarkup(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function defaultGetGame() {
  return globalThis.game || null;
}

function defaultGetCanvas() {
  return globalThis.canvas || null;
}

function getTokenDocument(tokenLike) {
  return tokenLike?.document || tokenLike || null;
}

function getTokenActor(tokenLike, tokenDocument, gameLike) {
  return tokenLike?.actor
    || tokenDocument?.actor
    || (tokenDocument?.actorId ? gameLike?.actors?.get?.(tokenDocument.actorId) || null : null);
}

export function createPlayerResourceActionRules({
  normalizeNonNegativeInteger,
  translate,
  escapeMarkup,
  getGame,
  getCanvas,
  createChatMessage,
  warn,
  playerActorType = "personnage"
} = {}) {
  const normalizeInteger = typeof normalizeNonNegativeInteger === "function"
    ? normalizeNonNegativeInteger
    : defaultNormalizeNonNegativeInteger;
  const tl = typeof translate === "function" ? translate : defaultTranslate;
  const escapeHtml = typeof escapeMarkup === "function" ? escapeMarkup : defaultEscapeMarkup;
  const readGame = typeof getGame === "function" ? getGame : defaultGetGame;
  const readCanvas = typeof getCanvas === "function" ? getCanvas : defaultGetCanvas;
  const postChatMessage = typeof createChatMessage === "function"
    ? createChatMessage
    : async data => globalThis.ChatMessage?.create?.(data);
  const logWarn = typeof warn === "function" ? warn : () => {};
  const normalizedPlayerActorType = String(playerActorType || "personnage").trim().toLowerCase();

  function getControlledTokens(options = {}) {
    if (Array.isArray(options.selectedTokens)) return options.selectedTokens;
    return readCanvas()?.tokens?.controlled || [];
  }

  function getSelectedPlayerActors(controlledTokens = null) {
    const tokens = Array.isArray(controlledTokens) ? controlledTokens : getControlledTokens();
    const gameLike = readGame();
    const recipients = [];
    const seen = new Set();
    for (const token of tokens) {
      const tokenDocument = getTokenDocument(token);
      const actor = getTokenActor(token, tokenDocument, gameLike);
      if (!actor) continue;
      const type = String(actor.type || "").trim().toLowerCase();
      if (type !== normalizedPlayerActorType) continue;
      const key = String(actor.uuid || actor.id || tokenDocument?.uuid || tokenDocument?.id || tokenDocument?.actorId || "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      recipients.push(actor);
    }
    return recipients;
  }

  function getActorName(actorName) {
    return String(actorName || tl("TYPES.Actor.personnage", "Joueur")).trim() || "Joueur";
  }

  function formatVoyageXpGrantLine(actorName, amount) {
    const name = getActorName(actorName);
    const fallback = `${name} a recu ${amount} point${amount > 1 ? "s" : ""} d'experience.`;
    return tl("BLOODMAN.Notifications.VoyageXPGrantLine", fallback, { actor: name, amount });
  }

  async function grantVoyageXpToSelectedPlayers(rawAmount, options = {}) {
    const amount = normalizeInteger(rawAmount, 0);
    const selectedTokens = getControlledTokens(options);
    if (amount <= 0) {
      return { amount, selectedTokens, grants: [], failures: [], reason: "no-points" };
    }
    if (!selectedTokens.length) {
      return { amount, selectedTokens, grants: [], failures: [], reason: "no-selection" };
    }

    const recipients = getSelectedPlayerActors(selectedTokens);
    if (!recipients.length) {
      return { amount, selectedTokens, grants: [], failures: [], reason: "no-recipients" };
    }

    const grants = [];
    const failures = [];
    for (const actor of recipients) {
      const actorName = getActorName(actor?.name);
      if (!actor?.update) {
        failures.push({ actorName });
        continue;
      }
      const voyageTotal = normalizeInteger(
        actor.system?.resources?.voyage?.total ?? actor.system?.resources?.voyage?.max,
        0
      );
      const voyageCurrent = Math.min(
        normalizeInteger(actor.system?.resources?.voyage?.current, 0),
        voyageTotal
      );
      const nextVoyageTotal = voyageTotal + amount;
      const nextVoyageCurrent = voyageCurrent + amount;

      try {
        await actor.update({
          "system.resources.voyage.total": nextVoyageTotal,
          "system.resources.voyage.current": nextVoyageCurrent,
          "system.resources.voyage.max": nextVoyageTotal
        });
        grants.push({ actorName, amount });
      } catch (error) {
        logWarn("[bloodman] voyage XP grant failed", {
          actorId: actor.id,
          actorName,
          amount,
          error
        });
        failures.push({ actorName });
      }
    }

    return {
      amount,
      selectedTokens,
      grants,
      failures,
      reason: grants.length ? "ok" : "all-failed"
    };
  }

  function formatFullPpRestoreLine(actorName, restore = {}) {
    const name = getActorName(actorName);
    const maxPp = normalizeInteger(restore?.maxPp, 0);
    const previousPp = normalizeInteger(restore?.previousPp, 0);
    if (restore?.changed === false) {
      const fallback = `${name} a deja tous ses PP (${maxPp}/${maxPp}).`;
      return tl("BLOODMAN.Notifications.FullPPRestoreAlreadyFullLine", fallback, { actor: name, max: maxPp });
    }
    const fallback = `${name} : PP ${previousPp} -> ${maxPp}.`;
    return tl("BLOODMAN.Notifications.FullPPRestoreLine", fallback, {
      actor: name,
      before: previousPp,
      after: maxPp,
      max: maxPp
    });
  }

  function formatFullPvRestoreLine(actorName, restore = {}) {
    const name = getActorName(actorName);
    const maxPv = normalizeInteger(restore?.maxPv, 0);
    const previousPv = normalizeInteger(restore?.previousPv, 0);
    if (restore?.changed === false) {
      const fallback = `${name} a deja tous ses PV (${maxPv}/${maxPv}).`;
      return tl("BLOODMAN.Notifications.FullPVRestoreAlreadyFullLine", fallback, { actor: name, max: maxPv });
    }
    const fallback = `${name} : PV ${previousPv} -> ${maxPv}.`;
    return tl("BLOODMAN.Notifications.FullPVRestoreLine", fallback, {
      actor: name,
      before: previousPv,
      after: maxPv,
      max: maxPv
    });
  }

  async function restoreFullResourceToSelectedPlayers({
    resourceKey,
    maxField,
    previousField,
    updatePath,
    options = {}
  }) {
    const selectedTokens = getControlledTokens(options);
    if (!selectedTokens.length) {
      return { selectedTokens, restores: [], failures: [], reason: "no-selection" };
    }

    const recipients = getSelectedPlayerActors(selectedTokens);
    if (!recipients.length) {
      return { selectedTokens, restores: [], failures: [], reason: "no-recipients" };
    }

    const restores = [];
    const failures = [];
    for (const actor of recipients) {
      const actorName = getActorName(actor?.name);
      if (!actor?.update) {
        failures.push({ actorName });
        continue;
      }

      const resource = actor.system?.resources?.[resourceKey] || {};
      const maxValue = normalizeInteger(resource.max, 0);
      const previousValue = normalizeInteger(resource.current, 0);
      if (previousValue === maxValue) {
        restores.push({ actorName, [previousField]: previousValue, [maxField]: maxValue, changed: false });
        continue;
      }

      try {
        await actor.update(
          { [updatePath]: maxValue },
          { bloodmanAllowVitalResourceUpdate: true }
        );
        restores.push({ actorName, [previousField]: previousValue, [maxField]: maxValue, changed: true });
      } catch (error) {
        logWarn(`[bloodman] full ${resourceKey.toUpperCase()} restore failed`, {
          actorId: actor?.id,
          actorName,
          [previousField]: previousValue,
          [maxField]: maxValue,
          error
        });
        failures.push({ actorName });
      }
    }

    return {
      selectedTokens,
      restores,
      failures,
      reason: restores.length ? "ok" : "all-failed"
    };
  }

  function restoreFullPpToSelectedPlayers(options = {}) {
    return restoreFullResourceToSelectedPlayers({
      resourceKey: "pp",
      maxField: "maxPp",
      previousField: "previousPp",
      updatePath: "system.resources.pp.current",
      options
    });
  }

  function restoreFullPvToSelectedPlayers(options = {}) {
    return restoreFullResourceToSelectedPlayers({
      resourceKey: "pv",
      maxField: "maxPv",
      previousField: "previousPv",
      updatePath: "system.resources.pv.current",
      options
    });
  }

  async function postSummary({ result, title, wrapperClass, lines }) {
    if (!result) return false;
    const contentLines = lines.map(line => `<p>${escapeHtml(line)}</p>`).join("");
    const content = `<div class="${wrapperClass}"><p><strong>${escapeHtml(title)}</strong></p>${contentLines}</div>`;
    await postChatMessage({ content })?.catch?.(() => null);
    return true;
  }

  async function postVoyageXpGrantSummary(result) {
    if (!result) return false;
    const lines = [];
    if (result.reason === "no-points") {
      lines.push(tl("BLOODMAN.Notifications.VoyageXPGrantNoPoints", "Aucun point d'XP voyage octroye."));
    } else if (result.reason === "no-selection") {
      lines.push(tl("BLOODMAN.Notifications.VoyageXPGrantNoSelection", "Selectionnez au moins un token joueur pour attribuer de l'XP voyage."));
    } else if (result.reason === "no-recipients") {
      lines.push(tl("BLOODMAN.Notifications.VoyageXPGrantNoRecipients", "Aucun token joueur selectionne pour recevoir de l'XP voyage."));
    } else if (result.reason === "all-failed") {
      lines.push(tl("BLOODMAN.Notifications.VoyageXPGrantAllFailed", "Aucune attribution d'XP voyage n'a pu etre appliquee."));
    } else {
      for (const grant of result.grants || []) lines.push(formatVoyageXpGrantLine(grant.actorName, grant.amount));
      const failureCount = Number(result.failures?.length || 0);
      if (failureCount > 0) {
        lines.push(tl(
          "BLOODMAN.Notifications.VoyageXPGrantPartialFailure",
          "{count} attribution(s) d'XP voyage n'ont pas pu etre appliquees.",
          { count: failureCount }
        ));
      }
    }
    return postSummary({
      result,
      title: tl("BLOODMAN.Dialogs.VoyageXPGrant.Title", "Attribution XP voyage"),
      wrapperClass: "bm-voyage-xp-grant-log",
      lines
    });
  }

  async function postFullPpRestoreSummary(result) {
    if (!result) return false;
    const lines = [];
    if (result.reason === "no-selection") {
      lines.push(tl("BLOODMAN.Notifications.FullPPRestoreNoSelection", "Selectionnez au moins un token joueur pour restaurer les PP."));
    } else if (result.reason === "no-recipients") {
      lines.push(tl("BLOODMAN.Notifications.FullPPRestoreNoRecipients", "Aucun token joueur selectionne pour restaurer les PP."));
    } else if (result.reason === "all-failed") {
      lines.push(tl("BLOODMAN.Notifications.FullPPRestoreAllFailed", "Aucune restauration de PP n'a pu etre appliquee."));
    } else {
      for (const restore of result.restores || []) lines.push(formatFullPpRestoreLine(restore.actorName, restore));
      const failureCount = Number(result.failures?.length || 0);
      if (failureCount > 0) {
        lines.push(tl(
          "BLOODMAN.Notifications.FullPPRestorePartialFailure",
          "{count} restauration(s) de PP n'ont pas pu etre appliquees.",
          { count: failureCount }
        ));
      }
    }
    return postSummary({
      result,
      title: tl("BLOODMAN.Dialogs.FullPPRestore.Title", "Restauration PP"),
      wrapperClass: "bm-full-pp-restore-log",
      lines
    });
  }

  async function postFullPvRestoreSummary(result) {
    if (!result) return false;
    const lines = [];
    if (result.reason === "no-selection") {
      lines.push(tl("BLOODMAN.Notifications.FullPVRestoreNoSelection", "Selectionnez au moins un token joueur pour restaurer les PV."));
    } else if (result.reason === "no-recipients") {
      lines.push(tl("BLOODMAN.Notifications.FullPVRestoreNoRecipients", "Aucun token joueur selectionne pour restaurer les PV."));
    } else if (result.reason === "all-failed") {
      lines.push(tl("BLOODMAN.Notifications.FullPVRestoreAllFailed", "Aucune restauration de PV n'a pu etre appliquee."));
    } else {
      for (const restore of result.restores || []) lines.push(formatFullPvRestoreLine(restore.actorName, restore));
      const failureCount = Number(result.failures?.length || 0);
      if (failureCount > 0) {
        lines.push(tl(
          "BLOODMAN.Notifications.FullPVRestorePartialFailure",
          "{count} restauration(s) de PV n'ont pas pu etre appliquees.",
          { count: failureCount }
        ));
      }
    }
    return postSummary({
      result,
      title: tl("BLOODMAN.Dialogs.FullPVRestore.Title", "Restauration PV"),
      wrapperClass: "bm-full-pv-restore-log",
      lines
    });
  }

  return {
    getSelectedPlayerActors,
    formatVoyageXpGrantLine,
    grantVoyageXpToSelectedPlayers,
    formatFullPpRestoreLine,
    formatFullPvRestoreLine,
    restoreFullPpToSelectedPlayers,
    restoreFullPvToSelectedPlayers,
    postVoyageXpGrantSummary,
    postFullPpRestoreSummary,
    postFullPvRestoreSummary
  };
}
