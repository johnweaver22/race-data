import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
await copyFile(path.join(root, 'engine.mjs'), path.join(root, 'web/engine.mjs'));
const assets = {};
async function collect(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const local = path.join(directory, entry.name);
    const key = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) await collect(local, key);
    else assets[key] = (await readFile(local)).toString('base64');
  }
}
await collect(path.join(root, 'web'));
const unexport = source => source.replace(/^import[^\n]+\n/gm, '').replace(/^export /gm, '');
const vendor = await readFile(path.join(root, 'web/vendor/jszip.min.js'), 'utf8');
const engine = unexport(await readFile(path.join(root, 'engine.mjs'), 'utf8'));
const excel = unexport(await readFile(path.join(root, 'web/excel-export.mjs'), 'utf8')).replace('const JSZip = globalThis.JSZip;', '');
const handler = unexport(await readFile(path.join(root, 'worker/index.mjs'), 'utf8'));
const bundled = `const JSZip = (() => { const module = {exports:{}}; const exports = module.exports;\n${vendor}\nreturn module.exports;})();\n${engine}\n${excel}\n${handler}\nexport default createRaceWorker(${JSON.stringify(assets)});\n`;
await mkdir(path.join(root, 'dist/server'), { recursive: true });
await mkdir(path.join(root, 'dist/.openai'), { recursive: true });
await writeFile(path.join(root, 'dist/server/index.js'), bundled);
try {
  await copyFile(path.join(root, '.openai/hosting.json'), path.join(root, 'dist/.openai/hosting.json'));
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const built = await import(`data:text/javascript;base64,${Buffer.from(bundled).toString('base64')}`);
if (typeof built.default?.fetch !== 'function') throw new Error('Worker must export fetch');
console.log('Built and validated the Race Data Worker');
