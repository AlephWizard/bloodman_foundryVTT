export function normalizeRollDieFormula(value, fallback = "d4") {
  const raw = String(value ?? fallback ?? "d4").trim();
  if (!raw) return "1d4";
  return /^\d/.test(raw) ? raw : `1${raw}`;
}
