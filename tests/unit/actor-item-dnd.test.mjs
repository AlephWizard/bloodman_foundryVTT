import assert from "node:assert/strict";
import { createActorItemDndController } from "../../src/sheets/actor-item-dnd.mjs";

class FakeElement {
  constructor({ dataset = {}, classes = [], item = null } = {}) {
    this.dataset = { ...dataset };
    this.classes = new Set(classes);
    this.item = item;
    this.children = [];
    this.classList = {
      add: name => this.classes.add(name),
      remove: name => this.classes.delete(name),
      contains: name => this.classes.has(name)
    };
  }

  matches(selector) {
    if (selector === ".item-list") return this.classes.has("item-list");
    if (selector === "ol.item-list") return this.classes.has("item-list");
    if (selector === "[data-item-list-drop-target='true']") return this.dataset.itemListDropTarget === "true";
    if (selector === "li.item[data-item-id]") return Boolean(this.dataset.itemId);
    return false;
  }

  closest(selector) {
    if (this.matches(selector)) return this;
    return this.parent?.closest?.(selector) || null;
  }

  querySelector(selector) {
    return this.children.find(child => child.matches?.(selector)) || null;
  }

  querySelectorAll(selector) {
    return this.children.filter(child => child.matches?.(selector));
  }

  contains(node) {
    if (node === this) return true;
    return this.children.includes(node);
  }

  getAttribute(name) {
    const key = name.replace(/^data-/, "").replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
    return this.dataset[key];
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 100, height: 40, right: 100, bottom: 40 };
  }
}

function createItem(id, type, sort = 0) {
  return {
    id,
    _id: id,
    uuid: `Actor.a1.Item.${id}`,
    type,
    sort,
    toObject() {
      return { _id: id, type, sort };
    }
  };
}

function createHtmlRecorder() {
  const handlers = new Map();
  const attrs = new Map();
  return {
    handlers,
    attrs,
    html: {
      find(selector) {
        return {
          attr(name, value) {
            attrs.set(`${selector}|${name}`, value);
            return this;
          }
        };
      },
      off(eventName, selector) {
        handlers.delete(`${eventName}|${selector}`);
        return this;
      },
      on(eventName, selector, handler) {
        handlers.set(`${eventName}|${selector}`, handler);
        return this;
      }
    }
  };
}

async function run() {
  const logs = [];
  const itemA = createItem("a", "objet", 1000);
  const itemB = createItem("b", "objet", 2000);
  const itemC = createItem("c", "objet", 3000);
  const items = [itemA, itemB, itemC];
  items.get = id => items.find(item => item.id === id);
  items.has = id => Boolean(items.get(id));
  const sheet = {
    actor: {
      id: "actor-a",
      uuid: "Actor.actor-a",
      items,
      isOwner: true,
      updateEmbeddedDocuments: async (_type, updates) => {
        logs.push({ updates });
      }
    },
    getItemFromListElement: li => items.get(li?.dataset?.itemId),
    isActorBagSlotsEnabled: () => true,
    isBagZoneSupportedItemType: type => ["objet", "soin", "ration"].includes(type),
    getCarriedColumnState: () => ({ byId: {}, columns: { bag: [], "objects-1": [itemA, itemB, itemC] } }),
    getItemCarryColumn: () => "objects-1",
    getEquiperAvecDropContainerFromEvent: () => null,
    rememberEquiperAvecDropTargetFromEvent: () => null,
    clearRememberedEquiperAvecDropTarget: () => {},
    clearItemReorderVisualState: () => {},
    onEquiperAvecDragOver: () => {},
    onEquiperAvecDragLeave: () => {},
    onEquiperAvecDrop: async () => false,
    onItemReorderDragStart(event) {
      controller.onItemReorderDragStart(this, event);
    },
    onItemReorderDragOver(event) {
      controller.onItemReorderDragOver(this, event);
    },
    onItemReorderDragLeave(event) {
      controller.onItemReorderDragLeave(this, event);
    },
    onItemReorderDragEnd() {
      controller.onItemReorderDragEnd(this);
    },
    onItemReorderDrop: async () => true,
    shouldSkipItemListContainerDelegate: () => false
  };

  const controller = createActorItemDndController({
    getHTMLElementClass: () => FakeElement,
    getSheetElementWrapper: () => ({ length: 0 }),
    getGame: () => ({ user: { isGM: false } }),
    toFiniteNumber: (value, fallback = 0) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : fallback;
    },
    getDragEventData: event => event?.dropData || {},
    carriedItemTypes: new Set(["arme", "objet", "protection", "ration", "soin"]),
    carryColumnSet: new Set(["equipment", "objects-1", "objects-2", "bag"]),
    carryColumnCapacity: { equipment: 10, "objects-1": 5, "objects-2": 5, bag: 5 },
    getCarriedItemInventorySlots: () => 1,
    sumCarriedItemInventorySlots: entries => entries.length
  });

  assert.deepEqual(controller.normalizeItemReorderPayload(sheet, {
    actorId: " actor-a ",
    actorUuid: "Actor.actor-a",
    itemId: " a ",
    itemType: " OBJET "
  }), {
    actorId: "actor-a",
    actorUuid: "Actor.actor-a",
    itemId: "a",
    itemType: "objet"
  });

  assert.deepEqual(controller.buildItemReorderPayloadFromDocumentDragData(sheet, {
    type: "Item",
    uuid: "Actor.actor-a.Item.b"
  }), {
    actorId: "actor-a",
    actorUuid: "",
    itemId: "b",
    itemType: "objet"
  });

  assert.equal(controller.buildItemReorderPayloadFromDocumentDragData(sheet, {
    type: "Item",
    uuid: "Item.a",
    id: "a"
  }), null);
  assert.equal(controller.isFoundryItemDocumentDragData({ type: "Item", uuid: "Item.a" }), true);

  const transferData = new Map();
  const dataTransfer = {
    effectAllowed: "",
    setData(type, value) {
      transferData.set(type, value);
    },
    getData(type) {
      return transferData.get(type) || "";
    }
  };
  const row = new FakeElement({ dataset: { itemId: "a" } });
  controller.onItemReorderDragStart(sheet, { currentTarget: row, dataTransfer });
  assert.equal(dataTransfer.effectAllowed, "move");
  assert.equal(JSON.parse(transferData.get("application/x-bloodman-item-reorder")).itemId, "a");
  assert.equal(globalThis.__bloodmanActiveItemDragPayload.itemId, "a");

  const payload = controller.getItemReorderPayloadFromEvent(sheet, { dataTransfer });
  assert.equal(payload.itemId, "a");

  const externalTransferData = new Map([
    ["text/plain", JSON.stringify({ type: "Item", uuid: "Item.a", id: "a" })]
  ]);
  const externalDataTransfer = {
    getData(type) {
      return externalTransferData.get(type) || "";
    }
  };
  assert.equal(controller.getItemReorderPayloadFromEvent(sheet, { dataTransfer: externalDataTransfer }), null);

  assert.equal(controller.getItemReorderPayloadFromEvent(sheet, {
    dropData: { type: "Item", uuid: "Item.a", id: "a" }
  }), null);

  assert.deepEqual(controller.buildItemReorderUpdates(sheet, itemA, itemC, { sortBefore: false }), [
    { _id: "b", sort: 1000 },
    { _id: "c", sort: 2000 },
    { _id: "a", sort: 3000 }
  ]);

  const list = new FakeElement({
    classes: ["item-list"],
    dataset: { acceptedTypes: "objet,soin", carryColumn: "objects-1", gridColumns: "2" }
  });
  assert.deepEqual([...controller.getItemListAcceptedTypesFromElement(sheet, list)], ["objet", "soin"]);
  assert.equal(controller.getItemListCarryColumnFromElement(sheet, list), "objects-1");
  assert.equal(controller.getItemListColumnCountFromElement(sheet, list), 2);

  const { html, handlers, attrs } = createHtmlRecorder();
  controller.activateActorItemDndListeners(sheet, html);
  assert.equal(attrs.get("li.item[data-item-id]|draggable"), true);
  assert.ok(handlers.has("dragstart.bloodmanDnd|li.item[data-item-id]"));
  assert.ok(handlers.has("drop.bloodmanDnd|ol.item-list, [data-item-list-drop-target='true']"));
}

run()
  .then(() => {
    console.log("actor-item-dnd.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
