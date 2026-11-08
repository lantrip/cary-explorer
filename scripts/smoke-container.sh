#!/usr/bin/env bash
set -euo pipefail
image=${1:?Usage: scripts/smoke-container.sh IMAGE}
container=$(docker run -d --read-only --tmpfs /tmp:rw,noexec,nosuid --cap-drop=ALL --security-opt=no-new-privileges -p 127.0.0.1::8080 "$image")
work=$(mktemp -d)
trap 'docker rm -f "$container" >/dev/null; rm -rf "$work"' EXIT
port=$(docker port "$container" 8080/tcp | awk -F: '{print $NF}')
base="http://127.0.0.1:$port"
for attempt in {1..30}; do
    if curl -fsS "$base/health" >"$work/health" 2>/dev/null; then break; fi
    if [ "$attempt" -eq 30 ]; then docker logs "$container"; exit 1; fi
    sleep 1
done
[ "$(cat "$work/health")" = OK ]
[ "$(docker exec "$container" id -u)" != 0 ]
curl -fsS -D "$work/headers" "$base/" >"$work/index"
grep -qi 'cache-control: private, no-cache' "$work/headers"
curl -fsS "$base/explore/parks" >"$work/fallback"
cmp "$work/index" "$work/fallback"
curl -fsS -D "$work/headers" "$base/data/manifest.json" >"$work/manifest"
grep -qi 'content-type: application/json' "$work/headers"
grep -qi 'cache-control: private, no-cache' "$work/headers"
catalog=$(node --input-type=module -e 'import fs from "node:fs"; const m=JSON.parse(fs.readFileSync(process.argv[1])); const c=m.artifacts?.catalog; if(typeof c!=="string"||!/^[\w.-]+\.json$/.test(c)) process.exit(1); console.log(c)' "$work/manifest")
curl -fsS -D "$work/headers" "$base/data/$catalog" >"$work/catalog"
grep -qi 'content-type: application/json' "$work/headers"
node --input-type=module -e 'import fs from "node:fs"; const c=JSON.parse(fs.readFileSync(process.argv[1])); if(!Array.isArray(c.places)||!Array.isArray(c.sources)) process.exit(1)' "$work/catalog"
asset=$(sed -nE 's/.*src="(\/assets\/[^\"]+\.js)".*/\1/p' "$work/index" | head -1)
[ -n "$asset" ]
curl -fsS -D "$work/headers" "$base$asset" >/dev/null
grep -qi 'content-type: .*javascript' "$work/headers"
grep -qi 'cache-control: private, max-age=31536000, immutable' "$work/headers"
for path in /data/missing.json /assets/missing.js /missing.css; do
    [ "$(curl -sS -o /dev/null -w '%{http_code}' "$base$path")" = 404 ]
done
printf '%s\n' 'Container smoke checks passed.'
