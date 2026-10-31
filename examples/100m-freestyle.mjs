import { compute } from '../engine.mjs';

// Invented test data, not an athlete record. All times are elapsed seconds.
export const config = { distance: 100, pool: 25, stroke: 'Freestyle' };
export const timestamps = [
  0,
  7, 7.2, 10.2, 12.5,
  20.5, 20.6, 24.2, 27,
  35.5, 35.6, 39.6, 42,
  50.8, 51, 55.5, 56, 60,
];

const result = compute(config, timestamps);
console.log(JSON.stringify(result, null, 2));
