export function getDamagePayloadField(data, keys = []) {
  if (!data || !Array.isArray(keys)) return undefined;
  for (const key of keys) {
    const value = data?.[key];
    if (value == null || value === "") continue;
    return value;
  }
  return undefined;
}

export function toBooleanFlag(value) {
  if (value === true) return true;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";
  return false;
}
