# Boundary snapshots

Small snapshots for the scope spike (#4). They are for checking the rules in `docs/scope.md`, not the final pipeline inputs. Re-download from the URLs below for real builds.

| File | Source URL | Licence | Retrieved |
|------|------------|---------|-----------|
| `cary-corporate-limits.geojson` | https://data.townofcary.org/api/explore/v2.1/catalog/datasets/cary-corporate-limits/exports/geojson (Town of Cary, last edited 2026-10-01) | CC0 1.0 | 2026-11-06 |
| `census-counties-wake-chatham-durham.geojson` | https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/11 (US Census TIGERweb, current vintage, WGS84) | US Government work, public domain | 2026-11-06 |

Both files are in WGS84 (EPSG:4326). Do distance work in EPSG:32119, not in degrees.

## Derived scope polygons

Computed once by `pipeline/tools/make-scope-polygons.py` (a one-off, not run in CI; needs `shapely` and `pyproj`) from the two files above, per the rules in `docs/scope.md`. Derived from US Census TIGER (public domain) and the Town of Cary limits (CC0 1.0). Buffers are measured in EPSG:32119, simplified at 20 m, transformed back to WGS84 and rounded to 6 decimals. `pipeline/lib/geo.mjs` reads them at build time.

| File | Contents | Parameters |
|------|----------|------------|
| `core.geojson` | Wake County union Cary corporate limits | none |
| `nearby-buffer.geojson` | core buffered outward by 5 miles | 8,046.72 m from the core edge |
| `crossing-limit.geojson` | nearby-buffer plus 5 km, the cut-off for crossing trails and streams | 8,046.72 m + 5,000 m from the core edge |
