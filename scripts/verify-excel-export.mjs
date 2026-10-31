// Run a temporary copy with the Codex primary runtime dependencies.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
const [source, outputDir] = process.argv.slice(2);
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(source));
assert.equal(workbook.worksheets.items.length, 3);
const summary = workbook.worksheets.getItem('Summary');
const lengths = workbook.worksheets.getItem('Length Metrics');
assert.equal(typeof summary.getRange('B13').values[0][0], 'number');
assert.equal(typeof lengths.getRange('I5').values[0][0], 'number');
assert.equal(typeof lengths.getRange('J5').values[0][0], 'number');
assert.equal(lengths.getRange('G5').values[0][0], '—');
console.log((await workbook.inspect({ kind: 'table', range: 'Summary!A12:C16', include: 'values', tableMaxRows: 5, tableMaxCols: 3 })).ndjson);
console.log((await workbook.inspect({ kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!', options: { useRegex: true, maxResults: 20 } })).ndjson);
for (const [name, range] of [['Summary', 'A1:C25'], ['Splits', 'A1:D7'], ['Length Metrics', 'A1:J8']]) {
  const preview = await workbook.render({ sheetName: name, range, scale: 1, format: 'png' });
  await fs.writeFile(path.join(outputDir, `verified-${name.replaceAll(' ', '-')}.png`), new Uint8Array(await preview.arrayBuffer()));
}
console.log('Downloaded workbook imports correctly; numeric metrics and all three sheets verified.');
