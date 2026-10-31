import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { test } from 'node:test';
import { loadExcelFile, saveExcelFile, XLSX_MIME } from '../web/excel-client.mjs';
const config = { swimmer: 'Test', meet: 'Test meet', distance: 50, pool: 50, stroke: 'Freestyle' };
const times = [0, 7, 8, 11, 22, 25];
const template = await fs.readFile(new URL('../web/assets/race-export-template.xlsx', import.meta.url));

test('Excel is generated locally from a template GET, with no race POST or login navigation', async () => {
  let request;
  const file = await loadExcelFile(config, times, async (url, options) => {
    request = { url, options };
    return new Response(template, { headers: { 'Content-Type': XLSX_MIME } });
  });
  assert.equal(request.url, './assets/race-export-template.xlsx');
  assert.equal(request.options.body, undefined);
  assert.equal(request.options.method, undefined);
  assert.equal(request.options.redirect, 'error');
  assert.match(file.name, /50m-Freestyle.*[.]xlsx$/);
  assert.equal(new Uint8Array(await file.arrayBuffer())[0], 0x50);
  await assert.rejects(loadExcelFile(config, times, async () => new Response('<html>Login</html>',
    { headers: { 'content-type': 'text/html' } })), /template/);
});

test('Excel uses the working timer synchronous Blob download sequence and preserves bytes', async () => {
  const file = new File([new Uint8Array([0x50, 0x4B, 1, 2])], 'Test.xlsx', { type: XLSX_MIME });
  const calls = []; let blob; let cleanup;
  const a = { click() { calls.push('click'); }, remove() { calls.push('remove'); } };
  const result = saveExcelFile(file, {
    URL: { createObjectURL: value => { blob = value; calls.push('url'); return 'blob:local'; }, revokeObjectURL: () => calls.push('revoke') },
    document: { createElement: () => a, body: { append: () => calls.push('append') } },
    setTimeout: (fn, delay) => { assert.equal(delay, 5000); cleanup = fn; },
  });
  assert.equal(result, undefined); // No asynchronous hop before the download.
  assert.deepEqual(calls, ['url', 'append', 'click', 'remove']);
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), new Uint8Array(await file.arrayBuffer()));
  assert.equal(a.download, 'Test.xlsx');
  assert.equal(a.target, undefined);
  cleanup();
});
