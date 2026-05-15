import assert from "node:assert/strict";
import {
  applyTransparentTokenEffectBackground,
  installTokenEffectBackgroundPatch,
  setTokenEffectBackgroundTransparent
} from "../../src/ui/token-effect-background.mjs";

async function run() {
  const background = {
    alpha: 1,
    visible: true,
    renderable: true,
    cleared: false,
    clear() {
      this.cleared = true;
    }
  };
  assert.equal(setTokenEffectBackgroundTransparent(background), true);
  assert.equal(background.alpha, 0);
  assert.equal(background.visible, false);
  assert.equal(background.renderable, false);
  assert.equal(background.cleared, true);

  const childBackground = { name: "background", alpha: 1, visible: true, renderable: true };
  const token = {
    effects: {
      bg: { alpha: 1, visible: true, renderable: true },
      children: [childBackground]
    }
  };
  assert.equal(applyTransparentTokenEffectBackground(token), true);
  assert.equal(token.effects.bg.alpha, 0);
  assert.equal(childBackground.visible, false);

  const previousConfig = globalThis.CONFIG;
  try {
    class TokenObject {
      constructor() {
        this.effects = { bg: { alpha: 1, visible: true, renderable: true } };
      }
      drawEffects() {
        return "drawn";
      }
    }
    globalThis.CONFIG = { Token: { objectClass: TokenObject } };
    assert.equal(installTokenEffectBackgroundPatch(), true);
    assert.equal(installTokenEffectBackgroundPatch(), true);
    const tokenObject = new TokenObject();
    assert.equal(tokenObject.drawEffects(), "drawn");
    assert.equal(tokenObject.effects.bg.alpha, 0);
  } finally {
    globalThis.CONFIG = previousConfig;
  }
}

run()
  .then(() => {
    console.log("token-effect-background.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
