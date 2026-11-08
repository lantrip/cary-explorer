# Data pipeline

The pipeline turns public sources into the static files the app loads: a content-hashed catalog, relationships, layers and `places/<hash>/` folder in `public/data/`, listed by `public/data/manifest.json`, the only mutable file. It has no database and no server. Design decisions are in `docs/decisions.md` #16.

## Commands

Run from the repo root with Node 22 or later.

| Command | What it does |
|---------|--------------|
| `npm run data:snapshot` | Fetches each enabled source from `pipeline/sources.config.json` (paged ArcGIS and opendatasoft adapters), checks the fetched count against the service count, keeps only allowlisted fields, and writes `pipeline/sources/<dir>/{data.geojson,meta.json}` and `pipeline/.last-run.json`. Use `-- --only <id,...>` to snapshot selected sources. `pipeline/scripts/snapshot-cary.mjs` remains as a thin wrapper that snapshots only the Cary (opendatasoft) sources. |
| `npm run data:build` | Runs `build-catalog.mjs` (`--out <dir>` to choose the output folder). Writes the catalog, layers, `relationships.json` and coverage classes (core, nearby, outside). |
| `npm run data:publish` | Applies `pipeline/overrides.json`, runs the validation gates, then writes hashed artifacts into `public/data`, writes `manifest.json` last and prunes old files (see Publish below). |
| `npm run check:budgets` | Gzips every artifact listed in the manifest (and `dist/assets/*.js` when `dist/` exists), compares with `pipeline/budgets.json` and exits 1 if anything is over. |
| `npm run data:refresh` | Runs snapshot, build and publish in order. Output goes to `pipeline/.staging/` until publish. |

The same output comes from the same snapshots, so a re-run on unchanged snapshots changes nothing.

## Source registry

`pipeline/sources.config.json` lists every source:

`id`, `publisher`, `title`, `type` (`ods`, `arcgis` or `arcgis-hub`), `url`, `licence`, `licenceStatus` (`open`, `restricted` or `unclear`), `attribution`, `cadence` (`weekly` or `monthly`), `fields` (public field allowlist), `dir`, `enabled`.

An `arcgis-hub` source also needs `hubItemId` (the 32-character item id) and may set `hubLayer` and `where`. An `arcgis` source may also set `bbox` (`[west, south, east, north]`, WGS84, features intersecting it are kept whole), `geometry: false` (attributes only) and `geometryPrecision` (decimal places). It downloads a fresh GeoJSON export from ArcGIS Hub for public items whose own REST host is unreachable (`pipeline/lib/fetch-hub.mjs`). The run fails unless the Hub dataset's `license` equals the registry `licence` and the export count equals the dataset's record count.

Only `open` sources can be enabled. Sources that are `restricted` or `unclear` stay out of the pipeline until their terms are confirmed.

## Snapshot layout

```
pipeline/sources/<dir>/data.geojson   records after the field allowlist
pipeline/sources/<dir>/meta.json      URL, retrieval time, licence, service count, fetched count
pipeline/.last-run.json               per-source result of the latest run (git-ignored)
```

## Gates

Publish stops if any gate fails:

- Schema and unique ids.
- Coordinate ranges and valid geometry.
- Every greenways layer feature has `status` `"existing"` or `"proposed"`.
- Source coverage, including samples in Wake, Chatham and Durham.
- Fetched count matching the service count. A truncated fetch fails the run.
- Record count changing by more than ±30% against the last release. A large change must be checked and, if real, accepted through the overrides file before it publishes.

## Overrides

`pipeline/overrides.json` holds curated descriptions, corrections and amenity or access evidence. A refresh never rewrites it, so curated text survives re-runs.

## Staging and publish

`data:build` writes to `pipeline/.staging/`. `data:publish` validates, then writes into `public/data/`:

1. Each artifact goes to a hashed name (`catalog.<h>.json`, `relationships.<h>.json`, `layers/<name>.<h>.geojson`, `places/<h>/<id>.json`) where `<h>` is the first 12 hex of the SHA-256 of the file text (for places, of all detail files in sorted id order). An artifact that already exists is not rewritten. Files are written to a temp name and renamed; the places folder is written as `places/<h>.tmp-<pid>/` and renamed.
2. `manifest.json` is written last (temp file, rename). This is the switch-over; any failure earlier leaves the old manifest live.
3. Prune: artifacts referenced by neither the new nor the previous manifest are deleted, including legacy unhashed files. The previous release stays so open tabs keep working. A prune failure is a warning.

Code that reads published data resolves paths through `pipeline/lib/release.mjs` (`readRelease(dataDir)`), never fixed names. If a source fails, the run reports which source failed and the last good release stays in place.

## Greenways layer status

Every feature in `layers/greenways.<h>.geojson` has `{ placeId, status, outsideCore }`, with `status` either `"existing"` or `"proposed"`. A greenway place gets its existing lines first, then its proposed lines (each split into core and outside-core parts). Proposed segments are included only when their normalized name matches a greenway that already became a place, so proposed-only greenways add no places or features. Place centroid, bbox and visit fields come from existing segments only.

## Regional trails (Wake greenways)

`wake/greenways` (Wake County, CC BY 4.0) feeds trail places outside Cary. `build-catalog.mjs` leaves out Cary-owned and private segments, groups the rest by `TRAIL_NAME` (else `CORRIDOR_NAME`), keeps groups of at least 0.5 mi that are not connectors, street-side paths or street names, and skips a trail whose name matches an existing place with a vertex within 1 km of it (logged as `dedupe skip: Wake greenway ...`). Kept trails become `wake-greenway-<slug>` places (category `trail`, town by Census place point-in-polygon) and `existing` features in the greenways layer, simplified to 5 m (`WAKE_GREENWAY_SIMPLIFY_M`) to stay inside the layer budget. Park entrances are not turned into places.

## Size budgets

`pipeline/budgets.json` holds gzipped byte limits (manifest, catalog, relationships, each layer, each place file, initial data, largest JS bundle). `npm run check:budgets` prints a table and fails when anything is over; CI runs it after the build. See `docs/performance.md`.

## Place detail files

`data:build` also writes `places/<id>.json` for every catalog place: `{ id, fields }` with the 14 visit fields in a fixed order (address, entrances, parking, restrooms, paved surface, steps and slope, wheelchair access, hours, drinking water, dog park, playground, picnic shelter, walking trails, phone). A field is `known` (with `value`, `sourceId` and `verifiedAt`) only when a source states it; "No", empty and null are `unknown`, and wheelchair access is known only from an explicit accessibility flag, never from paving. `data:publish` fails if a place lacks a file, a file lacks a key or evidence, and publishes `places/` as a hashed folder with the rest of the release. See decision 18.

## Manifest

`public/data/manifest.json` records the release version, what it was built from, an `artifacts` block (`catalog`, `relationships`, `layers`, `places` paths relative to `public/data/`), and for each source: record count, `retrievedAt`, licence, licence status, last successful refresh and `ok`. The browser can show source health from it.

## Weekly workflow

`.github/workflows/data-refresh.yml` runs on Mondays at 09:00 UTC and on manual dispatch. It runs `npm run data:refresh` and `npm test`. If files changed, it pushes a branch `data-refresh/<run_id>` and opens a PR to `dev` with the run report. It never pushes to `dev` or `main`, and it uses no secrets. A failed step fails the job and nothing is pushed.

## Adding a source

1. Add an entry to `pipeline/sources.config.json` with `licenceStatus: "open"`, the licence and attribution text, a `fields` allowlist that contains only the public fields you need, and `enabled: true`.
2. Run `npm run data:snapshot` and check `pipeline/.last-run.json`.
3. Run `npm run data:refresh` and review the diff and the manifest before merging.
