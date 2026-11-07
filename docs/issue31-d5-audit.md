# Issue31 D5: progression cost and natural long runs

Q5 (field-only reservation), Q6 (the revised physical limits), and Q8 (documented
indirect history differences) are resolved. PR #61 is merged. This stage checks
the resulting production policy; it does not reopen those decisions.

## Exactness of the optimization

Generated housing previously replayed all events whenever one lifecycle event
was appended. The owned transaction now replays the changed block's real event
history, checks global event order and cross-block overlap, and preserves the
public reducer's block ordering. Replaced prefixes fall back to the full reducer.
The uncached public/legacy reader is unchanged. Old prefix cache entries are
removed so that growing event arrays are not retained for every historical year.

Frozen physics also permits reusing the all-cell physical candidate checks and
water-distance penalties for a purpose and footprint size. Mutable records use
the uncached path. Occupancy, reservations, bridge crossings, graph distances,
candidate scores and final hypothetical access checks are recalculated. Returned
plots do not expose cached geometry. No candidate cutoff or scoring change is
introduced.

A CPU profile identified graph traversals and repeated RLE decoding as remaining
costs. Land queries now share a private raster only for deeply frozen physics;
the public decoder still returns fresh arrays. Graph traversal retains the exact
N/E/S/W order while avoiding a temporary neighbor array for every visited vertex.
Within one search, a private occupancy snapshot shares the unchanged before-graph
across candidates. Each hypothetical after-graph and every previously connected
entrance is still checked. Mutable terrain uses the original uncached path;
the exhaustive comparison also bypasses the transaction cache.
The placement jitter hash also reuses its constant, unfinalized FNV prefix and
the original decimal UTF-8 coordinate bytes. The original frozen hash is
unchanged. Every ground coordinate, Unicode prefixes, numeric edge cases and the
complete 13 original reference states are checked for bit-identical results.
When all physical candidates are impossible or occupied, search now returns HOLD
before constructing any access distance field. The benchmark records actual
candidate builds/reuse, exclusions, hypothetical checks, graph builds, visited
vertices, housing replay and bridge/housing HOLD reuse for every measured run.
Candidate scoring obtains the exact core/neighbor/housing distances in one BFS
from the candidate entrance. The graph is undirected, so these equal the reverse
multi-source fields. It stops after reaching each required group or exhausting
the component; exhaustive mode retains the independent full-field calculation.
Public spaces reuse their existing entrance field for hall/core distances.
The access transaction also shares its checked after-graph with scoring, rather
than rebuilding an identical graph. Only records produced by the strict validator
enter an internal weak identity set. Progression and observation may share these
deeply frozen records; unknown wires still undergo full validation, and public
validation still returns a detached result. Successful deep-freeze checks are
memoized because frozen rows cannot become mutable again.

The full-state reference fixture contains all twelve original field-only Q5
states at year 2000 (source `55cd3c5`) and the original seed 1 storage probe at
year 10000 (its original report recorded `local-unidentified`). The benchmark
also verifies the seed 1 references against unmodified main `4fac200`, including
every state field. Population/RNG-only comparisons would be insufficient here.

## Reproduction

Build an unmodified main checkout and the current checkout with the same Node
version. Run the benchmark by itself, without tests or rendering in parallel:

```sh
npm run build
BASELINE_ROOT=/path/to/unmodified-main node scripts/benchmark-generated-progression.mjs
```

It performs one warmup and five measured runs for 2000 and 10000 years, and
records every time, the median and full-state SHA-256. World initialization,
hashing, drawing and persistence are excluded. Both current main's generated
engine and its retained fixed-terrain legacy engine are reported. The original
design's legacy ratio, with a 1000ms denominator floor, is retained as a separate
mandatory gate; a fast comparison against already-generated main does not erase
it. Absolute budgets remain 5000ms and 25000ms. Unmet gates are reported as false.

`BENCHMARK_SEEDS=1,21,7,198` selects additional seeds.
`BENCHMARK_YEARS=2000` or `10000` selects a single horizon for the wider matrix.
`BENCHMARK_OUT` selects an output directory. `BENCHMARK_BASELINE_REPORT` may
reuse a prior complete baseline measured on this runner; its SHA, Node version,
platform and five measured samples are checked. Only baseline samples are reused,
and the provenance is recorded. Do not use this option for a different runner.

The separate long-run audit includes IO and must not run during measurement:

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/namonaki-browsers node scripts/audit-generated-longrun.mjs
PLAYWRIGHT_BROWSERS_PATH=/tmp/namonaki-browsers node scripts/review-terrain-families.mjs
node scripts/audit-generated-core-longrun.mjs
```

All twelve Q5 worlds advance naturally to 10000. The audit checks original year
2000 hashes, production save/restore at 0/100/1000/10000 and continuation from
those saves, historical observations at 0/1/99/100/101/1000/2000/10000, browser
localStorage reopening, repeated PNGs, and no generator import during reading.
It produces native and nearest-neighbor 4x scenes for 0/100/1000/10000 plus each
actually reached settlement/village/town/city/decline phase. Unreached phases,
unbuilt slots, failures and HOLD periods remain in the report.

The separate family catalog contains all R10/H8/C8/M6, including all three
mountain cameras. Prototype overrides are labeled and have no artificial
construction history. The natural long-run pages include a separate canonical
physics/plot/root overlay, with the same saved mirroring as the rendered scene.
The final core audit checks the preserved fixed-terrain model, automatic choices
and disaster dates at year 10000 for seeds 1/7/21/198. It permits the documented
indirect land-history differences, not changes to the direct model.

CI's `generated-world-acceptance` job publishes the `terrain31-d5-acceptance`
artifact for 14 days. Download and extract it, then open the two `index.html`
files in `terrain31-families` and `terrain31-d5`. The archive includes production
saves and JSON evidence; raw diagnostic review objects remain local. This job
does not claim the isolated performance gate or Human scenery acceptance.

Outputs are under `artifacts/terrain31-performance`, `artifacts/terrain31-d5`
and `artifacts/terrain31-families`;
bulk world saves and images are diagnostic artifacts, not source fixtures.

The checked-in `issue31-d5-performance.json` records the measured source SHA,
baseline SHA, every measured sample, exact state hashes and diagnostic counters.
Its `pass` fields are authoritative; the report does not turn an unmet ratio into
an accepted budget. Further source changes require fresh current measurements.

## Seed 1 measured result, 2026-11-07

Seed 1, Node v24.22.1, automatic choices; measured source `777787e`, main baseline
`4fac200`, same runner. All complete state hashes match the original references.

| Years | Main generated median | Improved median | Legacy median | Absolute gate | Legacy ratio gate, denominator floor 1000ms |
| --- | ---: | ---: | ---: | --- | --- |
| 2000 | 3796ms | 1582ms | 418ms | pass, <=5000ms | pass, 1.582 <= 2 |
| 10000 | 31859ms | 7888ms | 20581ms | pass, <=25000ms | pass, 0.383 <= 2 |

The improved simulation is approximately 58% faster at 2000 and 75% faster at
10000 than main's generated mode. Both seed 1 gates now pass without changing a
threshold. The former relative-gate failure at source `27bafae` was resolved by
the bit-identical prefix optimization. Formal measurements for the other eleven
worlds at 2000 and three additional worlds at 10000 are in progress. Other worlds'
long-run audits are correctness/IO checks, not substitutes for five isolated
performance measurements.

## Acceptance boundary

The scripts themselves do not establish D5 acceptance. Record actual measurement
results and failures before marking gates complete. The complete single-family
R10/H8/C8/M6 catalog, diagnostic overlays, search/graph counters, old-engine
long-run regressions, final browser checks and Human scenery decisions remain
separate requirements in design §10.2–10.4. Human merges PRs and closes #31.
