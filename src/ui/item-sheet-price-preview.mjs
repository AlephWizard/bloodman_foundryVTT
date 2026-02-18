function defaultResolveItemPricePreviewState(rawPrice) {
  const value = Number(String(rawPrice || "").trim().replace(",", "."));
  if (!Number.isFinite(value) || value < 0) {
    return { salePrice: "", errorMessage: "invalid-price" };
  }
  const sale = Math.round(Math.max(0, value * 0.5) * 100) / 100;
  const salePrice = Number.isInteger(sale) ? String(sale) : sale.toFixed(2).replace(/\.?0+$/, "");
  return { salePrice, errorMessage: "" };
}

function defaultIsItemSalePriceManual(priceValue, saleValue) {
  const price = Number(String(priceValue || "").trim().replace(",", "."));
  const sale = Number(String(saleValue || "").trim().replace(",", "."));
  if (!Number.isFinite(sale)) return false;
  if (!Number.isFinite(price) || price < 0) return true;
  const expected = Math.round(Math.max(0, price * 0.5) * 100) / 100;
  return Math.abs(sale - expected) > 0.000001;
}

export function createItemSheetPricePreviewRules({
  resolveItemPricePreviewState,
  isItemSalePriceManual
} = {}) {
  const resolvePreview = typeof resolveItemPricePreviewState === "function"
    ? resolveItemPricePreviewState
    : defaultResolveItemPricePreviewState;
  const isManualSalePrice = typeof isItemSalePriceManual === "function"
    ? isItemSalePriceManual
    : defaultIsItemSalePriceManual;

  function resolveSaleManualFlag(priceValue, saleValue) {
    return isManualSalePrice(priceValue, saleValue);
  }

  function resolveItemPricePreviewUiState({
    priceValue = "",
    saleValue = "",
    saleManual = false
  } = {}) {
    const preview = resolvePreview(priceValue);
    const errorMessage = String(preview?.errorMessage || "");
    const invalid = Boolean(errorMessage);
    const computedSalePrice = invalid ? "" : String(preview?.salePrice ?? "");
    const nextSaleValue = saleManual ? String(saleValue ?? "") : computedSalePrice;
    return {
      invalid,
      errorMessage,
      computedSalePrice,
      nextSaleValue,
      ariaInvalid: invalid ? "true" : "false"
    };
  }

  return {
    resolveSaleManualFlag,
    resolveItemPricePreviewUiState
  };
}
