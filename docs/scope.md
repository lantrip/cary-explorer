# Geographic scope rules

Issue #4. These rules decide which places and trails are in, near or out of scope. All checks use real polygons. Figures below were computed on 2026-11-06 with a throwaway script (shapely + pyproj, kept outside the repo); the counties and distances should be re-run in #13 when the pipeline exists.

## 1. Boundary sources

| Boundary | Source | Publisher | Vintage | Licence | Checked |
|----------|--------|-----------|---------|---------|---------|
| Cary corporate limits (Wake + Chatham + Durham parts, one multipolygon) | https://data.townofcary.org/api/explore/v2.1/catalog/datasets/cary-corporate-limits | Town of Cary | Dataset modified 2026-10-31; feature last edited 2026-10-01; 1 record, 62.4 sq mi | CC0 1.0 | Responded; GeoJSON export downloaded |
| Wake, Chatham, Durham county polygons (and all NC counties) | https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/11 | US Census Bureau (TIGERweb, current) | Current Census vintage | Public domain | Responded; 100 NC counties downloaded |
| Wake County line (line, not polygon) | https://services1.arcgis.com/a7CWfuGP5ZnLYE7I/arcgis/rest/services/CountyLine/FeatureServer/0 | Wake County GIS | Edited 2026-09-03; 1 feature | Wake disclaimer; sibling Wake items say CC BY 4.0, confirm for this item | Responded. Use as a cross-check only; it needs polygonising |
| Wake corporate limits (all towns, daily) | https://maps.wake.gov/arcgis/rest/services/Jurisdictions/Jurisdictions/MapServer/0 | Wake County GIS | Hub says updated each business day | Wake disclaimer; confirm CC BY 4.0 | Host did not respond from this network (same as the sources register). Hub listing only |
| 12 town limits, split by county part | https://services5.arcgis.com/mSDBiLWaIfH92NqI/arcgis/rest/services/North_Carolina_Municipalities/FeatureServer/0 (listed on NC OneMap as "North Carolina Municipalities") | NC OneMap / CGIA | Layer edited 2026-11-05; per-town dates in the table below | NC OneMap terms (https://www.nconemap.gov/pages/terms); confirm redistribution | Responded; all 12 towns returned. CGIA says local data is authoritative |
| Same 12 towns, alternates | Raleigh/Apex/Fuquay-Varina open data (Apex corporate limits 2025-06-17; Fuquay-Varina 2026-10-19) | Towns | as listed | Not checked | Hub listing only; use when the NC layer is stale |

NC layer rows used for the 12 towns (each row is one town in one county, with a separate ETJ row; ETJ is not used for town limits):

| Town | County parts in the layer | Last updated |
|------|---------------------------|--------------|
| Cary | Wake, Chatham, Durham | 2026-02-09 |
| Apex | Wake, Chatham | 2026-01-10 |
| Morrisville | Wake, Durham | Wake 2025-12-16; Durham 2022-01-12 (oldest, watch) |
| Raleigh | Wake, Durham | Wake 2026-02-19; Durham 2026-02-09 |
| Garner | Wake | 2026-04-01 |
| Holly Springs | Wake | 2026-02-09 |
| Fuquay-Varina | Wake | 2026-01-18 |
| Knightdale | Wake | 2026-03-19 |
| Wendell | Wake | 2025-12-17 |
| Zebulon | Wake | 2025-12-16 |
| Wake Forest | Wake, Franklin | Wake 2025-12-17; Franklin 2025-06-12 |
| Rolesville | Wake | 2025-12-17 |

Cross-check: the NC layer's Cary Chatham part is 5.6 sq km and its Durham part 0.08 sq km, both matching Cary's own limits (5.6 and 0.08). Its Cary Wake part is 164.9 sq km against 155.8 sq km of overlap with Cary's file, so the two disagree by about 9 sq km. Use Cary's own file for Cary.

Not substitutes: ZIP codes, postal addresses, ETJs, planning jurisdictions.

Working choice: take county polygons from Census, Cary from Cary open data, and towns from the NC layer (Cary overridden by Cary's file). Snapshots of the Cary limits and the three counties are in `pipeline/sources/boundaries/`.

## 2. Rules

| Rule | Value | Why |
|------|-------|-----|
| Core area | Wake County polygon union the full Cary limits polygon (all three counties). Core is 2,225 sq km: Wake 2,219 plus 5.7 of Cary's Chatham part and 0.1 of its Durham part | Matches the brief |
| Buffer distance | Configurable, default 5 mi = 8,046.72 m | Matches the brief |
| Measured from | The outer edge of the core polygon, straight-line distance, not road distance | Edge of core is what a visitor crosses |
| Computing CRS | EPSG:32119 (NAD83 / North Carolina State Plane, metres) | Metres match the 8,046.72 m rule with no unit conversion; low distortion for the Triangle. EPSG:2264 is the same system in US survey feet, so it would need a feet conversion for no gain. Never degrees. Store results in WGS84 |
| Hard cap | 10 mi = 16,093.44 m; config values above this are clamped | Keeps the catalog bounded. At 10 mi the buffer reaches 2 more counties (below) |
| Inclusion test | Place geometry intersects the core polygon = core. Intersects the buffered polygon only = nearby. Else out. Bounding boxes are only a first-pass retrieval filter, never the decision | Bboxes of the county and buffer are much larger than the shapes |
| Point and polygon places | Use the entrance point where we have one, else the polygon. A place counts as core if any part of it touches the core | Parks that straddle the edge stay together |
| Trails and streams crossing the edge | If a feature touches the buffer, include the whole connected feature up to N = 5 km (about 3 mi) beyond the outer buffer edge, measured along the line. If it continues past that, cut there and mark it as continuing | A county line must not look like the end of a stream, but without a limit the American Tobacco Trail or a river system would pull in tens of miles. 5 km is about an hour's walk, enough to reach the next road or trailhead on most greenways |
| Label for buffer places | "Nearby, outside core area" on the card and on the detail panel. Trail pieces beyond the buffer get the same label | Brief and issue wording |
| Keep separate | Municipal limits, county lines, planning areas / ETJ, and watersheds are different layers with different fields. A place may have a town, a county and a watershed, each stored on its own | Each answers a different question |

### Town filters (12 towns)

- **Default: full incorporated limit of the town, all county parts**, because someone who picks "Apex" expects Apex. This is the same rule as Cary's core.
- **Coverage label** under the town chip and in the info panel:
  - The note is built at runtime from the catalog, never typed per town: "Parks: N · Trails: N in this town's data", plus a count for each other theme that has places. A theme with no places in the town is a gap ("[Theme] places for [Town] aren't in the app yet.").
  - Towns that cross the county line (Apex, Morrisville, Raleigh, Wake Forest) add: "Part of [Town] is in [Chatham / Durham / Franklin] County; places there aren't counted here and show only if they're near Wake." Places in that part carry the county's name, so the town filter does not list them.
- **Unincorporated Wake stays discoverable**: places inside Wake but in no town limit get town = none and appear in "All places" and an "Unincorporated Wake" filter option. Never hide them because they have no town.
- Town of a place is by point-in-polygon with the town limits, not by mailing address. A Raleigh mailing address in unincorporated or Cary land does not make it Raleigh.

## 3. Counties the buffer reaches

Computed from the buffered polygon in EPSG:32119 (not estimated). "Min distance" is the gap between the county and the core; 0 means it touches.

| County | Min distance to core | In 5 mi buffer | Only in 10 mi cap | Data source status |
|--------|---------------------|----------------|-------------------|--------------------|
| Wake | in core | core | | Yes: Wake GIS parks, entrances, greenways (CC BY 4.0) |
| Chatham | 0 (Cary part is core) | yes | | Yes: Chatham GIS parks (licence restricts resale; confirm) |
| Durham | 0 (Cary part is core) | yes | | Found but not inspected: Durham hike/bike host did not connect from this network |
| Johnston | 0 | yes | | None yet |
| Franklin | 0 | yes | | None yet |
| Granville | 0 | yes | | None yet |
| Harnett | 0 | yes | | None yet |
| Nash | 0 | yes | | None yet |
| Lee | 5,425 m (3.4 mi) | yes (19 sq km) | | None yet |
| Orange | 8,074 m (5.0 mi) | no, just misses | yes | None yet; a 5.01 mi gap, so a tiny change in the line would flip it |
| Wilson | 11,067 m (6.9 mi) | no | yes | None yet |

Coverage gaps to carry into #13: Durham (inspect), and the six neighbouring counties without any source. Counties with no source simply have no buffer places; the card label still applies to whatever other sources (OSM, national datasets) supply there.

## 4. Hand-classified examples

County for each point was found by point-in-polygon against the Census county polygons (script in the session scratchpad, not the repo) and Cary-limits membership against the Cary limits polygon.

| Place | Where it is | County (how known) | In Cary limits | Class | Label |
|-------|-------------|--------------------|----------------|-------|-------|
| Fred G. Bond Metro Park | about -78.8314, 35.7824 | Wake (point-in-polygon) | Yes | Core | none; town = Cary |
| New Hope Church Road Trailhead Park (Cary parks data, "Existing Park") | about -78.9268, 35.8174 | Chatham (point-in-polygon; the Chatham GIS register also lists a Cary-addressed trailhead here) | Yes | Core, even though it is in Chatham | none; town = Cary, county = Chatham |
| A point in Cary's Durham slivers | about -78.8213, 35.8880 (largest of three pieces, 0.06 sq km) | Durham (point-in-polygon) | Yes | Core, even though it is in Durham | none; town = Cary, county = Durham |

Finding: no Cary parks polygon or named place falls in the Durham part. Three tiny pieces total 0.08 sq km; the nearest Cary park feature (GLCR Street-Side Trail) is 844 m away in Wake. So we cannot name a real Cary-owned Durham place from the data we hold. The Durham example is a coordinate and is a test of the rule, not a visitor place. Cary's Chatham part is larger (5.7 sq km, five pieces) and holds Panther Creek Greenway, Nancy Branch Greenway, Morris Branch Greenway and P-005 Weldon Ridge Site as well as the trailhead.

## 5. Test list

Use these to check the pipeline and the filters.

| # | Case | Expected |
|---|------|----------|
| 1 | Fred G. Bond Metro Park | Core, county Wake, town Cary |
| 2 | New Hope Church Road Trailhead Park | Core, county Chatham, town Cary |
| 3 | Point -78.8213, 35.8880 | Core, county Durham, town Cary |
| 4 | Clayton downtown (-78.457, 35.651), Johnston County, about 5.1 km from core | Buffer: "Nearby, outside core area" |
| 5 | Jordan Lake area point (-79.03, 35.78), Chatham County, about 7.0 km from core | Buffer: "Nearby, outside core area" |
| 6 | Eno River State Park, Cole Mill area (-79.003, 36.077), Orange County, about 22.5 km | Out of scope; beyond even the 10 mi cap |
| 7 | A trail or greenway that leaves the buffer (for example the American Tobacco Trail heading south) | Included to 5 km past the buffer edge, cut there and marked as continuing |
| 8 | A stream crossing the Wake/Durham line inside the buffer | Whole stream kept; no break at the county line |
| 9 | Buffer set to 12 mi in config | Clamped to 10 mi |
| 10 | A park in unincorporated Wake | In scope, town = none, found under "Unincorporated Wake" |
| 11 | A place in Morrisville's Durham part | Town = Morrisville; coverage note is derived from catalog counts (for example "Parks: N · Trails: N in this town's data") and adds "Part of Morrisville is in Durham County; places there aren't counted here and show only if they're near Wake." |

## 6. Open questions for the owner

- Is the 10 mi cap right, or should the cap be 5 mi (no config room)?
- Is N = 5 km acceptable for trails, or do you want longer (for example 8 km)?
- Orange County misses the 5 mi buffer by about 30 m of the 5 mi mark. Do you want it treated as inside (rounded) or out?
- Licence for NC OneMap and Wake corporate limits redistribution, and Chatham GIS resale wording, need confirming before committing larger snapshots.
- Re-run the county computation in #13 once Wake's own polygons (maps.wake.gov, unreachable from here) are available, to compare with Census polygons.
