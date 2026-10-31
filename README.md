# Race Data app

A race-day swimming metrics tapper, separate from Swim Clock.

## Current build: capture, metrics and CSV download

- Race setup: swimmer, meet, pool length, race distance and stroke.
- One large capture button advances through the fixed timing sequence.
- High-resolution monotonic timing, continuous clock and live wall splits.
- IM stroke changes and final 5m/finish prompts.
- Completion summary with finish time followed by event splits: 50m for 100m,
  100m for 200m and 400m IM, 200m for other 400m races, and 100m plus
  average 100m pace for 800m/1500m. Recorded-tap review remains available.
- Full length metrics: splits, cumulative times, turn-to-15m, stroke rate,
  estimated surface speed and estimated distance per stroke cycle. Units and
  metric definitions are included. Speed and DPS include length one; its
  turn-to-15m value shows a dash because the race starts without a turn.
- An audible beep on each accepted timing tap, including GO and finish. Audio
  unlocks on the setup press and never delays or blocks timestamp capture.
- Phone and iPad layouts in portrait and landscape; dark/light themes.
- Original RL stopwatch logo reused unchanged.

The single Download CSV button generates an Excel-compatible UTF-8 CSV file
synchronously on the device. It includes summary, event splits and length metrics,
with unrounded numeric results and a timestamped filename. There is no template
fetch, race POST, login navigation or asynchronous preparation before download.
CSV contains sections in one worksheet rather than separate workbook tabs.
The legacy Excel generator and endpoint remain available to existing consumers;
the current interface uses CSV. See `docs/csv-export.md`.

PDF export remains for the next build step.
Races are held only in the open browser tab. Reloading or starting a new race
clears the captured race. Backgrounding an active capture marks it interrupted;
reset is required rather than silently producing unreliable results.

## Run

Requires Node.js 18 or later. No package installation required.

```sh
npm test
npm run build
npm run simulate
npm run dev
```

`web/` contains the interface source and `worker/index.mjs` serves it together
with the Excel download endpoint. `npm run dev` starts a local preview.
`npm run build` produces a self-contained Worker at `dist/server/index.js`.
`engine.mjs` is the timing-engine source; the build refreshes `web/engine.mjs`.

The tracked Excel template is authored with Artifact Tool by
`scripts/build-excel-template.mjs` using the Codex primary runtime. JSZip is
vendored with its licence solely to fill/package that template in the app
browser. Race data is processed locally and is not stored.
No external CDN or third-party export service is used. `scripts/verify-excel-export.mjs`
reopens a sample export with Artifact Tool for numeric and visual checks.

See `docs/step-1-verification.md` and `docs/step-2-verification.md`.

## GitHub repository and testing

Source: https://github.com/johnweaver22/race-data

This is the Race Data app, separate from Swim Clock. Run `npm test` and
`npm run build:pages` after changes. The generated browser app is in `docs/`.
In GitHub Settings > Pages, deploy from branch `main`, folder `/docs`.
See `docs/github-pages.md` for setup and device testing.

## Timing contract

Timestamp and duration units: seconds. Browser capture uses
`performance.now() / 1000`, with raw precision retained until display. Output
uses two decimal places. The operator measures exactly three cycles between
SR start and stop; there are no undo or skip actions.

The original engine's event compatibility range is retained. IM requires
whole lengths in every quarter; 100m IM in a 50m pool is unavailable.

Logo source: original `RL Stopwatch Logo.png` from the user's files; unchanged.
