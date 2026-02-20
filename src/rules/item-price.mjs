const PRICE_PATH = "system.price";
const SALE_PRICE_PATH = "system.salePrice";
const PRICE_TO_SALE_RATIO = 0.2;
const NUMERIC_PATTERN = /^[-+]?(?:\d+|\d*\.\d+)$/;

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

  function parseNonNegativeNumber(rawValue) {
    const raw = String(rawValue ?? "").trim();
    if (!raw) return { raw, valid: false, empty: true, value: 0 };
    const compact = raw.replace(/\s+/g, "").replace(",", ".");
    if (!NUMERIC_PATTERN.test(compact)) return { raw, valid: false, empty: false, value: 0 };
    const value = Number(compact);
    if (!Number.isFinite(value) || value < 0) return { raw, valid: false, empty: false, value: 0 };
    return { raw, valid: true, empty: false, value };
  }

  function formatNumber(value) {
    if (!Number.isFinite(value) || value < 0) return "";
    const rounded = Math.round(value * 100) / 100;
    if (!Number.isFinite(rounded)) return "";
    if (Number.isInteger(rounded)) return String(rounded);
    return rounded.toFixed(2).replace(/\.?0+$/, "");
  }

  function resolveItemPriceFromSaleState(rawSaleValue) {
    const parsedSale = parseNonNegativeNumber(rawSaleValue);
    if (!parsedSale.valid) return { price: "", valid: false };
    const nextPrice = parsedSale.value / PRICE_TO_SALE_RATIO;
    return { price: formatNumber(nextPrice), valid: true };
  }

  function resolveItemPricePreviewState(rawValue) {
    const parsedPrice = parseNonNegativeNumber(rawValue);
    if (parsedPrice.empty) return { salePrice: "", errorMessage: "" };
    const invalidLabel = t("BLOODMAN.Items.PriceInvalid");
    const errorMessage = invalidLabel && invalidLabel !== "BLOODMAN.Items.PriceInvalid"
      ? invalidLabel
      : "Le prix doit etre un nombre valide.";
    if (!parsedPrice.valid) {
      return { salePrice: "", errorMessage };
    }
    const salePrice = Math.ceil(parsedPrice.value * PRICE_TO_SALE_RATIO);
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

      const currentPrice = String(item?.system?.price ?? "").trim();
      const currentSalePrice = String(item?.system?.salePrice ?? "").trim();
      const nextPrice = hasPriceUpdate
        ? String(readProperty(updateData, PRICE_PATH) ?? "").trim()
        : currentPrice;
      const nextSalePrice = hasSalePriceUpdate
        ? String(readProperty(updateData, SALE_PRICE_PATH) ?? "").trim()
        : currentSalePrice;
      const priceChanged = hasPriceUpdate && nextPrice !== currentPrice;
      const saleChanged = hasSalePriceUpdate && nextSalePrice !== currentSalePrice;
      let normalizedPrice = nextPrice;
      let normalizedSalePrice = nextSalePrice;

      if (saleChanged && !priceChanged && nextSalePrice !== "") {
        const reversePriceState = resolveItemPriceFromSaleState(nextSalePrice);
        normalizedPrice = reversePriceState.valid ? reversePriceState.price : currentPrice;
      } else if (priceChanged && !saleChanged) {
        const nextState = resolveItemSalePriceState(nextPrice, "");
        normalizedSalePrice = nextState.salePrice;
      } else if (priceChanged && saleChanged) {
        const nextPriceState = resolveItemSalePriceState(nextPrice, "");
        const priceDrivenSale = String(nextPriceState.salePrice ?? "").trim();
        const saleMatchesPrice = nextSalePrice === priceDrivenSale;
        const reversePriceState = resolveItemPriceFromSaleState(nextSalePrice);
        const saleDrivenPrice = reversePriceState.valid ? String(reversePriceState.price ?? "").trim() : "";
        const priceMatchesSale = reversePriceState.valid && nextPrice === saleDrivenPrice;
        if (!saleMatchesPrice && !priceMatchesSale) {
          normalizedSalePrice = priceDrivenSale;
        }
      } else {
        const nextState = resolveItemSalePriceState(nextPrice, nextSalePrice);
        normalizedSalePrice = nextState.salePrice;
      }

      writeProperty(updateData, PRICE_PATH, normalizedPrice);
      writeProperty(updateData, SALE_PRICE_PATH, normalizedSalePrice);
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
