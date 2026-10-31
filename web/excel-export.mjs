import './vendor/jszip.min.js';
import { compute } from './engine.mjs';

const JSZip = globalThis.JSZip;
export const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const unavailable = value => value === null ? '—' : value;
const cell = (column, row) => `${String.fromCharCode(65 + column)}${row}`;

export function exportData(config, timestamps, exportedAt = new Date()) {
  // Reuse the timing engine; reject partial captures rather than exporting them.
  const result = compute(config, timestamps);
  const identity = `${config.distance}m ${config.stroke === 'IM' ? 'IM' : config.stroke} · ${config.pool}m pool`;
  const summary = {
    B5: String(config.swimmer ?? ''), B6: String(config.meet ?? ''),
    B7: config.distance, B8: config.pool,
    B9: config.stroke === 'IM' ? 'Individual medley' : config.stroke,
    B10: exportedAt.toISOString(), B13: result.total,
    B14: result.start15m, B15: result.final5m, B16: unavailable(result.average100Pace),
  };
  const splits = result.summarySplits.map(row => [
    `${row.from}–${row.to}m`, row.stroke ?? config.stroke, row.split, row.cumulative,
  ]);
  const lengths = result.lengths.map(row => [row.length, row.length * config.pool, row.stroke,
    row.split, row.cumulative, unavailable(row.start15m), unavailable(row.turn15m),
    row.strokeRate, unavailable(row.surfaceSpeed), unavailable(row.estimatedDPS)]);
  return { summary, splits, lengths, identity,
    splitTitle: result.summarySplitDistance === null ? '50m race: no half splits. See Length Metrics.'
      : `${identity}. ${result.summarySplitDistance}m ${config.distance === 400 && config.stroke === 'IM' ? 'stroke splits' : config.distance >= 800 ? 'splits' : 'half splits'}. Times in seconds.` };
}

function escapeXml(value) {
  return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/gu, '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function fillSheet(xml, values, lastRow = Infinity) {
  const remaining = new Set(Object.keys(values));
  const filled = xml.replace(/<x:row\b([^>]*)>[\s\S]*?<\/x:row>/g, (rowXml, rowAttrs) => {
    if (Number(rowAttrs.match(/\br="(\d+)"/)?.[1]) > lastRow) return '';
    return rowXml.replace(/<x:c\b([^>]*?)(?:\/>|>[\s\S]*?<\/x:c>)/g, (original, attrs) => {
      const address = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
      if (!Object.hasOwn(values, address)) return original;
      remaining.delete(address);
      const value = values[address];
      const properties = attrs.replace(/\s+t="[^"]*"/, '').trimEnd();
      if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new Error('Invalid export metric');
        return `<x:c${properties} t="n"><x:v>${value}</x:v></x:c>`;
      }
      // All user text is literal text, including names beginning with =, + or @.
      return `<x:c${properties} t="inlineStr"><x:is><x:t xml:space="preserve">${escapeXml(value)}</x:t></x:is></x:c>`;
    });
  });
  if (remaining.size) throw new Error('Excel template does not match the export');
  return filled;
}

function rowsToCells(rows) {
  return Object.fromEntries(rows.flatMap((row, index) => row.map((value, column) => [cell(column, index + 5), value])));
}

export async function createExcelExport(config, timestamps, templateBytes, exportedAt = new Date()) {
  const data = exportData(config, timestamps, exportedAt);
  const zip = await JSZip.loadAsync(templateBytes);
  async function fill(path, values, lastRow) {
    const part = zip.file(path);
    if (!part) throw new Error('Excel template is missing');
    zip.file(path, fillSheet(await part.async('string'), values, lastRow));
  }
  const splitRows = data.splits.length ? data.splits : [['Not applicable', '—', '—', '—']];
  await fill('xl/worksheets/sheet1.xml', data.summary);
  await fill('xl/worksheets/sheet2.xml', { A3: data.splitTitle, ...rowsToCells(splitRows) }, splitRows.length + 4);
  await fill('xl/worksheets/sheet3.xml', { A3: `${data.identity}. Speed and DPS are estimates; see Summary for definitions.`,
    ...rowsToCells(data.lengths) }, data.lengths.length + 4);
  for (const [name, to] of [['table1', `D${splitRows.length + 4}`], ['table2', `J${data.lengths.length + 4}`]]) {
    const path = `xl/tables/${name}.xml`;
    const xml = await zip.file(path)?.async('string');
    if (!xml) throw new Error('Excel table is missing');
    zip.file(path, xml.replace(/\bref="[A-Z]+\d+:[A-Z]+\d+"/g, `ref="A4:${to}"`));
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export function excelFilename(config, date = new Date(), unique = globalThis.crypto?.randomUUID?.() ?? String(Math.random()).slice(2)) {
  const safe = value => String(value).normalize('NFKC').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 45) || 'Race';
  const stamp = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `Race-Data_${safe(config.swimmer)}_${config.distance}m-${safe(config.stroke)}_${stamp}_${safe(unique).slice(0, 8)}.xlsx`;
}
