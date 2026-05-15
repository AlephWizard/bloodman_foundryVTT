import assert from "node:assert/strict";
import { createItemSheetEquipWithController } from "../../src/ui/item-sheet-equip-with.mjs";

class FakeElement {
  constructor({ dataset = {}, matchesDrop = false, index = null } = {}) {
    this.dataset = { ...dataset };
    if (index != null) this.dataset.templateIndex = String(index);
    this.matchesDrop = matchesDrop;
    this.classes = new Set();
    this.classList = {
      add: name => this.classes.add(name),
      remove: name => this.classes.delete(name)
    };
  }

  matches(selector) {
    return selector === "[data-item-equiper-avec-drop='true']" && this.matchesDrop;
  }

  closest(selector) {
    if (selector === "[data-item-equiper-avec-drop='true']" && this.matchesDrop) return this;
    if (selector === "[data-template-index]" && this.dataset.templateIndex != null) return this;
    return null;
  }

  contains(target) {
    return target === this.child;
  }
}

function normalizeTemplates(value) {
  return (Array.isArray(value) ? value : [])
    .filter(entry => entry && typeof entry === "object")
    .map(entry => ({ ...entry, type: String(entry.type || "").trim().toLowerCase() }));
}

function buildTemplateEntry(itemDocument, options = {}) {
  if (!itemDocument) return null;
  const type = String(itemDocument.type || "").trim().toLowerCase();
  if (!["arme", "soin", "objet"].includes(type)) return null;
  const entry = {
    id: itemDocument.id,
    name: itemDocument.name || itemDocument.id,
    type,
    system: { ...(itemDocument.system || {}) }
  };
  if (options.keepSourceReference !== false) entry._templateSourceUuid = itemDocument.uuid || "";
  return entry;
}

function createController({ droppedItem = null, warnings = [], opened = [] } = {}) {
  return createItemSheetEquipWithController({
    normalizeItemLinkTemplateEntries: normalizeTemplates,
    buildItemLinkTemplateEntryFromItemDocument: buildTemplateEntry,
    isItemLinkSupportedType: type => ["arme", "soin", "objet"].includes(String(type || "").trim().toLowerCase()),
    resolveDroppedItemFromDropData: async () => droppedItem,
    getDragEventData: event => event?.dropData || null,
    fromUuid: async uuid => ({ sheet: { render: force => opened.push({ uuid, force }) } }),
    warn: message => warnings.push(message),
    translateWithFallback: (_key, fallback) => fallback,
    getHTMLElementClass: () => FakeElement
  });
}

function createSheet({ item = null } = {}) {
  const updates = [];
  const renders = [];
  const sheet = {
    item: item || {
      id: "parent",
      uuid: "Item.parent",
      type: "arme",
      actor: null,
      system: { link: { equiperAvecTemplates: [] } },
      async update(updateData) {
        updates.push(updateData);
        this.system.link.equiperAvecTemplates = updateData["system.link.equiperAvecTemplates"] || [];
        if (Object.prototype.hasOwnProperty.call(updateData, "system.link.equiperAvecEnabled")) {
          this.system.link.equiperAvecEnabled = updateData["system.link.equiperAvecEnabled"];
        }
      }
    },
    render(force) {
      renders.push(force);
    }
  };
  return { sheet, updates, renders };
}

function createHtml() {
  const selections = new Map();
  const handlers = new Map();
  const html = {
    find(selector) {
      if (!selections.has(selector)) {
        selections.set(selector, {
          attrs: new Map(),
          clickHandler: null,
          attr(name, value) {
            this.attrs.set(name, value);
            return this;
          },
          click(handler) {
            this.clickHandler = handler;
            return this;
          }
        });
      }
      return selections.get(selector);
    },
    on(eventName, selector, handler) {
      handlers.set(`${eventName}|${selector}`, handler);
      return this;
    }
  };
  return { html, selections, handlers };
}

async function run() {
  const warnings = [];
  const opened = [];
  const droppedItem = { id: "child", uuid: "Item.child", name: "Child", type: "soin", system: {} };
  const controller = createController({ droppedItem, warnings, opened });
  const { sheet, updates, renders } = createSheet();

  assert.deepEqual(controller.buildItemSheetDragPayload(sheet), {
    type: "Item",
    uuid: "Item.parent",
    id: "parent",
    itemType: "arme",
    actorId: "",
    actorUuid: ""
  });

  const transferCalls = [];
  const dataTransfer = {
    setData(type, value) {
      transferCalls.push({ type, value });
    }
  };
  assert.equal(controller.setItemSheetDragTransferData(dataTransfer, "text/plain", { id: "x" }), true);
  assert.equal(JSON.parse(transferCalls[0].value).id, "x");

  controller.onItemSheetDragStart(sheet, {
    target: { closest: () => null },
    dataTransfer
  });
  assert.equal(transferCalls.length, 3);
  assert.equal(dataTransfer.effectAllowed, "copyMove");

  const container = new FakeElement({ matchesDrop: true, dataset: { acceptedTypes: "arme, soin" } });
  assert.equal(controller.getItemSheetEquiperAvecDropContainerFromEvent({ currentTarget: container }), container);
  assert.deepEqual([...controller.getItemSheetEquiperAvecAcceptedTypes(container)], ["arme", "soin"]);
  assert.equal(controller.getItemSheetEquiperAvecTemplateIndexFromEvent({ currentTarget: new FakeElement({ index: 2 }) }), 2);
  assert.equal(controller.isItemSheetEquiperAvecTypeAccepted("soin", new Set(["soin"])), true);
  assert.equal(controller.isItemSheetEquiperAvecTypeAccepted("objet", new Set(["soin"])), false);

  assert.equal(await controller.addItemSheetEquiperAvecTemplateFromDocument(sheet, droppedItem, new Set(["soin"])), true);
  assert.equal(updates.length, 1);
  assert.equal(updates[0]["system.link.equiperAvecEnabled"], true);
  assert.equal(updates[0]["system.link.equiperAvecTemplates"][0].id, "child");
  assert.deepEqual(renders, [false]);

  assert.equal(await controller.removeItemSheetEquiperAvecTemplateByIndex(sheet, 0), true);
  assert.equal(updates.at(-1)["system.link.equiperAvecTemplates"].length, 0);

  assert.equal(await controller.addItemSheetEquiperAvecTemplateFromDocument(sheet, { id: "parent", uuid: "Item.parent", type: "arme" }), false);
  assert.equal(warnings.at(-1), "Un objet ne peut pas s'equiper avec lui-meme.");
  assert.equal(await controller.addItemSheetEquiperAvecTemplateFromDocument(sheet, { id: "bad", type: "note" }), false);
  assert.equal(warnings.at(-1), "Type incompatible avec Equiper avec.");

  let prevented = false;
  let stopped = false;
  container.classList.add("is-drop-target");
  assert.equal(await controller.onItemSheetEquiperAvecDrop(sheet, {
    currentTarget: container,
    dropData: { type: "Item" },
    preventDefault: () => { prevented = true; },
    stopPropagation: () => { stopped = true; }
  }), true);
  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(container.classes.has("is-drop-target"), false);

  controller.onItemSheetEquiperAvecDragOver(sheet, { currentTarget: container, dataTransfer: {} });
  assert.equal(container.classes.has("is-drop-target"), true);
  const child = new FakeElement();
  container.child = child;
  controller.onItemSheetEquiperAvecDragLeave(sheet, { currentTarget: container, relatedTarget: child });
  assert.equal(container.classes.has("is-drop-target"), true);
  controller.onItemSheetEquiperAvecDragLeave(sheet, { currentTarget: container, relatedTarget: new FakeElement() });
  assert.equal(container.classes.has("is-drop-target"), false);

  const { html, selections, handlers } = createHtml();
  controller.activateItemSheetEquiperAvecListeners(sheet, html);
  assert.equal(selections.get(".bm-item-top, .bm-item-img-el").attrs.get("draggable"), true);
  assert.ok(handlers.has("dragstart|.bm-item-top, .bm-item-img-el"));
  assert.ok(handlers.has("drop|[data-item-equiper-avec-drop='true']"));
  const openButton = selections.get(".bm-item-equiper-avec-open");
  await openButton.clickHandler({
    currentTarget: { dataset: { sourceUuid: "Item.open" } },
    preventDefault() {},
    stopPropagation() {}
  });
  assert.deepEqual(opened, [{ uuid: "Item.open", force: true }]);
}

run()
  .then(() => {
    console.log("item-sheet-equip-with.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
