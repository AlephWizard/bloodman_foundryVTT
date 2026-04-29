function toPositiveInteger(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return Math.max(0, Math.floor(Number(fallback) || 0));
  return Math.max(0, Math.floor(numeric));
}

function parseVersionMajor(versionString) {
  const raw = String(versionString || "").trim();
  if (!raw) return 0;
  const match = raw.match(/^(\d+)/);
  return match ? toPositiveInteger(match[1], 0) : 0;
}

export function foundryVersion() {
  const releaseVersion = String(globalThis.game?.release?.version || "").trim();
  if (releaseVersion) return releaseVersion;
  const gameVersion = String(globalThis.game?.version || "").trim();
  if (gameVersion) return gameVersion;
  const generation = toPositiveInteger(globalThis.game?.release?.generation, 0);
  if (generation > 0) return `${generation}.0`;
  return "0.0.0";
}

export function getFoundryGeneration() {
  const releaseGeneration = toPositiveInteger(globalThis.game?.release?.generation, 0);
  if (releaseGeneration > 0) return releaseGeneration;
  return parseVersionMajor(foundryVersion());
}

function isGenerationOrHigher(minGeneration) {
  return getFoundryGeneration() >= toPositiveInteger(minGeneration, 0);
}

export function isV10Plus() {
  return isGenerationOrHigher(10);
}

export function isV11Plus() {
  return isGenerationOrHigher(11);
}

export function isV12Plus() {
  return isGenerationOrHigher(12);
}

export function isV13Plus() {
  return isGenerationOrHigher(13);
}

export function isV14Plus() {
  return isGenerationOrHigher(14);
}
