function defaultToFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
}

function defaultRoundCurrencyValue(value) {
  const rounded = Math.round((Number(value) || 0) * 100) / 100;
  const whole = Math.round(rounded);
  if (Math.abs(rounded - whole) <= 0.000001) return whole;
  return rounded;
}

function defaultFormatCurrencyValue(value) {
  const normalized = defaultRoundCurrencyValue(Math.max(0, defaultToFiniteNumber(value, 0)));
  if (Number.isInteger(normalized)) return String(normalized);
  return normalized.toFixed(2).replace(/\.?0+$/, "");
}

function defaultParseLooseNumericInput(value) {
  if (value == null) return { ok: true, empty: true, value: 0 };
  const raw = String(value).trim();
  if (!raw) return { ok: true, empty: true, value: 0 };
  const compact = raw.replace(/\s+/g, "").replace(",", ".");
  const numericPattern = /^[+-]?(?:\d+|\d*\.\d+)$/;
  if (!numericPattern.test(compact)) return { ok: false, empty: false, value: Number.NaN };
  const numericValue = Number(compact);
  if (!Number.isFinite(numericValue)) return { ok: false, empty: false, value: Number.NaN };
  return { ok: true, empty: false, value: numericValue };
}

export function createDropDecisionRules({
  parseLooseNumericInput,
  roundCurrencyValue,
  formatCurrencyValue,
  toFiniteNumber,
  normalizeRollDieFormula,
  getWeaponCategory,
  normalizeNonNegativeInteger,
  getWeaponLoadedAmmo,
  fromDropData,
  translate,
  translateWithFallback
} = {}) {
  const parseLoose = typeof parseLooseNumericInput === "function"
    ? parseLooseNumericInput
    : defaultParseLooseNumericInput;
  const roundCurrency = typeof roundCurrencyValue === "function"
    ? roundCurrencyValue
    : defaultRoundCurrencyValue;
  const formatCurrency = typeof formatCurrencyValue === "function"
    ? formatCurrencyValue
    : defaultFormatCurrencyValue;
  const toFinite = typeof toFiniteNumber === "function"
    ? toFiniteNumber
    : defaultToFiniteNumber;
  const normalizeRollFormula = typeof normalizeRollDieFormula === "function"
    ? normalizeRollDieFormula
    : value => String(value || "").trim();
  const weaponCategory = typeof getWeaponCategory === "function"
    ? getWeaponCategory
    : () => "";
  const normalizePositiveInteger = typeof normalizeNonNegativeInteger === "function"
    ? normalizeNonNegativeInteger
    : (value, fallback = 0) => Math.max(0, Math.floor(defaultToFiniteNumber(value, fallback)));
  const weaponLoadedAmmo = typeof getWeaponLoadedAmmo === "function"
    ? getWeaponLoadedAmmo
    : () => 0;
  const resolveDroppedItem = typeof fromDropData === "function"
    ? fromDropData
    : async () => null;
  const t = typeof translate === "function"
    ? translate
    : key => key;
  const tl = typeof translateWithFallback === "function"
    ? translateWithFallback
    : (_key, fallback) => fallback;

  function getDropItemQuantity(dropData, droppedItem = null) {
    const candidates = [
      dropData?.quantity,
      dropData?.count,
      dropData?.amount,
      dropData?.data?.quantity,
      droppedItem?.system?.quantity
    ];
    for (const candidate of candidates) {
      const quantity = Number(candidate);
      if (!Number.isFinite(quantity)) continue;
      if (quantity <= 0) continue;
      return Math.max(1, Math.floor(quantity));
    }
    return 1;
  }

  function getDropEntries(dropData) {
    return Array.isArray(dropData?.items) && dropData.items.length
      ? dropData.items
      : [dropData];
  }

  function getDroppedItemUnitPrice(item) {
    const rawPrice = String(item?.system?.price ?? "").trim();
    if (!rawPrice) return { ok: true, value: 0 };
    const parsed = parseLoose(rawPrice);
    if (!parsed.ok) return { ok: false, value: 0 };
    const unitPrice = parsed.value;
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return { ok: false, value: 0 };
    return { ok: true, value: roundCurrency(unitPrice) };
  }

  function sanitizeDropDialogText(value, maxLength = 160) {
    const plain = String(value ?? "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!plain) return "";
    const cap = Math.max(20, Math.floor(toFinite(maxLength, 160)));
    if (plain.length <= cap) return plain;
    return `${plain.slice(0, cap - 3).trim()}...`;
  }

  function buildDroppedItemSpecificities(item, options = {}) {
    const details = [];
    if (!item) return details;

    const itemType = String(item.type || "").trim().toLowerCase();
    const quantity = Math.max(1, Math.floor(toFinite(options.quantity, 1)));
    const priceState = options.priceState || getDroppedItemUnitPrice(item);

    const typeLabel = itemType ? t(`TYPES.Item.${itemType}`) : "";
    if (typeLabel && typeLabel !== `TYPES.Item.${itemType}`) {
      details.push(`Type : ${typeLabel}`);
    }
    if (quantity > 1) {
      details.push(`Quantite : ${quantity}`);
    }
    if (priceState?.ok && priceState.value > 0) {
      details.push(`Prix unitaire : ${formatCurrency(priceState.value)}`);
    }
    if (itemType === "arme") {
      const damageDie = normalizeRollFormula(item.system?.damageDie, "d4");
      if (damageDie) details.push(`Degats : ${damageDie}`);
      const kind = weaponCategory(item.system?.weaponType);
      if (kind === "distance") details.push("Categorie : Distance");
      if (kind === "corps") details.push("Categorie : Corps a corps");
      const magazineCapacity = normalizePositiveInteger(item.system?.magazineCapacity, 0);
      if (magazineCapacity > 0) {
        const loadedAmmo = weaponLoadedAmmo(item, { fallback: 0 });
        details.push(`Chargeur : ${loadedAmmo} / ${magazineCapacity}`);
      }
    }
    if (itemType === "soin") {
      const healDie = normalizeRollFormula(item.system?.healDie, "d4");
      if (healDie) details.push(`Soin : ${healDie}`);
    }
    if (itemType === "protection") {
      const paValue = Math.max(0, Math.floor(toFinite(item.system?.pa, 0)));
      details.push(`PA : ${paValue}`);
    }
    const noteText = sanitizeDropDialogText(item.system?.note || item.system?.notes || "", 130);
    if (noteText) details.push(`Note : ${noteText}`);

    return details;
  }

  function buildDropDecisionPreview({ resolvedItems = [], purchase = null, targetName = "" } = {}) {
    if (!Array.isArray(resolvedItems) || !resolvedItems.length) return null;
    const safeTargetName = String(targetName || "").trim() || t("BLOODMAN.Common.Name");
    const firstItemName = String(resolvedItems[0]?.droppedItem?.name || "").trim() || t("BLOODMAN.Common.Name");
    const intro = tl(
      "BLOODMAN.Dialogs.DropDecision.Intro",
      "Vous vous appretez a glisser '{item}' sur la fiche de '{sheet}'.",
      {
        item: firstItemName,
        sheet: safeTargetName
      }
    );
    const question = tl(
      "BLOODMAN.Dialogs.DropDecision.Question",
      "Voulez-vous deplacer cet objet gratuitement ?"
    );
    const costLabel = tl("BLOODMAN.Dialogs.DropDecision.CostLabel", "Cout");
    const specificsLabel = tl("BLOODMAN.Dialogs.DropDecision.SpecificitiesLabel", "Specificites");

    const specificities = [];
    for (const itemContext of resolvedItems.slice(0, 4)) {
      const itemName = String(itemContext?.droppedItem?.name || "").trim() || t("BLOODMAN.Common.Name");
      const itemDetails = buildDroppedItemSpecificities(itemContext.droppedItem, {
        quantity: itemContext.quantity,
        priceState: itemContext.priceState
      });
      if (resolvedItems.length > 1) {
        specificities.push(`${itemName} :`);
        specificities.push(...itemDetails.map(detail => `- ${detail}`));
      } else {
        specificities.push(...itemDetails);
      }
    }
    if (resolvedItems.length > 4) {
      specificities.push(tl(
        "BLOODMAN.Dialogs.DropDecision.MoreItems",
        "+ {count} objet(s) supplementaire(s).",
        { count: resolvedItems.length - 4 }
      ));
    }
    if (!specificities.length) {
      specificities.push(tl("BLOODMAN.Dialogs.DropDecision.NoSpecificities", "Aucune specificite disponible."));
    }

    const totalCost = roundCurrency(Number(purchase?.totalCost || 0));
    return {
      intro,
      question,
      costLabel,
      specificsLabel,
      firstItemName,
      targetName: safeTargetName,
      specificities,
      totalCost,
      hasInvalidPrice: Boolean(purchase?.hasInvalidPrice)
    };
  }

  async function resolveDropPreviewItems({ entries = [], targetActorId = "" } = {}) {
    if (!Array.isArray(entries) || !entries.length) return [];
    const normalizedTargetActorId = String(targetActorId || "");
    const resolvedItems = [];
    for (const entry of entries) {
      const droppedItem = await resolveDroppedItem(entry).catch(() => null);
      if (!droppedItem) continue;
      const sourceActor = droppedItem.actor;
      if (sourceActor?.id === normalizedTargetActorId) continue;
      const quantity = getDropItemQuantity(entry, droppedItem);
      const priceState = getDroppedItemUnitPrice(droppedItem);
      resolvedItems.push({ droppedItem, sourceActor, quantity, priceState });
    }
    return resolvedItems;
  }

  return {
    getDropItemQuantity,
    getDropEntries,
    getDroppedItemUnitPrice,
    sanitizeDropDialogText,
    buildDroppedItemSpecificities,
    buildDropDecisionPreview,
    resolveDropPreviewItems
  };
}
