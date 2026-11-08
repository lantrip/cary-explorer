# Source coverage matrix

Issue #14. Purpose: a town filter must never imply data we do not have. This file says which source supplies which theme in which town, and where there is a `gap`.

Checked 2026-11-07 (read-only: catalog searches, ArcGIS `returnCountOnly`, small queries). Trail sources re-checked 2026-11-08 for #67 (section 9). Rules come from [scope.md](scope.md) (#4). Licence register for Cary data is in [sources.md](sources.md).

## Legend

- The source name links to the REST layer or dataset page (links are listed at the bottom of the file).
- `gap` means nothing was found. What was searched is written in the notes below the matrix and in the research notes.
- Status words in the parks and trails table (section 2, "Parks and trails status"): **data** = an open source is imported and shown, **partial** = imported but known to miss part of the town, **gap** = no open source exists, **pending licence** = a source exists but its licence is unclear or restricted, so it is not imported.
- Licence tag: **open** = an explicit open licence (Cary CC0, Wake County CC BY 4.0, USGS public domain). **restricted** = terms block reuse. **unclear** = no licence text, or only a "no warranty / informational" disclaimer. Unclear data must not ship until the publisher answers (section 8).
- "Region-wide" sources (Wake County layers, NC HPO, eBird, iNaturalist, USGS) apply to every row. They are split by a county or `JURISDICTION` field, or by point-in-polygon against the town limits (column "Splits by town via" in section 3).
- "not inspected (host unreachable)" means we know the layer exists but could not reach it.

## 2. The matrix

Short names used in cells: **Wake parks** = Parks in Wake County (292 points, `JURISDICTION` = town). Its amenity flags (`ARTSCENTER`, `COMMUNITYCENTER`) are the community source for every Wake row. **Wake water** = Wake water bodies + Wake blue-line streams. **Birds, region-wide** = eBird hotspots + iNaturalist (see notes).

| Row | Parks & trails | History | Birds & wildlife | Water | Art & community |
|---|---|---|---|---|---|
| Cary | [Cary park points][cary-pts] (open) · [Cary greenways][cary-gw] (open) · [Cary park polygons][cary-poly] (unclear) · [Wake entrances][wake-ent] (open) | [NC HPO][hpo] (unclear). Cary has no own history layer | [eBird][ebird] (restricted, local only, #5) · [iNaturalist][inat] (open per record) | [Cary hydro][cary-hydro] (unclear) · [Cary stormwater][cary-storm] (open) · [Wake blue-line streams][wake-blue] (open) | [Cary public art][cary-art] (unclear) · [Cary facilities][cary-fac] (unclear) · [Wake fire stations][wake-fire] / [Cary fire][cary-fire] (unclear, counts disagree) |
| Apex | [Apex parks][apex-parks] (unclear) · [Apex greenways][apex-bp] (unclear) · [Wake parks][wake-parks] (open) · [Wake greenways][wake-gw] (open, imported) | [Apex National Register structures][apex-nr] (unclear) · [NC HPO][hpo] (unclear) | Birds, region-wide | [Wake water bodies][wake-water] (open) · [Wake blue-line streams][wake-blue] (open) | [Apex public art][apex-art] (unclear) · [Wake parks][wake-parks] flags (open) |
| Morrisville | [Morrisville greenways][mv-gw] (unclear) · [Wake parks][wake-parks] (open) · [Wake greenways][wake-gw] (open, imported) | [NC HPO][hpo] (unclear). Town layer `gap` | Birds, region-wide | Wake water | [Wake parks][wake-parks] flags (open). Public art `gap` |
| Raleigh | [Raleigh parks][ral-parks] (unclear) · [Raleigh greenway trails][ral-gw] (unclear) · [Wake parks][wake-parks] (open) · [Wake greenways][wake-gw] (open, imported) | [Raleigh cemetery markers][ral-cem] (unclear) · [NC HPO][hpo] (unclear) · historic overlay districts: not inspected (host unreachable) [^hod] | [Raleigh fauna points][ral-fauna] (unclear) · birds, region-wide | [Raleigh hydrology][ral-hydro] (unclear) · Wake water (open) | [Raleigh public art][ral-art] (unclear) · [Raleigh park centers][ral-ctr] (unclear) |
| Garner | [Garner parks][garner-parks] (unclear) · [Garner trails][garner-gw] (unclear) · [Wake parks][wake-parks] (open) · [Wake greenways][wake-gw] (open, imported) | [NC HPO][hpo] (unclear). Town layer `gap` | Birds, region-wide | Wake water | [Wake parks][wake-parks] flags (open). Public art `gap` |
| Holly Springs | [Holly Springs greenways][hs-gw] (unclear) · [Wake parks][wake-parks] (open) · [Wake greenways][wake-gw] (open, imported) | [Black History Trail][hs-bht] (unclear, 2021) · [NC HPO][hpo] (unclear) | Birds, region-wide | Wake water | [Wake parks][wake-parks] flags (open). Public art `gap` |
| Fuquay-Varina | [Wake parks][wake-parks] (open) · [Wake greenways][wake-gw] (open, imported). Town parks and trails: not inspected (host unreachable, 403) [^fv] | [NC HPO][hpo] (unclear). Town layer `gap` | Birds, region-wide | Wake water (open). Town ponds and streams: not inspected (host unreachable, 403) | [Wake parks][wake-parks] flags (open). Public art `gap` |
| Knightdale | [Wake parks][wake-parks] (open) · [Wake greenways][wake-gw] (open, imported; 5 segments, one trail). Other trails `gap` | [NC HPO][hpo] (unclear). Town layer `gap` | Birds, region-wide | Wake water | [Wake parks][wake-parks] flags (open). Public art: StoryMap only, no data layer (`gap`) |
| Wendell | [Wake parks][wake-parks] (open). Trails `gap` (no Wendell-owned segment in [Wake greenways][wake-gw]; study map only) | [NC HPO][hpo] (unclear). Town layer `gap` | Birds, region-wide | Wake water | [Wake parks][wake-parks] flags (open). Mural trail app only, no data layer (`gap`) |
| Zebulon | [Wake parks][wake-parks] (open). Trails `gap` (no Zebulon-owned segment in [Wake greenways][wake-gw]) | [NC HPO][hpo] (unclear). Town layer `gap` | Birds, region-wide | Wake water | [Wake parks][wake-parks] flags (open). Public art `gap` |
| Wake Forest | [Wake Forest greenways, 2021][wf-gw] (unclear, stale) · [Wake parks][wake-parks] (open) · [Wake greenways][wake-gw] (open, imported). 2026 town greenways: not inspected (host unreachable, 403) | [Historic Wake Forest sites][wf-hist] (unclear) · [NC HPO][hpo] (unclear) | Birds, region-wide | Wake water | [Wake parks][wake-parks] flags (open). Public art is a web app only, no data layer (`gap`) |
| Rolesville | [Rolesville trails][rv-trails] (unclear) · [Rolesville park parcels][rv-parcels] (unclear) · [Wake parks][wake-parks] (open) · [Wake greenways][wake-gw] (open, imported) | [NC HPO][hpo] (unclear). Town layer `gap` | Birds, region-wide | Wake water | [Wake parks][wake-parks] flags (open). Public art `gap` |
| Unincorporated Wake | [Wake parks][wake-parks] (open; 14 with `JURISDICTION` Wake) · [Wake county parks][wake-county] (open) · [Wake entrances][wake-ent] (open) · [Wake greenways][wake-gw] (open, imported: Neuse River Trail, Falls Lake Trail and others). Wake open space: not inspected (host unreachable) [^wakegw] | [NC HPO][hpo] (unclear). County layer `gap` | Birds, region-wide | Wake water (open) | [Wake parks][wake-parks] flags (open) · [Wake libraries][wake-lib] (unclear, not verified). Public art `gap` |
| Cary's Chatham part | [Cary greenways][cary-gw] (open; 65 segments mostly here) · [Cary park points][cary-pts] (open; 1 park) · [Cary park polygons][cary-poly] (unclear). Chatham parks layers excluded (section 4) | [NC HPO][hpo] (unclear, Chatham county filter) | Birds, region-wide (Chatham hotspots) | [Chatham hydro lines][chat-hydro] (unclear) · [Cary hydro][cary-hydro] Chatham creeks (unclear) · [USGS NHD][nhd] (open) | `gap` |
| Cary's Durham part | [Cary greenways][cary-gw] (open; only 4 edge segments touch it). No park feature inside. [Durham Bike & Hike][dur-hb] (unclear): 0 sites inside | [NC HPO][hpo] (unclear, Durham county filter) | Birds, region-wide (Durham hotspots) | [USGS NHD][nhd] (open). Durham hydrology: not inspected (host unreachable) | `gap` |

[^hod]: Raleigh's General and Streetside Historic Overlay District layers are on maps.raleighnc.gov, which timed out.
[^fv]: Fuquay-Varina publishes Park and School Grounds, Existing Bicycle and Pedestrian Features, Ponds and Lakes, Blue Line Streams and Wetlands on [gis1.fuquay-varina.org][fv-gis]. All returned HTTP 403 from our network.
[^wakegw]: Wake Greenways and Open Space are on maps.wake.gov, which still does not connect. Greenways is imported anyway through the ArcGIS Hub export of the public item (section 9); Open Space is not. Wake Park Facilities lines (423, CC BY 4.0) were checked on 2026-11-08: 234 are trail lines, 175 of them named, inside county parks. Not imported (section 9).

Notes on "region-wide" cells:

- **History (NC HPO)**: one layer, split by the text field `County` (Wake 8,976 surveyed points, Chatham 888, Durham 4,020), then point-in-polygon for town. It is the only History source in 11 of the 15 rows. Licence is unclear (NC.gov disclaimer, no open licence). Status codes tell listed (NR, SL) from merely surveyed.
- **Birds**: eBird hotspots (Wake 196, Chatham 63, Durham 94; 28 inside Cary) are local snapshot only and must not be republished until #5 is settled. iNaturalist (Wake 380,754 research-grade) is open only per observation licence; obscured points (about 39,000 in Wake) must not be shown as points. So every row has a bird source on paper, but nothing is publishable yet except individually licensed iNaturalist records.
- **Water**: Wake water covers Wake rows only. It has no town field, so use point-in-polygon. For Cary's Chatham and Durham parts, USGS NHD (nationwide) is the only open option found.
- **Art & community**: no statewide or Wake-wide public-art layer exists. Searches for "public art", "mural", "sculpture" found only Cary, Raleigh and Apex layers. The Wake parks flags give community and arts centres for every Wake row, not public art.

### Cell counts

75 cells (15 rows by 5 themes). "Source" means at least one source is listed. Cells that also name a layer we could not reach are counted as "source" and shown in the last column.

| Theme | Source | `gap` | Not inspected | Cells with a part not inspected |
|---|---|---|---|---|
| Parks & trails | 15 | 0 | 0 | 3 (Fuquay-Varina, Wake Forest, unincorporated Wake) |
| History | 15 | 0 | 0 | 1 (Raleigh overlay districts) |
| Birds & wildlife | 15 | 0 | 0 | 0 |
| Water | 15 | 0 | 0 | 2 (Fuquay-Varina, Cary's Durham part) |
| Art & community | 13 | 2 | 0 | 0 |

These counts overstate usable coverage. Trails alone are a `gap` in Wendell and Zebulon, and thin in Knightdale (one trail), Garner, Rolesville, Morrisville and Fuquay-Varina (updated after #67; see "Parks and trails status by town"). Public art alone has a source in only 3 rows (Cary, Raleigh, Apex). Birds have a source in every row, but only a restricted one plus a per-record one. A town chip should not read "complete" for a theme without a usable source (section 6).

### Parks and trails status by town

Updated 2026-11-08 after #67. "Trail places" counts named systems of at least 0.5 mi that became catalog places (source: [Wake greenways][wake-gw], CC BY 4.0). Parks come from [Wake parks][wake-parks] (CC BY 4.0) in every Wake town, so the Parks column is `data` everywhere; the notes say what a town layer could still add.

| Town | Parks | Trails | Trail places | Notes and what is pending |
|---|---|---|---|---|
| Cary | data (Cary CC0) | data (Cary CC0) | n/a (Cary's own 46 greenway places) | Town limits used for filtering; coverage shown as counts per theme |
| Raleigh | data (Wake parks, 125 points) | data | 26 | Wake lists 271 Raleigh-owned segments. Raleigh's own layer (1,266 lines, parks as polygons) is pending licence |
| Apex | data | data | 9 | Wake lists 195 Apex-owned segments. Apex layers (parks polygons, 847 bike/ped lines) are pending licence |
| Wake Forest | data | data | 10 | 2021 town layer is stale and unlicensed; 2026 layer host returns 403 |
| Holly Springs | data | data | 9 | Town layer pending licence |
| Fuquay-Varina | data | partial | 4 | Town host returns 403 (pending licence and access) |
| Morrisville | data | partial | 4 | Town CTP layer is planned routes and pending licence |
| Garner | data | partial | 1 | Wake lists 20 Garner-owned segments, mostly unnamed or short. Garner layer (90 lines) is pending licence |
| Rolesville | data | partial | 2 | Wake lists 9 Rolesville-owned segments. Town layer (133 lines) is pending licence |
| Knightdale | data | partial | 1 | One trail (Mingo Creek Greenway). Everything else is a gap |
| Wendell | data | gap | 0 | No Wendell-owned segment in any open source |
| Zebulon | data | gap | 0 | No Zebulon-owned segment in any open source |
| Unincorporated Wake | data | data | 7 | Includes Neuse River Trail, Falls Lake Trail, Reedy Creek Trail |
| Cary's Chatham part | data (Cary CC0) | data (Cary CC0) | 0 | Chatham County geometry stays out: pending licence (resale restriction) |
| Cary's Durham part | data (Cary CC0, edge only) | data (4 edge segments) | 0 | Durham Bike & Hike pending licence |

Whole-county note: 85 Wake segments (about 43 mi) have no name in either `TRAIL_NAME` or `CORRIDOR_NAME` and are not shown. Segments shorter than 0.5 mi per name, connectors, street-side paths and private paths are left out by the same rules as Cary's.

## 3. Sources

Duplicate and stale layers that lost to a better one are listed in section 4.

| id | Source | Publisher | URL | Geometry | Count | Updated | Licence | Splits by town via |
|---|---|---|---|---|---|---|---|---|
| wake-parks | [Parks in Wake County][wake-parks] | Wake County GIS | [REST][wake-parks] | Point | 292 | layer 2026-09-01 | open (CC BY 4.0 on item) | `JURISDICTION` field |
| wake-ent | [Park entrances][wake-ent] | Wake County GIS | [REST][wake-ent] | Point | 900 | 2026-09-01 | open (CC BY 4.0) | `JURISDICTION` field |
| wake-gw | [Greenways in Wake County, NC][wake-gw] | Wake County GIS / PROS | [REST][wake-gw] (host unreachable; imported from the [Hub dataset][wake-gw-hub]) | Line | 1,299 (all `EXISTING`; Cary 532, Raleigh 271, Apex 195, Holly Springs 72, Wake Forest 46, Fuquay-Varina 40, Morrisville 28, Garner 20) | item modified 2026-02-18 | open (CC BY 4.0: Hub `license` and item `licenseInfo`) | `OWNER` field, then point-in-polygon |
| wake-county | [County-owned parks][wake-county] | Wake County GIS | [REST][wake-county] | Point | 13 | 2026-09-01 | open (CC BY 4.0) | county-owned only |
| wake-water | [Water bodies][wake-water] | Wake County GIS | [REST][wake-water] | Polygon | 15,103 | 2020-05-07 | open (CC BY 4.0) | point-in-polygon |
| wake-blue | [USGS blue-line streams][wake-blue] | Wake County GIS | [REST][wake-blue] | Line | 14,864 | 2026-10-28 | open (CC BY 4.0) | point-in-polygon |
| wake-lib | [Libraries][wake-lib] | Wake County GIS | [REST][wake-lib] | Point | 23 | 2025 | unclear (item not verified) | point-in-polygon |
| wake-fire | [Fire stations][wake-fire] | Wake County GIS | [REST][wake-fire] | Point | 89 (Cary 9) | recent | unclear (item not verified) | `CITY` field |
| hpo | [NC HPO surveyed resources, layer 14][hpo] | NC Dept of Natural and Cultural Resources, HPO | [REST][hpo] | Point | Wake 8,976 / Chatham 888 / Durham 4,020 | monthly (2026-11-03 zip) | unclear (NC.gov disclaimer, no open licence) | `County` field, then point-in-polygon |
| ebird | [eBird hotspots][ebird] | Cornell Lab of Ornithology | [API][ebird] | Point | Wake 196 / Chatham 63 / Durham 94 | snapshot 2026-11-07 | restricted (non-commercial API terms, key required; see [ebird.md](ebird.md)) | point-in-polygon |
| inat | [iNaturalist observations][inat] | iNaturalist | [API][inat] | Point | Wake 380,754 research-grade (341,608 with open geoprivacy) | live | open per record only (`license` field; obscured points excluded) | point-in-polygon |
| nhd | [USGS NHD flowlines][nhd] | US Geological Survey | [REST][nhd] | Line | Cary bbox about 1,881 | not stated | open (USGS, public domain by default; terms page not read) | polygon intersect |
| cary-pts | [Cary park points][cary-pts] | Town of Cary | [REST][cary-pts] | Point | 36 | 2026-10-31 | open (CC0) | whole layer is Cary |
| cary-poly | [Cary park polygons][cary-poly] | Town of Cary | [REST][cary-poly] | Polygon | 34 | not stated | unclear (not in catalog) | whole layer is Cary |
| cary-gw | [Cary greenways, existing and proposed][cary-gw] | Town of Cary | [REST][cary-gw] | Line | 1,098 (648 existing, 450 proposed) | 2026-11-01 weekly | open (CC0) | whole layer; Chatham/Durham by point-in-polygon |
| cary-art | [Cary public art][cary-art] | Town of Cary | [REST][cary-art] | Point | 48 | 2022-03-09 | unclear (no licence, not in catalog) | whole layer is Cary |
| cary-hydro | [Cary NaturalResources/Hydro][cary-hydro] | Town of Cary | [REST][cary-hydro] | Line / polygon | Wake creeks 96,107; Chatham creeks 6,094 | not stated | unclear (no licence stated) | separate Wake and Chatham layers |
| cary-storm | [Cary stormwater network (channel)][cary-storm] | Town of Cary | [dataset][cary-storm] | not inspected | Channel 24,229 | 2026-11-07 | open (CC0) | whole layer is Cary. Infrastructure, not streams |
| cary-fac | [Cary facilities][cary-fac] | Town of Cary | [REST][cary-fac] | Polygon / point | 98 sites, 89 points | not stated | unclear | whole layer is Cary |
| cary-fire | [Cary fire service operations][cary-fire] | Town of Cary | [REST][cary-fire] | Point | 25 | `LASTUPDATE` field | unclear (none stated) | whole layer is Cary |
| apex-parks | [Parks in Apex, NC][apex-parks] | Town of Apex | [REST][apex-parks] | Polygon | 19 | 2024-09-12 | unclear (GIS disclaimer) | whole layer is Apex |
| apex-bp | [Apex greenways and pedestrian paths][apex-bp] | Town of Apex | [REST][apex-bp] | Line | 847 | 2026-10-07 | unclear (GIS disclaimer) | whole layer is Apex |
| apex-nr | [Apex National Register structures][apex-nr] | Town of Apex | [REST][apex-nr] | Polygon | 176 | 2026-08-18 | unclear (GIS disclaimer) | whole layer is Apex |
| apex-art | [Apex public art locations][apex-art] | Town of Apex | [REST][apex-art] | Point | 31 | 2024-12-06 | unclear (GIS disclaimer) | whole layer is Apex |
| mv-gw | [Morrisville greenways (CTP 2022)][mv-gw] | Town of Morrisville | [REST][mv-gw] | Line | 75 (plus 60 sidepaths, 9 park polygons) | 2024-03-06 | unclear (no licence text) | whole layer is Morrisville. Planned routes, not all built |
| ral-parks | [Raleigh parks][ral-parks] | City of Raleigh PRCR | [REST][ral-parks] | Polygon | 205 | 2026-09-15 | unclear (Open Raleigh Data Policy, no CC licence) | whole layer is Raleigh |
| ral-gw | [Raleigh greenway trails][ral-gw] | City of Raleigh PRCR | [REST][ral-gw] | Line | 1,266 | 2026-09-09 | unclear (Open Raleigh Data Policy) | whole layer is Raleigh |
| ral-cem | [Raleigh city cemetery markers][ral-cem] | City of Raleigh PRCR | [REST][ral-cem] | Point | 2,284 | 2023-01-31 | unclear (PRCR disclaimer) | whole layer is Raleigh. Grave markers, not sites |
| ral-fauna | [Raleigh natural resource fauna][ral-fauna] | City of Raleigh PRCR | [REST][ral-fauna] | Point | 670 | 2026-02-02 | unclear (no licence text) | whole layer is Raleigh. Check species sensitivity |
| ral-hydro | [Raleigh hydrology][ral-hydro] | City of Raleigh | [REST][ral-hydro] | Line | 73,252 | 2026-10-21 | unclear (Open Raleigh Data Policy) | whole layer is Raleigh |
| ral-art | [Raleigh public art][ral-art] | City of Raleigh PRCR | [REST][ral-art] | Point | 245 | 2026-11-02 | unclear (Open Raleigh Data Policy) | whole layer is Raleigh |
| ral-ctr | [Raleigh park centers][ral-ctr] | City of Raleigh PRCR | [REST][ral-ctr] | Point | 60 | 2026-07-23 | unclear (disclaimer only) | whole layer is Raleigh |
| garner-parks | [Garner parks and facilities][garner-parks] | Town of Garner | [REST][garner-parks] | Point | 17 | 2026-03-10 | unclear (no licence text) | whole layer is Garner |
| garner-gw | [Garner existing trails and greenways][garner-gw] | Town of Garner | [REST][garner-gw] | Line | 90 | 2026-09-11 | unclear (no licence text) | whole layer is Garner |
| hs-gw | [Holly Springs public greenways and trails][hs-gw] | Town of Holly Springs | [REST][hs-gw] | Line | 70 | 2026-11-04 | unclear ("informational purposes only") | whole layer is Holly Springs |
| hs-bht | [Holly Springs Black History Trail][hs-bht] | Town of Holly Springs | [REST][hs-bht] | Point | 11 | 2021-06-03 | unclear (blank) | whole layer is Holly Springs |
| fv-gis | [Fuquay-Varina public services][fv-gis] | Town of Fuquay-Varina | [REST root][fv-gis] | Polygon / line | not reachable (403) | items 2026-10-19 | unclear ("For public use.") | whole layers are Fuquay-Varina |
| wf-gw | [Wake Forest greenways (2021)][wf-gw] | Town of Wake Forest | [REST][wf-gw] | Line | 25 | 2021-03-10 | unclear (blank) | whole layer is Wake Forest |
| wf-hist | [Historic Wake Forest sites][wf-hist] | Town of Wake Forest | [REST][wf-hist] | Point | 45 | 2025-12-15 | unclear ("no warranty") | whole layer is Wake Forest |
| rv-trails | [Rolesville inventory, trails][rv-trails] | Town of Rolesville | [REST][rv-trails] | Line | 133 | 2026-07-14 | unclear (blank) | whole layer is Rolesville |
| rv-parcels | [Rolesville park parcels][rv-parcels] | Town of Rolesville | [REST][rv-parcels] | Polygon | 16 | 2026-07-10 | unclear (blank) | whole layer is Rolesville |
| chat-hydro | [Chatham hydro lines][chat-hydro] | Chatham County GIS | [REST][chat-hydro] | Line | 9,713 | not stated | unclear ("Chatham County GIS" copyright, no licence) | point-in-polygon |
| chat-gw | [Chatham greenways][chat-gw] | Chatham County GIS | [REST][chat-gw] | Line | 109 (2 in Cary, both American Tobacco Trail) | May 2015 | unclear. Not used (stale) | point-in-polygon |
| chat-parks | [Chatham parks][chat-parks] | Chatham County GIS | [REST][chat-parks] | Point | 75 (1 in Cary) | 2026-10-31 | unclear. Not used until licensed | point-in-polygon |
| chat-bound | [Chatham park boundaries][chat-bound] | Chatham County GIS | [REST][chat-bound] | Polygon | 166 (14 centroids in Cary) | 2026-10-31 | restricted ("Any resale of this data is strictly prohibited"). Excluded | point-in-polygon |
| dur-hb | [Durham Bike & Hike (HikeBike2026)][dur-hb] | City of Durham GIS | [REST][dur-hb] | Point / line | 20 featured POIs, 45 trailheads, 268 trails, others | 2026-09-01 | unclear (no licence string). Not used until licensed | point-in-polygon |

Other candidates seen but not placed in the matrix (all region-wide, no town field): USGS WBD HUC12 (layer 6, open; now used for watershed places, see decisions 26), USGS 3DHP (open, lowest priority), NC DWR major basins (unclear), NC Highway Historical Markers (1,658 statewide, unclear, geometry split only), Wake hydrolines (113,281, last edit 2016), Wake primary, critical and water-supply watersheds, Wake National Register districts (183, 2018, unclear), Wake police stations (29), Wake park facilities (418 points, 423 lines, 375 polygons).

## 4. Overlaps and precedence

Rules, in order:

1. **Inside Cary limits, Cary wins** (CC0, owner-authoritative). This holds for the Chatham and Durham parts too.
2. **Elsewhere, prefer the Wake County CC BY layer** for licence consistency: one schema, one `JURISDICTION` filter, explicit licence.
3. **A town layer may win** only if its licence is open and it is more detailed. Today no town layer is open. So town layers are held back and only fill themes Wake does not cover (trails, polygons, public art) once the town answers (section 8).
4. **Chatham and Durham geometry is excluded** until licensed, and never used where Cary already publishes the same feature.
5. Never use the NCSU student copies (`WebMap_mewarre6_PP3_Final_WFL1`, 2024). They duplicate the county layer for Holly Springs, Knightdale, Rolesville, Wake Forest, Wendell and Zebulon.

Known overlaps:

| Feature | Records | Winner |
|---|---|---|
| Parks in Raleigh, Apex, Garner, Morrisville | Town layer and Wake parks (e.g. Raleigh 205 polygons vs 125 Wake points; Apex 19/31 polygons vs 18 points) | Wake parks for now. Town polygon later, once licensed |
| Apex parks | "Parks in Apex, NC" (19) and "Apex Parks" (31, includes school sites) | Neither is current (2024). Confirm with the Town |
| Holly Springs trails | 2021 layer (29 lines) vs 2026 layer (70 lines) | 2026 layer |
| Rolesville trails and parks | 2023 layers vs 2026 inventory and park parcels | 2026 layers |
| Wake Forest greenways | 2021 layer (25, reachable) vs 2026 layer (403) | 2026 once reachable; 2021 is the only option until then |
| Holly Springs water | Town hub re-lists county water bodies | Wake County service |
| American Tobacco Trail | Cary segments, Chatham greenways (2015), Durham trails, Wake greenways | Cary inside Cary. Wake greenways elsewhere. #67 dedupes by name plus 1 km (the Wake record is skipped, 841 m from the Cary place); a geometry-based dedupe is still untested |
| Greenways in Cary | Cary greenways (CC0) and the 532 Cary-owned segments in Wake greenways | Cary. Cary-owned Wake segments are left out by `OWNER`. Same-name Wake trails within 1 km of a Cary place are skipped |
| Cary parks that also appear in Chatham's boundary layer (Fred G. Bond Metro Park and 13 others) | Cary (CC0), Wake parks, Chatham boundaries (restricted) | Cary. Chatham layer excluded; it also holds areas outside Chatham |
| Trailheads in Cary | Durham trailheads (9 in Cary, all Wake, no licence) vs Cary `TRAILHEAD` flag | Cary |

**New Hope Church Road Trailhead Park.** Cary lists it as an "Existing Park" (CC0). Chatham GIS lists a Chatham-owned trailhead at 2575 New Hope Church Rd, Cary, in the Chatham part. Ownership conflicts. Until Cary and Chatham GIS answer, use the Cary record for name and attributes, do not use Chatham geometry, and note the conflict in the entry.

**Fire-station counts.** Wake's layer has 9 stations in Cary. Cary's own layer reports 25 features. We do not know which is current or what the extra 16 are (other agencies, non-station sites, or duplicates). Check both `AGENCY` and `LASTUPDATE` fields before using either. Neither is a core theme layer.

## 5. Cary's Chatham and Durham parts

Cary's own layers cover the whole town limits, so they cover both parts. Numbers from point-in-polygon with Census county polygons:

| Cary dataset | In the Chatham part | In the Durham part |
|---|---|---|
| Park points (36) | 1: New Hope Church Road Trailhead Park | 0 |
| Park polygons (34) | 1: same park | 0 |
| Greenways (1,098) | 65 majority-Chatham segments (20 existing, 45 proposed): Panther Creek, Nancy Branch, Morris Branch, American Tobacco Trail Connector, Lewter Shop Rd and Pittard Sears Rd side-street trails | 4 segments with a vertex in Durham (Wake Rd, GLC Rd West, American Tobacco Trail, NC 55 West). Edge crossings, not Durham sites |
| Natural surface trails (30) | 0 | 0 |
| Public art, hydro, stormwater, facilities | not clipped, so unknown | not clipped, so unknown |

The Durham part is 0.08 sq km in three pieces. The Chatham part is 5.6 sq km. Cary data are enough for parks and trails in both parts. For history, birds and water the parts rely on region-wide sources (HPO, eBird/iNaturalist, USGS NHD, Chatham hydro). Art and community is a `gap` in both.

## 6. Check against #4 (scope.md)

Town filters default to the full town limits, all county parts. Several towns have parts outside Wake, and our sources are mostly Wake-only.

Labels are not typed per town. `src/features/towns/coverage.ts` derives them from catalog counts: `townNote` builds "Parks: N · Trails: N in this town's data", adds a count for each other theme with places, and adds the other-county sentence for the four towns below. A theme with no places in the town is a gap, shown as "[Theme] places for [Town] aren't in the app yet." Nothing is labelled "complete".

| Town | Out-of-Wake part | Usable source for that part (open or clearable) | Other-county sentence in the app |
|---|---|---|---|
| Cary | Chatham, Durham | Cary layers (CC0) cover both for parks and trails. Other themes region-wide only | None (counts only). Art and community still need per-theme sources |
| Apex | Chatham | Wake layers do not reach it. Town of Apex layers cover the whole town but licences are unclear and not checked by location. Chatham layers: unlicensed or restricted. HPO, eBird, iNaturalist, USGS NHD cover it region-wide | "Part of Apex is in Chatham County; places there aren't counted here and show only if they're near Wake." |
| Morrisville | Durham | No open source. Town of Morrisville layers (unclear). Durham layers unlicensed | "Part of Morrisville is in Durham County; places there aren't counted here and show only if they're near Wake." |
| Raleigh | Durham | No open source. Raleigh layers (unclear) are city-wide, Durham Bike & Hike is unlicensed | "Part of Raleigh is in Durham County; places there aren't counted here and show only if they're near Wake." |
| Wake Forest | Franklin | None found for Franklin County | "Part of Wake Forest is in Franklin County; places there aren't counted here and show only if they're near Wake." |

The other seven towns lie wholly in Wake and show counts only. Unincorporated Wake adds "Wake County outside town limits". The counts do not claim completeness: for example, Wake data has no trails, public art or history for several of them. The towns with a `gap` in a theme are:

- **Trails**: Wendell and Zebulon have none, and Knightdale one trail (the other nine towns have Wake greenways data after #67; see "Parks and trails status by town").
- **Public art**: every row except Cary, Raleigh and Apex.
- **History (town-level)**: only HPO, a state survey, for Morrisville, Garner, Fuquay-Varina, Knightdale, Wendell, Zebulon, Rolesville, unincorporated Wake and the Cary parts.
- **Birds**: all rows depend on eBird (blocked by #5) or iNaturalist records with open licences.

## 7. Not reachable and to re-check

From the research notes, to retry from another network:

- `maps.wake.gov` (Wake Greenways, Open Space, Jurisdictions and others) and `maps.wakegov.com` (Park Locator): no connection (re-tried 2026-11-08, still a TCP timeout). Wake Greenways is imported through the ArcGIS Hub export of its public item instead, which Esri builds from the live service.
- `maps.raleighnc.gov`: timed out (historic overlays, drainage basins, stormwater).
- `gis1.fuquay-varina.org` and `twfgis.wakeforestnc.gov`: HTTP 403.
- `webgis2.durhamnc.gov` and `webgis.durhamnc.gov` (Durham Trans_HikeBikeMap, sidewalks, bike facilities, hydrology): no connection. The ArcGIS Online mirror (`services2.arcgis.com/G5vR3cOjh6g2Ed8E`) was used instead.
- Apex Trails (owner kmac8888): token required; do not use.
- Cary IoT (stream sensors) and Cary Environmental folders: token required. `carync.gov` stream sensors page: 403.
- Cary NaturalResources/Hydro layers 0 and 6: count query returned "invalid parameters".
- Holly Springs Stream Buffers: tiles only, no feature query.
- StoryMaps and web apps with no REST layer: Knightdale Public Art, Wendell Mural Trail, Wake Forest Public Art, Wake Forest Local Historic District, Holly Springs Black History Tour.
- NC HPO zip (27 MB) not downloaded; NC DEQ basin page not reached; USGS 3DHP terms page empty.
- Not probed for time: Garner proposed greenways, Raleigh drainage basins and stormwater, Wake restrictive covenants layer, Chatham Places for history content, DCHC MPO Durham trails copy, Cary stream gages (275,737 rows may be readings), Cary grade crossings.
- Cary count fields were not clipped by location for public art, hydro, stormwater and facilities (section 5).

## 8. Licence actions

Ask these publishers about reuse terms, most valuable first:

1. **NC HPO / NC DCR** (History for all 15 rows; the only history source in 11 of them). Ask for a written reuse grant for the surveyed-resources layer and the monthly zip.
2. **Town of Cary, ParksRecreation service** (core town). Ask them to add a CC0 licence to layers 1 (public art, 48 points) and 4 (park polygons, 34), and to the NaturalResources/Hydro, Facilities and Fire layers. One request, and it is a friendly publisher.
3. **City of Raleigh PRCR** (largest city: parks 205, greenways 1,266, public art 245, centres 60, fauna 670). Open Raleigh Data Policy has no CC licence.
4. **Cornell Lab (eBird)**. Already tracked in #5. iNaturalist is the fallback.
5. **Chatham County GIS** (resale restricted; Cary's Chatham part and Apex's Chatham part).
6. **Town of Apex** (parks, greenways 847, public art 31, National Register structures 176).
7. **Holly Springs, Wake Forest, Rolesville, Garner, Morrisville** (trails and, for Wake Forest and Holly Springs, history). Small towns, one email each.
8. **City of Durham GIS** (Bike & Hike services have no licence string; needed for Morrisville's and Raleigh's Durham parts).
9. **Wake County GIS**: confirm CC BY 4.0 on the fire-station, library and watershed items (item licence not individually verified) (the Wake Greenways item is now confirmed CC BY 4.0, see section 9).
10. **NC DWR / NCDCR gis2 / NC OneMap** (basins, markers, town limits): no copyright text or unconfirmed redistribution terms.

## 9. Regional trail sources checked for #67

Checked 2026-11-08. Rule: only an explicit open licence in the source's own metadata counts. A "not liable for errors" disclaimer is not a licence.

| Candidate | URL | Licence evidence (field: value) | Features | Name / status / surface fields | Overlap with Cary greenways | Verdict |
|---|---|---|---|---|---|---|
| **Greenways in Wake County, NC** (Wake County GIS / PROS) | [Hub dataset][wake-gw-hub], item `3f75595edc244c35812675b226021258`, service [REST][wake-gw] | Hub `license`: `CC-BY-4.0`. Item `licenseInfo`: "License: https://creativecommons.org/licenses/by/4.0/". `accessInformation`: "Wake County GIS" | 1,299 (all `TRAIL_STATUS` = `EXISTING`); 532 Cary-owned | `TRAIL_NAME`, `CORRIDOR_NAME`, `OWNER`, `TRAIL_STATUS`, `TRAIL_SURFACE`, `TRAIL_CLASS`, `ACCESSIBILITY_STATUS`, `BIKE`, `HIKE`, `DOG` | Yes: includes Cary's own trails. Cary-owned segments and same-name trails within 1 km of a Cary place are skipped | **Open. Imported** (73 trail places) |
| Wake Park Facilities, lines (layer 1) | [REST][wake-facilities] | Item `licenseInfo`: "License: https://creativecommons.org/licenses/by/4.0/" | 423 lines; 234 are trails, 175 of those named (112 names) | `Man_Made_Object` (e.g. "Trail Paved"), `Notes` (trail name, often blank), no owner or status | Overlaps Wake greenways for county-park trails (Reedy Creek Trail, Sycamore Trail) | Open. **Not imported**: names are sparse and the greenways layer budget has under 17 KB of headroom. Candidate for a later slice |
| Wake County parks, park entrances | listed in section 3 | CC BY 4.0 (section 3) | 292 and 900 points | n/a | n/a | Open, points only. Entrances feed visit info; they are not places |
| NCDOT Great Trails State Plan Network | [item][ncdot-gtsp] | `licenseInfo`: "The North Carolina Department of Transportation shall not be held liable for any errors in this data..." No licence or public-domain statement | not counted | n/a | Planned state network | **Unclear. Not imported** |
| NCDOT Pedestrian and Bicycle Infrastructure Network 2026 | [item][ncdot-pbin] | same "not liable" disclaimer, no licence | 51,227 in the Wake bounding box (sidewalks and paths, not a trail inventory) | n/a | Overlaps all towns | **Unclear. Not imported** |
| NCDOT CTP Bicycle Pedestrian Recommendations | [item][ncdot-ctp] | same disclaimer, no licence | not counted | n/a | Planned routes | **Unclear. Not imported** |
| NC State Trails (NC Division of Parks and Recreation) | [item][ncdpr-trails] | `licenseInfo`: "...While efforts have been made to ensure that these data are accurate and reliable... DPR cannot assume liability..." No licence | not counted | n/a | State park trails only (Falls Lake, Umstead are already in Wake greenways) | **Unclear. Not imported** |
| NC OneMap recreation layers (paddle trails) | [item][nconemap-rec] | `licenseInfo`: link to https://www.nconemap.gov/pages/terms (not an open licence; redistribution unconfirmed) | not counted | n/a | None | **Unclear. Not imported** |
| Town layers (Raleigh, Apex, Morrisville, Garner, Holly Springs, Wake Forest, Rolesville, Fuquay-Varina) | section 3 | Unclear or blank (section 3) | see section 3 | see section 3 | n/a | **Unclear. Stay disabled** |
| Chatham County, Durham | section 3 | Chatham: resale prohibited. Durham: no licence string | see section 3 | n/a | Cary's Chatham and Durham parts | **Excluded.** Licence pending with the owner |

How the import works: `maps.wake.gov` still times out from this network, so the snapshot uses the ArcGIS Hub export of the public item (registry type `arcgis-hub`, `pipeline/lib/fetch-hub.mjs`). The adapter refuses to run unless the Hub dataset's `license` equals the registry's licence, requests a fresh export with a non-default `where` (the plain download serves a cache that was 1,033 features from June 2025 against 1,299 live), and fails unless the export's count equals the dataset's record count.

### Trail gaps and licence requests

| Town | Candidate sources checked | Licence status | What is needed, from whom |
|---|---|---|---|
| Raleigh | Raleigh greenway trails (1,266 lines); Wake greenways | Raleigh: unclear (Open Raleigh Data Policy, no CC licence). Wake: open | Ask City of Raleigh PRCR to state CC BY or CC0 on the greenway and parks layers. Until then only the Wake copy (271 segments) is shown |
| Apex | Apex bike/ped (847 lines); Wake greenways (195 segments) | Apex: unclear (GIS disclaimer). Wake: open | Ask Town of Apex GIS for a licence on its greenway and parks layers |
| Morrisville | Morrisville CTP greenways (planned routes); Wake greenways (28 segments) | Town: unclear (no licence text) | Ask Town of Morrisville GIS for a licence and a built-only trail layer |
| Garner | Garner trails (90 lines); Wake greenways (20 segments) | Town: unclear (no licence text) | Ask Town of Garner GIS for a licence |
| Holly Springs | Holly Springs greenways (70 lines); Wake greenways (72 segments) | Town: unclear ("informational purposes only") | Ask Town of Holly Springs GIS for a licence |
| Fuquay-Varina | Town services (403 from our network); Wake greenways (40 segments) | Town: unclear ("For public use.") | Ask Town of Fuquay-Varina GIS for a licence and for access to `gis1.fuquay-varina.org` |
| Knightdale | Wake greenways (5 segments); no town layer found | n/a | Ask Town of Knightdale Parks and Recreation whether a trail GIS layer exists and under what licence. Ask Wake County PROS whether more Knightdale trails can be added to the greenways layer |
| Wendell | Wake greenways (none); no town layer found | n/a | Same request to Town of Wendell. Ask Wake County PROS to add Wendell trails |
| Zebulon | Wake greenways (none); no town layer found | n/a | Same request to Town of Zebulon. Ask Wake County PROS to add Zebulon trails |
| Wake Forest | Wake Forest greenways 2021 (25 lines, stale); 2026 layer (403); Wake greenways (46 segments) | Town: unclear (blank) | Ask Town of Wake Forest GIS for a licence and for access to `twfgis.wakeforestnc.gov` |
| Rolesville | Rolesville trails (133 lines); Wake greenways (9 segments) | Town: unclear (blank) | Ask Town of Rolesville for a licence |
| Cary's Chatham part | Chatham greenways (2015), parks, park boundaries | Unclear; boundaries restricted (NCGS 132-10 resale) | Ask Chatham County GIS for reuse terms. Cary's CC0 data covers the part meanwhile |
| Cary's Durham part | Durham Bike & Hike | Unclear (no licence string) | Ask City of Durham GIS for a licence. Edge segments only, low priority |
| All towns, State layers | NCDOT Great Trails, PBIN, CTP; NC State Trails (NC DPR) | Unclear (liability disclaimers only) | Ask NCDOT Integrated Mobility Division and NC DPR/DNCR to state an open licence (CC0, CC BY or public domain) on the items |
| Wake County | Wake greenways: no gap in licence, but coverage depends on the towns reporting to PROS | Open | Ask Wake County PROS how often the layer is refreshed and whether unnamed segments (85 here) can be named |

<!-- link references -->
[cary-pts]: https://maps-apis.carync.gov/server/rest/services/ParksRecreation/Parks/FeatureServer/0
[cary-art]: https://maps-apis.carync.gov/server/rest/services/ParksRecreation/Parks/FeatureServer/1
[cary-gw]: https://maps-apis.carync.gov/server/rest/services/ParksRecreation/Parks/FeatureServer/2
[cary-poly]: https://maps-apis.carync.gov/server/rest/services/ParksRecreation/Parks/FeatureServer/4
[cary-hydro]: https://maps-apis.carync.gov/server/rest/services/NaturalResources/Hydro/MapServer
[cary-storm]: https://data.townofcary.org/explore/dataset/stormwater-network-stormwater-channel/
[cary-fac]: https://maps-apis.carync.gov/server/rest/services/Facilities/Facilities/MapServer
[cary-fire]: https://maps-apis.carync.gov/server/rest/services/PublicSafety/Fire_Service_Operations/MapServer/0
[wake-parks]: https://services1.arcgis.com/a7CWfuGP5ZnLYE7I/arcgis/rest/services/Wake_Parks_Public/FeatureServer/0
[wake-ent]: https://services1.arcgis.com/a7CWfuGP5ZnLYE7I/arcgis/rest/services/Wake_Park_Entrances/FeatureServer/0
[wake-gw]: https://maps.wake.gov/arcgis/rest/services/OpenSpace/Greenways/MapServer/0
[wake-gw-hub]: https://data-wake.opendata.arcgis.com/datasets/3f75595edc244c35812675b226021258_0
[wake-facilities]: https://services1.arcgis.com/a7CWfuGP5ZnLYE7I/arcgis/rest/services/ParkFacilities/FeatureServer/1
[ncdot-gtsp]: https://services.arcgis.com/NuWFvHYDMVmmxMeM/arcgis/rest/services/NCDOT_Great_Trails_State_Plan_Network/FeatureServer
[ncdot-pbin]: https://services.arcgis.com/NuWFvHYDMVmmxMeM/arcgis/rest/services/NCDOT_PBIN_2026/FeatureServer
[ncdot-ctp]: https://services.arcgis.com/NuWFvHYDMVmmxMeM/arcgis/rest/services/a3BicyclePedestrianRecommendat/FeatureServer
[ncdpr-trails]: https://services6.arcgis.com/nRIB86xC7kq6wavB/arcgis/rest/services/State_Trails/FeatureServer
[nconemap-rec]: https://services.nconemap.gov/secure/rest/services/NC1Map_Recreation/MapServer
[wake-county]: https://services1.arcgis.com/a7CWfuGP5ZnLYE7I/arcgis/rest/services/CountyParks/FeatureServer/0
[wake-water]: https://services1.arcgis.com/a7CWfuGP5ZnLYE7I/arcgis/rest/services/WaterBodies/FeatureServer/0
[wake-blue]: https://services1.arcgis.com/a7CWfuGP5ZnLYE7I/arcgis/rest/services/USGSBlueLineStreams/FeatureServer/0
[wake-fire]: https://services1.arcgis.com/a7CWfuGP5ZnLYE7I/arcgis/rest/services/FireStations/FeatureServer/0
[wake-lib]: https://services1.arcgis.com/a7CWfuGP5ZnLYE7I/arcgis/rest/services/Libraries/FeatureServer/0
[hpo]: https://gis2.ncdcr.gov/dncrgis/rest/services/NCHPO_Public/NCHPO_Historic_Resources/MapServer/14
[ebird]: https://api.ebird.org/v2/ref/hotspot/US-NC-183?fmt=json
[inat]: https://api.inaturalist.org/v1/observations?place_id=1844&quality_grade=research&per_page=0
[nhd]: https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/6
[apex-parks]: https://services1.arcgis.com/nry3yyvaEfskMEXA/arcgis/rest/services/Parks/FeatureServer/0
[apex-bp]: https://services1.arcgis.com/nry3yyvaEfskMEXA/arcgis/rest/services/Apex_Bicycle_and_Pedestrian_System/FeatureServer/2
[apex-nr]: https://services1.arcgis.com/nry3yyvaEfskMEXA/arcgis/rest/services/Apex_Historic_District/FeatureServer/0
[apex-art]: https://services1.arcgis.com/nry3yyvaEfskMEXA/arcgis/rest/services/Public_Art_Locations/FeatureServer/0
[mv-gw]: https://services.arcgis.com/ud8kSLNkfBb9WX8U/arcgis/rest/services/Morrisville_Greenways_and_Sidepaths/FeatureServer/18
[ral-parks]: https://services.arcgis.com/v400IkDOw1ad7Yad/arcgis/rest/services/Parks/FeatureServer/0
[ral-gw]: https://services.arcgis.com/v400IkDOw1ad7Yad/arcgis/rest/services/Greenway_Trails_All/FeatureServer/0
[ral-cem]: https://services.arcgis.com/v400IkDOw1ad7Yad/arcgis/rest/services/Raleigh_City_Cemetery_Markers/FeatureServer/0
[ral-fauna]: https://services.arcgis.com/v400IkDOw1ad7Yad/arcgis/rest/services/Natural_Resource_Fauna_Editor/FeatureServer/0
[ral-hydro]: https://services.arcgis.com/v400IkDOw1ad7Yad/arcgis/rest/services/Hydrology/FeatureServer/0
[ral-art]: https://services.arcgis.com/v400IkDOw1ad7Yad/arcgis/rest/services/Public_Art_view_publicc/FeatureServer/0
[ral-ctr]: https://services.arcgis.com/v400IkDOw1ad7Yad/arcgis/rest/services/Raleigh_Park_Centers_(public)/FeatureServer/3
[garner-parks]: https://services1.arcgis.com/o3ok0s2woZDh8Saq/arcgis/rest/services/Garner_Parks_and_Facilities/FeatureServer/0
[garner-gw]: https://services1.arcgis.com/o3ok0s2woZDh8Saq/arcgis/rest/services/Garner_Existing_Trails_and_Greenways/FeatureServer/0
[hs-gw]: https://services1.arcgis.com/b6kciy3dYoQmo0t3/arcgis/rest/services/Public_Greenways_and_Trails/FeatureServer/0
[hs-bht]: https://services1.arcgis.com/b6kciy3dYoQmo0t3/arcgis/rest/services/Black_History_Trail/FeatureServer/0
[fv-gis]: https://gis1.fuquay-varina.org/server/rest/services/Public
[wf-gw]: https://services1.arcgis.com/gqTCvanrwF2z2HEu/arcgis/rest/services/Greenways/FeatureServer/3
[wf-hist]: https://services1.arcgis.com/gqTCvanrwF2z2HEu/arcgis/rest/services/Historic_Wake_Forest_Sites/FeatureServer/0
[rv-trails]: https://services5.arcgis.com/hWeFCqXp2ayouIVC/arcgis/rest/services/Rolesville_Inventory_view_layer/FeatureServer/14
[rv-parcels]: https://services5.arcgis.com/hWeFCqXp2ayouIVC/arcgis/rest/services/Park_Parcels/FeatureServer/0
[chat-hydro]: https://gisservices.chathamcountync.gov/opendataagol/rest/services/ReferenceData/Chatham_HydroLines/MapServer/0
[chat-gw]: https://gisservices.chathamcountync.gov/opendataagol/rest/services/ReferenceData/Chatham_Greenways/MapServer/0
[chat-parks]: https://gisservices.chathamcountync.gov/opendataagol/rest/services/ReferenceData/Chatham_Parks/MapServer/0
[chat-bound]: https://gisservices.chathamcountync.gov/opendataagol/rest/services/ReferenceData/Chatham_ParkBoundaries/MapServer/0
[dur-hb]: https://services2.arcgis.com/G5vR3cOjh6g2Ed8E/arcgis/rest/services/HikeBike2026/FeatureServer

## 10. USGS Watershed Boundary Dataset (#22)

| Item | Value |
|------|-------|
| Service | https://hydro.nationalmap.gov/arcgis/rest/services/wbd/MapServer, layers 6 (HUC-12, 108 features in the buffer box), 4 (HUC-8, 7) and 3 (HUC-6, 3) |
| Licence | The service's own metadata says: "Use Constraints: None. All data are open and non-proprietary." It asks for acknowledgment of the U.S. Geological Survey, which the credits give. Registry licence: "Public domain (USGS)" |
| Status | WBD is no longer maintained; USGS 3DHP is the successor for hydrography. We use WBD because it has a ready HUC-12 layer we could snapshot with a count check (service data loaded 2024-08); 3DHP was not evaluated, so check its coverage at the next refresh |
| Snapshot | `pipeline/sources/usgs/wbd-huc12/` (5-decimal geometry), `wbd-huc8/` and `wbd-huc6/` (names only), bbox -79.09,35.44,-78.16,36.15, count checked against the service count |
| Basins | Neuse, Cape Fear and Pamlico (the Tar-Pamlico basin) |
| Not used | The `tohuc` flow field is not snapshotted, so no flow or downstream claim can be made (#28). Creek places, a tap-a-point lookup and the Neuse / Cape Fear story text with Cary citations are still open on #22 |
