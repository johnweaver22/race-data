# CSV download

Results expose one Download CSV button. A completed race is calculated with the
same engine as the displayed results and serialized synchronously within the
click handler. Download uses a CSV Blob, object URL and temporary download anchor.
The URL remains valid for 60 seconds. No network request or login navigation is
required. CSV opens in Excel as a single sheet with clearly labeled sections.

Contents: swimmer, meet, course, event, export timestamp, finish time,
start-to-15m, final 5m, event-specific half/stroke/100m splits, distance-event
average 100m pace, and all length metrics including first-length m/s and DPS.
Blank cells mean unavailable. Numerical precision is retained. UTF-8 BOM and
CRLF records support Excel; commas, quotes and line breaks are escaped, and
formula-like user text is protected.

Validation: all 41 automated checks pass, including CSV results across all 56
supported event/course combinations, incomplete capture rejection and encoding.
A full 100m sample race was completed through the preview UI. Clicking Download
CSV produced an actual completed browser download with no navigation. Phone and
iPad saving still requires device confirmation.
