import { bmLog } from "../core/logger.mjs";

const TOKEN_EFFECT_BG_PATCH_FLAG = "__bmTokenEffectBackgroundPatched";

export function setTokenEffectBackgroundTransparent(target) {
  if (!target || target.destroyed) return false;
  let changed = false;
  if (typeof target.clear === "function") {
    try {
      target.clear();
      changed = true;
    } catch (_error) {
      // no-op
    }
  }
  if ("alpha" in target && target.alpha !== 0) {
    target.alpha = 0;
    changed = true;
  }
  if ("visible" in target && target.visible !== false) {
    target.visible = false;
    changed = true;
  }
  if ("renderable" in target && target.renderable !== false) {
    target.renderable = false;
    changed = true;
  }
  return changed;
}

export function applyTransparentTokenEffectBackground(tokenLike) {
  const tokenObject = tokenLike?.object || tokenLike || null;
  if (!tokenObject) return false;

  const roots = [
    tokenObject.effects,
    tokenObject.effectContainer,
    tokenObject.effectsContainer,
    tokenObject._effects
  ].filter(root => root && typeof root === "object");
  if (!roots.length) return false;

  let changed = false;
  for (const root of roots) {
    changed = setTokenEffectBackgroundTransparent(root?.bg) || changed;
    changed = setTokenEffectBackgroundTransparent(root?.background) || changed;
    changed = setTokenEffectBackgroundTransparent(root?.backdrop) || changed;

    const children = Array.isArray(root?.children) ? root.children : [];
    for (const child of children) {
      const name = String(child?.name || "").trim().toLowerCase();
      const isBackgroundLike = name === "bg" || name.includes("background") || name.includes("backdrop");
      if (isBackgroundLike) changed = setTokenEffectBackgroundTransparent(child) || changed;
      changed = setTokenEffectBackgroundTransparent(child?.bg) || changed;
      changed = setTokenEffectBackgroundTransparent(child?.background) || changed;
      changed = setTokenEffectBackgroundTransparent(child?.backdrop) || changed;
    }
  }

  return changed;
}

export function installTokenEffectBackgroundPatch() {
  const tokenClass = globalThis.CONFIG?.Token?.objectClass || globalThis.Token;
  if (!tokenClass?.prototype) return false;
  const proto = tokenClass.prototype;
  if (proto[TOKEN_EFFECT_BG_PATCH_FLAG] === true) return true;

  const originalDrawEffects = proto.drawEffects;
  if (typeof originalDrawEffects !== "function") return false;

  proto.drawEffects = function (...args) {
    const finalize = () => {
      try {
        applyTransparentTokenEffectBackground(this);
      } catch (error) {
        bmLog.warn("[bloodman] token effect background transparency patch skipped", error);
      }
    };

    const result = originalDrawEffects.apply(this, args);
    if (result && typeof result.then === "function") {
      return result.then(value => {
        finalize();
        return value;
      }).catch(error => {
        finalize();
        throw error;
      });
    }
    finalize();
    return result;
  };

  Object.defineProperty(proto, TOKEN_EFFECT_BG_PATCH_FLAG, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  return true;
}
