import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { test } from 'node:test';
import { sequence } from '../engine.mjs';

const source = await fs.readFile(new URL('../dist/server/index.js', import.meta.url));
const { default: worker } = await import(`data:text/javascript;base64,${source.toString('base64')}`);
const config = { distance: 100, pool: 25, stroke: 'Freestyle', swimmer: 'Test swimmer', meet: 'Test meet' };
const request = payload => new Request('https://race.example/api/export.xlsx', {
  method: 'POST', body: new URLSearchParams({ payload: JSON.stringify(payload) }),
});

test('the published Worker returns an actual downloadable Excel response, including a full 1500m race', async () => {
  for (const distance of [50, 100, 400, 1500]) {
    const cfg = { ...config, distance, stroke: distance === 400 ? 'IM' : 'Freestyle' };
    const response = await worker.fetch(request({ config: cfg, timestamps: sequence(cfg).map((_, i) => i * 2) }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    assert.match(response.headers.get('content-disposition'), /^attachment; filename="Race-Data_/);
    assert.match(response.headers.get('content-disposition'), /\.xlsx/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.equal(bytes[0], 0x50); assert.equal(bytes[1], 0x4B);
    assert.equal(bytes.length, Number(response.headers.get('content-length')));
  }
});

test('the endpoint rejects incomplete races and serves the single-control results page', async () => {
  const invalid = await worker.fetch(request({ config, timestamps: [0, 2] }));
  assert.equal(invalid.status, 400);
  assert.ok((await invalid.json()).error);
  assert.equal((await worker.fetch(new Request('https://race.example/api/export.xlsx'))).status, 405);
  const page = await worker.fetch(new Request('https://race.example/'));
  const html = await page.text();
  assert.doesNotMatch(html, /<form[^>]*action="\/api\/export.xlsx"/);
  assert.doesNotMatch(html, /Save Excel file/);
  assert.equal((html.match(/id="export-csv"/g) ?? []).length, 1);
  const app = await worker.fetch(new Request('https://race.example/app.mjs'));
  assert.match(app.headers.get('content-type'), /javascript/);
});
