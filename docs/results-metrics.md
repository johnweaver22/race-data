# Results metrics

The results table now exposes the existing timing engine's turn-to-15m,
surface-speed and estimated-DPS values alongside each length's split,
cumulative time and stroke rate. No additional timing taps are required.

- Turn-to-15m is measured from the previous wall; the first length has no turn.
- Surface speed and estimated DPS include the first length, using its 15m-to-wall
  section. The existing turn allowances and finish treatment still apply.
- Unavailable values appear as a dash, never a numeric zero.
- Units state seconds, cycles/min, m/s and metres per complete stroke cycle.
- The table scrolls horizontally with a pinned length column, keyboard focus
  and an accessible region label. Definitions are available below the table.
- Summary finish time and event splits retain priority above length metrics.

Existing engine and capture checks cover the formulas, unavailable values,
IM changeovers and final-length handling. Excel/PDF exports are a later step.

## Validation

All 28 automated checks pass, including first-length values for every stroke,
IM changeovers and a single-length 50m race. A complete 100m short-course race
was captured in the browser to check the eight result columns and metric
definitions. Physical phone/iPad testing remains with the user.
