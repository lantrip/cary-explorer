# Source register and Cary snapshot findings

Owner: issue #6 (Cary part). Register columns mirror `Source` in `src/types/place.ts` (`id`, `name`, `url`, `license`, `retrievedAt`) plus attribution, vintage, coverage and a verdict.
Per-town coverage: see [source-matrix.md](source-matrix.md).

Snapshots live in `pipeline/sources/cary/<dataset>/` (`data.geojson`, `meta.json`, `metadata.json`); regenerate with `npm run data:snapshot` (`pipeline/scripts/snapshot.mjs`; add `--only <id,...>` to snapshot selected sources, e.g. `npm run data:snapshot -- --only cary-parks-polygons`). Node 22, no dependencies; fails if export count differs from catalog count. `pipeline/scripts/snapshot-cary.mjs` remains as a thin wrapper that snapshots only the Cary (opendatasoft) sources via `snapshot.mjs`.

## Licence/attribution register

| id | source | publisher | URL | licence/reuse terms | attribution text | vintage | last refresh | coverage | verdict |
|---|---|---|---|---|---|---|---|---|---|
| cary-parks-polygons | Parks and Recreation Features | Town of Cary | https://data.townofcary.org/explore/dataset/parks-and-recreation-feature-polygons/ | CC0 1.0 Universal (metadata `license`; https://creativecommons.org/publicdomain/zero/1.0/). Committing is allowed. | Not required by CC0; courtesy: "Town of Cary open data (CC0)" | Source modified 2026-10-31; upstream ArcGIS `ParksRecreation/Parks/FeatureServer/5`; no update frequency stated | 2026-11-06 | 867 parcel-level polygons across Cary (and a little of Apex per `territory`); 142 Parks and Recreation + 725 Conservation | Usable with cleanup: parcels must be dissolved by name, greenway-corridor parcels excluded, private-owner field dropped, no stable id |
| cary-greenway-trails | Natural Surface Trails (id `greenway-trails`) | Town of Cary | https://data.townofcary.org/explore/dataset/greenway-trails/ | CC0 1.0 Universal | as above | Modified 2026-11-01; WEEKLY | 2026-11-06 | 30 LineStrings, all `Existing`, all inside parks (Bond, Hemlock Bluffs, WakeMed, ...) | Not used by the build (disabled in the registry as a licence record; the snapshot folder was deleted). Title says natural-surface trails, not the greenway system; no id; no proposed rows |
| cary-greenways-all | Greenway Trails Existing and Proposed (id `proposed-greenway-trails`) | Town of Cary | https://data.townofcary.org/explore/dataset/proposed-greenway-trails/ | CC0 1.0 Universal | as above | Modified 2026-11-01; WEEKLY; upstream `Parks/MapServer/2` | 2026-11-06 | 1098 segments: 648 Existing, 450 Proposed | Usable as-is for geometry (has `segmentid`); names need grouping into trails |
| cary-parks-points | Parks and Recreation Feature Map (Points) | Town of Cary | https://data.townofcary.org/explore/dataset/parks-and-recreation-feature-map/ | CC0 1.0 Universal | as above | Modified 2026-10-31 | 2026-11-06 | 36 points, `parkurl` and amenity Yes/No flags, no name field | Usable with cleanup: only a join aid (4 rows lack a URL) |

Not snapshotted: `cary-parks-and-recreation-areas` (same 867 polygons as the polygons dataset but with `created_user`/`last_edited_user` editor fields and owner names; use the polygons dataset instead).

## Regional and other sources

Retrieved 2026-11-06.

| id | source | publisher | URL | licence / reuse terms | attribution | vintage | last refresh | coverage | verdict (usable as-is / with cleanup / not usable / not inspected) + reason |
|---|---|---|---|---|---|---|---|---|---|
| WAKE-PARKS | Parks in Wake County (292 pts) | Wake County GIS | https://services1.arcgis.com/a7CWfuGP5ZnLYE7I/arcgis/rest/services/Wake_Parks_Public/FeatureServer/0 | CC-BY-4.0 (item structuredLicense); county disclaimer, not legal document | "Wake County GIS" (per item) | layer last edit 2026-09-01 | 2026-09-01 (item modified 2026-02-17) | Wake County, incl. parks of other jurisdictions (Raleigh sample) | with cleanup: point not polygon; JURISDICTION mixed; Lat/Lon null on some rows; filter to Cary by jurisdiction/location |
| WAKE-ENTRANCES | Park Entrances in Wake County (900 pts) | Wake County GIS | https://services1.arcgis.com/a7CWfuGP5ZnLYE7I/arcgis/rest/services/Wake_Park_Entrances/FeatureServer/0 | CC-BY-4.0 | "Wake County GIS" | 2026-09-01 | 2026-09-01 | Wake County parks | with cleanup: best entrance source found (vehicle/greenway/pedestrian flags); layer metadata name is wrong ("Wake Parks"); maxRecordCount 1000 vs 900 records |
| WAKE-GREENWAYS | Greenways in Wake County, NC (1,299 features) | Wake County GIS / PROS | https://maps.wake.gov/arcgis/rest/services/OpenSpace/Greenways/MapServer/0 (Hub: https://data-wake.opendata.arcgis.com/datasets/3f75595edc244c35812675b226021258_0) | CC-BY-4.0 (Hub `license`; item `licenseInfo` links https://creativecommons.org/licenses/by/4.0/) | "Wake County GIS" | item modified 2026-02-18 | 2026-02-18 | Wake County, municipal and county trails | **Imported (#67)** through the Hub export (registry type `arcgis-hub`): maps.wake.gov still does not connect from this network. All 1,299 are `EXISTING`; 532 Cary-owned are left out, 73 named systems outside Cary became trail places. Plain Hub download is a stale cache, so the adapter requests a fresh export |
| CHATHAM-PARKS | Chatham County - Parks (75 pts) | Chatham County GIS | https://gisservices.chathamcountync.gov/opendataagol/rest/services/ReferenceData/Chatham_Parks/MapServer/0 | none stated on item; sibling layer says resale prohibited (NCGS 132-10) | "Chatham County GIS" | sample edit 2026-06-09 | item modified 2026-10-31 | Chatham County, includes entrances/trailheads/boat ramps; one Cary-addressed trailhead (New Hope Church Rd) | with cleanup: licence must be confirmed before committing samples; feature codes mix park entrances and trailheads |
| CHATHAM-BOUNDARIES | Chatham County - Park Boundaries (166 polys) | Chatham County GIS | https://gisservices.chathamcountync.gov/opendataagol/rest/services/ReferenceData/Chatham_ParkBoundaries/MapServer/0 | custom: "Any resale of this data is strictly prohibited" (NCGS 132-10) | "Chatham County GIS" | item created 2019 | item modified 2026-10-31 | Chatham County and surrounding area | with cleanup: licence blocks redistribution; confirm before any public-repo use; includes areas outside Chatham |
| DURHAM-HIKEBIKE | Durham Hike/Bike Trails MapServer (sublayers not listed) | City of Durham GIS | https://webgis2.durhamnc.gov/server/rest/services/ProjectServices/Trans_HikeBikeMap/MapServer | unknown | unknown | unknown | unknown | Durham County | not inspected: host did not connect from this network (TCP hang); no counts or samples |
| EBIRD | eBird hotspots | Cornell Lab of Ornithology | https://ebird.org/ | see docs/ebird.md | see docs/ebird.md | see docs/ebird.md | see docs/ebird.md | see docs/ebird.md | not inspected: see docs/ebird.md |
| NCHPO | NC Historic Preservation Office GIS data | NC DNCR HPO | https://www.hpo.nc.gov/survey-and-national-register/gis-maps-and-data | NC.gov Disclaimer and Terms of Use (https://www.nc.gov/disclaimer-terms-use); no explicit open licence seen on page | per page: NC HPO | zip NCHPO_GISdata_2026-11-03.zip (27 MB) | monthly zip, live HPOWEB daily | Statewide NC historic points and district boundaries; local landmarks not authoritative | not inspected (page read only): no dataset downloaded; licence text needs confirmation; HPO is not authoritative for local landmarks |
| INAT | iNaturalist API v1 | iNaturalist (CalAcademy / National Geographic) | https://api.inaturalist.org/v1/docs/ | licence per observation and per photo (`license`, `photo_license` params); only open-licensed photos (inaturalist-open-data host) are reusable; static.inaturalist.org photos are not open; terms page returned 403 | per observation licence and observer | live API | live | global | with cleanup: store only records with an open licence code and keep per-record attribution; API-only, no bulk pull; terms page not read |
| NCDEQ-BASIN | NC DEQ basin maps | NC DEQ | not reached | unknown | unknown | unknown | unknown | NC river basins | not inspected: no official page reached in this session |
| USGS-3DHP | USGS 3D Hydrography Program | USGS | https://www.usgs.gov/3d-hydrography-program | unknown (page returned empty content); USGS federal data normally public domain but not verified here | unknown | unknown | unknown | nationwide | not inspected: page returned no text; licence not verified |
| CARY-SENSORS | Cary stream sensors | Town of Cary | https://www.carync.gov/services-publications/water-sewer-stormwater/stormwater/floodplains/stream-sensors | unknown (page returned 403 to automated access) | unknown | unknown | unknown | Cary streams | not inspected: 403; no data feed identified |
| CARY-FACILITIES | Facility Site Assets (layer 1), 354 points | Town of Cary GIS | https://maps-apis.carync.gov/server/rest/services/Facilities/Facilities/FeatureServer/1 | none stated in service metadata | "Town of Cary" (assumed; confirm) | LASTUPDATE field present; service metadata has no edit date | not stated | Cary town facilities | with cleanup: 354 features, maxRecordCount 2000, single page; drop created_user, last_edited_user, LASTEDITOR; confirm licence before reuse |
| CARY-FIRE | Fire Station (layer 0), 25 points | Town of Cary GIS | https://maps-apis.carync.gov/server/rest/services/PublicSafety/Fire_Service_Operations/MapServer/0 | none stated in service metadata | "Town of Cary" (assumed; confirm) | LASTUPDATE field present | not stated | Cary fire stations | with cleanup: 25 features, maxRecordCount 2000, single page; drop editor fields; confirm licence before reuse |

## Regional findings

- County-edge coverage: the Chatham layers include Cary-area sites, but none is a Cary-owned park; the one Cary-addressed record is a Chatham trailhead (New Hope Church Rd). Durham could not be inspected (host unreachable), so the Cary-in-Durham check is still open.
- Paging: all tested layers fit in one request (Wake Parks 292 of 1000, Wake Entrances 900 of 1000, Chatham Parks 75 of 2000, Chatham Boundaries 166 of 2000, Cary facilities 354 of 2000, Cary fire 25 of 2000). Wake Greenways (1,299 of 2000 per hub) fits on one page; it is fetched as a Hub export because maps.wake.gov is unreachable. Page anyway: Wake Entrances is close to its 1000 limit.
- CRS: all tested ArcGIS layers are native NAD83 NC State Plane feet (WKID 102719, latest 2264). `outSR=4326` works on every layer tested.
- Entrances and trailheads: Wake has a dedicated entrances layer (900 points). Chatham has entrances and trailheads as feature codes inside the parks point layer. Cary's facility layer was not checked for entrances.
- Licence: Wake layers are CC-BY-4.0, so the samples can be committed with attribution. Chatham carries a resale prohibition, so its samples should stay out of a public repo until Chatham GIS confirms terms.
- Blocked or unreachable from this network: maps.wake.gov, webgis2.durhamnc.gov, and several official pages returned 403 (Cary stream sensors, iNaturalist terms, USGS 3DHP returned empty). Those rows are marked not inspected rather than inferred.

## Cary snapshot findings

- API: opendatasoft Explore v2.1. GeoJSON export is WGS84 lon/lat (no State Plane); no paging needed for `/exports/geojson`. Export counts equal catalog `records_count` for all four datasets (867 / 30 / 1098 / 36). Largest raw file 2.2 MB, reduced files total about 3.5 MB (each below 5 MB), so all four are committed.
- Dropped fields: `owner` (private homeowner names on ~700 greenway-corridor parcels), deed/book/page/document fields, `shape_area`/`shape_length`, builder/owner/maintainer and notes columns of the greenway set. `created_user`/`last_edited_user` are not present in the datasets used. Raw geometry kept unchanged.
- Parks polygons (867): geometry Polygon 752 / MultiPolygon 115. `uselevel2`: Greenway Corridor 668, Existing Park 84, Future Park 46, Natural Area 57, Community Use Facility 12. Fields kept: `name`, `uselevel1/2/3`, `calcacreag`, `townzone` (Central/Maynard/South/West, not a county), `realid` (parcel id), `created_date`, `last_edited_date` (mostly null). Features are parcels, not parks: 839 distinct `realid`, many parks are several records (Hemlock Bluffs 7, Annie L. Jones 4, Bond 2). 79 of 84 Existing Park records are Polygon.
- Greenway trails (30): LineString, status values `Existing` only (30). Fields `name`, `segment`, `status`, `shape_stlength`.
- Existing vs proposed: lives in `proposed-greenway-trails`: Existing 648 (645 LineString + 3 MultiLineString), Proposed 450 (444 + 6). `segmentid` is unique (1098). `trailtype`: Greenway 810, Street-Side 285, Sidewalk Connector 3. `opentopublic` is `Yes` on all rows, including Proposed, so do not use it to filter; use `status`.
- Update dates: Cary-stated frequency WEEKLY for the two trail datasets; polygons and points have none stated (modified 2026-10-31). `created_date`/`last_edited_date` are almost always null, so row-level vintage is unavailable; use dataset `modified`.
- Data quality: `length_in_miles` in `proposed-greenway-trails` is off by a factor of 5280 (median haversine ratio 5280.0); `build-catalog.mjs` corrects it with `LENGTH_MILES_SCALE`.
- Data quality: `parkurl` in the points dataset uses the old townofcary.org domain; the build rewrites it to carync.gov (301 redirect checked 2026-11-07).
- County: no county or jurisdiction field in any dataset (`townzone` is a Town operational zone). The polygons bbox is lon -78.93..-78.75, lat 35.66..35.84 and covers Cary's Wake County core; Chatham/Durham pieces cannot be identified from these data and need a county-boundary join (boundaries task) or the neighbour counties' data.

## Join test

Official pages were reachable only from a real browser (curl and WebFetch got HTTP 403 from carync.gov), so a pipeline cannot scrape them; treat them as manual references. Old `townofcary.org` URLs in `parkurl` redirect to `carync.gov`.

| Park | Polygon records | Points dataset | Official page | Result |
|---|---|---|---|---|
| Fred G. Bond Metro Park | 2 (273.56 + 2.74 ac) | 275.13 ac, `parkurl` matches slug `fred-g-bond-metro-park` | Page says 310 acres, hours "open by 7:30 a.m., close at sunset"; no street address in page text | Name and slug join cleanly; acreage differs (276 vs 275 vs 310); address not on page; trail dataset calls it "Bond Park" |
| Hemlock Bluffs Nature Preserve | 7 parcels (sum about 139.9 ac, equals points 139.85) | `parkurl` slug is `stevens-nature-center-at-hemlock-bluffs-nature-preserve` | Slug guessed from the name returns 404; correct slug found only via `parkurl`; text had no address or hours | Joins via points `parkurl` plus spatial match, not by name; trail dataset calls it "Hemlock Bluffs" |
| Annie L. Jones Park | 4 parcels (sum 9.81 ac = points 9.81) | slug `annie-jones-park` (name differs: "L." missing) | Address "1414 Tarbert Drive", hours "Sunrise to Sunset", feature list, "Trailhead parking for Annie Jones Greenway" | Address and hours available as free text; name needs alias |

No Chatham or Durham park was found (no county field), so the county-edge sample is still open. Summary: spatial join (polygon centroid or point-in-polygon against the points dataset) works; name join needs aliases; address/hours exist only as unstructured page text for some parks.

## Entrances report

- Parks polygons: no entrance, trailhead or parking features. They include a few polygons named as trailheads (Black Creek Greenway Trailhead Park, New Hope Church Road Trailhead Park, Wake County/Town of Cary Trailhead, Future: Old Reedy Creek Rd Trailhead) which are park areas, not access points.
- Trail datasets: segment geometries only. A few segment names hint at access (Hemlock Bluffs "connects parking to trails", Bond "pavilion to Paw Paw Trail") but no point features. Trail ends could be derived as candidate access points but are not entrances.
- Points dataset (36): one representative point per park (a centroid-like point, not a gate). Amenity flags only.
- Other Cary catalog datasets found: Eco-Counter sites (counter locations on trails, not entrances), CASSI Bond Park stops (shuttle stops), EV charging stations. No dedicated trailhead or parking-lot dataset found by catalog search for trailhead/park/parking/greenway/facility. Not exhaustive; the catalog could also be searched for "amenit" and the upstream ArcGIS server (maps-apis.carync.gov/server/rest/services/ParksRecreation) listed for more layers.
- Completeness for Cary: none for entrances. Fallback: OpenStreetMap (entrance/parking/trailhead nodes, ODbL, needs attribution and share-alike review) and the official park pages (Annie Jones mentions trailhead parking). Until then `centroid` is a representative point, as the `Place` type already states.

## Schema fit

| `Place` field | Cary data | Fit |
|---|---|---|
| id | Polygons have no stable id (only parcel `realid`, repeating per park partly); 30-row trails have none; the 1098 greenways have `segmentid`; points have none | Needs a generated slug id fixed at first import and stored in a mapping file (not derived from name at runtime). Keep `realid`/`segmentid` in sourceIds |
| name, aliases | Name present; variants across datasets ("Bond Park" vs "Fred G. Bond Metro Park", "Hemlock Bluffs") | Fits; aliases fill the gap |
| category | `uselevel2` Existing Park -> park; Natural Area -> park (preserve); Community Use Facility -> community; Future Park and Greenway Corridor -> exclude (corridor parcels are land, not trails); trails from the 1098 set with status Existing -> trail; Proposed excluded | Fits `park`/`trail`/`community` |
| municipality | Always Cary for Cary-published rows (territory also lists Apex) | Fits as constant |
| county | Absent | Needs boundary join; optional field, can stay empty |
| centroid | Computable; `geo_point_2d` per parcel and per segment; dissolve first for multi-parcel parks | Fits; use a point guaranteed inside the polygon for odd shapes |
| bbox | Computable from dissolved geometry | Fits |
| sourceIds | Dataset ids above | Fits (`Source.license` = "CC0 1.0 Universal") |
| address | Only on some official pages (free text) | Optional field, deferred |

Deferred: Observation (eBird, iNaturalist), Collection, Relationship (park contains trail, trail connects greenway), entrances/trailheads, hours/amenities (points dataset flags could feed later), stationNumber (fire stations, other source), geometry storage (the `Place` type holds only centroid and bbox, so polygons/lines for map drawing need a separate geometry artifact).

Blockers for the first real catalog entries (#7): choose id scheme and park-name dissolve rules, decide which Natural Area and Community Use Facility rows count, and group greenway segments by name into trail Places.

## Credits & privacy page

The in-app "Credits & privacy" dialog (issue #19) lists the sources that were actually published. It is generated, not hand-typed:

- Rows come from `sources` in the release manifest (`public/data/manifest.json`: licence, retrieval and last-success dates, record count, `ok`), joined by id to the catalog `sources` (name and link). The join lives in `buildCreditsRows` in `src/features/about/credits.ts`; a source missing from the catalog is shown by its id. CC BY sources also get a visible credit line, and a source with `ok: false` shows a warning badge.
- The eBird section appears only when the catalog has an `ebird` source. The Map section uses `BASEMAP_CREDIT` in `credits.ts`; keep it in step with `src/features/map/basemap.ts` when the production basemap provider is chosen (#3).
- The privacy text is hand-written in `src/features/about/PrivacyNotice.tsx`. Update it whenever the app starts using geolocation, storage, cookies, analytics or a new third-party request.
- The dialog opens from the URL param `about=1` (so Back/Forward and shared links work) and from the "Credits & privacy" button in the desktop panel footer and the mobile sheet header.
- Licence gate: `validateRegistry` (`pipeline/lib/snapshot-core.mjs`) only allows `enabled` sources with `licenceStatus: "open"`, and `validateRelease` (`pipeline/lib/validate.mjs`) refuses to publish a catalog source with a missing or blank licence. Both are covered by tests.
