export function normalizeWeaponType(value) {
  const raw = String(value ?? "").toLowerCase();
  const ascii = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!raw) return "";
  if (raw === "distance" || raw.includes("distance")) return "distance";
  if (
    raw === "corps"
    || raw.includes("corps")
    || raw.includes("blanche")
    || raw.includes("mÃªlÃ©e")
    || ascii.includes("melee")
  ) return "corps";
  if (raw.includes("tactique") || raw.includes("jet") || raw.includes("poing")) return "distance";
  return String(value ?? "").trim();
}

export function getWeaponCategory(value) {
  const normalized = normalizeWeaponType(value);
  if (normalized === "corps") return "corps";
  return "distance";
}
