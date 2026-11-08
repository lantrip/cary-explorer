#!/usr/bin/env python3
"""One-off: precompute the scope polygons for pipeline/lib/geo.mjs (docs/scope.md, issue #4).

Not run in CI and not part of the pipeline runtime; the outputs are committed.
Needs: pip install shapely pyproj

  core           = Wake County U Cary corporate limits
  nearby-buffer  = core buffered 8,046.72 m (5 mi), measured in EPSG:32119
  crossing-limit = core buffered 8,046.72 + 5,000 m
Each is simplified at 20 m (projected), transformed to WGS84 and rounded to 6 decimals.
"""
import json
import sys
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import mapping, shape
from shapely.ops import transform, unary_union

DIR = Path(__file__).resolve().parents[1] / "sources" / "boundaries"
BUFFER_M = 8046.72
CROSSING_EXTRA_M = 5000
SIMPLIFY_M = 20
DECIMALS = 6

to_proj = Transformer.from_crs("EPSG:4326", "EPSG:32119", always_xy=True).transform
to_wgs = Transformer.from_crs("EPSG:32119", "EPSG:4326", always_xy=True).transform


def load(name):
    return json.loads((DIR / name).read_text())


def round_coords(c):
    if isinstance(c[0], (int, float)):
        return [round(c[0], DECIMALS), round(c[1], DECIMALS)]
    return [round_coords(x) for x in c]


def write(name, geom_proj, props):
    g = transform(to_wgs, geom_proj.simplify(SIMPLIFY_M, preserve_topology=True))
    m = mapping(g)
    out = {
        "type": "FeatureCollection",
        "features": [{"type": "Feature", "properties": props,
                      "geometry": {"type": m["type"], "coordinates": round_coords(m["coordinates"])}}],
    }
    (DIR / name).write_text(json.dumps(out, separators=(",", ":")) + "\n")
    print(name, (DIR / name).stat().st_size, "bytes")


def main():
    counties = load("census-counties-wake-chatham-durham.geojson")
    wake = [f for f in counties["features"] if f["properties"].get("NAME") in ("Wake", "Wake County")]
    if len(wake) != 1:
        sys.exit("expected exactly one Wake feature")
    limits = load("cary-corporate-limits.geojson")
    geoms = [shape(wake[0]["geometry"])] + [shape(f["geometry"]) for f in limits["features"]]
    core = unary_union([transform(to_proj, g).buffer(0) for g in geoms])
    write("core.geojson", core, {"name": "core", "rule": "Wake County union Cary limits"})
    write("nearby-buffer.geojson", core.buffer(BUFFER_M), {"name": "nearby-buffer", "bufferM": BUFFER_M})
    write("crossing-limit.geojson", core.buffer(BUFFER_M + CROSSING_EXTRA_M),
          {"name": "crossing-limit", "bufferM": BUFFER_M + CROSSING_EXTRA_M})


if __name__ == "__main__":
    main()
