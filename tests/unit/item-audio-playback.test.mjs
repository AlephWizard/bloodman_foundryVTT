import assert from "node:assert/strict";
import { createItemAudioPlaybackRules } from "../../src/rules/item-audio-playback.mjs";

async function run() {
  const notifications = [];
  const delays = [];
  const playCalls = [];
  const errors = [];

  const rules = createItemAudioPlaybackRules({
    isAudioEnabledItemType: type => type === "arme",
    normalizeItemAudioFile: value => (String(value).endsWith(".mp3") ? String(value) : ""),
    getItemAudioName: item => item?.name || "Unknown",
    waitMs: async ms => {
      delays.push(ms);
    },
    translate: (key, data) => `${key}:${data?.item || ""}`,
    notifyError: message => notifications.push(message),
    playAudio: async (payload, broadcast) => {
      playCalls.push({ payload, broadcast });
    },
    logError: (...args) => errors.push(args),
    defaultDelayMs: 450
  });

  assert.equal(await rules.playItemAudio(null), false);
  assert.equal(await rules.playItemAudio({ type: "objet", system: { audioFile: "ok.mp3" } }), false);
  assert.equal(await rules.playItemAudio({ type: "arme", system: { audioFile: "" } }), false);

  const invalidResult = await rules.playItemAudio({
    type: "arme",
    name: "Pistolet",
    system: { audioFile: "bad.txt" }
  }, { delayMs: 0 });
  assert.equal(invalidResult, false);
  assert.equal(notifications.length, 1);

  const successResult = await rules.playItemAudio({
    id: "i1",
    type: "arme",
    name: "Pistolet",
    system: { audioFile: "fire.mp3" }
  }, { broadcast: false, delayMs: 12 });
  assert.equal(successResult, true);
  assert.deepEqual(delays, [12]);
  assert.equal(playCalls.length, 1);
  assert.deepEqual(playCalls[0], {
    payload: { src: "fire.mp3", volume: 0.9, autoplay: true, loop: false },
    broadcast: false
  });

  const noPlayerRules = createItemAudioPlaybackRules({
    isAudioEnabledItemType: () => true,
    normalizeItemAudioFile: value => String(value),
    getItemAudioName: item => item?.name || "Unknown",
    waitMs: async () => {},
    translate: key => key,
    notifyError: message => notifications.push(message),
    playAudio: null,
    logError: (...args) => errors.push(args),
    defaultDelayMs: 0
  });
  assert.equal(await noPlayerRules.playItemAudio({ type: "arme", name: "X", system: { audioFile: "x.mp3" } }), false);

  const failingRules = createItemAudioPlaybackRules({
    isAudioEnabledItemType: () => true,
    normalizeItemAudioFile: value => String(value),
    getItemAudioName: item => item?.name || "Unknown",
    waitMs: async () => {},
    translate: key => key,
    notifyError: message => notifications.push(message),
    playAudio: async () => {
      throw new Error("boom");
    },
    logError: (...args) => errors.push(args),
    defaultDelayMs: 0
  });
  assert.equal(await failingRules.playItemAudio({ type: "arme", id: "w1", system: { audioFile: "x.mp3" } }), false);
  assert.equal(errors.length > 0, true);
}

run()
  .then(() => {
    console.log("item-audio-playback.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
