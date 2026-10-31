# Step 1: timing verification

Date: 31 October 2026.

Status: calculation checks passed. Live tap capture and device reliability have
not been tested; those require the interface in the next build step.

## Preserved decisions

- One fixed tap sequence: GO, 15m, stroke-rate start, stroke-rate stop, wall.
- Count three complete cycles between stroke-rate start and stop.
- Each new length starts with its 15m prompt. No extra taps, undo or skip.
- On the final length, final 5m then finish replace the wall prompt.
- Pools: 25m or 50m. Strokes: Freestyle, Backstroke, Breaststroke, Butterfly, IM.
- The original engine's event range is retained: 50, 100, 200, 400, 800, 1500m;
  IM requires whole pool lengths in each quarter of the race. This is an engine
  compatibility range, not a reviewed list of competition events. The setup
  screen still needs an explicit event availability review.
- First-length surface speed and Estimated DPS are included, using the section
  from the first 15m tap to the first wall or finish (updated after user review).
- Final-length Estimated DPS uses 15m to finish, as in the saved engine.
- Same-stroke freestyle and backstroke turns use the agreed fixed 0.8s/1m
  allowance; breaststroke, butterfly, IM changeovers and finishes do not.

## Simulated 100m freestyle, 25m pool

These are invented timestamps for calculation checking, not a real swimmer's data.
There are 18 taps, including GO and finish.

| Tap | Race point | Elapsed time (s) |
| --- | --- | ---: |
| 1 | GO | 0.00 |
| 2 | Length 1: 15m | 7.00 |
| 3 | Length 1: SR start | 7.20 |
| 4 | Length 1: SR stop, after three cycles | 10.20 |
| 5 | 25m wall | 12.50 |
| 6 | Length 2: 15m out (40m race distance) | 20.50 |
| 7 | Length 2: SR start | 20.60 |
| 8 | Length 2: SR stop, after three cycles | 24.20 |
| 9 | 50m wall | 27.00 |
| 10 | Length 3: 15m out (65m race distance) | 35.50 |
| 11 | Length 3: SR start | 35.60 |
| 12 | Length 3: SR stop, after three cycles | 39.60 |
| 13 | 75m wall | 42.00 |
| 14 | Length 4: 15m out (90m race distance) | 50.80 |
| 15 | Length 4: SR start | 51.00 |
| 16 | Length 4: SR stop, after three cycles | 55.50 |
| 17 | Final 5m marker (95m race distance) | 56.00 |
| 18 | 100m finish | 60.00 |

| Length | Split (s) | Cumulative (s) | Start/turn to 15m (s) | SR (cycles/min) | Surface speed (m/s) | Estimated DPS (m/cycle) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.50 | 12.50 | 7.00 (start) | 60.00 | 1.91 | 1.91 |
| 2 | 14.50 | 27.00 | 8.00 (turn) | 50.00 | 1.58 | 1.89 |
| 3 | 15.00 | 42.00 | 8.50 (turn) | 45.00 | 1.58 | 2.11 |
| 4 | 18.00 | 60.00 | 8.80 (turn) | 40.00 | 1.09 | 1.63 |

Total: **60.00s**. Start to 15m: **7.00s**. Final 5m: **4.00s**.

## Formula checks

- Total = finish timestamp - GO timestamp.
- Start 15m = first 15m timestamp - GO timestamp.
- Turn 15m = current length's 15m timestamp - previous wall timestamp.
  This is a combined turn-and-15m-out measure, not an isolated wall-contact time.
- Length split = current wall/finish timestamp - previous wall/GO timestamp.
- SR = 3 cycles x 60 / (SR stop - SR start).
- Final 5m = finish timestamp - final-5m timestamp.
- Surface speed = (pool length - 15 - distance allowance) /
  (wall/finish timestamp - 15m timestamp - time allowance).
- Estimated DPS = surface speed x 60 / SR.

Example, length 2: SR = 180 / 3.60 = 50.00 cycles/min. Adjusted surface
speed = 9 / (6.50 - 0.80) = 1.578947... m/s. Estimated DPS =
1.578947... x 60 / 50 = 1.894736... m/cycle.

These allowances are fixed estimates selected in scoping, not measured turn data.
The calculations cannot verify that the operator observed three actual cycles;
the tapping interface and poolside test must check the practical sequence.

## Corrections made

1. Return the previously missing start-to-15m, turn-to-15m and final-5m metrics.
2. Remove the erroneous tumble allowance at the backstroke-to-breaststroke IM
   changeover. Apply the allowance only when the same eligible stroke continues.
3. Reject sparse arrays, negative/nonfinite/nonnumeric timestamps, incomplete tap
   lists and non-increasing timestamps. Preserve unavailable estimates as `null`.
4. Retain raw precision internally and state seconds explicitly as the input unit.

## Validation

13 automated tests pass, covering the 56 configurations supported by the original
engine, plus:

- Exact 100m short-course sequence and hand-calculated outputs.
- Arbitrary monotonic clock origins and split totals.
- IM stroke boundaries and open changeovers.
- Same-stroke tumble allowances, open turns and finish treatment.
- Long-course remaining distances and final-length Estimated DPS.
- Invalid input, missing taps and nonpositive adjusted durations.
- Input immutability and precision retention.

No live timing accuracy, touch latency, sleep/resume, offline storage or export
claim is made by these calculation tests. Those belong to subsequent build steps.
