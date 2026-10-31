import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sequence, compute } from '../engine.mjs';
import { createCsvExport, csvFilename, downloadCsv } from '../web/csv-export.mjs';

const config = { swimmer: 'Zoë, "Test"', meet: 'Meet\nDay 1', distance: 100, pool: 25, stroke: 'Freestyle' };
const date = new Date('2026-10-31T17:30:45.123Z');

test('CSV includes exact engine results for all supported events and courses', () => {
  let checked = 0;
  for (const pool of [25, 50]) for (const distance of [50, 100, 200, 400, 800, 1500]) {
    for (const stroke of ['Freestyle', 'Backstroke', 'Breaststroke', 'Butterfly', 'IM']) {
      const cfg = { ...config, pool, distance, stroke };
      let events;
      try { events = sequence(cfg); } catch { continue; }
      const times = events.map((_, i) => 100 + i * 2.123);
      const result = compute(cfg, times);
      const csv = createCsvExport(cfg, times, date);
      assert.ok(csv.startsWith('\uFEFFRace Data\r\n'));
      assert.ok(csv.includes(`Finish time,${result.total}\r\n`));
      assert.ok(csv.includes('Swimmer,"Zoë, ""Test"""\r\n'));
      assert.ok(csv.includes('Meet,"Meet\nDay 1"\r\n'));
      for (const row of result.summarySplits) {
        assert.ok(csv.includes(`${row.from},${row.to},${row.stroke ?? stroke},${row.split},${row.cumulative}\r\n`));
      }
      const first = result.lengths[0];
      assert.ok(csv.includes(`1,${pool},${first.stroke},${first.split},${first.cumulative},${first.start15m},,${first.strokeRate},${first.surfaceSpeed},${first.estimatedDPS}\r\n`));
      assert.equal(csv.includes('Average 100m pace,'), distance >= 800);
      checked++;
    }
  }
  assert.ok(checked >= 50);
});

test('CSV rejects incomplete races, protects text and produces portable filenames', () => {
  assert.throws(() => createCsvExport(config, [0, 1]));
  const cfg = { ...config, swimmer: '=1+1', meet: '@SUM(A1)' };
  const csv = createCsvExport(cfg, sequence(cfg).map((_, i) => i * 2), date);
  assert.ok(csv.includes("Swimmer,'=1+1\r\n"));
  assert.ok(csv.includes("Meet,'@SUM(A1)\r\n"));
  assert.match(csvFilename(config, date), /^Race-Data_Zoë-Test_100m-Freestyle_20261031T173045123Z\.csv$/u);
});

test('CSV starts a download synchronously from the click without a fetch or navigation', async () => {
  const calls = []; let blob; let cleanup;
  const link = { click() { calls.push('click'); }, remove() { calls.push('remove'); } };
  const times = sequence(config).map((_, i) => i * 2);
  const result = downloadCsv(config, times, {
    URL: { createObjectURL(value) { blob = value; return 'blob:race'; }, revokeObjectURL() { calls.push('revoke'); } },
    document: { createElement: () => link, body: { append() { calls.push('append'); } } },
    setTimeout(fn, delay) { assert.equal(delay, 60000); cleanup = fn; },
  });
  assert.equal(result, undefined);
  assert.deepEqual(calls, ['append', 'click', 'remove']);
  assert.equal(blob.type, 'text/csv;charset=utf-8');
  assert.equal(link.href, 'blob:race');
  assert.ok(link.download.endsWith('.csv'));
  assert.equal(link.target, undefined);
  assert.match(await blob.text(), /Estimated DPS \(m\/cycle\)/);
  assert.deepEqual([...new Uint8Array(await blob.arrayBuffer()).slice(0, 3)], [239, 187, 191]);
  cleanup();
});
