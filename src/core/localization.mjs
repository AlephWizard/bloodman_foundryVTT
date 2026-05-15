export function t(key, data = null) {
  if (!globalThis.game?.i18n) return key;
  return data ? game.i18n.format(key, data) : game.i18n.localize(key);
}

export function tl(key, fallback, data = null) {
  const localized = t(key, data);
  return localized && localized !== key ? localized : fallback;
}
