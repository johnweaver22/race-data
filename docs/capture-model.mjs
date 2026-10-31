import { sequence, compute } from './engine.mjs';

export class RaceCapture {
  constructor(config) {
    this.config = Object.freeze({ ...config });
    this.events = sequence(this.config);
    this.timestamps = [];
    this.state = 'ready';
    this.interruptedAt = null;
  }

  get next() { return this.events[this.timestamps.length] ?? null; }

  record(seconds) {
    if (this.state === 'complete' || this.state === 'interrupted') return false;
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Invalid capture time');
    if (this.timestamps.length && seconds <= this.timestamps.at(-1)) return false;
    this.timestamps.push(seconds);
    this.state = this.timestamps.length === this.events.length ? 'complete' : 'running';
    return true;
  }

  elapsed(seconds) {
    if (this.state === 'ready') return 0;
    const end = this.state === 'complete' ? this.timestamps.at(-1)
      : this.state === 'interrupted' ? this.interruptedAt : seconds;
    return Math.max(0, end - this.timestamps[0]);
  }

  interrupt(seconds) {
    if (this.state !== 'running') return false;
    this.interruptedAt = Math.max(seconds, this.timestamps.at(-1));
    this.state = 'interrupted';
    return true;
  }

  splits() {
    if (!this.timestamps.length) return [];
    let previous = this.timestamps[0];
    const splits = [];
    for (let i = 1; i < this.timestamps.length; i++) {
      const event = this.events[i];
      if (event.type === 'WALL' || event.type === 'FINISH') {
        splits.push({ length: event.length, stroke: event.stroke, split: this.timestamps[i] - previous });
        previous = this.timestamps[i];
      }
    }
    return splits;
  }

  results() {
    if (this.state !== 'complete') throw new Error('Race capture is incomplete');
    return compute(this.config, this.timestamps);
  }
}

export function formatClock(seconds, live = false) {
  const cents = Math.max(0, live ? Math.floor(seconds * 100) : Math.round(seconds * 100));
  const minutes = Math.floor(cents / 6000);
  const wholeSeconds = Math.floor(cents / 100) % 60;
  return `${minutes}:${String(wholeSeconds).padStart(2, '0')}.${String(cents % 100).padStart(2, '0')}`;
}
