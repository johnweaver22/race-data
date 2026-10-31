import { PDFDocument, StandardFonts, rgb } from './vendor/pdf-lib.esm.min.mjs';
import { reportData, monotonePath } from './report-model.mjs';
import { formatClock } from './capture-model.mjs';
import { csvFilename } from './csv-export.mjs';
import { brandLogo } from './report-brand.mjs';

const W = 841.89, H = 595.28, M = 26;
const color = hex => rgb(...hex.match(/\w\w/g).map(v => parseInt(v, 16) / 255));
const ink = color('192a31'), title = color('39484f'), muted = color('53666f');
const line = color('d7e0e2'), fill = color('edf2f2'), speedColor = color('244d5a'), dpsColor = color('829467');
const shortStroke = s => ({ Freestyle: 'Free', Backstroke: 'Back', Breaststroke: 'Breast', Butterfly: 'Fly' })[s] ?? s;
const number = v => v === null ? '-' : v.toFixed(2);

export async function createRacePdf(config, timestamps, { portrait = null, date = new Date() } = {}) {
  const model = reportData(config, timestamps);
  const doc = await PDFDocument.create();
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await doc.embedJpg(brandLogo);
  const image = portrait ? await doc.embedJpg(portrait) : null;
  // Helvetica supports western European names. Other glyphs use a readable
  // replacement rather than making the entire completed race unexportable.
  function safe(value) {
    return [...String(value)].map(ch => { try { normal.encodeText(ch); return ch; } catch { return '?'; } }).join('');
  }
  const text = (page, value, x, top, { size = 8, weight = false, tint = ink, align = 'left', width = null } = {}) => {
    const font = weight ? bold : normal;
    let label = safe(value), actual = size;
    if (width) {
      while (font.widthOfTextAtSize(label, actual) > width && actual > size * .75) actual -= .25;
      while (font.widthOfTextAtSize(label, actual) > width && label.length) label = label.slice(0, -2) + '…';
    }
    const measured = font.widthOfTextAtSize(label, actual);
    page.drawText(label, { x: align === 'right' ? x - measured : align === 'center' ? x - measured / 2 : x,
      y: H - top - actual, size: actual, font, color: tint });
  };
  const rule = (page, x1, x2, top, tint = line, thickness = .55) => page.drawLine({
    start: { x: x1, y: H - top }, end: { x: x2, y: H - top }, color: tint, thickness });
  const rect = (page, x, top, width, height, tint) => page.drawRectangle({ x, y: H - top - height, width, height, color: tint });
  const eventName = `${config.distance}m ${config.stroke === 'IM' ? 'Individual Medley' : config.stroke}`;
  const raceDate = new Date(config.raceDate ?? date);
  const dateLabel = Number.isFinite(raceDate.getTime()) ? raceDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  function header(page, continuation = false) {
    if (image) page.drawImage(image, { x: M, y: H - 115, width: 123, height: 97 });
    const start = image ? 160 : M;
    text(page, continuation ? 'RACE ANALYSIS / CONTINUED' : 'RACE ANALYSIS', start, 28, { size: 7.5, tint: title, weight: true });
    text(page, config.swimmer, start, 45, { size: 24, weight: true, width: 400 });
    text(page, eventName, start, 77, { size: 10, weight: true });
    text(page, config.meet, start, 94, { size: 8, tint: muted, width: 420 });
    text(page, `${dateLabel}  |  ${config.pool}m pool - ${config.pool === 25 ? 'Short' : 'Long'} course`, start, 107, { size: 7, tint: muted, width: 420 });
    page.drawImage(logo, { x: W - M - 110, y: H - 47, width: 22, height: 22 });
    text(page, 'RACE DATA', W - M, 30, { align: 'right', weight: true, size: 10 });
    text(page, 'FINISH TIME', W - M, 64, { align: 'right', size: 7, tint: title, weight: true });
    text(page, formatClock(model.result.total), W - M, 78, { align: 'right', weight: true, size: 31 });
    rect(page, W - M - 34, 116, 34, 3, color('b3e963'));
    rule(page, M, W - M, 128, ink, 1.3);
  }
  function footer(page, index, count) {
    rule(page, M, W - M, H - 31);
    text(page, 'RL / RACE DATA', M, H - 23, { size: 6.5, weight: true, tint: title });
    text(page, 'Speed and DPS are estimates. Curves join length estimates; gaps mean unavailable. DPS = metres/cycle.', W / 2, H - 23,
      { size: 6.1, align: 'center', tint: muted });
    text(page, `${index} / ${count}`, W - M, H - 23, { size: 6.5, align: 'right', tint: title });
  }
  function table(page, x, top, width, heading, note, columns, rows, { height = 16, fontSize = 7.5 } = {}) {
    rule(page, x, x + width, top, title, 1.1);
    text(page, heading, x, top + 9, { size: 7.2, weight: true, tint: title });
    if (note) text(page, note, x + width, top + 10, { size: 6.1, align: 'right', tint: muted });
    const head = top + 28;
    rect(page, x, head, width, 18, fill);
    let columnX = x;
    for (const c of columns) {
      text(page, c.label, c.align === 'right' ? columnX + c.width * width - 7 : columnX + 7, head + 5,
        { size: 6.4, tint: title, weight: true, align: c.align ?? 'left' });
      columnX += c.width * width;
    }
    for (const [index, row] of rows.entries()) {
      const y = head + 18 + index * height;
      let xx = x;
      for (let i = 0; i < columns.length; i++) {
        const c = columns[i];
        text(page, row[i], c.align === 'right' ? xx + c.width * width - 7 : xx + 7, y + (height - fontSize) / 2,
          { size: fontSize, align: c.align ?? 'left', width: c.width * width - 14 });
        xx += c.width * width;
      }
      rule(page, x, x + width, y + height);
    }
    if (!rows.length) text(page, 'No turns in this event.', x + 7, head + 27, { size: 8, tint: muted });
  }
  function chart(page, top) {
    const x = M, width = 526, height = 158, l = 39, r = width - 40, t = 35, b = height - 28;
    text(page, 'SPEED & DISTANCE PER CYCLE', x, top, { size: 7.2, weight: true, tint: title });
    page.drawLine({ start: { x: x + 369, y: H - top - 5 }, end: { x: x + 386, y: H - top - 5 }, thickness: 1.5, color: speedColor });
    text(page, 'm/s', x + 390, top, { size: 6.5, tint: muted });
    page.drawLine({ start: { x: x + 424, y: H - top - 5 }, end: { x: x + 444, y: H - top - 5 }, thickness: 1.5, color: dpsColor, dashArray: [1, 3] });
    text(page, 'DPS', x + 448, top, { size: 6.5, tint: muted });
    const valid = model.chart.filter(v => v.speed !== null && v.dps !== null);
    if (!valid.length) { text(page, 'Speed / DPS unavailable for this capture.', x + 39, top + 75, { tint: muted }); return; }
    const domain = key => {
      const vals = valid.map(v => v[key]);
      const min = Math.min(...vals), max = Math.max(...vals), pad = Math.max((max - min) * .18, .05);
      return [Math.max(0, min - pad), max + pad];
    };
    const a = domain('speed'), d = domain('dps');
    const xx = distance => l + 4 + (distance - config.pool) / Math.max(config.distance - config.pool, 1) * (r - l - 8);
    const yy = (value, bounds) => b - (value - bounds[0]) / (bounds[1] - bounds[0]) * (b - t);
    text(page, 'm/s', x + l, top + 19, { size: 6.5, tint: title });
    text(page, 'DPS - m/cycle', x + r, top + 19, { size: 6.5, tint: title, align: 'right' });
    for (let i = 0; i < 4; i++) {
      const f = i / 3, y = b - (b - t) * f;
      rule(page, x + l, x + r, top + y, line, .4);
      text(page, (a[0] + (a[1] - a[0]) * f).toFixed(2), x + l - 7, top + y - 3, { align: 'right', size: 6.1, tint: muted });
      text(page, (d[0] + (d[1] - d[0]) * f).toFixed(2), x + r + 7, top + y - 3, { size: 6.1, tint: muted });
    }
    const step = Math.max(1, Math.ceil(model.chart.length / 8));
    const labels = model.chart.filter((_, i) => i % step === 0 || i === model.chart.length - 1);
    for (const v of labels) text(page, v.distance, x + xx(v.distance), top + b + 7, { size: 6.2, tint: muted, align: 'center' });
    text(page, 'Race distance - m', x + (l + r) / 2, top + height - 5, { size: 6.5, tint: title, align: 'center' });
    for (const [key, bounds, tint, dotted] of [['speed', a, speedColor, false], ['dps', d, dpsColor, true]]) {
      // Split at unavailable lengths; never connect a curve across missing data.
      const segments = [[]];
      for (const v of model.chart) {
        if (v[key] === null) { if (segments.at(-1).length) segments.push([]); }
        else segments.at(-1).push([xx(v.distance), yy(v[key], bounds)]);
      }
      for (const points of segments) {
        if (points.length > 1) page.drawSvgPath(monotonePath(points), { x, y: H - top, borderColor: tint,
          borderWidth: 1.6, borderDashArray: dotted ? [1, 3] : undefined });
        for (const p of points) page.drawCircle({ x: x + p[0], y: H - top - p[1], size: 1.9,
          color: dotted ? rgb(1, 1, 1) : tint, borderColor: tint, borderWidth: .9 });
      }
    }
  }
  for (const [i, chunk] of model.chunks.entries()) {
    const page = doc.addPage([W, H]);
    header(page, i > 0);
    chart(page, 145);
    const sx = 582, sw = W - M - sx, rowH = Math.min(22, 142 / model.summary.length);
    text(page, 'RACE SUMMARY', sx, 145, { size: 7.2, tint: title, weight: true });
    for (const [n, [label, value]] of model.summary.entries()) {
      const top = 163 + n * rowH;
      if (n === 0) rect(page, sx, top - 2, sw, rowH, color('f0f4ec'));
      text(page, label, sx + 7, top + 4, { size: 7, tint: muted, width: sw * .65 });
      text(page, value, sx + sw - 7, top + 4, { size: 8, weight: true, align: 'right' });
      rule(page, sx, sx + sw, top + rowH - 2);
    }
    const y = 319, tw = 238, gap = 23, splitW = 268;
    const rowHeight = Math.min(20, 196 / Math.max(chunk.lengths.length, 1));
    const size = chunk.lengths.length > 12 ? 7 : 8;
    table(page, M, y, tw, 'TURNS', 'Wall to 15m out', [
      { label: 'WALL', width: .25 }, { label: 'STROKE OUT', width: .45 }, { label: 'TIME - s', width: .30, align: 'right' },
    ], chunk.turns.map(v => [`${v.wall}m`, shortStroke(v.stroke), number(v.time)]), { height: rowHeight, fontSize: size });
    table(page, M + tw + gap, y, splitW, 'SPLITS & CUMULATIVE', 'Seconds', [
      { label: 'AT', width: .27 }, { label: 'SPLIT', width: .31, align: 'right' }, { label: 'CUMULATIVE', width: .42, align: 'right' },
    ], chunk.lengths.map(v => [`${v.length * config.pool}m`, number(v.split), number(v.cumulative)]), { height: rowHeight, fontSize: size });
    table(page, M + tw + gap + splitW + gap, y, W - M * 2 - tw - splitW - gap * 2, 'STROKE RATE', '3-cycle timing', [
      { label: 'AT', width: .24 }, { label: 'STROKE', width: .35 }, { label: 'CYCLES/MIN', width: .41, align: 'right' },
    ], chunk.lengths.map(v => [`${v.length * config.pool}m`, shortStroke(v.stroke), number(v.strokeRate)]), { height: rowHeight, fontSize: size });
  }
  if (model.summaryPage) {
    const page = doc.addPage([W, H]); header(page, true);
    table(page, M, 151, W - M * 2, '100m SPLITS', 'Seconds', [
      { label: 'FROM - TO', width: .34 }, { label: '100m SPLIT', width: .33, align: 'right' }, { label: 'CUMULATIVE', width: .33, align: 'right' },
    ], model.result.summarySplits.map(v => [`${v.from}-${v.to}m`, number(v.split), number(v.cumulative)]), { height: 23, fontSize: 9 });
  }
  const pages = doc.getPages(); pages.forEach((page, i) => footer(page, i + 1, pages.length));
  doc.setTitle(`${config.swimmer} - ${eventName} - Race Data`);
  doc.setAuthor('RL Race Data'); doc.setCreator('Race Data'); doc.setCreationDate(date); doc.setModificationDate(date);
  return { bytes: await doc.save(), name: csvFilename(config, date).replace(/\.csv$/, '.pdf'), pages: pages.length };
}

export function downloadRacePdf(file, scope = globalThis) {
  const blob = new Blob([file.bytes], { type: 'application/pdf' });
  const url = scope.URL.createObjectURL(blob);
  const link = scope.document.createElement('a');
  link.href = url; link.download = file.name;
  scope.document.body.append(link); link.click(); link.remove();
  scope.setTimeout(() => scope.URL.revokeObjectURL(url), 60000);
}
