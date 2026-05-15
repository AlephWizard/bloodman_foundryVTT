import assert from "node:assert/strict";
import {
  clampTokenHudTurnValue,
  collectTokenHudSvgStatusSources,
  buildTokenHudCounterIconPath,
  buildTokenHudTurnCounterEffectPayloads,
  buildTokenHudTurnLabel,
  decrementTokenHudCountersForActorTurn,
  ensureTokenHudLocalSvgIcons,
  extractFileNameFromPath,
  getTokenHudCounterFlagData,
  getTokenHudCounterPriorityValue,
  getTokenDocumentFromPlaceable,
  getTokenHudActorForDocument,
  getTokenHudLocalIconDirectoryPath,
  getTokenHudStorageKey,
  getTokenHudTargetTokenDocuments,
  isSvgAssetPath,
  listTokenHudLocalSvgIconNames,
  refreshTokenHudStatusEffectIconPaths
} from "../../src/ui/token-hud.mjs";

async function withGlobals(values, callback) {
  const previousGame = globalThis.game;
  const previousCanvas = globalThis.canvas;
  const previousConfig = globalThis.CONFIG;
  const previousFilePicker = globalThis.FilePicker;
  const previousFoundry = globalThis.foundry;
  const previousConst = globalThis.CONST;
  globalThis.game = values.game;
  globalThis.canvas = values.canvas;
  globalThis.CONFIG = values.config;
  globalThis.FilePicker = values.filePicker;
  globalThis.foundry = values.foundry;
  globalThis.CONST = values.const;
  try {
    return await callback();
  } finally {
    globalThis.game = previousGame;
    globalThis.canvas = previousCanvas;
    globalThis.CONFIG = previousConfig;
    globalThis.FilePicker = previousFilePicker;
    globalThis.foundry = previousFoundry;
    globalThis.CONST = previousConst;
  }
}

function getProperty(source, path) {
  return String(path || "")
    .split(".")
    .reduce((cursor, key) => cursor?.[key], source);
}

async function run() {
  assert.equal(clampTokenHudTurnValue("3"), 3);
  assert.equal(clampTokenHudTurnValue("999"), 12);
  assert.equal(clampTokenHudTurnValue("bad"), 1);
  assert.equal(clampTokenHudTurnValue("0", { min: 2, max: 5 }), 2);
  assert.equal(buildTokenHudTurnLabel(1), "1 TOUR");
  assert.equal(buildTokenHudTurnLabel(2), "2 TOURS");
  assert.equal(buildTokenHudTurnLabel("bad"), "1 TOUR");

  const tokenDoc = { id: "t1", uuid: "Scene.s1.Token.t1" };
  assert.equal(getTokenHudStorageKey(tokenDoc), "Scene.s1.Token.t1");
  assert.equal(getTokenDocumentFromPlaceable({ document: tokenDoc }), tokenDoc);
  assert.equal(getTokenDocumentFromPlaceable(tokenDoc), tokenDoc);

  const linkedActor = { id: "a1" };
  await withGlobals({
    game: { actors: { get: id => (id === "a1" ? linkedActor : null) } },
    canvas: null,
    config: null,
    filePicker: null,
    foundry: null,
    const: null
  }, async () => {
    assert.equal(getTokenHudActorForDocument({ actorLink: true, actorId: "a1" }), linkedActor);
    assert.equal(getTokenHudActorForDocument({ actor: { id: "synthetic" } }).id, "synthetic");
  });

  const controlledA = { document: { id: "a", uuid: "Token.a" } };
  const controlledB = { document: { id: "b", uuid: "Token.b" } };
  await withGlobals({
    game: null,
    canvas: { tokens: { controlled: [controlledA, controlledB] } },
    config: null,
    filePicker: null,
    foundry: null,
    const: null
  }, async () => {
    assert.deepEqual(
      getTokenHudTargetTokenDocuments({ document: controlledA.document }).map(doc => doc.id),
      ["a", "b"]
    );
    assert.deepEqual(
      getTokenHudTargetTokenDocuments({ document: { id: "solo", uuid: "Token.solo" } }).map(doc => doc.id),
      ["solo"]
    );
  });

  assert.equal(getTokenHudLocalIconDirectoryPath(), "systems/bloodman/images");
  assert.equal(extractFileNameFromPath("icons/svg/rage.svg?v=1#x"), "rage.svg");
  assert.equal(isSvgAssetPath("icons/svg/rage.svg?v=1"), true);
  assert.equal(isSvgAssetPath("icons/svg/rage.png"), false);

  await withGlobals({
    game: { user: { isGM: false } },
    canvas: null,
    config: {
      statusEffects: [
        { id: "rage", img: "icons/svg/rage.svg" },
        { id: "support", icon: "systems/bloodman/images/support.svg?v=1" },
        { id: "png", img: "icons/png/not-svg.png" }
      ]
    },
    foundry: null,
    const: null,
    filePicker: class {
      static async browse() {
        return {
          files: [
            "systems/bloodman/images/rage.svg",
            "systems/bloodman/images/support.svg",
            "systems/bloodman/images/not-svg.png"
          ]
        };
      }
    }
  }, async () => {
    const sources = collectTokenHudSvgStatusSources();
    assert.deepEqual([...sources.keys()].sort(), ["rage.svg", "support.svg"]);

    const localNames = await listTokenHudLocalSvgIconNames();
    assert.deepEqual([...localNames].sort(), ["rage.svg", "support.svg"]);

    await ensureTokenHudLocalSvgIcons({ force: true });
    refreshTokenHudStatusEffectIconPaths({ bumpCache: true });
    assert.match(globalThis.CONFIG.statusEffects[0].img, /^systems\/bloodman\/images\/rage\.svg\?v=\d+$/);
    assert.match(globalThis.CONFIG.statusEffects[1].icon, /^systems\/bloodman\/images\/support\.svg\?v=\d+$/);
  });

  await withGlobals({
    game: {
      i18n: {
        has: key => key === "BLOODMAN.Status.Rage",
        localize: key => key === "BLOODMAN.Status.Rage" ? "Rage localisee" : key
      }
    },
    canvas: null,
    config: {
      statusEffects: [
        { id: "rage", statuses: ["rage"], name: "BLOODMAN.Status.Rage", img: "icons/svg/rage.svg" }
      ]
    },
    filePicker: null,
    foundry: { utils: { getProperty } },
    const: { ACTIVE_EFFECT_SHOW_ICON: { ALWAYS: 2, NEVER: 0 } }
  }, async () => {
    assert.equal(buildTokenHudCounterIconPath("icons/svg/rage.svg", "Rage", 2), "icons/svg/rage.svg?bmCounter=rage-2");
    assert.equal(buildTokenHudCounterIconPath("icons/svg/rage.svg?v=1", "Rage", 2), "icons/svg/rage.svg?v=1&bmCounter=rage-2");

    const payloads = buildTokenHudTurnCounterEffectPayloads({
      statusId: "rage",
      turns: 3,
      primaryEffect: { name: "Rage", img: "fallback.svg" },
      tokenDoc: { uuid: "Scene.s1.Token.t1" }
    });
    assert.equal(payloads.length, 3);
    assert.equal(payloads[0].name, "Rage localisee (1)");
    assert.equal(payloads[2].flags.bloodman.tokenHudTurnCounter.rounds, 3);
    assert.equal(payloads[2].flags.bloodman.tokenHudTurnCounter.statusId, "rage");
    assert.equal(payloads[2].origin, "Scene.s1.Token.t1");

    assert.deepEqual(getTokenHudCounterFlagData(payloads[1]), {
      statusId: "rage",
      token: "Scene.s1.Token.t1",
      rounds: 2
    });
    assert.equal(getTokenHudCounterPriorityValue(payloads[1]), 2);

    const actor = {
      hasStatusEffect: statusId => statusId === "rage",
      effects: []
    };
    const counterOne = {
      id: "c1",
      parent: actor,
      flags: { bloodman: { tokenHudTurnCounter: { statusId: "rage", rounds: 1 } } },
      statuses: [],
      async delete() {
        actor.effects = actor.effects.filter(effect => effect !== this);
      }
    };
    const counterTwo = {
      id: "c2",
      parent: actor,
      flags: { bloodman: { tokenHudTurnCounter: { statusId: "rage", rounds: 2 } } },
      statuses: [],
      async delete() {
        actor.effects = actor.effects.filter(effect => effect !== this);
      }
    };
    actor.effects = [counterOne, counterTwo];
    assert.equal(await decrementTokenHudCountersForActorTurn(actor), true);
    assert.deepEqual(actor.effects.map(effect => effect.id), ["c1"]);
  });
}

run()
  .then(() => {
    console.log("token-hud.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
