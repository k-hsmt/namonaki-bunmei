# Issue #31 D4-A: generated scene composition foundation

The independent reader `observeGeneratedSceneReview` projects a confirmed year
from the complete D3 trial. `GeneratedSceneGround` carries the frozen terrain,
confirmed ordinary/civic plots, and bridges existing at that year. Generated
composition checks all three districts against the saved raster and actual
occupied rectangles, including housing and public spaces. It rejects moved
display anchors, missing bridge geometry, water housing, and future objects.

`drawGeneratedSceneReview` paints that saved terrain, confirmed public surfaces,
housing, civic architecture, ordinary structures, and the variable bridge.
Ground-level facility paint stays inside its actual plot; upper roofs may
overhang. Generated housing roof anchors are clamped inside their saved plots.
The existing silhouettes are reused, while fields use their actual footprint.
All layers share the saved horizontal projection, including west-side worlds.
Damaged and ruined bridges keep their supports and expose the central water.

Legacy `composeScene`/`drawScene` remain the default path. Their import graph must
not load generated terrain modules. A shared internal projection function keeps
the legacy validation and generated saved-ground validation in separate callers.
The Chromium legacy check caught an initial static dependency leak; the final
separation restores all 66 exact PNG/RGBA matches and zero new terrain imports.

Terrain-aware presentation uses the same observed-year walking graph as land
placement. People stand on reachable 2×2 windows near existing active facilities
or occupied homes. Light wear follows routes between those confirmed anchors,
but paints only original land and creates no road history. Travel carts require
an entire free 10×4 stable-land plot. Disease/vacancy suppress activity. Trees
use saved terrain and a separate hash, so their positions stay fixed across dates.
Festival flags and fire marks require an actual hall or damaged building anchor.
Flood tint changes only saved freshwater; drought does not alter physics. Clouds
are independent decorations in the sky. None of these consume civilization RNG.

## Fixed-coordinate audit

| Existing drawing | Generated path in this foundation | Remaining work before activation |
| --- | --- | --- |
| Fixed far mountains, hills, river and coastline | Frozen contours/RLE/decals via `drawTerrainRecord` | Human scenery acceptance |
| Inferred lots and fixed bridge span | Confirmed year-specific objects and saved bridge parts | Full v5 reader integration |
| Old fixed-river housing conflict check | Saved physics and actual occupied plots | Complete import history validator |
| Fixed field rows/footings outside their actual plots | Confirmed footprint-clipped ground paint | Scenery refinement if review requests it |
| Housing/civic/public-space painting | Existing styles and confirmed sources, all three sites | Full v5 save/UI dispatch |
| Fixed shore paving, neighborhood accents and paths | Reachable light wear between confirmed home/facility entrances on original land | Human scenery acceptance |
| Fixed trees/reeds/stones, boats and travel carts | Stable trees and saved decals; carts need free land. Legacy inferred boats/docks were already excluded from local-site views and remain excluded | Human scenery acceptance |
| Fixed people/festival/fire/flood/drought overlays | Reachable people, confirmed anchors, freshwater-only flood tint and soil-only drought marks | Human scenery acceptance |

The generated D4-A path is ready for scenery review. D4-B save/UI activation
and D5 human scenery acceptance remain separate; this independent renderer
does not activate generated mode in the game.

## Verification and comparison

The full local suite passed 262 tests. Related generated/legacy scene tests are
also rerun after the import separation. Chromium verifies repeat rendering,
320×180 resolution, west-side house anchors, open water through broken
spans, and flood paint confined to saved water. Five generated-scene tests also
check stable vegetation, reachable people/wear and free cart plots. Native/four-times images of all 108 scenes are reproducible with
`node scripts/review-generated-scenes.mjs`; CI runs the complete fixed
twelve-world, three-reservation comparison in a separate job without reducing
earlier audit coverage. Detailed policy and indirect-history results are in
[the Q5/Q8 comparison](issue31-q5-q8-generated-comparison.md).

The app entry point, new-game mode and storage writer remain unchanged. Q5/Q8
decisions, v5 save/UI integration and D5 remain.
