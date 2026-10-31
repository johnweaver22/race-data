# Race Data app

A race-day swimming metrics tapper, separate from Swim Clock.

## Current build: capture, saved swimmers, CSV and landscape PDF

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

The Download PDF control prepares a real A4 landscape PDF locally, then saves
it synchronously from the button press. The approved layout includes a swimmer
portrait fading into white, a solid speed curve on the left axis and dotted DPS
curve on the right axis, a summary, and separate turn, split/cumulative and
stroke-rate tables. Reports for 50-400m fit one page. Longer events continue on
additional pages and include all 100m splits and average 100m pace. Headings
use darker grey. Missing speed/DPS values leave gaps in the curves.

The Swimmers section saves names and processed portrait photos in IndexedDB.
Add photo opens the file/photo picker; Take photo uses a camera capture input
on supported phones and tablets. Saving requests persistent browser storage on
a best-effort basis. Profiles stay in the same browser on the same device;
clearing site data removes them. The app does not sync profiles between devices.
Race setup selects a saved swimmer or accepts a one-off name. A capture keeps
a snapshot of the selected name and photo, so later profile edits cannot change
that race report. No swimmer names, portraits or race data are sent to GitHub.

PDF-Lib 1.17.1 is vendored with its MIT licence. No CDN is required. Embedded
DejaVu Sans report fonts cover Latin, Greek and Cyrillic text; unsupported
report glyphs use `?`, while the original name remains in the app and CSV.
Font notices are in `web/vendor/Report-Fonts-LICENSE.md`. Regenerate the pinned
font data with `python scripts/build-report-fonts.py` (requires fontTools).

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
