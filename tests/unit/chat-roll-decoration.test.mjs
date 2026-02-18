import assert from "node:assert/strict";
import { buildChatRollDecorationHooks } from "../../src/hooks/chat-roll-decoration.mjs";

function createClassList() {
  const values = new Set();
  return {
    contains: value => values.has(value),
    add: (...items) => items.forEach(item => values.add(item)),
    has: value => values.has(value)
  };
}

async function run() {
  const previousCss = globalThis.CSS;
  try {
    globalThis.CSS = {
      supports: (_property, value) => String(value || "").toLowerCase() === "#123456"
    };

    const actor = {
      id: "a1",
      type: "personnage",
      name: "Hero",
      img: "hero.png",
      system: { profile: { pseudonyme: "Pseudo Hero" } }
    };
    const tokenDoc = {
      id: "t1",
      actor,
      actorId: "a1",
      texture: { src: "token.png" }
    };
    const scene = {
      id: "s1",
      tokens: {
        get: id => (id === "t1" ? tokenDoc : null),
        contents: [tokenDoc]
      }
    };
    const gameRef = {
      actors: new Map([["a1", actor]]),
      users: new Map([["u1", { color: "#123456" }]]),
      scenes: new Map([["s1", scene]])
    };
    const canvasRef = { scene };

    const hooks = buildChatRollDecorationHooks({
      getGame: () => gameRef,
      getCanvas: () => canvasRef,
      getProperty: (object, path) => String(path).split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), object),
      normalizeChatRollType: value => {
        const normalized = String(value || "").trim().toLowerCase();
        const allowed = new Set(["generic", "characteristic", "damage", "experience", "heal", "luck"]);
        return allowed.has(normalized) ? normalized : "generic";
      },
      chatRollTypes: {
        GENERIC: "generic",
        CHARACTERISTIC: "characteristic",
        DAMAGE: "damage",
        EXPERIENCE: "experience",
        HEAL: "heal",
        LUCK: "luck"
      },
      t: key => key,
      tl: (_key, fallback) => fallback,
      escapeChatMarkup: value => String(value || "").replace(/</g, "&lt;"),
      isHtmlElement: value => Boolean(value?.querySelector && value?.classList)
    });

    const contentElement = {
      innerHTML: "<p>jet</p>",
      querySelector: () => null
    };
    const root = {
      classList: createClassList(),
      dataset: {},
      querySelector: selector => (selector === ".message-content" ? contentElement : null)
    };

    hooks.decorateBloodmanChatRollMessage({
      user: "u1",
      speaker: { actor: "a1", token: "t1", scene: "s1", alias: "Alias" },
      rolls: [{ total: 7 }],
      flags: { bloodman: { chatRollType: "damage" } }
    }, root);

    assert.equal(contentElement.innerHTML.includes("bm-chat-roll-frame"), true);
    assert.equal(root.classList.has("bm-chat-roll"), true);
    assert.equal(root.classList.has("bm-chat-roll--damage"), true);
    assert.equal(root.dataset.bmChatRollType, "damage");

    assert.equal(hooks.normalizeChatCssColor("not-a-color", "#ff0000"), "#ff0000");
    assert.equal(hooks.resolveChatRollTypeLabel("heal"), "Soin");
  } finally {
    globalThis.CSS = previousCss;
  }
}

run()
  .then(() => {
    console.log("chat-roll-decoration.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
