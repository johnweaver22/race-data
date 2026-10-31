import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.join(root, 'docs');
await mkdir(path.join(destination, 'assets'), { recursive: true });
await mkdir(path.join(destination, 'vendor'), { recursive: true });
await copyFile(path.join(root, 'engine.mjs'), path.join(root, 'web/engine.mjs'));
// Publish the browser app only. CSV export needs no server or Excel template.
for (const file of ['index.html', 'app.mjs', 'styles.css', 'engine.mjs',
  'capture-model.mjs', 'tap-feedback.mjs', 'csv-export.mjs', 'assets/rl-logo.png',
  'profiles.mjs', 'profiles-ui.mjs', 'report-model.mjs', 'pdf-report.mjs', 'report-brand.mjs',
  'report-fonts.mjs', 'report-font-data.mjs', 'vendor/Report-Fonts-LICENSE.md',
  'vendor/pdf-lib.esm.min.mjs', 'vendor/PDF-Lib-LICENSE.md']) {
  await copyFile(path.join(root, 'web', file), path.join(destination, file));
}
await writeFile(path.join(destination, '.nojekyll'), '');
console.log('GitHub Pages files ready in docs/');
