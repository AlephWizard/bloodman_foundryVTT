export function createItemDisplayDataBuilder({
  isPowerUsableEnabled = value => Boolean(value),
  formatMultilineTextToHtml = value => String(value || ""),
  resolveItemSingleUseDisplayData = () => ({ show: false, label: "" }),
  normalizeRollDieFormula = (value, fallback = "d4") => String(value || fallback || "d4"),
  toCheckboxBoolean = (value, fallback = false) => (value == null ? Boolean(fallback) : Boolean(value))
} = {}) {
  return function buildItemDisplayData(item) {
    const data = typeof item?.toObject === "function" ? item.toObject() : { ...(item || {}) };
    data._id = data._id ?? item?.id;
    data.usableEnabled = isPowerUsableEnabled(item?.system?.usableEnabled);
    data.displayNoteHtml = formatMultilineTextToHtml(item?.system?.note || item?.system?.notes || "");

    const singleUseDisplay = resolveItemSingleUseDisplayData(data.system || item?.system || {});
    data.showSingleUseCount = singleUseDisplay.show;
    data.singleUseCountLabel = singleUseDisplay.label;
    data.singleUseCountClass = "item-chip item-meta bm-btn-usage-count";

    if (item?.system?.damageEnabled && item?.system?.damageDie) {
      const rawDie = item.system.damageDie.toString();
      data.displayDamageDie = normalizeRollDieFormula(rawDie, "d4");
    }
    if (toCheckboxBoolean(item?.system?.healEnabled, false) && item?.system?.healDie) {
      const rawHealDie = item.system.healDie.toString();
      data.displayHealDie = normalizeRollDieFormula(rawHealDie, "d4");
    }

    return data;
  };
}
