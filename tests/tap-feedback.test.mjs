import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTapFeedback } from '../web/tap-feedback.mjs';

test('audio missing, denied, or broken cannot interrupt capture feedback', async () => {
  for (const scope of [{}, { AudioContext: class { constructor() { throw new Error('Blocked'); } } },
    { AudioContext: class { state = 'suspended'; resume() { return Promise.reject(new Error('Denied')); } } }]) {
    const feedback = createTapFeedback(scope);
    assert.doesNotThrow(() => feedback.prepare());
    assert.doesNotThrow(() => feedback.beep());
  }
  await Promise.resolve();
});

test('every press, including the first and last, gets its own short tone using one audio context', () => {
  const tones = [];
  let contexts = 0;
  class AudioContext {
    state = 'running'; currentTime = 10; sampleRate = 48000; destination = {};
    constructor() { contexts++; }
    createBuffer() { return {}; }
    createBufferSource() { return { connect() {}, start() {}, disconnect() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
    createOscillator() {
      const tone = { frequency: { setValueAtTime() {} }, connect() {}, disconnect() {},
        start(t) { this.startTime = t; }, stop(t) { this.stopTime = t; } };
      tones.push(tone); return tone;
    }
  }
  const feedback = createTapFeedback({ webkitAudioContext: AudioContext });
  feedback.prepare();
  for (let i = 0; i < 18; i++) feedback.beep();
  assert.equal(contexts, 1);
  assert.equal(tones.length, 18);
  for (const tone of tones) {
    assert.ok(tone.stopTime > tone.startTime && tone.stopTime - tone.startTime < 0.1);
    assert.doesNotThrow(() => tone.onended());
  }
});
