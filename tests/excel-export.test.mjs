import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { test } from 'node:test';
import { DISTANCES, STROKES, compute, sequence } from '../engine.mjs';
import { createExcelExport, excelFilename, exportData } from '../web/excel-export.mjs';

const template = await fs.readFile(new URL('../web/assets/race-export-template.xlsx', import.meta.url));
const config = { distance: 100, pool: 25, stroke: 'Freestyle', swimmer: 'Test swimmer', meet: 'Test meet' };
const timestamps = [0, 7, 7.2, 10.2, 12.5, 20.5, 20.6, 24.2, 27,
  35.5, 35.6, 39.6, 42, 50.8, 51, 55.5, 56, 60];
const exportedAt = new Date('2026-10-31T15:45:00Z');

function value(xml, address) {
  const c = xml.match(new RegExp(`<x:c\\b[^>]*\\br="${address}"[^>]*>([\\s\\S]*?)<\\/x:c>`));
  if (!c) return undefined;
  const numeric = c[0].includes('t="n"');
  const text = c[1].match(/<x:(?:v|t)(?:\s[^>]*)?>([\s\S]*?)<\/x:(?:v|t)>/)?.[1];
  return numeric ? Number(text) : text;
}
async function parts(cfg, ts) {
  const bytes = await createExcelExport(cfg, ts, template, exportedAt);
  const zip = await globalThis.JSZip.loadAsync(bytes, { checkCRC32: true });
  return { zip, summary: await zip.file('xl/worksheets/sheet1.xml').async('string'),
    splits: await zip.file('xl/worksheets/sheet2.xml').async('string'),
    lengths: await zip.file('xl/worksheets/sheet3.xml').async('string') };
}

test('Excel workbook contains numeric summary, half splits and all first-length metrics', async () => {
  const { zip, summary, splits, lengths } = await parts(config, timestamps);
  assert.equal(value(summary, 'B5'), 'Test swimmer');
  assert.equal(value(summary, 'B6'), 'Test meet');
  assert.equal(value(summary, 'B13'), 60);
  assert.equal(value(summary, 'B14'), 7);
  assert.equal(value(summary, 'B15'), 4);
  assert.equal(value(summary, 'B16'), '—');
  assert.equal(value(splits, 'C5'), 27);
  assert.equal(value(splits, 'C6'), 33);
  assert.equal(value(splits, 'D6'), 60);
  assert.equal(value(lengths, 'F5'), 7);
  assert.equal(value(lengths, 'G5'), '—');
  assert.equal(value(lengths, 'I5'), 9 / (12.5 - 7 - 0.8));
  assert.ok(Math.abs(value(lengths, 'J5') - 9 / (12.5 - 7 - 0.8)) < 1e-12);
  assert.equal(value(lengths, 'G6'), 8);
  assert.equal(value(lengths, 'E8'), 60);
  assert.equal(value(lengths, 'A9'), undefined);
  assert.match(await zip.file('xl/tables/table1.xml').async('string'), /ref="A4:D6"/);
  assert.match(await zip.file('xl/tables/table2.xml').async('string'), /ref="A4:J8"/);
  assert.match(await zip.file('xl/workbook.xml').async('string'), /name="Length Metrics"/);
  assert.match(lengths, /state="frozen"/);
});

test('all supported events export complete length and summary split tables', async () => {
  for (const pool of [25, 50]) for (const distance of DISTANCES) for (const stroke of STROKES) {
    if (stroke === 'IM' && (distance < 100 || (distance / 4) % pool !== 0)) continue;
    const cfg = { ...config, distance, pool, stroke };
    const ts = sequence(cfg).map((_, i) => 1000 + i * 2.1234567);
    const result = compute(cfg, ts);
    const { summary, splits, lengths } = await parts(cfg, ts);
    const finalRow = distance / pool + 4;
    assert.equal(value(lengths, `B${finalRow}`), distance);
    assert.equal(value(lengths, `E${finalRow}`), result.total);
    assert.equal(value(lengths, `A${finalRow + 1}`), undefined);
    assert.equal(value(summary, 'B16'), result.average100Pace ?? '—');
    if (result.summarySplits.length) {
      const finalSplitRow = result.summarySplits.length + 4;
      assert.equal(value(splits, `D${finalSplitRow}`), result.total);
      assert.equal(value(splits, `A${finalSplitRow + 1}`), undefined);
    } else {
      assert.equal(value(splits, 'A5'), 'Not applicable');
      assert.equal(value(splits, 'C5'), '—');
    }
  }
});

test('400m IM exports the four strokes and distance events use 100m pace', () => {
  const im = { ...config, distance: 400, stroke: 'IM' };
  const data = exportData(im, sequence(im).map((_, i) => i * 2), exportedAt);
  assert.deepEqual(data.splits.map(row => row[1]), ['Butterfly', 'Backstroke', 'Breaststroke', 'Freestyle']);
  for (const distance of [800, 1500]) {
    const cfg = { ...config, distance };
    const ts = sequence(cfg).map((_, i) => i * 2);
    const data = exportData(cfg, ts, exportedAt);
    assert.equal(data.splits.length, distance / 100);
    assert.equal(data.summary.B16, ts.at(-1) * 100 / distance);
  }
});

test('user text stays literal text and XML special characters are preserved safely', async () => {
  const { summary } = await parts({ ...config, swimmer: '=HYPERLINK("x") & <Test>', meet: '+@A1\u0001' }, timestamps);
  assert.match(summary, /t="inlineStr"><x:is><x:t xml:space="preserve">=HYPERLINK\(&quot;x&quot;\) &amp; &lt;Test&gt;/);
  assert.equal(value(summary, 'B6'), '+@A1');
  assert.doesNotMatch(summary, /<x:f\b/);
});

test('unavailable estimates remain nonnumeric and invalid captures cannot export', async () => {
  const ts = [...timestamps];
  ts.splice(5, 4, 26.5, 26.6, 26.8, 27);
  const { lengths } = await parts(config, ts);
  assert.equal(value(lengths, 'I6'), '—');
  assert.equal(value(lengths, 'J6'), '—');
  await assert.rejects(createExcelExport(config, timestamps.slice(0, -1), template), /Tap count mismatch/);
  await assert.rejects(createExcelExport(config, timestamps, new Uint8Array([1, 2, 3])));
});

test('export names preserve event identity and use a unique safe suffix', () => {
  const cfg = { ...config, swimmer: '../../A:B? "Swimmer"' };
  const first = excelFilename(cfg, exportedAt, 'id-one');
  const second = excelFilename(cfg, exportedAt, 'id-two');
  assert.notEqual(first, second);
  assert.match(first, /100m-Freestyle_20261031T154500Z_id-one\.xlsx$/);
  assert.doesNotMatch(first, /[\\/:?"<>|]/);
});
