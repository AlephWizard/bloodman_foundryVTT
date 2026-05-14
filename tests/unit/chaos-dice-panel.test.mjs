import assert from "node:assert/strict";

import {
  clampChaosValue,
  createChaosDicePanelController
} from "../../src/ui/chaos-dice-panel.mjs";

function createGameMock({ isGM = true, initialChaos = 0 } = {}) {
  const settings = new Map([
    ["bloodman.chaosDice", initialChaos],
    ["bloodman.chaosDicePanelPosition", {}]
  ]);
  return {
    user: { isGM },
    settings: {
      get: (systemId, key) => settings.get(`${systemId}.${key}`),
      set: async (systemId, key, value) => {
        settings.set(`${systemId}.${key}`, value);
        return value;
      }
    },
    readSetting: key => settings.get(key)
  };
}

function run() {
  assert.equal(clampChaosValue(Number.NaN), 0);
  assert.equal(clampChaosValue(-12), 0);
  assert.equal(clampChaosValue(3.6), 4);
  assert.equal(clampChaosValue(141), 100);

  const gmGame = createGameMock({ isGM: true, initialChaos: 4 });
  const gmController = createChaosDicePanelController({
    getGame: () => gmGame,
    getDocument: () => null
  });

  assert.equal(gmController.getChaosValue(), 4);
  assert.equal(gmController.ensureChaosDiceUI(), null);

  return gmController.setChaosValue(8).then(async () => {
    assert.equal(gmGame.readSetting("bloodman.chaosDice"), 8);

    await gmController.requestChaosDelta(5);
    assert.equal(gmGame.readSetting("bloodman.chaosDice"), 13);

    const emitted = [];
    const playerGame = createGameMock({ isGM: false, initialChaos: 2 });
    const playerController = createChaosDicePanelController({
      getGame: () => playerGame,
      getDocument: () => null,
      getFoundry: () => ({ utils: { randomID: () => "request-id" } }),
      hasSocket: () => true,
      socketEmit: (socketName, payload) => emitted.push({ socketName, payload })
    });

    await playerController.requestChaosDelta(2);
    assert.deepEqual(emitted, [{
      socketName: "system.bloodman",
      payload: {
        type: "adjustChaosDice",
        delta: 2,
        requestId: "request-id"
      }
    }]);
    assert.equal(playerGame.readSetting("bloodman.chaosDice"), 2);
  });
}

await run();
console.log("chaos-dice-panel.test.mjs: OK");
