export function stripRollCommandPrefix(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return raw.replace(/^\/(?:r|roll)\b\s*/i, "").trim();
}

export function normalizeRollDieFormula(value, fallback = "d4") {
  const sourceValue = value ?? fallback ?? "d4";
  const stripped = stripRollCommandPrefix(sourceValue);
  if (!stripped) return "1d4";
  const explicitDiceCount = stripped.replace(/(^|[+\-*/(])\s*d(\d+)/ig, "$11d$2");
  const compact = explicitDiceCount.replace(/\s+/g, "");
  return compact;
}

export function isValidSimpleRollFormula(value, fallback = "d4") {
  const normalized = normalizeRollDieFormula(value, fallback);
  if (!normalized) return false;
  return /^(?:\d*d\d+|\d+)(?:[+\-*/](?:\d*d\d+|\d+))*$/i.test(normalized);
}
