import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sequence, compute } from '../engine.mjs';
import { createRacePdf, downloadRacePdf } from '../web/pdf-report.mjs';
import { reportData } from '../web/report-model.mjs';
import { PDFDocument } from '../web/vendor/pdf-lib.esm.min.mjs';
import { validateProfile } from '../web/profiles.mjs';

const config = { swimmer: 'Zoë Test', meet: 'Autumn Open', distance: 200, pool: 25, stroke: 'IM' };
const date = new Date('2026-10-31T18:15:00Z');

test('PDF report data preserves every split and every turn for all supported events', () => {
  for (const pool of [25, 50]) for (const distance of [50, 100, 200, 400, 800, 1500]) {
    for (const stroke of ['Freestyle', 'Backstroke', 'Breaststroke', 'Butterfly', 'IM']) {
      const cfg = { ...config, distance, pool, stroke };
      let events; try { events = sequence(cfg); } catch { continue; }
      const timestamps = events.map((_, i) => i * 3.14159);
      const engine = compute(cfg, timestamps), model = reportData(cfg, timestamps);
      assert.deepEqual(model.chunks.flatMap(p => p.lengths), engine.lengths);
      assert.deepEqual(model.chunks.flatMap(p => p.turns).map(p => p.time), engine.lengths.slice(1).map(p => p.turn15m));
      assert.equal(model.chunks.flatMap(p => p.turns).at(-1)?.wall ?? 0, distance - pool);
      assert.equal(model.summaryPage, distance >= 800);
      if (distance <= 400) assert.equal(model.chunks.length, 1);
      assert.equal(model.chart[0].speed, engine.lengths[0].surfaceSpeed);
      assert.equal(model.chart[0].dps, engine.lengths[0].estimatedDPS);
    }
  }
});

test('PDF bytes reopen as landscape pages; small events fit one page and distance races retain all pages', async () => {
  for (const [distance, pool, stroke] of [[50,50,'Freestyle'],[100,25,'Freestyle'],[200,25,'IM'],[400,25,'IM'],[400,25,'Freestyle'],[800,50,'Freestyle'],[1500,25,'Freestyle']]) {
    const cfg = { ...config, distance, pool, stroke };
    const file = await createRacePdf(cfg, sequence(cfg).map((_,i) => i * 3.14159), { date });
    assert.equal(new TextDecoder().decode(file.bytes.slice(0,5)), '%PDF-');
    const reopened = await PDFDocument.load(file.bytes);
    assert.equal(reopened.getPageCount(), Math.ceil(distance / pool / 16) + (distance >= 800 ? 1 : 0));
    for (const page of reopened.getPages()) {
      assert.ok(Math.abs(page.getWidth() - 841.89) < .01);
      assert.ok(Math.abs(page.getHeight() - 595.28) < .01);
    }
    assert.equal(reopened.getTitle(), `${cfg.swimmer} - ${distance}m ${stroke === 'IM' ? 'Individual Medley' : stroke} - Race Data`);
  }
  await assert.rejects(createRacePdf(config, [0,1]));
});

test('Unavailable speed does not prevent PDF export and non-Latin names do not lose the whole report', async () => {
  const cfg = { ...config, swimmer: 'Test 张 🏊', distance: 50, stroke: 'Freestyle' };
  const file = await createRacePdf(cfg, sequence(cfg).map((_,i) => i * .1), { date });
  assert.equal(file.pages, 1);
});

test('Prepared PDF download is synchronous and preserves PDF bytes without requests or navigation', async () => {
  const file = await createRacePdf(config, sequence(config).map((_,i) => i * 3), { date });
  const calls = []; let blob;
  const anchor = { click() { calls.push('click'); }, remove() { calls.push('remove'); } };
  downloadRacePdf(file, { URL:{createObjectURL(b) { blob=b; return 'blob:pdf'; }},
    document:{createElement() { return anchor; },body:{append() {calls.push('append');}}},setTimeout() {} });
  assert.deepEqual(calls, ['append','click','remove']);
  assert.equal(blob.type, 'application/pdf'); assert.ok(anchor.download.endsWith('.pdf'));
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), file.bytes);
  assert.equal(anchor.target, undefined);
});

test('Profiles preserve identity across edits and validate names and processed image payloads', () => {
  const p = validateProfile({ name:'  Alex Taylor  ' });
  assert.ok(p.id); assert.equal(p.name, 'Alex Taylor'); assert.equal(p.photo, null);
  assert.equal(validateProfile({...p,name:'Alex T'}).id, p.id);
  assert.throws(()=>validateProfile({name:' '}));
  assert.throws(()=>validateProfile({name:'a'.repeat(101)}));
  assert.throws(()=>validateProfile({name:'Alex',photo:'https://untrusted/image.jpg'}));
  assert.throws(()=>validateProfile({name:'Alex',photo:'data:image/svg+xml;base64,PHN2Zz4='}));
});
