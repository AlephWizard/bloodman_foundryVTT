import assert from "node:assert/strict";
import { createItemSheetPricePreviewRules } from "../../src/ui/item-sheet-price-preview.mjs";

function buildCustomRules() {
  return createItemSheetPricePreviewRules({
    resolveItemPricePreviewState: rawPrice => {
      const value = Number(String(rawPrice || "").trim().replace(",", "."));
      if (!Number.isFinite(value) || value < 0) {
        return { salePrice: "", errorMessage: "Prix invalide" };
      }
      return { salePrice: String(Math.floor(value / 5)), errorMessage: "" };
    },
    isItemSalePriceManual: (_priceValue, saleValue) => String(saleValue || "").trim().toLowerCase() === "manual"
  });
}

async function run() {
  const rules = buildCustomRules();

  assert.equal(rules.resolveSaleManualFlag("10", "manual"), true);
  assert.equal(rules.resolveSaleManualFlag("10", "2"), false);

  assert.deepEqual(
    rules.resolveItemPricePreviewUiState({
      priceValue: "10",
      saleValue: "",
      saleManual: false
    }),
    {
      invalid: false,
      errorMessage: "",
      computedSalePrice: "2",
      nextSaleValue: "2",
      ariaInvalid: "false"
    }
  );

  assert.deepEqual(
    rules.resolveItemPricePreviewUiState({
      priceValue: "10",
      saleValue: "manual",
      saleManual: true
    }),
    {
      invalid: false,
      errorMessage: "",
      computedSalePrice: "2",
      nextSaleValue: "manual",
      ariaInvalid: "false"
    }
  );

  assert.deepEqual(
    rules.resolveItemPricePreviewUiState({
      priceValue: "bad",
      saleValue: "7",
      saleManual: false
    }),
    {
      invalid: true,
      errorMessage: "Prix invalide",
      computedSalePrice: "",
      nextSaleValue: "",
      ariaInvalid: "true"
    }
  );

  assert.deepEqual(
    rules.resolveItemPricePreviewUiState({
      priceValue: "bad",
      saleValue: "7",
      saleManual: true
    }),
    {
      invalid: true,
      errorMessage: "Prix invalide",
      computedSalePrice: "",
      nextSaleValue: "7",
      ariaInvalid: "true"
    }
  );

  const fallbackRules = createItemSheetPricePreviewRules();
  const fallbackState = fallbackRules.resolveItemPricePreviewUiState({
    priceValue: "10",
    saleValue: "",
    saleManual: false
  });
  assert.equal(fallbackState.invalid, false);
  assert.equal(fallbackState.nextSaleValue, "5");
}

run()
  .then(() => {
    console.log("item-sheet-price-preview.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
