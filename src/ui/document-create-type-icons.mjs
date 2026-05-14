import { bmLog } from "../core/logger.mjs";

export const ACTOR_CREATE_TYPE_ICONS = Object.freeze({
  "personnage": "fa-masks-theater",
  "personnage-non-joueur": "fa-mask"
});

export const ITEM_CREATE_TYPE_ICONS = Object.freeze({
  "arme": "fa-gun",
  "objet": "fa-box-open",
  "ration": "fa-utensils",
  "soin": "fa-kit-medical",
  "protection": "fa-shield-halved",
  "aptitude": "fa-hand-fist",
  "pouvoir": "fa-bolt"
});

const CREATE_TYPE_PICKER_ROOT_CLASS = "bm-doc-type-picker";
const CREATE_TYPE_EMOJI_BY_ICON = Object.freeze({
  "fa-masks-theater": "\u{1F3AD}",
  "fa-mask": "\u{1F479}",
  "fa-gun": "\u{1F52B}",
  "fa-box-open": "\u{1F4E6}",
  "fa-utensils": "\u{1F37D}\u{FE0F}",
  "fa-kit-medical": "\u{1F489}",
  "fa-shield-halved": "\u{1F6E1}\u{FE0F}",
  "fa-hand-fist": "\u{270A}",
  "fa-bolt": "\u{26A1}"
});
const CREATE_TYPE_REFRESH_DEBOUNCE_MS = 120;
const CREATE_TYPE_REFRESH_MAX_ROOTS = 40;

let createTypeRefreshTimerId = null;
let createTypeRefreshRunning = false;
let createTypeRefreshPending = false;
const createTypeRefreshRoots = new Set();

function isHTMLElement(value) {
  return typeof HTMLElement !== "undefined" && value instanceof HTMLElement;
}

function isHTMLSelectElement(value) {
  return typeof HTMLSelectElement !== "undefined" && value instanceof HTMLSelectElement;
}

function getDocument() {
  return globalThis.document || null;
}

export function normalizeCreateTypeLabel(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function getCreateTypeIconByTypeKey(typeKey) {
  const key = String(typeKey || "").trim().toLowerCase();
  return ACTOR_CREATE_TYPE_ICONS[key] || ITEM_CREATE_TYPE_ICONS[key] || "";
}

export function getCreateTypeIconByLabelText(labelText) {
  const normalized = normalizeCreateTypeLabel(labelText);
  if (!normalized) return "";
  if (normalized.includes("non joueur")) return "fa-mask";
  if (normalized.includes("joueur")) return "fa-masks-theater";
  if (normalized.includes("arme")) return "fa-gun";
  if (normalized.includes("protection")) return "fa-shield-halved";
  if (normalized.includes("aptitude")) return "fa-hand-fist";
  if (normalized.includes("pouvoir")) return "fa-bolt";
  if (normalized.includes("ration")) return "fa-utensils";
  if (normalized.includes("soin")) return "fa-kit-medical";
  if (normalized.includes("objet")) return "fa-box-open";
  return "";
}

function cleanCreateTypeLabelText(labelText) {
  return String(labelText || "")
    .replace(/^[\s\u25A1\u25A0\u2610\u2611\u2612\uF000-\uF8FF]+/g, "")
    .trim();
}

function getCreateTypeEmoji(iconClass) {
  return CREATE_TYPE_EMOJI_BY_ICON[String(iconClass || "").trim()] || "";
}

function isDocumentTypeSelect(selectEl) {
  if (!isHTMLSelectElement(selectEl)) return false;
  if ((selectEl.name || "").toLowerCase() === "type") return true;
  const keywords = ["joueur", "non joueur", "arme", "aptitude", "objet", "pouvoir", "protection", "ration", "soin"];
  const options = Array.from(selectEl.options || []);
  return options.some(option => {
    const label = normalizeCreateTypeLabel(option?.dataset?.bmTypeLabel || option?.textContent || "");
    return keywords.some(keyword => label.includes(keyword));
  });
}

function findCreateTypeLabelHost(optionRow, input) {
  const direct = optionRow?.querySelector(".label, .name, .title, .option-name, .document-name");
  if (direct) return direct;
  const textCandidates = optionRow?.querySelectorAll("span, div, p, strong, h4") || [];
  for (const candidate of textCandidates) {
    if (!candidate) continue;
    if (candidate.classList?.contains("bm-doc-type-label-with-icon")) return candidate;
    const text = String(candidate.textContent || "").trim();
    if (text) return candidate;
  }
  if (input?.parentElement && input.parentElement !== optionRow) return input.parentElement;
  return optionRow;
}

function appendCreateTypeIcon(optionRow, input, iconClass) {
  if (!optionRow || !iconClass) return;
  if (optionRow.querySelector(".bm-doc-type-icon")) return;
  const host = findCreateTypeLabelHost(optionRow, input);
  if (!host) return;
  const documentRef = getDocument();
  if (!documentRef?.createElement) return;
  host.classList?.add("bm-doc-type-label-with-icon");
  const icon = documentRef.createElement("i");
  icon.className = `bm-doc-type-icon fa-solid ${iconClass}`;
  if (host.firstChild) host.insertBefore(icon, host.firstChild);
  else host.appendChild(icon);
}

function decorateCreateTypeSelect(selectEl) {
  try {
    if (!isHTMLSelectElement(selectEl) || !selectEl.options?.length) return;
    if (!isDocumentTypeSelect(selectEl)) return;
    selectEl.classList.remove("bm-doc-type-select-native");
    delete selectEl.dataset.bmTypeEnhanced;
    const existingPicker = selectEl.parentElement?.querySelector(`.${CREATE_TYPE_PICKER_ROOT_CLASS}`);
    existingPicker?.remove();

    for (const option of Array.from(selectEl.options || [])) {
      const rawLabel = option.dataset?.bmTypeLabel || String(option.textContent || "");
      const baseLabel = cleanCreateTypeLabelText(rawLabel);
      if (!baseLabel) continue;
      if (!option.dataset.bmTypeLabel) option.dataset.bmTypeLabel = baseLabel;
      const iconClass = getCreateTypeIconByTypeKey(option.value) || getCreateTypeIconByLabelText(baseLabel);
      const emoji = getCreateTypeEmoji(iconClass);
      const nextLabel = emoji ? `${emoji} ${baseLabel}` : baseLabel;
      if (String(option.textContent || "") !== nextLabel) option.textContent = nextLabel;
    }
  } catch (error) {
    try {
      if (selectEl?.classList) selectEl.classList.remove("bm-doc-type-select-native");
      if (selectEl?.dataset) delete selectEl.dataset.bmTypeEnhanced;
      const picker = selectEl?.parentElement?.querySelector(`.${CREATE_TYPE_PICKER_ROOT_CLASS}`);
      picker?.remove();
    } catch (_cleanupError) {
      // non-fatal cleanup
    }
    bmLog.warn("[bloodman] create type icon picker disabled for this select", error);
  }
}

export function injectDocumentCreateTypeIcons(htmlLike) {
  try {
    const root = htmlLike?.[0] || htmlLike;
    if (isHTMLElement(root)) {
      const typeSelects = root.querySelectorAll("select[name='type']");
      for (const selectEl of typeSelects) decorateCreateTypeSelect(selectEl);

      const typeInputs = root.querySelectorAll("input[name='type']");
      for (const input of typeInputs) {
        const optionRow = input.closest("label, li, .form-group, .option, [data-value]");
        if (!optionRow) continue;
        const typeKey = input.value || optionRow.dataset?.value || "";
        const rowText = String(optionRow.textContent || "");
        const iconClass = getCreateTypeIconByTypeKey(typeKey) || getCreateTypeIconByLabelText(rowText);
        appendCreateTypeIcon(optionRow, input, iconClass);
      }
      return;
    }

    const documentRef = getDocument();
    if (!documentRef?.querySelectorAll) return;
    const fallbackSelects = documentRef.querySelectorAll(
      ".window-app select[name='type'], .application select[name='type'], dialog select[name='type']"
    );
    for (const selectEl of fallbackSelects) decorateCreateTypeSelect(selectEl);
  } catch (error) {
    bmLog.warn("[bloodman] create type icon injection skipped", error);
  }
}

export function refreshAllCreateTypeIcons() {
  const documentRef = getDocument();
  if (!documentRef?.querySelectorAll) return;
  const selectNodes = documentRef.querySelectorAll(
    ".window-app select[name='type'], .application select[name='type'], dialog select[name='type']"
  );
  for (const selectEl of selectNodes) decorateCreateTypeSelect(selectEl);
}

function shouldRefreshCreateTypeIconsForNode(node) {
  if (!isHTMLElement(node)) return false;
  if (node.matches("select[name='type'], input[name='type'], .window-app, .application, dialog")) return true;
  if (!node.childElementCount) return false;
  return Boolean(node.querySelector("select[name='type'], input[name='type']"));
}

function resolveCreateTypeRefreshRoot(node) {
  if (!isHTMLElement(node)) return null;
  const appRootSelector = ".window-app, .application, dialog";
  if (node.matches(appRootSelector)) return node;
  const closestRoot = node.closest(appRootSelector);
  if (closestRoot) return closestRoot;
  const nestedRoot = node.querySelector(appRootSelector);
  if (isHTMLElement(nestedRoot)) return nestedRoot;
  return node;
}

function scheduleCreateTypeIconsRefresh() {
  if (createTypeRefreshTimerId) return;
  createTypeRefreshTimerId = setTimeout(() => {
    createTypeRefreshTimerId = null;
    flushCreateTypeIconsRefreshQueue();
  }, CREATE_TYPE_REFRESH_DEBOUNCE_MS);
}

export function queueCreateTypeIconsRefreshFromMutations(mutations = []) {
  let hasRelevantMutation = false;
  let saturated = false;
  for (const mutation of mutations || []) {
    if (saturated) break;
    if (!mutation?.addedNodes?.length) continue;
    for (const node of mutation.addedNodes) {
      if (!shouldRefreshCreateTypeIconsForNode(node)) continue;
      const root = resolveCreateTypeRefreshRoot(node) || node;
      createTypeRefreshRoots.add(root);
      hasRelevantMutation = true;
      if (createTypeRefreshRoots.size >= CREATE_TYPE_REFRESH_MAX_ROOTS) {
        createTypeRefreshRoots.clear();
        const documentRef = getDocument();
        if (documentRef?.body) createTypeRefreshRoots.add(documentRef.body);
        saturated = true;
        break;
      }
    }
  }
  if (!hasRelevantMutation) return;
  scheduleCreateTypeIconsRefresh();
}

export function flushCreateTypeIconsRefreshQueue() {
  if (createTypeRefreshRunning) {
    createTypeRefreshPending = true;
    return;
  }
  createTypeRefreshRunning = true;
  try {
    const roots = Array.from(createTypeRefreshRoots).filter(node => node?.isConnected);
    createTypeRefreshRoots.clear();
    if (!roots.length) return;
    const cappedRoots = roots.slice(0, CREATE_TYPE_REFRESH_MAX_ROOTS);
    for (const root of cappedRoots) injectDocumentCreateTypeIcons(root);
    if (roots.length > cappedRoots.length) {
      for (const root of roots.slice(cappedRoots.length)) {
        if (root?.isConnected) createTypeRefreshRoots.add(root);
      }
      createTypeRefreshPending = true;
    }
  } catch (error) {
    bmLog.warn("create type icon refresh queue failed", { error });
  } finally {
    createTypeRefreshRunning = false;
    if (createTypeRefreshPending || createTypeRefreshRoots.size > 0) {
      createTypeRefreshPending = false;
      scheduleCreateTypeIconsRefresh();
    }
  }
}

export function injectCreateTypeIconsFromHook(htmlLike, sourceHook = "unknown") {
  try {
    const root = htmlLike?.[0] || htmlLike;
    injectDocumentCreateTypeIcons(root);
  } catch (error) {
    bmLog.warn(`[bloodman] ${sourceHook} type icon hook skipped`, error);
  }
}

export function registerCreateTypeIconRenderHooks() {
  if (!globalThis.Hooks || typeof Hooks.on !== "function") return false;
  if (globalThis.__bloodmanCreateTypeIconHooksRegistered) return true;
  globalThis.__bloodmanCreateTypeIconHooksRegistered = true;
  const hookBindings = [
    ["renderDialog", "renderDialog"],
    ["renderApplication", "renderApplication"],
    ["renderApplicationV1", "renderApplicationV1"],
    ["renderApplicationV2", "renderApplicationV2"],
    ["renderDocumentCreateDialog", "renderDocumentCreateDialog"],
    ["renderDocumentCreateDialogV1", "renderDocumentCreateDialogV1"],
    ["renderDocumentCreateDialogV2", "renderDocumentCreateDialogV2"]
  ];
  for (const [hookName, sourceHook] of hookBindings) {
    Hooks.on(hookName, (_app, htmlLike) => {
      injectCreateTypeIconsFromHook(htmlLike, sourceHook);
    });
  }
  return true;
}

export function installCreateTypeIconObserver({ enabled = false } = {}) {
  const windowRef = globalThis.window || globalThis;
  const documentRef = getDocument();
  const existingObserver = windowRef.__bmCreateTypeIconObserver;
  if (existingObserver && typeof existingObserver.disconnect === "function") {
    try {
      existingObserver.disconnect();
    } catch (_disconnectError) {
      // ignore stale observer cleanup failure
    }
    windowRef.__bmCreateTypeIconObserver = null;
  }

  if (!enabled || windowRef.__bmCreateTypeIconObserver) return false;
  if (!documentRef?.body || typeof MutationObserver !== "function") return false;
  const observer = new MutationObserver(mutations => {
    queueCreateTypeIconsRefreshFromMutations(mutations);
  });
  observer.observe(documentRef.body, { childList: true, subtree: true });
  windowRef.__bmCreateTypeIconObserver = observer;
  return true;
}
