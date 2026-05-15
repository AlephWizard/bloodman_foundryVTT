import { bmLog } from "../core/logger.mjs";
import { getDialogClass, getDialogV2Class } from "../compat/index.mjs";

export function toDialogHtmlLike(dialogInstance) {
  const jq = globalThis.jQuery || globalThis.$;
  const element = dialogInstance?.form || dialogInstance?.element || null;
  if (typeof jq === "function" && typeof HTMLElement !== "undefined" && element instanceof HTMLElement) return jq(element);
  return element;
}

function createDialogV2Shim(config = {}, options = {}) {
  const DialogV2Class = getDialogV2Class();
  if (typeof DialogV2Class !== "function") return null;

  const normalizedConfig = config && typeof config === "object" ? config : {};
  const normalizedOptions = options && typeof options === "object" ? options : {};
  const buttonsConfig = normalizedConfig.buttons && typeof normalizedConfig.buttons === "object"
    ? normalizedConfig.buttons
    : {};
  const defaultAction = String(normalizedConfig.default || "").trim();

  const buttons = Object.entries(buttonsConfig).map(([action, buttonConfig]) => {
    const legacyCallback = buttonConfig?.callback;
    return {
      action,
      label: String(buttonConfig?.label ?? action),
      default: defaultAction ? action === defaultAction : false,
      callback: (event, button, dialog) => {
        if (typeof legacyCallback !== "function") return action;
        return legacyCallback(toDialogHtmlLike(dialog), event, button, dialog);
      }
    };
  });

  const v2Options = {
    classes: Array.isArray(normalizedOptions.classes) ? [...normalizedOptions.classes] : undefined,
    content: String(normalizedConfig.content || ""),
    rejectClose: false,
    window: {
      title: String(normalizedConfig.title || "")
    },
    buttons,
    position: Number.isFinite(Number(normalizedOptions.width))
      ? { width: Number(normalizedOptions.width) }
      : undefined,
    submit: result => {
      if (result == null && typeof normalizedConfig.close === "function") normalizedConfig.close();
    }
  };

  const dialogInstance = new DialogV2Class(v2Options);
  if (typeof normalizedConfig.render === "function" && typeof dialogInstance.addEventListener === "function") {
    dialogInstance.addEventListener("render", () => {
      normalizedConfig.render(toDialogHtmlLike(dialogInstance), dialogInstance);
    });
  }
  return {
    get element() {
      return toDialogHtmlLike(dialogInstance);
    },
    render(force = true) {
      const renderResult = dialogInstance.render({ force: Boolean(force) });
      if (renderResult && typeof renderResult.catch === "function") {
        void renderResult.catch(error => {
          bmLog.warn("dialog-v2 render failed", {
            title: String(normalizedConfig.title || ""),
            error
          });
        });
      }
      return dialogInstance;
    },
    close(optionsArg = {}) {
      return dialogInstance.close(optionsArg);
    },
    instance: dialogInstance
  };
}

export function createBloodmanDialog(config, options = undefined) {
  const dialogV2Shim = createDialogV2Shim(config, options);
  if (dialogV2Shim) return dialogV2Shim;
  const DialogClass = getDialogClass();
  if (typeof DialogClass !== "function") return null;
  return options === undefined ? new DialogClass(config) : new DialogClass(config, options);
}

export function renderBloodmanDialog(config, options = undefined) {
  const dialog = createBloodmanDialog(config, options);
  if (!dialog || typeof dialog.render !== "function") {
    bmLog.warn("dialog render skipped (Dialog API unavailable)", {
      title: String(config?.title || "")
    });
    return null;
  }
  dialog.render(true);
  return dialog;
}
