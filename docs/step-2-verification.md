# Step 2: setup and capture

Date: 31 October 2026.

## Included

Race setup, the fixed one-button tap sequence, continuous monotonic timer,
live length splits, IM stroke prompts, final-5m/finish capture, basic results,
recorded-tap review, reset confirmation and shared RL branding.

## Validation

- 21 automated tests pass, including the original 56 engine configurations.
- A complete 18-tap 100m short-course freestyle race was exercised through
  browser pointer input. Every press advanced once, in the agreed order.
- A complete 200m long-course IM race was exercised through keyboard input.
  Recorded strokes were Butterfly, Backstroke, Breaststroke, Freestyle.
- Pool/IM compatibility selects a valid distance and disables invalid options.
- Cancelling the new-race dialog preserves results; confirming clears the
  race while retaining setup fields.
- Both theme directions were checked in the browser.
- Original RL logo is used for the header, favicon and Apple touch icon.

## Responsive browser layout checks

The app was rendered inside viewports at the following sizes. This tests the
actual responsive CSS; it is not a claim of native-device or touch-latency QA.
All checked capture layouts had no horizontal page overflow, and the entire
capture button was inside the viewport without scrolling.

| Target | Viewport | Capture-button bottom | Viewport height |
| --- | --- | ---: | ---: |
| Small phone | 320 x 568 | 521 | 568 |
| Phone | 390 x 844 | 595 | 844 |
| Large phone | 430 x 932 | 603 | 932 |
| Phone landscape | 844 x 390 | 356 | 390 |
| iPad portrait | 768 x 1024 | 767 | 1024 |
| iPad landscape | 1024 x 768 | 719 | 768 |

Scrollbar space in this desktop browser reduces inner document width by 15px.
Phone distance controls were measured at 48px high and about 92px wide at the
390px viewport; form inputs use 16px text to avoid iPhone input zoom.
Themes and resets have at least 44px touch targets. The capture button is
150-245px high across the checked layouts.

## Reliability behaviour

Captures remain in memory only. Wake lock is requested when supported, but the
app instructs the user to leave the page open. A hidden-page interruption
blocks further taps and does not produce a completed result. Partial or
interrupted captures cannot produce fabricated splits or a final race time.

Reset requires an explicit confirmation. The dialog return value is cleared
when opened so cancelling cannot reuse a previous reset choice. Pointer input
is recorded at press time, with synthetic follow-up clicks ignored. Secondary
pointers and held-key repeats do not add extra taps.

## Still to verify

Physical phone/iPad touch latency, Safari-specific behaviour, screen sleep and
real poolside usability. Full metric tables and Excel/PDF exports are later
build steps. No offline-installation or saved-race feature is claimed.
