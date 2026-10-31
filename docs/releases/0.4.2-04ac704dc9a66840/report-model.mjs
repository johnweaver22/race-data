import { compute } from './engine.mjs';
import { formatClock } from './capture-model.mjs';

export function reportData(config, timestamps) {
  const result = compute(config, timestamps);
  const summary = [['Finish time', formatClock(result.total)]];
  if (config.distance < 800) for (const row of result.summarySplits) {
    summary.push([`${row.from}-${row.to}m${row.stroke ? ` ${row.stroke}` : ''}`, formatClock(row.split)]);
  }
  if (result.average100Pace !== null) summary.push(['Average 100m pace', formatClock(result.average100Pace)]);
  summary.push(['Start to 15m', `${result.start15m.toFixed(2)} s`], ['Final 5m', `${result.final5m.toFixed(2)} s`]);
  const chunks = [];
  for (let i = 0; i < result.lengths.length; i += 16) {
    const lengths = result.lengths.slice(i, i + 16);
    chunks.push({ lengths, turns: lengths.filter(row => row.length > 1).map(row => ({
      wall: (row.length - 1) * config.pool, stroke: row.stroke, time: row.turn15m,
    })) });
  }
  return { result, summary, chunks, summaryPage: config.distance >= 800,
    chart: result.lengths.map(row => ({ distance: row.length * config.pool, speed: row.surfaceSpeed, dps: row.estimatedDPS })) };
}

export function monotonePath(points) {
  if (!points.length) return '';
  const slopes = points.slice(1).map((p, i) => (p[1] - points[i][1]) / (p[0] - points[i][0]));
  const tangents = points.map((_, i) => i === 0 ? slopes[0] : i === points.length - 1 ? slopes.at(-1)
    : slopes[i - 1] * slopes[i] <= 0 ? 0 : 2 / (1 / slopes[i - 1] + 1 / slopes[i]));
  let path = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = (b[0] - a[0]) / 3;
    path += `C${a[0] + dx},${a[1] + tangents[i - 1] * dx} ${b[0] - dx},${b[1] - tangents[i] * dx} ${b[0]},${b[1]}`;
  }
  return path;
}
