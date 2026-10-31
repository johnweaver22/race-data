// All timestamps and durations are seconds. Convert performance.now() / 1000
// at the capture boundary; retain precision until displaying/exporting results.
export const DISTANCES = Object.freeze([50, 100, 200, 400, 800, 1500]);
export const STROKES = Object.freeze(['Freestyle', 'Backstroke', 'Breaststroke', 'Butterfly', 'IM']);

function validateConfig(config) {
  if (!config || typeof config !== 'object') throw new Error('Unsupported event');
  const { distance, pool, stroke } = config;
  if (!DISTANCES.includes(distance) || ![25, 50].includes(pool)
      || distance % pool !== 0 || !STROKES.includes(stroke)) {
    throw new Error('Unsupported event');
  }
  // Preserve the original engine's event range pending the setup-screen review.
  if (stroke === 'IM' && (distance < 100 || (distance / 4) % pool !== 0)) {
    throw new Error('Unsupported IM event');
  }
}

export function strokeAt(stroke, distance, lengthIndex, pool) {
  if (stroke !== 'IM') return stroke;
  const leg = distance / 4;
  return ['Butterfly', 'Backstroke', 'Breaststroke', 'Freestyle'][
    Math.min(3, Math.floor((lengthIndex * pool) / leg))
  ];
}

export function sequence(config) {
  validateConfig(config);
  const { distance, pool, stroke } = config;
  const lengths = distance / pool;
  const events = [{ type: 'GO', length: 0, stroke }];
  for (let i = 0; i < lengths; i++) {
    const s = strokeAt(stroke, distance, i, pool);
    const length = i + 1;
    events.push(
      { type: 'HEAD_15M', length, stroke: s },
      { type: 'SR_START', length, stroke: s },
      { type: 'SR_STOP', length, stroke: s },
    );
    if (i === lengths - 1) {
      events.push({ type: 'FINAL_5M', length, stroke: s }, { type: 'FINISH', length, stroke: s });
    } else {
      events.push({ type: 'WALL', length, stroke: s });
    }
  }
  return events;
}

export function compute(config, timestamps) {
  const events = sequence(config);
  if (!Array.isArray(timestamps) || timestamps.length !== events.length) {
    throw new Error('Tap count mismatch');
  }
  // A loop deliberately rejects sparse arrays as well as invalid numeric values.
  for (let i = 0; i < timestamps.length; i++) {
    if (!Number.isFinite(timestamps[i]) || timestamps[i] < 0
        || (i > 0 && timestamps[i] <= timestamps[i - 1])) {
      throw new Error('Invalid timestamps');
    }
  }

  const rows = events.map((event, i) => ({ ...event, t: timestamps[i] }));
  const lengthCount = config.distance / config.pool;
  const lengths = [];
  for (let n = 1; n <= lengthCount; n++) {
    const offset = 1 + (n - 1) * 4;
    const head = timestamps[offset];
    const srTime = timestamps[offset + 2] - timestamps[offset + 1];
    const isFinal = n === lengthCount;
    const end = timestamps[offset + (isFinal ? 4 : 3)];
    const previous = n === 1 ? timestamps[0] : lengths[n - 2].end;
    const stroke = strokeAt(config.stroke, config.distance, n - 1, config.pool);
    const nextStroke = isFinal ? null : strokeAt(config.stroke, config.distance, n, config.pool);
    // IM changeovers are open turns, including backstroke -> breaststroke.
    const tumble = !isFinal && nextStroke === stroke
      && (stroke === 'Freestyle' || stroke === 'Backstroke');
    const surfaceDuration = end - head - (tumble ? 0.8 : 0);
    const surfaceDistance = config.pool - 15 - (tumble ? 1 : 0);
    const surfaceSpeed = surfaceDuration <= 0
      ? null : surfaceDistance / surfaceDuration;
    const strokeRate = 180 / srTime;
    lengths.push({
      length: n,
      stroke,
      split: end - previous,
      cumulative: end - timestamps[0],
      end,
      start15m: n === 1 ? head - previous : null,
      turn15m: n === 1 ? null : head - previous,
      strokeRate,
      estimatedDPS: surfaceSpeed === null ? null : surfaceSpeed * 60 / strokeRate,
      surfaceSpeed,
    });
  }
  const total = timestamps.at(-1) - timestamps[0];
  const summarySplitDistance = config.distance === 100 ? 50
    : config.distance === 200 ? 100
    : config.distance === 400 ? (config.stroke === 'IM' ? 100 : 200)
    : config.distance >= 800 ? 100 : null;
  const summarySplits = [];
  if (summarySplitDistance !== null) {
    let previous = 0;
    for (const length of lengths) {
      const to = length.length * config.pool;
      if (to % summarySplitDistance !== 0) continue;
      summarySplits.push({ from: to - summarySplitDistance, to,
        split: length.cumulative - previous, cumulative: length.cumulative,
        stroke: config.stroke === 'IM' && config.distance === 400 ? length.stroke : null });
      previous = length.cumulative;
    }
  }
  return {
    total,
    summarySplitDistance,
    summarySplits,
    average100Pace: config.distance >= 800 ? total * 100 / config.distance : null,
    start15m: lengths[0].start15m,
    final5m: timestamps.at(-1) - timestamps.at(-2),
    lengths,
    events: rows,
  };
}
