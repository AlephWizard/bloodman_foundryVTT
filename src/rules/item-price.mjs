const PRICE_PATH = "system.price";
const SALE_PRICE_PATH = "system.salePrice";

function defaultGetProperty(object, path) {
  return String(path || "")
    .split(".")
    .reduce((current, key) => (current == null ? undefined : current[key]), object);
}

function defaultSetProperty(object, path, value) {
  if (!object || !path) return;
  const keys = String(path).split(".");
  let current = object;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    if (!key) continue;
    const child = current[key];
    if (!child || typeof child !== "object") current[key] = {};
    current = current[key];
  }
  const finalKey = keys[keys.length - 1];
  if (!finalKey) return;
  current[finalKey] = value;
}

export function createItemPriceRules({
  priceItemTypes,
  getProperty,
  setProperty,
  translate
} = {}) {
  const managedItemTypes = priceItemTypes instanceof Set
    ? priceItemTypes
    : new Set(Array.isArray(priceItemTypes) ? priceItemTypes : []);
  const readProperty = typeof getProperty === "function"
    ? getProperty
    : defaultGetProperty;
  const writeProperty = typeof setProperty === "function"
    ? setProperty
    : defaultSetProperty;
  const t = typeof translate === "function"
    ? translate
    : key => key;

  function isPriceManagedItemType(itemType) {
    const type = String(itemType || "").trim().toLowerCase();
    return managedItemTypes.has(type);
  }

  function resolveItemPricePreviewState(rawValue) {
    const raw = String(rawValue ?? "").trim();
    if (!raw) return { salePrice: "", errorMessage: "" };
    const compact = raw.replace(/\s+/g, "").replace(",", ".");
    const numericPattern = /^[-+]?(?:\d+|\d*\.\d+)$/;
    const numericValue = Number(compact);
    const invalidLabel = t("BLOODMAN.Items.PriceInvalid");
    const errorMessage = invalidLabel && invalidLabel !== "BLOODMAN.Items.PriceInvalid"
      ? invalidLabel
      : "Le prix doit etre un nombre valide.";
    if (!numericPattern.test(compact) || !Number.isFinite(numericValue) || numericValue < 0) {
      return { salePrice: "", errorMessage };
    }
    const salePrice = Math.ceil(numericValue * 0.2);
    return { salePrice: String(salePrice), errorMessage: "" };
  }

  function resolveItemSalePriceState(rawPriceValue, rawSalePriceValue) {
    const pricePreview = resolveItemPricePreviewState(rawPriceValue);
    const salePriceRaw = String(rawSalePriceValue ?? "").trim();
    if (salePriceRaw) {
      return {
        salePrice: salePriceRaw,
        errorMessage: pricePreview.errorMessage
      };
    }
    return {
      salePrice: pricePreview.errorMessage ? "" : pricePreview.salePrice,
      errorMessage: pricePreview.errorMessage
    };
  }

  function isItemSalePriceManual(rawPriceValue, rawSalePriceValue) {
    const salePriceRaw = String(rawSalePriceValue ?? "").trim();
    if (!salePriceRaw) return false;
    const pricePreview = resolveItemPricePreviewState(rawPriceValue);
    if (pricePreview.errorMessage) return true;
    return salePriceRaw !== String(pricePreview.salePrice ?? "").trim();
  }

  function normalizeItemPriceUpdate(item, updateData = null) {
    if (!isPriceManagedItemType(item?.type)) return false;

    if (updateData) {
      const hasPriceUpdate = Object.prototype.hasOwnProperty.call(updateData, PRICE_PATH)
        || readProperty(updateData, PRICE_PATH) !== undefined;
      const hasSalePriceUpdate = Object.prototype.hasOwnProperty.call(updateData, SALE_PRICE_PATH)
        || readProperty(updateData, SALE_PRICE_PATH) !== undefined;
      if (!hasPriceUpdate && !hasSalePriceUpdate) return false;

      const nextPrice = hasPriceUpdate
        ? String(readProperty(updateData, PRICE_PATH) ?? "").trim()
        : String(item?.system?.price ?? "").trim();
      const currentPrice = String(item?.system?.price ?? "").trim();
      const currentSalePrice = String(item?.system?.salePrice ?? "").trim();
      const saleWasManual = isItemSalePriceManual(currentPrice, currentSalePrice);
      const nextSalePrice = hasSalePriceUpdate
        ? String(readProperty(updateData, SALE_PRICE_PATH) ?? "").trim()
        : (saleWasManual ? currentSalePrice : "");
      const nextState = resolveItemSalePriceState(nextPrice, nextSalePrice);

      writeProperty(updateData, PRICE_PATH, nextPrice);
      writeProperty(updateData, SALE_PRICE_PATH, nextState.salePrice);
      return true;
    }

    const sourcePrice = String(item?.system?.price ?? "").trim();
    const sourceSalePrice = String(item?.system?.salePrice ?? "").trim();
    const sourceState = resolveItemSalePriceState(sourcePrice, sourceSalePrice);
    item.updateSource({
      [PRICE_PATH]: sourcePrice,
      [SALE_PRICE_PATH]: sourceState.salePrice
    });
    return true;
  }

  return {
    isPriceManagedItemType,
    resolveItemPricePreviewState,
    resolveItemSalePriceState,
    isItemSalePriceManual,
    normalizeItemPriceUpdate
  };
}
