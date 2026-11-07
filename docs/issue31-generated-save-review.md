# Issue #31 D4-B: generated v5 save proposal

This is a concrete, testable schema proposal and isolated storage adapter.
Production policy remains unapproved; `main.ts`, the app save/load buttons, and
the new-game default are unchanged. Draft IDs/status distinguish these files
from the eventual production contract. Q5/Q8 decisions and schema review precede
production ID freezing and atomic UI activation.

## Generated envelope

| Field | Draft contract |
| --- | --- |
| format / version / schemaVersion / status | `namonaki-generated-save-draft` / 5 / 1 / `review-only` |
| initialTerrain | schema 1, explicit `mode: generated`, one complete frozen terrain record, saved river ownership, three year-zero plans |
| progressionPolicy | `generated-land-review-v1`, explicit reservation trial mode and exact revised Q6 limits |
| rendererId | `generated-scene-review-v1` |
| landHistory | schema 1 and immutable land-birth events in actual source-record order |
| state | Existing v4 engine payload, detached and validated for complete generated history |

Each land event has `year`, same-year `seq`, `objectId`, `site`, `purpose`,
`sourceRecordId`, and `placement`. Placement schema 1 contains `plot`, `entrance`,
and the original `access` path from primary root to entrance. Bridges also carry
their verified single-span geometry. All ordinary/civic/housing/public-space and
bridge births appear exactly once. Status changes remain in their existing
building/housing/public-space histories; they do not create new land births.

Positions in existing building history remain authoritative. Ordinary footprint
dimensions/anchors and every saved placement must agree. Civic/housing/public
footprints must match exactly. There is no independent movable copy of an
existing building. Initial houses must agree with their saved year-zero plans.

Validation reconstructs occupancy in actual source order, including same-year
ordinary → civic → housing → public-space ordering. It validates original paths
with frozen v1 ground rules; it does not select new positions or regenerate the
world. Bridge birth validation checks the original improvement and banks, and
observed condition controls later walking independently. Unknown fields,
schema/rule/renderer/codec IDs, missing sources, inconsistent views, future
events, altered immutable geometry, sparse arrays and non-JSON data are rejected.

The state boundary checks population blocks, three settlement histories, all
building transitions, housing transitions/sources, civic/public-space sources,
economy, society, and memory. At year zero, the engine legitimately has not yet
created economy/society. Their absence is retained; the loader does not invent
them. Pending choices retain the previous confirmed observation year and exact
unfinished engine state.

## Lossless storage container

The complete uncompressed JSON has a 16MiB ceiling. The known storage wrapper is:

```json
{
  "format": "namonaki-compressed-save-draft",
  "version": 5,
  "schemaVersion": 1,
  "status": "review-only",
  "mode": "generated",
  "encoding": "gzip-base64-v1",
  "uncompressedBytes": 8817211,
  "data": "<standard gzip bytes in canonical base64>"
}
```

Compression preserves the complete validated envelope. Standard
CompressionStream/DecompressionStream performs gzip; decompression counts bytes
incrementally and cancels when the declared bound is exceeded. Both stored and
expanded input are bounded at 16MiB, lengths must match exactly, invalid UTF-8
or gzip is rejected, and nested/mixed-version containers are not accepted. The
inner mode must match the wrapper. No history is sampled, truncated, or removed.
The encoder uses plain JSON when it is smaller or compression is unavailable;
unsupported compressed input stops rather than falling back to another save.

The same codec supports existing `legacy-fixed` draft envelopes without changing
legacy progression. Discovery reads v5 → v4 → v3 → v2 and stops at the first
present key, including a corrupt/empty value. Validation and compression finish
before the sole native `setItem` call. Old keys are never deleted/overwritten.
Native quota failure keeps the previous value and returns the full plain JSON
for manual export. All probes use fresh isolated browser contexts.

## Evidence and fixture

- The full suite passed 272 tests. The final nine save/codec tests were also
  rerun after defensive input/path validation, and the legacy browser reader
  still matches all 66 scenes with zero new terrain imports.
- Frozen fixture: `tests/fixtures/generated-save-draft-v1-seed42-year0.json`.
  Complete decoded-domain SHA-256:
  `42e89ae91880e86413cb79f85f7356c9c9578bd90657ce195e5bfcc323ff22eb`.
- Seed 6 at 2,000: 103 immutable land births; 1,144,465 uncompressed bytes.
  State, pending choice, past views and resumed future match the unsaved trial.
- Seed 1 / field-only at 10,000: 181 births, 8,817,211 plain bytes → 932,933
  compressed bytes. Terrain itself is 77,655 bytes. The growth is primarily
  history, not terrain; gzip preserves every event.
- In Chromium, the complete generated save coexists with the original seed-42
  10,000-year v4 save (3,936,259 bytes). Native writes/reloads and full state
  digests match. Fifteen native/four-times past scenes render with every
  prototype/capture module blocked, and none is requested.
- Native quota preserves both prior values. Export after a simulated reduced
  quota restores the exact complete state. A corrupt v5 stops discovery.
- Record-boundary batching matches the old one-year UI loop. A local ten-year
  probe fell from about 3.8s to 0.62s with the complete review value unchanged;
  this is a local measurement, not a universal timing guarantee.

Reproduce with `node scripts/review-generated-save.mjs`; CI artifact
`terrain31-v5-save-review` includes the full plain/compressed files, capacity
report, and 15 scenes at native/four-times size. This one long-run storage case
does not complete D5. Production schema/policy freezing, actual app UI dispatch,
and the full D5 mechanical/human acceptance still remain.
