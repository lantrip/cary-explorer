# eBird hotspot snapshot

`pipeline/scripts/snapshot-ebird.mjs` takes a snapshot of eBird hotspots (public birding locations) for the Cary area, using the eBird API 2.0. It is a hand-run script with no dependencies (Node 22 or newer).

## How to run

Put the key in `.env` at the repo root as `EBIRD_API_KEY=...`. The key is never committed (`.env` is git-ignored). Then run:

```bash
node --env-file=.env pipeline/scripts/snapshot-ebird.mjs
```

The script also reads `EBIRD_API_KEY` from the environment, or parses `.env` itself, so `node pipeline/scripts/snapshot-ebird.mjs` works too. If the key is missing, it exits with an error that names the variable but never prints a value.

The key is only sent in the `x-ebirdapitoken` request header. It is never put in a URL and never written to any output.

## What it does

1. Fetches hotspots for three regions, one request at a time, with a pause between them: Wake (`US-NC-183`), Chatham (`US-NC-037`) and Durham (`US-NC-063`). Cary spans all three. Each request is retried once on a server error (5xx). Nothing is written until all three regions have been fetched, so a failed run keeps the previous files.
2. Keeps only these fields per hotspot: `locId`, `locName`, `lat`, `lng`, `subnational2Code` (county), plus `ebirdUrl` (`https://ebird.org/hotspot/{locId}`).
3. Computes `inCaryLimits` by point-in-polygon against `pipeline/sources/boundaries/cary-corporate-limits.geojson` (Polygon and MultiPolygon, with holes).
4. Writes two files here:
   - `hotspots.geojson`: a FeatureCollection of Points, one per unique `locId`, with the fields above plus `inCaryLimits`.
   - `meta.json`: source, endpoint, regions, `retrievedAt`, `countsByRegion` (hotspots returned per region), `inCaryCount`, attribution and terms.

## Fields dropped

- `numSpeciesAllTime` (species counts) and `latestObsDt` (latest observation date) are not kept. They are derived from the API and held back until the owner confirms the terms (issue #5). See `docs/ebird.md`.
- Other API fields (country and state codes, elevation and similar) are not needed and are not kept.

## Why the outputs are git-ignored

eBird's terms are non-commercial, and they do not clearly allow republishing API output as a public file. The owner has not yet confirmed that a public snapshot is allowed (issue #5). So `hotspots.geojson` and `meta.json` stay on the local machine. `.gitignore` covers `pipeline/sources/ebird/*` and keeps this README tracked. Do not commit or publish the generated files until the terms are confirmed.

## Attribution

Data: eBird.org (Cornell Lab of Ornithology). Data is from eBird contributors, and the snapshot date is in `meta.json`.
