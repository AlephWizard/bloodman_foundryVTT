function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
}

export function hasActorUpdatePayload(updateData, flattenObject) {
  if (!updateData || typeof updateData !== "object") return false;
  if (typeof flattenObject !== "function") return Object.keys(updateData).length > 0;
  return Object.keys(flattenObject(updateData)).length > 0;
}

export function normalizeVitalResourceValue({
  path,
  value,
  pvMax,
  ppMax
} = {}) {
  const normalizedPath = String(path || "");
  const numeric = Math.max(0, Math.floor(toFiniteNumber(value, 0)));
  if (normalizedPath === "system.resources.pv.current") {
    const max = toFiniteNumber(pvMax, numeric);
    return Math.min(numeric, Math.max(0, max));
  }
  if (normalizedPath === "system.resources.pp.current") {
    const max = toFiniteNumber(ppMax, numeric);
    return Math.min(numeric, Math.max(0, max));
  }
  return numeric;
}
