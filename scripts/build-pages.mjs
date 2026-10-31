import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.join(root, 'docs');
const source = path.join(root, 'web');
await copyFile(path.join(root, 'engine.mjs'), path.join(source, 'engine.mjs'));
const { version } = JSON.parse(await readFile(path.join(root, 'package.json')));
const runtime = ['app.mjs', 'styles.css', 'engine.mjs', 'capture-model.mjs', 'tap-feedback.mjs',
  'csv-export.mjs', 'profiles.mjs', 'profiles-ui.mjs', 'report-model.mjs', 'pdf-report.mjs',
  'report-brand.mjs', 'report-fonts.mjs', 'report-font-data.mjs', 'offline.mjs',
  'vendor/pdf-lib.esm.min.mjs', 'vendor/PDF-Lib-LICENSE.md', 'vendor/Report-Fonts-LICENSE.md'];
const shared = ['manifest.webmanifest', 'assets/race-data-icon-180.png', 'assets/race-data-icon-192.png', 'assets/race-data-icon-512.png'];
const inputs = new Map();
for (const name of [...runtime, ...shared, 'index.html', 'sw-template.js']) inputs.set(name, await readFile(path.join(source, name)));
const hash = createHash('sha256').update(version);
for (const [name, bytes] of inputs) hash.update(name).update(bytes);
const release = `${version}-${hash.digest('hex').slice(0, 16)}`;
const directory = `releases/${release}`;
const appInfo = Buffer.from(`export const APP_VERSION = ${JSON.stringify(version)};\nexport const APP_RELEASE = ${JSON.stringify(release)};\n`);
const shell = Buffer.from(inputs.get('index.html').toString()
  .replace('href="./styles.css"', `href="./${directory}/styles.css"`)
  .replace('src="./app.mjs"', `src="./${directory}/app.mjs"`));
const entries = [];
async function output(name, bytes, offline = true) {
  await mkdir(path.dirname(path.join(destination, name)), { recursive: true });
  await writeFile(path.join(destination, name), bytes);
  if (offline) entries.push({ path: name, sha256: createHash('sha256').update(bytes).digest('hex') });
}
for (const name of runtime) {
  await output(`${directory}/${name}`, inputs.get(name));
  // Retain root routes for existing bookmarks and the previous release's tabs.
  await output(name, inputs.get(name), false);
}
for (const name of shared) await output(name, inputs.get(name));
await output(`${directory}/app-info.mjs`, appInfo);
await output('app-info.mjs', appInfo, false);
await output(`${directory}/shell.html`, shell);
await output('index.html', shell, false);
const config = { version, release, shell: `${directory}/shell.html`, files: entries };
await output('sw.js', Buffer.from(inputs.get('sw-template.js').toString().replace('__OFFLINE_CONFIG__', JSON.stringify(config))), false);
await output('offline-release.json', Buffer.from(JSON.stringify(config, null, 2) + '\n'), false);
await output('.nojekyll', Buffer.alloc(0), false);
console.log(`GitHub Pages ready: ${release} (${entries.length} verified offline files)`);
