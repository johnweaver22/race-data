import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DISTANCES, STROKES, compute, sequence } from '../engine.mjs';

const config = { distance: 100, pool: 25, stroke: 'Freestyle' };
const times = [0, 7, 7.2, 10.2, 12.5, 20.5, 20.6, 24.2, 27,
  35.5, 35.6, 39.6, 42, 50.8, 51, 55.5, 56, 60];
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10,
  `Expected ${expected}, received ${actual}`);

test('100m short-course freestyle uses exactly the agreed 18 taps', () => {
  assert.deepEqual(sequence(config).map(e => e.type), [
    'GO',
    'HEAD_15M', 'SR_START', 'SR_STOP', 'WALL',
    'HEAD_15M', 'SR_START', 'SR_STOP', 'WALL',
    'HEAD_15M', 'SR_START', 'SR_STOP', 'WALL',
    'HEAD_15M', 'SR_START', 'SR_STOP', 'FINAL_5M', 'FINISH',
  ]);
});

test('hand-calculated 100m example produces correct splits and timing metrics', () => {
  const result = compute(config, times);
  assert.equal(result.total, 60);
  assert.equal(result.summarySplitDistance, 50);
  assert.deepEqual(result.summarySplits.map(row => row.split), [27, 33]);
  assert.deepEqual(result.summarySplits.map(row => row.cumulative), [27, 60]);
  assert.equal(result.average100Pace, null);
  assert.equal(result.start15m, 7);
  assert.equal(result.final5m, 4);
  assert.deepEqual(result.lengths.map(l => l.split), [12.5, 14.5, 15, 18]);
  assert.deepEqual(result.lengths.map(l => l.cumulative), [12.5, 27, 42, 60]);
  assert.deepEqual(result.lengths.map(l => l.start15m), [7, null, null, null]);
  [null, 8, 8.5, 8.8].forEach((expected, i) => {
    if (expected === null) assert.equal(result.lengths[i].turn15m, null);
    else close(result.lengths[i].turn15m, expected);
  });
  [60, 50, 45, 40].forEach((expected, i) => close(result.lengths[i].strokeRate, expected));
  close(result.lengths[0].surfaceSpeed, 9 / 4.7);
  close(result.lengths[0].estimatedDPS, 9 / 4.7); // 60 cycles/min.
  close(result.lengths[1].surfaceSpeed, 1.5789473684210527);
  close(result.lengths[1].estimatedDPS, 1.8947368421052633);
  close(result.lengths[2].estimatedDPS, 2.105263157894737);
  close(result.lengths[3].surfaceSpeed, 1.0869565217391304);
  close(result.lengths[3].estimatedDPS, 1.6304347826086956);
});

test('first-length speed and DPS use 15m-to-wall time for every stroke', () => {
  for (const stroke of STROKES) {
    const result = compute({ ...config, stroke }, times);
    const first = result.lengths[0];
    const expected = ['Freestyle', 'Backstroke'].includes(stroke) ? 9 / 4.7 : 10 / 5.5;
    close(first.surfaceSpeed, expected);
    close(first.estimatedDPS, expected); // First measured rate is 60 cycles/min.
    assert.equal(first.turn15m, null);
    assert.equal(first.start15m, 7);
  }
});

test('single-length 50m race includes first-length speed and DPS without a turn allowance', () => {
  for (const stroke of STROKES.filter(stroke => stroke !== 'IM')) {
    const result = compute({ distance: 50, pool: 50, stroke }, [100, 107, 108, 111, 122, 125]);
    close(result.lengths[0].surfaceSpeed, 35 / 18);
    close(result.lengths[0].estimatedDPS, 35 / 18);
    assert.equal(result.lengths[0].turn15m, null);
    assert.equal(result.total, 25);
    assert.equal(result.final5m, 3);
  }
});

test('summary split groups cover every supported event in both pool lengths', () => {
  for (const pool of [25, 50]) for (const distance of DISTANCES) for (const stroke of STROKES) {
    if (stroke === 'IM' && (distance < 100 || (distance / 4) % pool !== 0)) continue;
    const cfg = { pool, distance, stroke };
    const events = sequence(cfg);
    // Unequal length times catch cumulative values mistakenly shown as splits.
    const timestamps = events.map((event, i) => 500 + i * 2 + i * i / 100);
    const result = compute(cfg, timestamps);
    const expectedDistance = distance === 50 ? null : distance === 100 ? 50
      : distance === 200 ? 100 : distance === 400 && stroke !== 'IM' ? 200 : 100;
    assert.equal(result.summarySplitDistance, expectedDistance);
    if (expectedDistance === null) {
      assert.deepEqual(result.summarySplits, []);
    } else {
      assert.equal(result.summarySplits.length, distance / expectedDistance);
      let previous = 0;
      for (const [i, row] of result.summarySplits.entries()) {
        assert.equal(row.from, i * expectedDistance);
        assert.equal(row.to, (i + 1) * expectedDistance);
        const boundary = result.lengths[row.to / pool - 1].cumulative;
        close(row.split, boundary - previous);
        close(row.cumulative, boundary);
        previous = boundary;
      }
      close(result.summarySplits.reduce((sum, row) => sum + row.split, 0), result.total);
    }
    if (distance >= 800) close(result.average100Pace, result.total / (distance / 100));
    else assert.equal(result.average100Pace, null);
  }
});

test('400m IM labels four 100m splits in stroke order', () => {
  for (const pool of [25, 50]) {
    const cfg = { distance: 400, stroke: 'IM', pool };
    const result = compute(cfg, sequence(cfg).map((_, i) => i * 2));
    assert.deepEqual(result.summarySplits.map(row => row.stroke),
      ['Butterfly', 'Backstroke', 'Breaststroke', 'Freestyle']);
  }
});

test('1500m average pace uses all fifteen 100m segments', () => {
  const cfg = { distance: 1500, pool: 50, stroke: 'Freestyle' };
  const events = sequence(cfg);
  const timestamps = events.map((_, i) => 9876 + 1200 * i / (events.length - 1));
  const result = compute(cfg, timestamps);
  close(result.total, 1200);
  close(result.average100Pace, 80);
  assert.equal(result.summarySplits.length, 15);
});

test('nonzero monotonic-clock origin does not alter race durations', () => {
  const original = compute(config, times);
  const shifted = compute(config, times.map(t => t + 12345.6789));
  close(shifted.total, original.total);
  close(shifted.start15m, original.start15m);
  close(shifted.final5m, original.final5m);
  for (let i = 0; i < original.lengths.length; i++) {
    for (const key of ['split', 'cumulative', 'strokeRate', 'surfaceSpeed', 'estimatedDPS', 'turn15m']) {
      if (original.lengths[i][key] === null) assert.equal(shifted.lengths[i][key], null);
      else close(shifted.lengths[i][key], original.lengths[i][key]);
    }
  }
});

test('all 56 original supported configurations retain their sequence and split sums', () => {
  let count = 0;
  for (const pool of [25, 50]) for (const distance of DISTANCES) for (const stroke of STROKES) {
    const cfg = { pool, distance, stroke };
    if (stroke === 'IM' && (distance < 100 || (distance / 4) % pool !== 0)) {
      assert.throws(() => sequence(cfg), /Unsupported IM event/);
      continue;
    }
    const events = sequence(cfg);
    assert.equal(events.length, 4 * distance / pool + 2);
    assert.equal(events.filter(e => e.type === 'HEAD_15M').length, distance / pool);
    assert.equal(events.filter(e => e.type === 'FINAL_5M').length, 1);
    assert.equal(events.filter(e => e.type === 'FINISH').length, 1);
    const result = compute(cfg, events.map((_, i) => i * 2));
    assert.equal(result.lengths.length, distance / pool);
    close(result.lengths.reduce((sum, l) => sum + l.split, 0), result.total);
    count++;
  }
  assert.equal(count, 56);
});

test('100m and 200m IM change strokes at the correct length boundaries', () => {
  for (const [distance, pool, expected] of [
    [100, 25, ['Butterfly', 'Backstroke', 'Breaststroke', 'Freestyle']],
    [200, 50, ['Butterfly', 'Backstroke', 'Breaststroke', 'Freestyle']],
    [200, 25, ['Butterfly', 'Butterfly', 'Backstroke', 'Backstroke',
      'Breaststroke', 'Breaststroke', 'Freestyle', 'Freestyle']],
  ]) {
    assert.deepEqual(sequence({ distance, pool, stroke: 'IM' })
      .filter(e => e.type === 'HEAD_15M').map(e => e.stroke), expected);
  }
});

test('backstroke-to-breaststroke IM changeover receives no tumble allowance', () => {
  const result = compute({ ...config, stroke: 'IM' }, times);
  close(result.lengths[1].surfaceSpeed, 1.5384615384615385); // 10 / (27 - 20.5)
  close(result.lengths[1].estimatedDPS, 1.8461538461538463);
  close(result.lengths[2].surfaceSpeed, 1.5384615384615385);
});

test('same-stroke backstroke and freestyle turns receive the fixed allowance', () => {
  for (const stroke of ['Backstroke', 'Freestyle']) {
    const result = compute({ ...config, stroke }, times);
    close(result.lengths[1].surfaceSpeed, 1.5789473684210527);
    close(result.lengths[3].surfaceSpeed, 1.0869565217391304); // Finish: no allowance.
  }
});

test('open turns in breaststroke and butterfly receive no allowance', () => {
  for (const stroke of ['Breaststroke', 'Butterfly']) {
    close(compute({ ...config, stroke }, times).lengths[1].surfaceSpeed, 1.5384615384615385);
  }
});

test('long-course surface distance uses the 35m remaining after 15m', () => {
  const cfg = { distance: 200, pool: 50, stroke: 'Freestyle' };
  const ts = [0, 7, 8, 11, 25, 33, 34, 37, 53,
    61, 62, 65, 82, 90, 91, 94, 107, 111];
  const result = compute(cfg, ts);
  close(result.lengths[1].surfaceSpeed, 34 / 19.2);
  close(result.lengths[3].surfaceSpeed, 35 / 21);
  assert.equal(result.final5m, 4);
});

test('nonpositive adjusted surface duration yields unavailable DPS and speed', () => {
  const ts = [...times];
  ts.splice(5, 4, 26.5, 26.6, 26.8, 27);
  const result = compute(config, ts);
  assert.equal(result.lengths[1].surfaceSpeed, null);
  assert.equal(result.lengths[1].estimatedDPS, null);
  assert.ok(Number.isFinite(result.lengths[1].strokeRate));
});

test('rejects missing, sparse, nonnumeric, nonfinite, negative and unordered timestamps', () => {
  for (const bad of [undefined, {}, times.slice(1), [...times, 61]]) {
    assert.throws(() => compute(config, bad), /Tap count mismatch/);
  }
  for (const value of [undefined, '7', NaN, Infinity, -Infinity, -1, 0, 7.2]) {
    const bad = [...times];
    bad[1] = value;
    assert.throws(() => compute(config, bad), /Invalid timestamps/);
  }
  const sparse = [...times];
  delete sparse[1];
  assert.throws(() => compute(config, sparse), /Invalid timestamps/);
});

test('rejects unsupported events and IM legs shorter than a pool length', () => {
  for (const bad of [null, {}, { ...config, pool: 33 }, { ...config, distance: 75 },
    { ...config, stroke: 'Doggy paddle' }]) {
    assert.throws(() => sequence(bad), /Unsupported event/);
  }
  assert.throws(() => sequence({ distance: 100, pool: 50, stroke: 'IM' }), /Unsupported IM event/);
});

test('calculation keeps sub-centisecond precision and does not mutate input', () => {
  const input = Object.freeze(times.map(t => t + 0.000123));
  const cfg = Object.freeze({ ...config });
  const result = compute(cfg, input);
  assert.equal(result.events[0].t, 0.000123);
  close(result.total, 60);
  assert.ok(result.lengths[1].estimatedDPS !== Number(result.lengths[1].estimatedDPS.toFixed(2)));
});
