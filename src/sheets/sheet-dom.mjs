export function getHandlebarsActorSheetV2Base() {
  const actorSheetV2 = globalThis.foundry?.applications?.sheets?.ActorSheetV2;
  const handlebarsMixin = globalThis.foundry?.applications?.api?.HandlebarsApplicationMixin;
  if (typeof actorSheetV2 !== "function" || typeof handlebarsMixin !== "function") return null;
  return handlebarsMixin(actorSheetV2);
}

export function getSheetElementWrapper(sheet) {
  const element = sheet?._bloodmanElementWrapper || sheet?.element || null;
  if (element?.find) return element;
  const jq = globalThis.jQuery || globalThis.$;
  if (typeof jq === "function" && typeof HTMLElement !== "undefined" && element instanceof HTMLElement) return jq(element);
  return element;
}

export function getSheetHTMLElement(sheet) {
  const element = sheet?.element || null;
  if (typeof HTMLElement === "undefined") return null;
  if (element instanceof HTMLElement) return element;
  if (element?.[0] instanceof HTMLElement) return element[0];
  return null;
}

export function getHTMLElementFromHtmlLike(htmlLike) {
  if (typeof HTMLElement === "undefined") return null;
  if (htmlLike instanceof HTMLElement) return htmlLike;
  if (htmlLike?.[0] instanceof HTMLElement) return htmlLike[0];
  if (typeof htmlLike?.get === "function" && htmlLike.get(0) instanceof HTMLElement) return htmlLike.get(0);
  return null;
}

export function buildActorSheetBaseData(sheet, options = {}) {
  const actor = sheet?.actor || sheet?.document || sheet?.object || null;
  const system = actor?.system || {};
  const items = actor?.items?.contents || Array.from(actor?.items || []);
  const editable = Boolean(sheet?.isEditable);
  return {
    actor,
    data: actor,
    document: actor,
    object: actor,
    system,
    items,
    owner: Boolean(actor?.isOwner),
    limited: Boolean(actor?.limited),
    editable,
    cssClass: editable ? "editable" : "locked",
    options: sheet?.options || options
  };
}

export function callPrototypeMethod(prototype, receiver, methodName, args = []) {
  const method = prototype?.[methodName];
  if (typeof method !== "function") return undefined;
  return method.apply(receiver, args);
}
