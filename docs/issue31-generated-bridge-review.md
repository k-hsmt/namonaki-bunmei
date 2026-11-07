# Issue #31 D3-C: generated bridge history and access

`generated-bridge-review.ts` combines all generated land stages in an explicit
review facade. It requires saved river-reach ownership, retains
`placementPolicy: null`, and does not activate the game or v5 save writer.
Previous ordinary/housing/civic/public-space facades retain their stage limits.

The existing settlement engine still decides population demand (6,500), trade,
coverage, disasters, abandonment, eight-year work cadence, and repairs. The land
callback proposes the horizontal bridge described in
[the geometry review](issue31-bridge-geometry-review.md). Only an actual
`building-built` transaction commits its immutable geometry, year, and source
record. A failed proposal consumes no work interval. Repeated geometry HOLDs
are cached only while roots, occupancy, reservations, and active crossings agree.

At an observed year, both bank supports and the deck remain occupied regardless
of condition. Only an existing intact bridge contributes walking connectivity.
Normal facilities, civic facilities, housing, and public-space distances all use
that same graph. Walking over water never changes original construction physics.
The housing HOLD cache includes bridge footprints and active crossings, so a
repair can reopen a previously failed housing search.

Ledger validation requires the saved descriptor and geometry; it does not call
any world generator. It rejects missing/duplicate foundations, other-site
bridges, changed anchors, fabricated birth sources, and incompatible condition
transitions. The foundation search is replayed against occupancy before the
same year's civic/housing/public-space stages. Existing bridge geometry is never
replaced during repair or abandonment. This is a trial ledger validator, not a
claim that the future complete v5 import/export validator is finished.

## Reproducible evidence

- `npm test` covers the ten geometry catalog seeds, cached/reference geometry
  equality, original land/water behavior, and generated land stages.
- The natural seed-6, field-only fixture builds its bridge in 756, damages it in
  1096, repairs it in 1104, and abandons it in 1289. Tests check every boundary's
  walking state, invariant anchors, sources, and unchanged direct model,
  decisions, and hazard years.
- A JSON reload and 1,000 + 1,000 advancement must match a single 2,000 advance;
  historical observation at year 800 remains unchanged after future events.
- `AUDIT_BRIDGE=1 node scripts/audit-generated-housing.mjs` uses the same fixed
  seeds 1/21/198 and wide/field-only/none modes as earlier stages: nine trials to
  2,000 and all three seed-1 trials to 10,000. HOLDs and non-city outcomes remain.
  It checks bridge/ordinary footprint separation, complete bridge histories,
  direct-model equality, and past-view equality.
- `node scripts/review-generated-bridges.mjs` writes six observed-year diagnostic
  images at 320×180 and 1280×720 plus an HTML index. These show actual occupied
  footprints and bridge conditions; they are explicitly not final D4 sprites.
- CI preserves all earlier audits and adds the bridge stage to the same nine
  shards and native/four-times diagnostic captures to the browser job.

Remaining work includes D4 terrain-aware scene composition, full v5 save and UI
integration, the twelve-world Q5 comparison, production-policy approval, and D5
mechanical and human scenery acceptance. This stage does not complete #31.

## Local verification result

The full suite passed 257/257 tests. The final geometry normalization change was
also checked by rerunning all 18 geometry/history tests. Chromium legacy review
passed all 66 scenes with exact PNG/RGBA equality and the old key preserved.

The bridge audit completed all nine 2,000-year trials and all three 10,000-year
continuations without failures; direct model, choices, hazard years and past
observations matched their baselines. In all reservation modes, seed 1 built in
994 (24-pixel water span), seed 198 built in 555 (30-pixel span), and seed 21
remained without a safe bridge (474 HOLD decisions). Seed 198's bridge was
damaged in 901, repaired in 912, and abandoned in 1113. No replacement seed was
substituted for the braided-river HOLD. These three worlds are a D3 regression
sample, not the twelve-world Q5 comparison or D5 acceptance.
