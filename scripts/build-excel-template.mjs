// Run a temporary copy with CODEX_PRIMARY_RUNTIME_NODE and runtime dependencies.
// The browser fills this Artifact Tool-authored template with captured results.
import fs from 'node:fs/promises';
import path from 'node:path';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const project = process.argv[2];
const outputDir = process.argv[3];
if (!project || !outputDir) throw new Error('Provide project and output directories');
await fs.mkdir(outputDir, { recursive: true });
const workbook = Workbook.create();
const summary = workbook.worksheets.add('Summary');
const splits = workbook.worksheets.add('Splits');
const lengths = workbook.worksheets.add('Length Metrics');
const dark = '#16232B';

function setup(sheet, title, lastCell, widths) {
  sheet.showGridLines = false;
  sheet.getRange(`A1:${lastCell}`).format = {
    font: { name: 'Arial', size: 11, color: '#20312D' },
    verticalAlignment: 'center', rowHeight: 24,
  };
  sheet.getRange('A2').values = [[title]];
  sheet.getRange('A2').format.font = { name: 'Arial', size: 16, bold: true, color: dark };
  sheet.getRange('A2').format.rowHeight = 30;
  for (const [i, width] of widths.entries()) {
    const col = String.fromCharCode(65 + i);
    sheet.getRange(`${col}1:${col}${lastCell.match(/\d+/)[0]}`).format.columnWidth = width;
  }
}
function header(sheet, address, values) {
  const range = sheet.getRange(address);
  range.values = [values];
  range.format = { fill: dark, font: { name: 'Arial', size: 11, bold: true, color: '#FFFFFF' },
    wrapText: true, rowHeight: 42, horizontalAlignment: 'center', verticalAlignment: 'center' };
}
setup(summary, 'Race Data', 'C26', [29, 58, 17]);
summary.tabColor = dark;
header(summary, 'A4:C4', ['Race details', 'Value', 'Unit']);
summary.getRange('A5:C10').values = [
  ['Swimmer', '—', ''], ['Meet', '—', ''], ['Race distance', 0, 'm'],
  ['Pool length', 0, 'm'], ['Stroke', '—', ''], ['Exported (UTC)', '—', ''],
];
summary.getRange('B5:B6').format.wrapText = true;
summary.getRange('A5:C6').format.rowHeight = 40;
header(summary, 'A12:C12', ['Race summary', 'Result', 'Unit']);
summary.getRange('A13:C16').values = [
  ['Finish time', 0, 'seconds'], ['Start to 15m', 0, 'seconds'],
  ['Final 5m', 0, 'seconds'], ['Average 100m pace', '—', 'seconds/100m'],
];
summary.getRange('B13:B16').setNumberFormat('0.00');
summary.getRange('A13:C13').format.fill = '#EFF8DB';
summary.getRange('A13:C13').format.font.bold = true;
summary.getRange('A18').values = [['Metric definitions']];
summary.getRange('A18').format.font.bold = true;
summary.getRange('A19:C19').values = [['Turn to 15m', 'Previous wall to the next 15m tap. Not applicable on length one.', '']];
summary.getRange('A20:C20').values = [['Surface speed', '15m to wall/finish, including length one; estimated in m/s.', '']];
summary.getRange('A21:C21').values = [['Estimated DPS', 'Metres per complete stroke cycle, calculated from speed and stroke rate.', '']];
summary.getRange('A22:C22').values = [['Turn allowance', 'Same-stroke freestyle/backstroke turns: fixed 0.8s and 1m.', '']];
summary.getRange('A23:C23').values = [['Open turns and finishes', 'No allowance for open turns, IM stroke changes or finishes.', '']];
summary.getRange('A24:C24').values = [['Unavailable values', 'A dash means unavailable or not applicable; it is not a zero.', '']];
summary.getRange('A25:C25').values = [['Times', 'Numeric seconds, shown to two decimal places. Raw precision is retained.', '']];
summary.getRange('B19:B25').format.wrapText = true;
summary.getRange('A19:C25').format.rowHeight = 38;

setup(splits, 'Race splits', 'D19', [22, 20, 19, 22]);
splits.getRange('A3').values = [['Summary splits for this event. All times in seconds.']];
header(splits, 'A4:D4', ['Distance', 'Stroke', 'Split (s)', 'Cumulative (s)']);
splits.getRange('A5:D19').values = Array.from({ length: 15 }, () => ['—', '—', 0, 0]);
splits.getRange('C5:D19').setNumberFormat('0.00');
splits.tables.add('A4:D19', true, 'RaceSplits');
splits.freezePanes.freezeRows(4);

setup(lengths, 'Length metrics', 'J64', [10, 14, 19, 15, 18, 18, 18, 20, 21, 20]);
lengths.getRange('A3').values = [['Speed and DPS are estimates. Definitions and allowances are on Summary.']];
header(lengths, 'A4:J4', ['Length', 'Distance (m)', 'Stroke', 'Split (s)', 'Cumulative (s)',
  'Start to 15m (s)', 'Turn to 15m (s)', 'Stroke rate (cycles/min)', 'Surface speed (m/s)', 'Est. DPS (m/cycle)']);
lengths.getRange('A5:J64').values = Array.from({ length: 60 }, () => [0, 0, '—', 0, 0, '—', '—', 0, 0, 0]);
lengths.getRange('D5:J64').setNumberFormat('0.00');
lengths.tables.add('A4:J64', true, 'RaceLengthMetrics');
lengths.freezePanes.freezeRows(4);

workbook.recalculate();
console.log((await workbook.inspect({ kind: 'sheet', include: 'id,name' })).ndjson);
for (const sheet of [summary, splits, lengths]) {
  const preview = await workbook.render({ sheetName: sheet.name,
    range: sheet === summary ? 'A1:C25' : sheet === splits ? 'A1:D8' : 'A1:J8', scale: 1, format: 'png' });
  await fs.writeFile(path.join(outputDir, `${sheet.name.replaceAll(' ', '-')}.png`), new Uint8Array(await preview.arrayBuffer()));
}
const file = await SpreadsheetFile.exportXlsx(workbook);
const output = path.join(outputDir, 'race-export-template.xlsx');
await file.save(output);
await fs.copyFile(output, path.join(project, 'web/assets/race-export-template.xlsx'));
console.log('Excel template ready');
