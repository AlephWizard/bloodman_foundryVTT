import assert from "node:assert/strict";
import { createTokenImageController, DEFAULT_TOKEN_IMAGE } from "../../src/rules/token-images.mjs";

function getProperty(source, path) {
  return String(path || "").split(".").reduce((cursor, key) => cursor?.[key], source);
}

function setPath(source, path, value) {
  const keys = String(path || "").split(".").filter(Boolean);
  let cursor = source;
  while (keys.length > 1) {
    const key = keys.shift();
    cursor[key] ??= {};
    cursor = cursor[key];
  }
  cursor[keys[0]] = value;
}

function applyFlatUpdate(target, updateData) {
  for (const [path, value] of Object.entries(updateData || {})) {
    setPath(target, path, value);
  }
}

function createTokenDoc({ id, actor = null, actorId = "", actorLink = false, src = "", type = "" } = {}) {
  return {
    id,
    actor,
    actorId,
    actorLink,
    texture: {
      src,
      scaleX: 0,
      scaleY: 1,
      offsetX: 0.5,
      offsetY: 0,
      fit: "contain"
    },
    updates: [],
    async update(updateData, options = {}) {
      this.updates.push({ updateData, options });
      applyFlatUpdate(this, updateData);
    },
    _type: type
  };
}

function createController({ game, tokenDocs = [], validTextures = ["actor.png", "new.png", "token.png"] } = {}) {
  const valid = new Set(validTextures);
  return createTokenImageController({
    getProperty,
    expandObject: source => source,
    getGame: () => game,
    getCanvas: () => ({ tokens: { get: () => null } }),
    getImageConstructor: () => null,
    getTextureLoader: () => async src => {
      if (valid.has(src)) return {};
      throw new Error(`missing texture: ${src}`);
    },
    getTokenActorType: tokenDoc => tokenDoc?.actor?.type || tokenDoc?._type || "",
    isCharacterLikeActorType: actorType => actorType === "personnage" || actorType === "personnage-non-joueur",
    getTokenDocumentsForActor: () => tokenDocs,
    textureValidityCache: new Map()
  });
}

async function run() {
  const game = {
    user: { isGM: true },
    actors: new Map()
  };
  const worldActor = {
    id: "actor-1",
    type: "personnage",
    img: "actor.png",
    prototypeToken: { texture: { src: "old.png" } },
    updates: [],
    async update(updateData, options = {}) {
      this.updates.push({ updateData, options });
      applyFlatUpdate(this, updateData);
    }
  };
  game.actors.set(worldActor.id, worldActor);

  const controller = createController({ game });
  assert.equal(controller.isMissingTokenImage(""), true);
  assert.equal(controller.isMissingTokenImage(DEFAULT_TOKEN_IMAGE), true);
  assert.equal(controller.isMissingTokenImage("actor.png"), false);
  assert.equal(controller.shouldResetTokenScale(0), true);
  assert.equal(controller.shouldResetTokenOffset(0.5), true);
  assert.equal(controller.shouldResetTokenFit("contain"), true);
  assert.equal(await controller.canLoadTextureSource("actor.png"), true);
  assert.equal(await controller.canLoadTextureSource("missing.png"), false);

  const repairedToken = createTokenDoc({
    id: "token-repair",
    actor: worldActor,
    actorId: worldActor.id,
    actorLink: true,
    src: "missing.png"
  });
  assert.equal(await controller.repairTokenTextureSource(repairedToken), true);
  assert.equal(getProperty(repairedToken, "texture.src"), "actor.png");
  assert.equal(getProperty(repairedToken, "texture.scaleX"), 1);
  assert.equal(getProperty(repairedToken, "texture.offsetX"), 0);
  assert.equal(getProperty(repairedToken, "texture.fit"), "fill");

  worldActor.img = "new.png";
  const linkedToken = createTokenDoc({ id: "linked", actor: worldActor, actorLink: true, src: "custom.png" });
  const missingToken = createTokenDoc({ id: "missing", actor: worldActor, src: DEFAULT_TOKEN_IMAGE });
  const previousToken = createTokenDoc({ id: "previous", actor: worldActor, src: "old.png" });
  const customToken = createTokenDoc({ id: "custom", actor: worldActor, src: "custom.png" });
  const sameToken = createTokenDoc({ id: "same", actor: worldActor, src: "new.png" });
  const sceneController = createController({
    game,
    tokenDocs: [linkedToken, missingToken, previousToken, customToken, sameToken]
  });
  assert.equal(await sceneController.syncSceneTokenImagesFromActorImage(worldActor, { previousActorImage: "old.png" }), 3);
  assert.equal(getProperty(linkedToken, "texture.src"), "new.png");
  assert.equal(getProperty(missingToken, "texture.src"), "new.png");
  assert.equal(getProperty(previousToken, "texture.src"), "new.png");
  assert.equal(getProperty(customToken, "texture.src"), "custom.png");
  assert.equal(sameToken.updates.length, 0);

  const tokenSource = createTokenDoc({ id: "source", actorId: worldActor.id, src: "token.png" });
  assert.equal(await sceneController.syncActorAndPrototypeImageFromTokenImage(tokenSource), true);
  assert.equal(worldActor.img, "token.png");
  assert.equal(getProperty(worldActor, "prototypeToken.texture.src"), "token.png");
  assert.deepEqual(worldActor.updates.at(-1).options, {
    bloodmanSkipPrototypeImageSync: true,
    bloodmanSkipSceneTokenImageSync: true
  });

  const npcActor = {
    type: "personnage-non-joueur",
    img: "actor.png",
    prototypeToken: {
      actorLink: true,
      texture: { src: "missing.png", scaleX: 0, scaleY: 0, offsetX: 1, offsetY: -1, fit: "grid" }
    }
  };
  assert.deepEqual(await sceneController.getPrototypeTokenImageNormalizationUpdates(npcActor), {
    "prototypeToken.actorLink": false,
    "prototypeToken.texture.scaleX": 1,
    "prototypeToken.texture.scaleY": 1,
    "prototypeToken.texture.offsetX": 0,
    "prototypeToken.texture.offsetY": 0,
    "prototypeToken.texture.fit": "fill",
    "prototypeToken.texture.src": "actor.png"
  });
}

run()
  .then(() => {
    console.log("token-images.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
