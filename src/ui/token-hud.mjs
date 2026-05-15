import { SYSTEM_ID, SYSTEM_ROOT_PATH } from "../core/constants.mjs";
import { bmLog } from "../core/logger.mjs";
import { isV14Plus } from "../compat/index.mjs";
import {
  actorHasStatusInFamily,
  clearActorStatusFamily,
  deleteStatusEffectDocuments,
  findStatusEffect,
  getActiveEffectStatusIds,
  getActorEffectDocuments,
  getActorStatusEffectDocumentsByFamily,
  normalizeStatusValue,
  tokenHasStatusInFamily
} from "../rules/status-effect-sync.mjs";
import { getFilePickerClass } from "./file-picker.mjs";

const TOKEN_HUD_COUNTER_FLAG_KEY = "tokenHudTurnCounter";
const TOKEN_HUD_TURN_MIN = 1;
const TOKEN_HUD_TURN_MAX = 12;
const TOKEN_HUD_RENDER_PATCH_FLAG = "__bmTokenHudRenderPatched";
const TOKEN_HUD_ICON_SYNC_INTERVAL_MS = 2_000;
const TOKEN_HUD_TURN_SELECTION_BY_TOKEN = new Map();
const TOKEN_HUD_LAST_STATUS_BY_TOKEN = new Map();
let TOKEN_HUD_LOCAL_SVG_ICON_NAMES = new Set();
let TOKEN_HUD_ICON_SYNC_PROMISE = null;
let TOKEN_HUD_LAST_ICON_SYNC_AT = 0;
let TOKEN_HUD_ICON_CACHE_BUSTER = Date.now();
let TOKEN_HUD_DOM_OBSERVER = null;
let TOKEN_HUD_DOM_SYNC_FRAME = null;

export function getTokenHudRootElement(htmlLike, fallback = null) {
  if (htmlLike instanceof HTMLElement) return htmlLike;

  const candidateFromCollection = Array.isArray(htmlLike)
    ? htmlLike[0]
    : htmlLike?.[0];
  if (candidateFromCollection instanceof HTMLElement) return candidateFromCollection;

  if (fallback instanceof HTMLElement) return fallback;

  const domRoot = document.getElementById("token-hud");
  return domRoot instanceof HTMLElement ? domRoot : null;
}

export function getTokenHudStorageKey(tokenDoc) {
  return String(tokenDoc?.uuid || tokenDoc?.id || "").trim();
}

export function getTokenDocumentFromPlaceable(tokenLike) {
  return tokenLike?.document || tokenLike || null;
}

export function getTokenHudActorForDocument(tokenDoc, fallbackActor = null) {
  if (!tokenDoc) return fallbackActor || null;
  if (tokenDoc.actorLink === true) {
    return tokenDoc.actor
      || (tokenDoc.actorId ? globalThis.game?.actors?.get?.(tokenDoc.actorId) : null)
      || fallbackActor
      || null;
  }
  return tokenDoc.actor || fallbackActor || null;
}

export function getTokenHudTargetTokenDocuments(hud) {
  const hudTokenDoc = getTokenDocumentFromPlaceable(hud?.document || hud?.object);
  const hudKey = getTokenHudStorageKey(hudTokenDoc);
  const controlled = Array.isArray(globalThis.canvas?.tokens?.controlled)
    ? globalThis.canvas.tokens.controlled
    : [];
  const docs = [];
  const seen = new Set();

  for (const token of controlled) {
    const tokenDoc = getTokenDocumentFromPlaceable(token);
    const key = getTokenHudStorageKey(tokenDoc);
    if (!tokenDoc || !key || seen.has(key)) continue;
    docs.push(tokenDoc);
    seen.add(key);
  }

  if (docs.length > 1 && hudKey && seen.has(hudKey)) return docs;
  return hudTokenDoc ? [hudTokenDoc] : docs.slice(0, 1);
}

export function clampTokenHudTurnValue(value, { min = 1, max = 12 } = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

export function queryTokenHudControl(root, selectors = []) {
  if (!(root instanceof HTMLElement)) return null;
  for (const selector of selectors) {
    if (!selector) continue;
    const element = root.querySelector(selector);
    if (element) return element;
  }
  return null;
}

export function ensureTokenHudColumn(root, name) {
  if (!(root instanceof HTMLElement) || !name) return null;
  const existing = root.querySelector(`.col.${name}`);
  if (existing) return existing;
  const column = document.createElement("div");
  column.className = `col ${name}`;
  root.appendChild(column);
  return column;
}

export function reorderTokenHudColumn(column, orderedNodes = []) {
  if (!(column instanceof HTMLElement)) return;
  const unique = [];
  const seen = new Set();
  for (const node of orderedNodes) {
    if (!(node instanceof HTMLElement)) continue;
    if (seen.has(node)) continue;
    seen.add(node);
    unique.push(node);
  }
  const extras = Array.from(column.children).filter(node => !seen.has(node));
  column.replaceChildren(...unique, ...extras);
}

export function ensureTokenHudLayoutContainer(root, className) {
  if (!(root instanceof HTMLElement) || !className) return null;
  let container = root.querySelector(`.${className}`);
  if (!(container instanceof HTMLElement)) {
    container = document.createElement("div");
    container.className = className;
    root.appendChild(container);
  }
  return container;
}

export function resolveTokenHudEffectsButton(root) {
  const directMatch = queryTokenHudControl(root, [
    "button[data-action='togglePalette'][data-palette='effects']",
    "[data-action='togglePalette'][data-palette='effects']",
    "[data-action='toggleStatusEffects']",
    "button[data-action='toggleStatusEffects']",
    "button.control-icon.effects",
    "button[data-action='effects']",
    ".control-icon[data-action='togglePalette'][data-palette='effects']",
    ".control-icon.effects",
    ".control-icon[data-action='effects']",
    "[data-action='effects']",
    "[data-tooltip='HUD.AssignStatusEffects']",
    "[data-tooltip-text='HUD.AssignStatusEffects']"
  ]);
  if (directMatch instanceof HTMLElement) return directMatch;

  const effectsPalette = resolveTokenHudEffectsPalette(root);
  const previousSibling = effectsPalette?.previousElementSibling;
  if (previousSibling instanceof HTMLElement) return previousSibling;

  const rightCol = root instanceof HTMLElement ? root.querySelector(".col.right") : null;
  if (rightCol instanceof HTMLElement) {
    const paletteSibling = Array.from(rightCol.querySelectorAll(".palette.status-effects, .palette[data-palette='effects'], .status-effects"))
      .map(palette => palette?.previousElementSibling)
      .find(node => node instanceof HTMLElement);
    if (paletteSibling instanceof HTMLElement) return paletteSibling;
  }

  return null;
}

export function resolveTokenHudEffectsPalette(root) {
  let palette = queryTokenHudControl(root, [
    ".palette[data-palette='effects']",
    ".palette.status-effects",
    ".status-effects"
  ]);
  if (!(palette instanceof HTMLElement) && root instanceof HTMLElement) {
    palette = Array.from(root.querySelectorAll(".palette, .status-effects"))
      .find(node => node instanceof HTMLElement && (
        node.matches(".palette.status-effects, .palette[data-palette='effects'], .status-effects")
        || Boolean(node.querySelector?.(".effect-control[data-status-id]"))
      )) || null;
  }
  if (!(palette instanceof HTMLElement)) return null;
  palette.classList.add("palette", "status-effects");
  if (!palette.dataset.palette) palette.dataset.palette = "effects";
  return palette;
}

export function resolveTokenHudMovementButton(root) {
  return queryTokenHudControl(root, [
    "button[data-action='togglePalette'][data-palette='movementActions']",
    "button[data-action='movement']",
    "button[data-action='movementAction']",
    ".control-icon[data-action='togglePalette'][data-palette='movementActions']",
    ".control-icon[data-action='movement']"
  ]);
}

export function resolveTokenHudMovementPalette(root) {
  const palette = queryTokenHudControl(root, [
    ".palette[data-palette='movementActions']",
    ".movement-actions"
  ]);
  if (!(palette instanceof HTMLElement)) return null;
  palette.classList.add("palette", "movement-actions");
  if (!palette.dataset.palette) palette.dataset.palette = "movementActions";
  return palette;
}

export function arrangeTokenHudControlLayout(root) {
  if (!(root instanceof HTMLElement)) return;
  const leftCol = ensureTokenHudColumn(root, "left");
  const middleCol = ensureTokenHudColumn(root, "middle");
  const rightCol = ensureTokenHudColumn(root, "right");
  if (!(leftCol && middleCol && rightCol)) return;

  const elevation = queryTokenHudControl(root, [
    ".attribute.elevation",
    ".attribute[data-attribute='elevation']",
    "[name='elevation']"
  ])?.closest(".attribute") || null;

  const sortUp = queryTokenHudControl(root, [
    "button[data-action='sort'][data-direction='up']",
    "button[data-action='sort-up']",
    "button[data-action='sortUp']",
    "button[data-direction='up'][data-action='sort']"
  ]);

  const sortDown = queryTokenHudControl(root, [
    "button[data-action='sort'][data-direction='down']",
    "button[data-action='sort-down']",
    "button[data-action='sortDown']",
    "button[data-direction='down'][data-action='sort']"
  ]);

  const config = queryTokenHudControl(root, [
    "button[data-action='config']",
    ".control-icon[data-action='config']"
  ]);

  const visibility = queryTokenHudControl(root, [
    "button[data-action='visibility']",
    ".control-icon[data-action='visibility']"
  ]);

  const effectsButton = resolveTokenHudEffectsButton(root);
  const effectsPalette = resolveTokenHudEffectsPalette(root);

  const movementButton = resolveTokenHudMovementButton(root);
  const movementPalette = resolveTokenHudMovementPalette(root);

  const target = queryTokenHudControl(root, [
    "button[data-action='target']",
    ".control-icon[data-action='target']"
  ]);

  const combat = queryTokenHudControl(root, [
    "button[data-action='combat']",
    ".control-icon[data-action='combat']"
  ]);

  const bar2 = queryTokenHudControl(root, [".attribute.bar2"]);
  const bar1 = queryTokenHudControl(root, [".attribute.bar1"]);

  const topRow = ensureTokenHudLayoutContainer(root, "bm-token-hud-top-row");
  if (topRow instanceof HTMLElement) {
    if (effectsButton instanceof HTMLElement) topRow.appendChild(effectsButton);
    if (effectsPalette instanceof HTMLElement) topRow.appendChild(effectsPalette);
  }

  const bottomRow = ensureTokenHudLayoutContainer(root, "bm-token-hud-bottom-row");
  const bottomSort = ensureTokenHudLayoutContainer(root, "bm-token-hud-bottom-sort");
  if (bottomRow instanceof HTMLElement && bottomSort instanceof HTMLElement) {
    if (sortUp instanceof HTMLElement) bottomSort.appendChild(sortUp);
    if (sortDown instanceof HTMLElement) bottomSort.appendChild(sortDown);
    reorderTokenHudColumn(bottomRow, [config, elevation, bottomSort]);
  }

  reorderTokenHudColumn(leftCol, [combat, target]);
  reorderTokenHudColumn(middleCol, [bar2, bar1]);
  reorderTokenHudColumn(rightCol, [
    visibility,
    movementButton,
    movementPalette,
    ...Array.from(rightCol.children).filter(node => {
      if (!(node instanceof HTMLElement)) return false;
      return node !== visibility && node !== movementButton && node !== movementPalette;
    })
  ]);
}

export function getTokenHudLocalIconDirectoryPath() {
  return `${SYSTEM_ROOT_PATH}/images`;
}

export function extractFileNameFromPath(path) {
  const normalized = String(path || "").trim();
  if (!normalized) return "";
  const cleanPath = normalized.split("#")[0].split("?")[0];
  const chunks = cleanPath.split("/");
  return String(chunks[chunks.length - 1] || "").trim();
}

export function isSvgAssetPath(path) {
  const normalized = String(path || "").trim();
  if (!normalized) return false;
  return /\.svg(?:$|[?#])/i.test(normalized);
}

export function collectTokenHudSvgStatusSources() {
  const sources = new Map();
  const effects = Array.isArray(globalThis.CONFIG?.statusEffects) ? globalThis.CONFIG.statusEffects : [];
  for (const effect of effects) {
    if (!effect || typeof effect !== "object") continue;
    for (const key of ["img", "icon"]) {
      const sourcePath = String(effect[key] || "").trim();
      if (!isSvgAssetPath(sourcePath)) continue;
      const fileName = extractFileNameFromPath(sourcePath);
      if (!fileName) continue;
      const lower = fileName.toLowerCase();
      if (!sources.has(lower)) sources.set(lower, { fileName, sourcePath });
    }
  }
  return sources;
}

export async function listTokenHudLocalSvgIconNames() {
  try {
    const FilePickerClass = getFilePickerClass();
    if (typeof FilePickerClass?.browse !== "function") return new Set();
    const browseResult = await FilePickerClass.browse("data", getTokenHudLocalIconDirectoryPath());
    const names = new Set();
    for (const filePath of Array.isArray(browseResult?.files) ? browseResult.files : []) {
      if (!isSvgAssetPath(filePath)) continue;
      const fileName = extractFileNameFromPath(filePath).toLowerCase();
      if (fileName) names.add(fileName);
    }
    return names;
  } catch (_error) {
    return new Set();
  }
}

export async function copyTokenHudSvgIconToLocalFolder(fileName, sourcePath) {
  if (!fileName || !sourcePath) return false;
  try {
    const response = await fetch(sourcePath, { cache: "no-store" });
    if (!response?.ok) return false;
    const content = await response.text();
    if (!/<svg[\s>]/i.test(content)) return false;
    const file = new File([content], fileName, { type: "image/svg+xml" });
    const FilePickerClass = getFilePickerClass();
    if (typeof FilePickerClass?.upload !== "function") return false;
    await FilePickerClass.upload("data", getTokenHudLocalIconDirectoryPath(), file, {}, { notify: false });
    return true;
  } catch (_error) {
    return false;
  }
}

export async function ensureTokenHudLocalSvgIcons({ copyMissing = false, force = false } = {}) {
  const now = Date.now();
  if (
    !force
    && !copyMissing
    && TOKEN_HUD_LOCAL_SVG_ICON_NAMES.size
    && (now - TOKEN_HUD_LAST_ICON_SYNC_AT) < TOKEN_HUD_ICON_SYNC_INTERVAL_MS
  ) {
    return TOKEN_HUD_LOCAL_SVG_ICON_NAMES;
  }

  if (TOKEN_HUD_ICON_SYNC_PROMISE) return TOKEN_HUD_ICON_SYNC_PROMISE;

  TOKEN_HUD_ICON_SYNC_PROMISE = (async () => {
    const svgSources = collectTokenHudSvgStatusSources();
    let localIconNames = await listTokenHudLocalSvgIconNames();

    if (copyMissing && globalThis.game?.user?.isGM && svgSources.size) {
      for (const { fileName, sourcePath } of svgSources.values()) {
        const lower = fileName.toLowerCase();
        if (localIconNames.has(lower)) continue;
        const copied = await copyTokenHudSvgIconToLocalFolder(fileName, sourcePath);
        if (copied) localIconNames.add(lower);
      }
      localIconNames = await listTokenHudLocalSvgIconNames();
    }

    TOKEN_HUD_LOCAL_SVG_ICON_NAMES = localIconNames;
    TOKEN_HUD_LAST_ICON_SYNC_AT = Date.now();
    TOKEN_HUD_ICON_CACHE_BUSTER = TOKEN_HUD_LAST_ICON_SYNC_AT;
    return TOKEN_HUD_LOCAL_SVG_ICON_NAMES;
  })().finally(() => {
    TOKEN_HUD_ICON_SYNC_PROMISE = null;
  });

  return TOKEN_HUD_ICON_SYNC_PROMISE;
}

export function resolveTokenHudLocalSvgIconPath(sourcePath) {
  const normalized = String(sourcePath || "").trim();
  if (!normalized || !isSvgAssetPath(normalized)) return normalized;
  const fileName = extractFileNameFromPath(normalized);
  const lower = fileName.toLowerCase();
  if (!fileName || !TOKEN_HUD_LOCAL_SVG_ICON_NAMES.has(lower)) return normalized;
  return `${getTokenHudLocalIconDirectoryPath()}/${fileName}?v=${TOKEN_HUD_ICON_CACHE_BUSTER}`;
}

export function refreshTokenHudStatusEffectIconPaths({ bumpCache = false } = {}) {
  if (bumpCache) TOKEN_HUD_ICON_CACHE_BUSTER = Date.now();
  const effects = Array.isArray(globalThis.CONFIG?.statusEffects) ? globalThis.CONFIG.statusEffects : [];
  for (const effect of effects) {
    if (!effect || typeof effect !== "object") continue;
    const nextImg = resolveTokenHudLocalSvgIconPath(effect.img);
    if (nextImg && nextImg !== effect.img) effect.img = nextImg;
    const nextIcon = resolveTokenHudLocalSvgIconPath(effect.icon);
    if (nextIcon && nextIcon !== effect.icon) effect.icon = nextIcon;
  }
}

export function getTokenHudCounterFlagData(effectDoc) {
  const data = globalThis.foundry?.utils?.getProperty?.(effectDoc, `flags.${SYSTEM_ID}.${TOKEN_HUD_COUNTER_FLAG_KEY}`);
  return data && typeof data === "object" ? data : null;
}

export function isTokenHudCounterEffect(effectDoc, statusId = "") {
  const flagData = getTokenHudCounterFlagData(effectDoc);
  if (!flagData) return false;
  if (!statusId) return true;
  return normalizeStatusValue(flagData.statusId) === normalizeStatusValue(statusId);
}

export function getTokenHudCounterEffects(actor, statusId = "") {
  const normalizedStatusId = normalizeStatusValue(statusId);
  return getActorEffectDocuments(actor).filter(effectDoc => {
    if (!isTokenHudCounterEffect(effectDoc)) return false;
    if (!normalizedStatusId) return true;
    return isTokenHudCounterEffect(effectDoc, normalizedStatusId);
  });
}

export async function clearTokenHudCounterEffects(actor, statusId = "") {
  const counterEffects = getTokenHudCounterEffects(actor, statusId);
  if (!counterEffects.length) return false;
  return deleteStatusEffectDocuments(counterEffects);
}

export async function cleanupTokenHudOrphanCounterEffects(actor) {
  if (!actor) return false;
  const orphanEffects = [];
  for (const effectDoc of getTokenHudCounterEffects(actor)) {
    const statusId = normalizeStatusValue(getTokenHudCounterFlagData(effectDoc)?.statusId);
    if (!statusId) {
      orphanEffects.push(effectDoc);
      continue;
    }
    if (!actorHasStatusInFamily(actor, [statusId])) orphanEffects.push(effectDoc);
  }
  if (!orphanEffects.length) return false;
  return deleteStatusEffectDocuments(orphanEffects);
}

export function buildTokenHudTurnDurationData(_turns) {
  return {
    value: null,
    units: "seconds",
    expiry: null
  };
}

export function buildTokenHudCounterDurationData() {
  return {
    value: null,
    units: "seconds",
    expiry: null
  };
}

export function buildTokenHudCounterIconPath(path, statusId, roundCount) {
  const source = String(path || "").trim();
  if (!source) return source;
  const separator = source.includes("?") ? "&" : "?";
  const status = encodeURIComponent(normalizeStatusValue(statusId) || "status");
  const round = encodeURIComponent(String(roundCount || 1));
  return `${source}${separator}bmCounter=${status}-${round}`;
}

export function resolveTokenHudEffectOrigin(tokenDoc) {
  const uuid = String(tokenDoc?.uuid || "").trim();
  return uuid ? uuid : null;
}

export function buildTokenHudEmptyEffectChangesData() {
  const data = { changes: [] };
  if (isV14Plus()) data.system = { changes: [] };
  return data;
}

export async function setTokenHudEffectDuration(effectDoc, turns) {
  if (!effectDoc) return false;
  const duration = buildTokenHudTurnDurationData(turns);
  await effectDoc.update({
    duration,
    showIcon: globalThis.CONST?.ACTIVE_EFFECT_SHOW_ICON?.NEVER ?? 0
  }).catch(() => null);
  return true;
}

export function getTokenHudPrimaryStatusEffectDocument(actor, statusId) {
  const normalizedStatusId = normalizeStatusValue(statusId);
  if (!actor || !normalizedStatusId) return null;
  const candidates = getActorStatusEffectDocumentsByFamily(actor, [normalizedStatusId]);
  for (const effectDoc of candidates) {
    if (isTokenHudCounterEffect(effectDoc)) continue;
    const statusIds = getActiveEffectStatusIds(effectDoc);
    if (statusIds.includes(normalizedStatusId)) return effectDoc;
  }
  return candidates.find(effectDoc => !isTokenHudCounterEffect(effectDoc)) || null;
}

export function buildTokenHudTurnCounterEffectPayloads({ statusId, turns, primaryEffect, tokenDoc }) {
  const totalTurns = clampTokenHudTurnValue(turns);
  const statusDef = findStatusEffect([statusId]) || null;
  const statusNameKey = String(statusDef?.name ?? statusDef?.label ?? "").trim();
  const i18n = globalThis.game?.i18n;
  const statusName = statusNameKey
    ? (i18n?.has?.(statusNameKey) ? i18n.localize(statusNameKey) : statusNameKey)
    : String(primaryEffect?.name || statusId || "Etat").trim();
  const rawStatusImg = String(statusDef?.img || statusDef?.icon || primaryEffect?.img || "icons/svg/aura.svg").trim();
  const statusImg = resolveTokenHudLocalSvgIconPath(rawStatusImg) || rawStatusImg;
  const normalizedStatusId = normalizeStatusValue(statusId);
  const tokenRef = resolveTokenHudEffectOrigin(tokenDoc);
  const payloads = [];

  for (let roundCount = 1; roundCount <= totalTurns; roundCount += 1) {
    payloads.push({
      name: `${statusName} (${roundCount})`,
      img: buildTokenHudCounterIconPath(statusImg, normalizedStatusId, roundCount),
      ...(tokenRef ? { origin: tokenRef } : {}),
      statuses: [],
      ...buildTokenHudEmptyEffectChangesData(),
      duration: buildTokenHudCounterDurationData(),
      showIcon: globalThis.CONST?.ACTIVE_EFFECT_SHOW_ICON?.ALWAYS ?? 2,
      flags: {
        [SYSTEM_ID]: {
          [TOKEN_HUD_COUNTER_FLAG_KEY]: {
            statusId: normalizedStatusId,
            token: tokenRef,
            rounds: roundCount
          }
        }
      }
    });
  }

  return payloads;
}

export function getTokenHudCounterPriorityValue(effectDoc) {
  const fromFlag = Number(getTokenHudCounterFlagData(effectDoc)?.rounds);
  if (Number.isFinite(fromFlag)) return Math.max(0, Math.floor(fromFlag));
  const fromDuration = Number(globalThis.foundry?.utils?.getProperty?.(effectDoc, "duration.rounds"));
  if (Number.isFinite(fromDuration)) return Math.max(0, Math.floor(fromDuration));
  return 0;
}

export async function decrementTokenHudCountersForActorTurn(actor) {
  if (!actor) return false;
  const allCounters = getTokenHudCounterEffects(actor);
  if (!allCounters.length) return false;

  const statusIds = [...new Set(
    allCounters
      .map(effectDoc => normalizeStatusValue(getTokenHudCounterFlagData(effectDoc)?.statusId))
      .filter(Boolean)
  )];
  if (!statusIds.length) return false;

  let changed = false;
  for (const statusId of statusIds) {
    if (!actorHasStatusInFamily(actor, [statusId])) {
      const cleared = await clearTokenHudCounterEffects(actor, statusId);
      changed = changed || cleared;
      continue;
    }

    const counters = getTokenHudCounterEffects(actor, statusId)
      .sort((a, b) => getTokenHudCounterPriorityValue(b) - getTokenHudCounterPriorityValue(a));
    if (!counters.length) continue;

    const removed = await deleteStatusEffectDocuments([counters[0]]);
    changed = changed || removed;

    const remainingCounters = getTokenHudCounterEffects(actor, statusId);
    if (remainingCounters.length) continue;
    const cleared = await clearActorStatusFamily(actor, [statusId]);
    changed = changed || cleared;
  }

  if (changed) await cleanupTokenHudOrphanCounterEffects(actor);
  return changed;
}

export function buildTokenHudTurnLabel(turns) {
  const count = clampTokenHudTurnValue(turns);
  return `${count} ${count > 1 ? "TOURS" : "TOUR"}`;
}

export function getTokenHudTurnFieldValue(turnField) {
  if (turnField instanceof HTMLSelectElement) {
    return clampTokenHudTurnValue(turnField.value);
  }
  if (!(turnField instanceof HTMLElement)) return TOKEN_HUD_TURN_MIN;
  const valueInput = turnField.querySelector(".bm-token-hud-turn-value");
  if (valueInput instanceof HTMLInputElement) return clampTokenHudTurnValue(valueInput.value);
  return clampTokenHudTurnValue(turnField.dataset.turns || TOKEN_HUD_TURN_MIN);
}

export function setTokenHudTurnFieldValue(turnField, turns) {
  const value = String(clampTokenHudTurnValue(turns));
  if (turnField instanceof HTMLSelectElement) {
    turnField.value = value;
    return;
  }
  if (!(turnField instanceof HTMLElement)) return;
  turnField.dataset.turns = value;
  const valueInput = turnField.querySelector(".bm-token-hud-turn-value");
  if (valueInput instanceof HTMLInputElement) valueInput.value = value;
  const label = turnField.querySelector(".bm-token-hud-turn-label");
  if (label instanceof HTMLElement) label.textContent = buildTokenHudTurnLabel(value);
  const options = turnField.querySelectorAll(".bm-token-hud-turn-option[data-turns]");
  for (const option of options) {
    if (!(option instanceof HTMLElement)) continue;
    const isSelected = option.dataset.turns === value;
    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-selected", isSelected ? "true" : "false");
  }
}

export function buildTokenHudTurnControlContent(wrapper) {
  if (!(wrapper instanceof HTMLElement)) return null;
  wrapper.replaceChildren();

  const valueInput = document.createElement("input");
  valueInput.type = "hidden";
  valueInput.className = "bm-token-hud-turn-value";
  valueInput.name = "bm-token-hud-turns";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "bm-token-hud-turn-toggle";
  toggle.setAttribute("aria-label", "Nombre de tours d'effet");
  toggle.title = "Nombre de tours d'attribution d'effet d'etat (1 a 12)";

  const label = document.createElement("span");
  label.className = "bm-token-hud-turn-label";
  label.textContent = buildTokenHudTurnLabel(TOKEN_HUD_TURN_MIN);

  const caret = document.createElement("i");
  caret.className = "fa-solid fa-chevron-down bm-token-hud-turn-caret";
  caret.setAttribute("inert", "");

  toggle.append(label, caret);

  const menu = document.createElement("div");
  menu.className = "bm-token-hud-turn-menu";
  menu.setAttribute("role", "listbox");

  for (let turns = TOKEN_HUD_TURN_MIN; turns <= TOKEN_HUD_TURN_MAX; turns += 1) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "bm-token-hud-turn-option";
    option.dataset.turns = String(turns);
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", "false");
    option.textContent = buildTokenHudTurnLabel(turns);
    menu.appendChild(option);
  }

  wrapper.append(valueInput, toggle, menu);
  return wrapper;
}

export function positionTokenHudTurnControl(root, wrapper) {
  if (!(root instanceof HTMLElement) || !(wrapper instanceof HTMLElement)) return;
  wrapper.style.left = "50%";
  wrapper.style.top = "calc(-1 * var(--control-size) - 16px)";
  wrapper.style.transform = "translateX(-50%)";
}

export function rememberTokenHudStatusSelection(tokenDocs = [], statusId = "", turns = TOKEN_HUD_TURN_MIN) {
  const normalizedStatusId = normalizeStatusValue(statusId);
  if (!normalizedStatusId) return;
  const selectedTurns = clampTokenHudTurnValue(turns);
  for (const tokenDoc of tokenDocs) {
    const tokenKey = getTokenHudStorageKey(tokenDoc);
    if (!tokenKey) continue;
    TOKEN_HUD_TURN_SELECTION_BY_TOKEN.set(tokenKey, selectedTurns);
    TOKEN_HUD_LAST_STATUS_BY_TOKEN.set(tokenKey, normalizedStatusId);
  }
}

export async function applyTokenHudStatusTurnSelection(hud, statusId, { active = true, turns = TOKEN_HUD_TURN_MIN, overlay = false } = {}) {
  const tokenDoc = getTokenDocumentFromPlaceable(hud?.document || hud?.object);
  const actor = getTokenHudActorForDocument(tokenDoc, hud?.actor || null);
  const normalizedStatusId = normalizeStatusValue(statusId);
  if (!actor || !normalizedStatusId || typeof actor.toggleStatusEffect !== "function") return false;

  await clearTokenHudCounterEffects(actor, normalizedStatusId);

  try {
    await actor.toggleStatusEffect(statusId, { active: Boolean(active), overlay: Boolean(overlay) });
  } catch (error) {
    bmLog.warn("[bloodman] token HUD status toggle failed", { statusId, error });
    return false;
  }

  if (!active) {
    await cleanupTokenHudOrphanCounterEffects(actor);
    return true;
  }

  const primaryEffect = getTokenHudPrimaryStatusEffectDocument(actor, normalizedStatusId);
  if (!primaryEffect) return true;

  const totalTurns = clampTokenHudTurnValue(turns);
  await setTokenHudEffectDuration(primaryEffect, totalTurns);

  const payloads = buildTokenHudTurnCounterEffectPayloads({
    statusId: normalizedStatusId,
    turns: totalTurns,
    primaryEffect,
    tokenDoc
  });
  if (payloads.length) {
    await actor.createEmbeddedDocuments("ActiveEffect", payloads).catch(error => {
      bmLog.warn("[bloodman] token HUD counter effects creation failed", { statusId: normalizedStatusId, error });
    });
  }

  await cleanupTokenHudOrphanCounterEffects(actor);
  return true;
}

export async function applyTokenHudStatusTurnSelectionToDocuments(hud, tokenDocs = [], statusId, options = {}) {
  const docs = Array.isArray(tokenDocs) && tokenDocs.length
    ? tokenDocs
    : getTokenHudTargetTokenDocuments(hud);
  let changed = false;

  for (const tokenDoc of docs) {
    const actor = getTokenHudActorForDocument(tokenDoc, hud?.actor || null);
    if (!actor) continue;
    const applied = await applyTokenHudStatusTurnSelection({
      actor,
      document: tokenDoc,
      object: { document: tokenDoc }
    }, statusId, options);
    changed = applied || changed;
  }

  return changed;
}

export function ensureTokenHudTurnControl(root, hud) {
  const effectsPalette = resolveTokenHudEffectsPalette(root);
  const effectsButton = resolveTokenHudEffectsButton(root);
  const anchorButton = effectsButton instanceof HTMLElement
    ? effectsButton
    : (effectsPalette?.previousElementSibling instanceof HTMLElement ? effectsPalette.previousElementSibling : null);
  if (!(anchorButton instanceof HTMLElement)) return null;

  let wrapper = root.querySelector(".bm-token-hud-turn-control");
  if (!(wrapper instanceof HTMLElement)) {
    wrapper = document.createElement("div");
    wrapper.className = "bm-token-hud-turn-control";
    buildTokenHudTurnControlContent(wrapper);
  } else if (!(wrapper.querySelector(".bm-token-hud-turn-toggle") instanceof HTMLElement)) {
    buildTokenHudTurnControlContent(wrapper);
  }

  const legacyInput = wrapper.querySelector(".bm-token-hud-turn-field");
  if (legacyInput instanceof HTMLElement) legacyInput.remove();
  const legacySuffix = wrapper.querySelector(".bm-token-hud-turn-suffix");
  if (legacySuffix instanceof HTMLElement) legacySuffix.remove();
  const legacySelect = wrapper.querySelector(".bm-token-hud-turn-select");
  if (legacySelect instanceof HTMLElement) legacySelect.remove();

  if (wrapper.parentElement !== root) root.appendChild(wrapper);
  wrapper.classList.add("is-visible");
  positionTokenHudTurnControl(root, wrapper);

  const turnField = wrapper;

  const tokenKey = getTokenHudStorageKey(hud?.document || hud?.object?.document || null);
  const selectedTurns = tokenKey ? TOKEN_HUD_TURN_SELECTION_BY_TOKEN.get(tokenKey) : null;
  setTokenHudTurnFieldValue(turnField, selectedTurns ?? TOKEN_HUD_TURN_MIN);

  const selectedStatus = tokenKey ? TOKEN_HUD_LAST_STATUS_BY_TOKEN.get(tokenKey) : "";
  if (selectedStatus) turnField.dataset.statusId = selectedStatus;

  return turnField;
}

export function syncTokenHudTurnControlUi(root) {
  if (!(root instanceof HTMLElement)) return;
  const wrapper = root.querySelector(".bm-token-hud-turn-control");
  if (!(wrapper instanceof HTMLElement)) return;
  wrapper.classList.add("is-visible");
  positionTokenHudTurnControl(root, wrapper);
}

export function bindTokenHudTurnControlEvents(root, hud, turnField) {
  if (!(root instanceof HTMLElement) || !(turnField instanceof HTMLElement)) return;

  if (turnField.dataset.bmTokenHudTurnsBound !== "true") {
    const applyTurnValue = () => {
      const turns = getTokenHudTurnFieldValue(turnField);
      setTokenHudTurnFieldValue(turnField, turns);
      const tokenKey = getTokenHudStorageKey(hud?.document || hud?.object?.document || null);
      if (tokenKey) TOKEN_HUD_TURN_SELECTION_BY_TOKEN.set(tokenKey, turns);

      const statusId = String(turnField.dataset.statusId || "").trim();
      if (!statusId) return;
      const tokenDocs = getTokenHudTargetTokenDocuments(hud)
        .filter(tokenDoc => tokenHasStatusInFamily(tokenDoc, [statusId]));
      if (!tokenDocs.length) return;
      rememberTokenHudStatusSelection(tokenDocs, statusId, turns);

      void applyTokenHudStatusTurnSelectionToDocuments(hud, tokenDocs, statusId, { active: true, turns, overlay: false });
    };

    const toggle = turnField.querySelector(".bm-token-hud-turn-toggle");
    const menu = turnField.querySelector(".bm-token-hud-turn-menu");
    const closeMenu = () => menu?.classList.remove("is-open");

    if (toggle instanceof HTMLButtonElement && menu instanceof HTMLElement) {
      toggle.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        menu.classList.toggle("is-open");
      });

      menu.addEventListener("click", event => {
        const option = event.target instanceof HTMLElement
          ? event.target.closest(".bm-token-hud-turn-option[data-turns]")
          : null;
        if (!(option instanceof HTMLElement)) return;
        event.preventDefault();
        event.stopPropagation();
        setTokenHudTurnFieldValue(turnField, option.dataset.turns || TOKEN_HUD_TURN_MIN);
        applyTurnValue();
        closeMenu();
      });

      root.addEventListener("click", event => {
        const target = event.target;
        if (target instanceof Node && turnField.contains(target)) return;
        closeMenu();
      });
      root.addEventListener("contextmenu", () => closeMenu());
    }

    turnField.dataset.bmTokenHudTurnsBound = "true";
  }

  const effectsPalette = resolveTokenHudEffectsPalette(root);
  if (effectsPalette && effectsPalette.dataset.bmTokenHudPaletteBound !== "true") {
    const handleEffectSelection = event => {
      const target = event.target instanceof HTMLElement
        ? event.target.closest(".effect-control[data-status-id]")
        : null;
      if (!(target instanceof HTMLElement) || !effectsPalette.contains(target)) return;
      const statusId = String(target.dataset.statusId || "").trim();
      if (!statusId) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const turns = getTokenHudTurnFieldValue(turnField);
      setTokenHudTurnFieldValue(turnField, turns);
      turnField.dataset.statusId = statusId;
      const tokenDocs = getTokenHudTargetTokenDocuments(hud);
      rememberTokenHudStatusSelection(tokenDocs, statusId, turns);

      const nextActive = tokenDocs.length
        ? !tokenDocs.every(tokenDoc => tokenHasStatusInFamily(tokenDoc, [statusId]))
        : !target.classList.contains("active");
      const overlay = event.type === "contextmenu";
      void applyTokenHudStatusTurnSelectionToDocuments(hud, tokenDocs, statusId, { active: nextActive, turns, overlay });
    };

    effectsPalette.addEventListener("click", handleEffectSelection, true);
    effectsPalette.addEventListener("contextmenu", handleEffectSelection, true);
    effectsPalette.dataset.bmTokenHudPaletteBound = "true";
  }

  if (root.dataset.bmTokenHudSyncBound !== "true") {
    const scheduleSync = () => {
      requestAnimationFrame(() => syncTokenHudTurnControlUi(root));
    };
    root.addEventListener("click", scheduleSync);
    root.addEventListener("contextmenu", scheduleSync);
    root.dataset.bmTokenHudSyncBound = "true";
  }
}

export function configureTokenHudEnhancements(hud, htmlLike) {
  const root = getTokenHudRootElement(htmlLike, hud?.element);
  if (!root) return;

  void ensureTokenHudLocalSvgIcons({ copyMissing: false });
  refreshTokenHudStatusEffectIconPaths({ bumpCache: false });

  root.classList.add("bm-token-hud");
  root.dataset.bmTokenHudEnhanced = "true";

  const turnField = ensureTokenHudTurnControl(root, hud);
  if (!(turnField instanceof HTMLElement)) return;

  bindTokenHudTurnControlEvents(root, hud, turnField);
  syncTokenHudTurnControlUi(root);

  const actor = hud?.actor || hud?.document?.actor || null;
  if (actor) void cleanupTokenHudOrphanCounterEffects(actor);
}

export function installTokenHudRenderPatch() {
  const hudClass = globalThis.CONFIG?.Token?.hudClass;
  if (!hudClass?.prototype) return false;
  const proto = hudClass.prototype;
  if (proto[TOKEN_HUD_RENDER_PATCH_FLAG] === true) return true;

  const originalOnRender = proto._onRender;
  if (typeof originalOnRender !== "function") return false;

  proto._onRender = async function (...args) {
    const response = await originalOnRender.apply(this, args);
    try {
      configureTokenHudEnhancements(this, this.element);
    } catch (error) {
      bmLog.warn("[bloodman] token HUD enhancement (patched render) skipped", error);
    }
    return response;
  };

  Object.defineProperty(proto, TOKEN_HUD_RENDER_PATCH_FLAG, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  return true;
}

export function scheduleTokenHudDomEnhancement(attempt = 0) {
  if (TOKEN_HUD_DOM_SYNC_FRAME !== null) return;
  TOKEN_HUD_DOM_SYNC_FRAME = requestAnimationFrame(() => {
    TOKEN_HUD_DOM_SYNC_FRAME = null;
    const root = document.getElementById("token-hud");
    if (!(root instanceof HTMLElement)) {
      if (attempt < 8) setTimeout(() => scheduleTokenHudDomEnhancement(attempt + 1), 40);
      return;
    }
    const hud = globalThis.canvas?.hud?.token || null;
    try {
      configureTokenHudEnhancements(hud, root);
    } catch (error) {
      bmLog.warn("[bloodman] token HUD enhancement (dom observer) skipped", error);
    }
    const hasTurnControl = Boolean(root.querySelector(".bm-token-hud-turn-control"));
    if (!hasTurnControl && attempt < 8) setTimeout(() => scheduleTokenHudDomEnhancement(attempt + 1), 40);
  });
}

export function installTokenHudDomObserver() {
  if (TOKEN_HUD_DOM_OBSERVER) return true;
  if (typeof MutationObserver !== "function") return false;
  const hudContainer = document.getElementById("hud");
  if (!(hudContainer instanceof HTMLElement)) return false;

  TOKEN_HUD_DOM_OBSERVER = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") continue;
      const added = Array.from(mutation.addedNodes || []).some(node => {
        return node instanceof HTMLElement && (node.id === "token-hud" || Boolean(node.querySelector?.("#token-hud")));
      });
      if (added) {
        scheduleTokenHudDomEnhancement();
        return;
      }
      const removedTokenHud = Array.from(mutation.removedNodes || []).some(node => node instanceof HTMLElement && node.id === "token-hud");
      if (removedTokenHud) {
        TOKEN_HUD_DOM_SYNC_FRAME = null;
      }
    }
  });

  TOKEN_HUD_DOM_OBSERVER.observe(hudContainer, { childList: true });
  scheduleTokenHudDomEnhancement();
  return true;
}
