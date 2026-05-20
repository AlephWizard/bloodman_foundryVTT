export function createActorSheetPermissionController({
  isBasicPlayerRole,
  canCurrentUserEditCharacteristics,
  getUserRole,
  getSheetElementWrapper,
  vitalResourceInputSelector,
  characteristicBaseInputSelector
} = {}) {
  function applyInteractivePermissions(sheet, htmlLike = null) {
    const root = htmlLike?.find ? htmlLike : getSheetElementWrapper?.(sheet);
    if (!root?.length) return false;

    const userRole = getUserRole?.();
    const basicPlayer = Boolean(isBasicPlayerRole?.(userRole));
    const canToggleCharacteristicsEdit = Boolean(canCurrentUserEditCharacteristics?.());
    const characteristicsUnlocked = canToggleCharacteristicsEdit && Boolean(sheet?._characteristicsEditEnabled);
    root.toggleClass?.(
      "characteristics-edit-active",
      sheet?.actor?.type === "personnage" && characteristicsUnlocked
    );

    if (basicPlayer) {
      root.find("input, textarea, select, button").prop("disabled", false).removeAttr("disabled");
    }
    if (canToggleCharacteristicsEdit) {
      root.find(".char-edit-toggle").prop("disabled", false).removeAttr("disabled");
      root
        .find(vitalResourceInputSelector)
        .prop("disabled", false)
        .prop("readonly", false)
        .removeAttr("disabled")
        .removeAttr("readonly");
    }

    if (sheet?.actor?.type === "personnage") {
      const characteristicInputs = root.find(characteristicBaseInputSelector);
      if (characteristicsUnlocked) {
        characteristicInputs
          .prop("disabled", false)
          .prop("readonly", false)
          .removeAttr("disabled")
          .removeAttr("readonly")
          .removeClass("is-locked");
        root.find(".char-edit-toggle").addClass("is-active");
      } else {
        characteristicInputs
          .prop("readonly", true)
          .attr("readonly", "readonly")
          .addClass("is-locked");
        root.find(".char-edit-toggle").removeClass("is-active");
      }
    }

    return true;
  }

  return {
    applyInteractivePermissions
  };
}
