import { bmLog } from "../core/logger.mjs";

export function getFilePickerClass() {
  const namespaced = globalThis.foundry?.applications?.apps?.FilePicker?.implementation;
  if (typeof namespaced === "function") return namespaced;
  if (typeof globalThis.FilePicker === "function") return globalThis.FilePicker;
  return null;
}

export function renderFilePickerSafely(picker, contextLabel = "file-picker") {
  if (!picker || typeof picker.render !== "function") return false;
  try {
    const renderResult = picker.render(true);
    if (renderResult && typeof renderResult.then === "function") {
      void renderResult.catch(error => {
        bmLog.warn(`${contextLabel}: render failed`, { error });
      });
    }
    return true;
  } catch (error) {
    bmLog.warn(`${contextLabel}: render failed`, { error });
    return false;
  }
}
