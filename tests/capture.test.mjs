import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RaceCapture, formatClock } from '../web/capture-model.mjs';
import { compute } from '../engine.mjs';

const config = { distance: 100, pool: 25, stroke: 'Freestyle', swimmer: 'Test swimmer', meet: 'Test meet' };
const timestamps = [0, 7, 7.2, 10.2, 12.5, 20.5, 20.6, 24.2, 27,
  35.5, 35.6, 39.6, 42, 50.8, 51, 55.5, 56, 60];

test('capture begins ready and exposes one ordered prompt for each accepted tap', () => {
  const race = new RaceCapture(config);
  assert.equal(race.state, 'ready');
  assert.equal(race.elapsed(100), 0);
  assert.equal(race.next.type, 'GO');
  const order = [];
  for (const [i, timestamp] of timestamps.entries()) {
    order.push(race.next.type);
    assert.equal(race.record(timestamp), true);
    assert.equal(race.timestamps.length, i + 1);
    assert.equal(race.state, i === timestamps.length - 1 ? 'complete' : 'running');
  }
  assert.deepEqual(order, ['GO',
    'HEAD_15M', 'SR_START', 'SR_STOP', 'WALL',
    'HEAD_15M', 'SR_START', 'SR_STOP', 'WALL',
    'HEAD_15M', 'SR_START', 'SR_STOP', 'WALL',
    'HEAD_15M', 'SR_START', 'SR_STOP', 'FINAL_5M', 'FINISH']);
  assert.equal(race.next, null);
  assert.equal(race.elapsed(900), 60);
  assert.equal(race.record(901), false);
  assert.equal(race.timestamps.length, 18);
  assert.deepEqual(race.results(), compute(config, timestamps));
});

test('running clock stays continuous through wall taps and uses the monotonic origin', () => {
  const race = new RaceCapture(config);
  for (const timestamp of timestamps.slice(0, 5)) race.record(timestamp + 500);
  assert.equal(race.elapsed(520), 20);
  assert.deepEqual(race.splits(), [{ length: 1, stroke: 'Freestyle', split: 12.5 }]);
  assert.equal(race.next.type, 'HEAD_15M');
  assert.equal(race.next.length, 2);
});

test('only recorded walls and finish appear as live splits', () => {
  const race = new RaceCapture(config);
  for (const timestamp of timestamps.slice(0, 8)) race.record(timestamp);
  assert.equal(race.splits().length, 1);
  race.record(timestamps[8]);
  assert.equal(race.splits().length, 2);
  for (const timestamp of timestamps.slice(9)) race.record(timestamp);
  assert.deepEqual(race.splits().map(split => split.split), [12.5, 14.5, 15, 18]);
});

test('invalid or duplicate timestamps cannot advance the prompt', () => {
  const race = new RaceCapture(config);
  assert.throws(() => race.record(NaN), /Invalid capture time/);
  assert.throws(() => race.record(-1), /Invalid capture time/);
  assert.throws(() => race.record('5'), /Invalid capture time/);
  assert.equal(race.timestamps.length, 0);
  race.record(5);
  assert.equal(race.record(5), false);
  assert.equal(race.record(4), false);
  assert.equal(race.next.type, 'HEAD_15M');
  assert.equal(race.timestamps.length, 1);
});

test('background interruption freezes capture and prevents fabricated results', () => {
  const race = new RaceCapture(config);
  assert.equal(race.interrupt(20), false);
  race.record(100);
  race.record(107);
  assert.equal(race.interrupt(108), true);
  assert.equal(race.state, 'interrupted');
  assert.equal(race.record(110), false);
  assert.equal(race.elapsed(1000), 8);
  assert.throws(() => race.results(), /incomplete/);
  assert.equal(race.timestamps.length, 2);
});

test('a reset is a clean independent race with unchanged setup', () => {
  const first = new RaceCapture(config);
  first.record(10);
  const reset = new RaceCapture(first.config);
  assert.equal(reset.state, 'ready');
  assert.equal(reset.next.type, 'GO');
  assert.equal(reset.timestamps.length, 0);
  assert.equal(reset.config.swimmer, 'Test swimmer');
  assert.equal(first.timestamps.length, 1);
  assert.notEqual(reset.timestamps, first.timestamps);
});

test('full 1500m and IM captures complete with the correct final prompt', () => {
  for (const cfg of [{ distance: 1500, pool: 25, stroke: 'Freestyle' },
    { distance: 200, pool: 25, stroke: 'IM' }]) {
    const race = new RaceCapture(cfg);
    let timestamp = 500;
    while (race.next) { race.record(timestamp); timestamp += 2; }
    assert.equal(race.events.at(-2).type, 'FINAL_5M');
    assert.equal(race.events.at(-1).type, 'FINISH');
    assert.equal(race.state, 'complete');
    assert.equal(race.results().lengths.length, cfg.distance / cfg.pool);
  }
});

test('clock formatting handles minutes, centisecond carry and live truncation', () => {
  assert.equal(formatClock(0), '0:00.00');
  assert.equal(formatClock(60), '1:00.00');
  assert.equal(formatClock(59.999), '1:00.00');
  assert.equal(formatClock(59.999, true), '0:59.99');
  assert.equal(formatClock(900.125), '15:00.13');
});
