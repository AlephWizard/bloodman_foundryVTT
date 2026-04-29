import assert from "node:assert/strict";
import {
  foundryVersion,
  getFoundryGeneration,
  isV10Plus,
  isV11Plus,
  isV12Plus,
  isV13Plus,
  isV14Plus
} from "../../src/compat/version.mjs";

function withGameMock(gameMock, fn) {
  const previousGame = globalThis.game;
  globalThis.game = gameMock;
  try {
    fn();
  } finally {
    globalThis.game = previousGame;
  }
}

function run() {
  withGameMock({ release: { version: "13.348", generation: 13 } }, () => {
    assert.equal(foundryVersion(), "13.348");
    assert.equal(getFoundryGeneration(), 13);
    assert.equal(isV10Plus(), true);
    assert.equal(isV11Plus(), true);
    assert.equal(isV12Plus(), true);
    assert.equal(isV13Plus(), true);
    assert.equal(isV14Plus(), false);
  });

  withGameMock({ release: { version: "14.360", generation: 14 } }, () => {
    assert.equal(foundryVersion(), "14.360");
    assert.equal(getFoundryGeneration(), 14);
    assert.equal(isV13Plus(), true);
    assert.equal(isV14Plus(), true);
  });

  withGameMock({ version: "11.315" }, () => {
    assert.equal(foundryVersion(), "11.315");
    assert.equal(getFoundryGeneration(), 11);
    assert.equal(isV10Plus(), true);
    assert.equal(isV11Plus(), true);
    assert.equal(isV12Plus(), false);
    assert.equal(isV13Plus(), false);
    assert.equal(isV14Plus(), false);
  });

  withGameMock({}, () => {
    assert.equal(foundryVersion(), "0.0.0");
    assert.equal(getFoundryGeneration(), 0);
  });
}

run();
console.log("compat-version.test.mjs: OK");
