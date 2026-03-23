export function normalizeCarriedItemInventorySlots(value, fallback = 1) {
  const numericValue = Number(value);
  if (Number.isFinite(numericValue) && numericValue >= 1) {
    return Math.max(1, Math.floor(numericValue));
  }

  const numericFallback = Number(fallback);
  if (Number.isFinite(numericFallback) && numericFallback >= 1) {
    return Math.max(1, Math.floor(numericFallback));
  }

  return 1;
}

export function getCarriedItemInventorySlots(item, fallback = 1) {
  return normalizeCarriedItemInventorySlots(item?.system?.inventorySlots, fallback);
}

export function sumCarriedItemInventorySlots(items = [], fallback = 1) {
  if (!Array.isArray(items) || !items.length) return 0;
  return items.reduce(
    (total, item) => total + getCarriedItemInventorySlots(item, fallback),
    0
  );
}
