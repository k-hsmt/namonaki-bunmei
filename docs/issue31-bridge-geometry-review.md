# Issue #31 D3-C: horizontal bridge geometry review

This independent review does not activate generated terrain in gameplay or change
the v4 save format. Production placement policy remains undecided.

The reader uses the frozen terrain raster and saved `river-reaches-v1` ownership;
it never regenerates missing water from a seed. Candidates scan support origins
at y=108..170 in steps of 2. Each 4×6 bank support must be stable, grade 0,
internally level, and within one elevation unit of its opposite bank. The water
envelope across the six support rows must be 6..56 pixels wide and contain one
continuous stream on every row. Islands, parallel channels, sea, and junctions
within eight pixels are excluded. A horizontal four-pixel deck covers that
envelope plus the two four-pixel bank supports. North and south two-pixel bank
portals are evaluated independently.

Both banks must connect to original screen-edge land roots before construction;
exactly one must connect to the primary root. After adding the deck, both bank
portals must connect to the primary root, with no previously connected entrance
lost. Rank candidates by newly connected land area, core distance, span, an
independent deterministic hash, then y/x. A reference search checks the cached
search without sharing its post-deck reachability cache.

Bridge crossings affect only walking connectivity. Original water physics still
reject ordinary construction on the deck. Ordinary obstructions are applied
after the bridge overlay, so the overlay cannot bypass another occupied plot.
Removing the active crossing closes the route while preserving the footprint.

The ten river-family geometry fixtures produce eight proposals and two valid
HOLDs (twin islands and braided river). These are geometry probes, not claims
that social construction conditions occurred. The complete test run passed
253 tests, including frozen terrain, legacy histories, stream ownership,
cached/reference equality, tamper rejection, and crossing removal.
