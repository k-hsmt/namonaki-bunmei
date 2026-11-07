# Issue #31 D4-B — production v5 and atomic UI connection

Human confirmed Q5 = reserve only the initial field proposal, and Q8 = retain
and disclose the indirect historical differences, on 2026-11-07. The production
candidate freezes `terrain-placement-v1`, `field-only`, the revised Q6 limits,
and `generated-scene-v1`. The app explains that terrain and an unavailable bridge
can delay construction and urban development. The measured seed-29/21 outcomes
remain documented in the Q5/Q8 comparison.

## Production contract

The outer envelope is `namonaki-world-save`, version 5, schema 1. It has no trial
status. Generated payloads use the approved policy and renderer IDs and carry
the complete terrain, ownership, initial plans, land-birth history and engine
state. Legacy payloads explicitly use `legacy-fixed`, preserve their original
version/observation boundary and run `legacy-v4-d2f7cb1`.

The accepted frozen terrain-result wire record and strict validation modules are
reused through a versioned adapter. Their historical review names/record marker
do not choose a game's mode: the validated outer mode and production policy do.
Production loaders reject trial envelopes and unknown policy/renderer IDs.
Inner engine state remains v4; version 5 belongs to the whole world envelope.

Lossless storage uses `namonaki-world-save-gzip`, schema 1, `gzip-base64-v1`, an
explicit mode and exact expanded byte count. Stored and expanded input are
bounded at 16MiB. Native gzip length/format and complete world validation finish
before restoring a session. Plain production JSON and old v2/v3/v4 JSON are also
readable; an unknown or broken v5 stops discovery without an older-key fallback.

## One world mode across the UI

`WorldSession` chooses progression, manual/automatic choices, observation,
rendering and serialization together. New-world generation is loaded lazily only
when creating a new world. An existing saved world boots without any generator.
New games validate all three initial sites before adoption. Generated choices
use the existing civilization RNG and finish exactly the pending year. Legacy
worlds keep original engine/renderer rules and never receive generated terrain.

Startup opens the first present saved value. Without a save it creates a new
generated seed-42 world. A corrupt cold-start save shows recovery controls and
keeps its value; a valid file can recover the app without a generator. No startup
or new-game action automatically writes storage.

Save/load/import stop automatic time/choice timers and prevent conflicting
actions during I/O. Candidate files/worlds are validated and rendered offscreen
at all three sites before replacing the displayed session. Failure preserves
the current world and save values. Only an explicit save writes
`namonaki-story-v5`; v4/v3/v2 keys are retained. Native quota leaves the previous
value and offers complete JSON export. Import is read-only; export contains the
current full world even while viewing a past year.

## Verification

- New production session/codec tests cover approved-policy freezing, exact
  roundtrip/future progression, unchanged legacy continuation, automatic-choice
  RNG parity, authoritative v5 discovery and quota export.
- The full unit suite passed 276 tests; the full browser suite passed 30 tests. Updated save tests retain all prior
  housing/pending/observation coverage while expecting the explicit v5 envelope.
- Actual UI tests cold-load a 2,000-year generated world with all generators
  blocked; compare saved/reloaded past scenes and exported complete state;
  preserve both old and current values on generation/import/quota failure; and
  recover a corrupt boot through a valid file without a generator or write.
- Earlier 66-scene legacy pixel checks, 12-world/three-policy comparison and
  complete 10,000-year compressed storage probes remain in CI.

D5 remains: formal repeated performance measurements, the complete multi-seed
long-run/save/reopen acceptance and Human scenery review. These are not implied
by a successful UI smoke test or by merging an implementation stage.
