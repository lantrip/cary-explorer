# eBird API, terms and place matching (issue #5)

Checked: 2026-11-06. Feeds #8 (hotspot prototype) and #16 (small cached API).

Confidence note: the endpoint facts below come from the official eBird API 2.0 documentation (read from its published Postman collection). The Cornell Lab terms pages (birds.cornell.edu) returned HTTP 403 (bot block) to automated fetches, so the terms section relies on search-result excerpts of those pages plus eBird Help Center pages that did load. Someone should read the full API Terms of Use in a browser before the Prototype ships (see Open questions).

## Summary

- The API gives us everything we need: hotspots by region or by lat/lng, recent and notable observations, and region species lists. Every call needs a personal key, sent in a header, which must stay server-side as `EBIRD_API_KEY`.
- Recent observations look back at most 30 days (default 14). Hotspot and observation endpoints return at most 10,000 results where `maxResults` applies. No numeric rate limit is published; the terms prohibit use that harms eBird servers.
- Licence is non-commercial, revocable, personal-key based. Attribution to eBird.org with a link is required. The terms do NOT clearly say whether API output may be stored and republished as a public static file. Treat that as unresolved.
- Sensitive species are withheld from public API output by eBird. We must not re-add them, and must never make wildlife locations a game or collection target.
- Hotspots link to parks only by evidence (name match, point-in-polygon, curated link), never by proximity alone.

## API

Base URL `https://api.ebird.org/v2`. Key goes in the `x-ebirdapitoken` request header (a `key` query parameter also works; do not use it, URLs get logged). Coordinates are given to 2 decimals.

| Need | Endpoint | Key | Notes |
|---|---|---|---|
| Hotspots in a region | `GET /ref/hotspot/{regionCode}` | yes | Region = country, state or county code, e.g. `US-NC-183` (Wake County; verify the code via `/ref/region/info/US-NC-183`). `fmt=json` (default is CSV). Optional `back` 1-30 = only hotspots visited in the last N days. Returns id, name, lat/lng, last-observation date, all-time species count. |
| Hotspots near a point | `GET /ref/hotspot/geo?lat=&lng=&dist=` | yes | `dist` up to 500 km per the parameter table (the prose says 50 km; use a small radius anyway). Same fields; `fmt=json`. |
| Hotspot info | `GET /ref/hotspot/info/{locId}` | yes | Single hotspot details. |
| Recent observations in a region | `GET /data/obs/{regionCode}/recent` | yes | `back` 1-30 (default 14), `hotspot=true`, `maxResults` 1-10000, `r` up to 10 location ids, `includeProvisional` false by default. One record per species (the most recent). |
| Recent nearby observations | `GET /data/obs/geo/recent?lat=&lng=` | yes | `dist` 0-50 km (default 25), `back` 1-30 (default 14), `hotspot`, `maxResults`, `sort`. |
| Recent notable (rare/unusual) | `GET /data/obs/{regionCode}/recent/notable` and `/data/obs/geo/recent/notable` | yes | Same `back`, `dist`, `hotspot` limits; `detail=simple` or `full`. Notable includes rarities, so expect sensitive-adjacent records to be filtered by eBird; do not use for the game or featured lists. |
| Species list for a region | `GET /product/spplist/{regionCode}` | yes | Species codes ever seen. Refreshed about every 10 s for locations, daily for larger regions. |

Getting a key: sign in to an eBird account and request one through the eBird API key form (the documentation links a sign-up page; `https://ebird.org/api/keygen`). Keys are tied to that person's eBird account, personal use, and the holder is responsible for activity under them. Do not share the key, do not put it in the repo, and never in a `VITE_` variable. A key now exists on the dev machine (holder: Sameer, for development only), set as `EBIRD_API_KEY` in the repo-root `.env` (git-ignored). The serverless/job environment still needs its own key set by the owner (listed in `.env.example`, empty).

Hotspot snapshot script: `pipeline/scripts/snapshot-ebird.mjs` (run with `node --env-file=.env pipeline/scripts/snapshot-ebird.mjs`). It writes git-ignored outputs to `pipeline/sources/ebird/`; see that folder's README.

Rate limits: none published in the API documentation. A commonly repeated figure of about 1,000 requests a day is from third parties and is unverified; do not rely on it. Terms say use that adversely affects eBird server stability can lead to suspension. Plan for a handful of calls per hour at most, cached.

## Terms

What the sources say (paraphrased):

- API use is under a non-exclusive, non-transferable, non-sublicensable, revocable licence for non-commercial use. Commercial use needs prior written permission from the Cornell Lab; the definition is broad (includes non-profits using data to make revenue, and any use assisting a commercial entity).
- Attribution: credit eBird.org as the data source wherever API data is shown or used, with a link back where possible. Derived materials need an acknowledgement and citation.
- Personal key per user; access can be suspended for harmful use.
- The API is meant for limited, recent and summary output. Bulk historical data is a different product (the eBird Basic Dataset, via a request form with its own terms: non-commercial research/education, no passing files to others, no redistributing the original format, commercial use needs permission). Do not use the bulk dataset for this site.
- Excerpts of the API terms say downloaded API content is limited to a single copy on one device for personal, non-commercial use. Read literally, that is hostile to publishing API output in a public repo or site. AMBIGUOUS.
- Caching: no rule found on either allowing or limiting it. AMBIGUOUS. Short-lived server cache is the conventional reading of API use; permanent public republication is not clearly covered.
- Sensitive species: eBird automatically restricts public output (including the API and the bulk dataset) for species at risk from capture, targeted killing or disturbance. We should confirm with the full terms but treat as true. Our job: never reconstruct, infer, or add such records from other sources.
- Photos and audio: Macaulay Library media is separate. Contributors keep copyright; embedding is allowed only for non-commercial use with attribution; other use needs a request or licence. We show no eBird/Macaulay media. If ever wanted, use links to the Macaulay Library, not copies.
- Commercial vs non-commercial: the project must stay non-commercial (no ads, paid tier, sponsor revenue) while it uses the API, or get written permission first. Owner decision.

## Decision for #8 and #16

#8 (Prototype hotspots, committed snapshot only):

- Conditional yes, conservative form. Commit only factual hotspot reference data: eBird locId, hotspot name, lat/lng, plus snapshot date and a link to the eBird hotspot page, for hotspots in or near Cary. No observation records, no species lists, no counts of sightings, no photos.
- "Counts" in #8 (e.g. all-time species number) are derived from the API; hold them out of the committed file until the owner has written confirmation that a public snapshot is allowed. If confirmed, add `numSpeciesAllTime` and `latestObsDt`.
- Snapshot is produced by a hand-run script using a personal key kept outside the repo; the key never appears in the bundle or network log.
- If the owner would rather not take the licence risk at all, fallback: commit only locIds linked to parks and fetch names live via #16.

#16 (live recent observations):

- Serve recent observations only through the bounded endpoint, server-side key, attribution on every response.
- Cache TTL: 3 hours default (allowed range 1-6 h), stale-while-error, response carries `fetchedAt` and each record's observation date/time. Do not persist beyond the cache window; no permanent archive.
- Bounds: region fixed to Cary core plus buffer (Wake County `US-NC-183` or a lat/lng radius); `dist` max 10 km; `back` max 7 days (hard cap 14, eBird max 30); `maxResults` max 100; `hotspot=true` only; `includeProvisional` false; never pass a client-supplied region code or URL.
- Upstream-aware limiting: one upstream call per cache key per TTL, coalesce concurrent requests, global ceiling of roughly 200 upstream calls a day, back off on any 429/5xx.

## Display rules

- Always show the observation date and time (as provided; say if no time) and the snapshot date or `fetchedAt`.
- Location precision: say "reported at an eBird hotspot" (a public shared place) and show the hotspot name. Never show a personal location as a precise point; treat any non-hotspot record as approximate and do not plot it.
- Wording: observations are reports by volunteers, not proof that a bird is present now or evidence of abundance. Use "reported", not "here", and avoid counts like "common" or "rare" unless eBird states them.
- Attribution line (use as the card and sources-list text): "Bird data from eBird (ebird.org), Cornell Lab of Ornithology. Reports by eBird contributors; snapshot dated {date}." Link to the hotspot's eBird page.
- No eBird or Macaulay photos or audio.
- Do not list or highlight notable/rare species as things to find.

## Matching rule

- A hotspot links to a park only by recorded evidence: (a) name match (normalised, human-checked), (b) the hotspot point is inside the park polygon, or (c) a curated link added by a person. Proximity or a buffer distance alone never links them or merges the records.
- Hotspots stay their own place records (category `wildlife`) with `relatedTo` a park when linked.
- Record the evidence per link, e.g. `{ "hotspotId": "L123456", "parkId": "...", "evidence": "point-in-polygon" | "name-match" | "curated", "note": "...", "checkedBy": "...", "checkedAt": "2026-11-06" }`. A link without evidence is rejected by the data check.
- Observations attach to the hotspot only (by locId), never directly to a park.
- Sensitive wildlife is never a game or collection target; bird features are information only, with no "find it" scoring.

## Open questions for the owner

1. Request an eBird API key (personal account) and decide who holds it; set `EBIRD_API_KEY` server-side only.
2. Read the full eBird API Terms of Use in a browser (our automated fetch was blocked) and confirm: public static snapshot allowed? caching limits? Or ask the Cornell Lab through the eBird Help Center for written confirmation of a committed hotspot snapshot and a 3-hour cache.
3. Confirm the project is strictly non-commercial (no ads, sponsors or paid features); otherwise written permission is required.
4. ~~Confirm the county code `US-NC-183` is Wake County and whether Cary-only is filtered by polygon.~~ Answered: `US-NC-183` is Wake (confirmed via `/ref/region/info/US-NC-183`, result "Wake, North Carolina, United States"). The snapshot script keeps all hotspots from Wake, Chatham (`US-NC-037`) and Durham (`US-NC-063`) and sets `inCaryLimits` by polygon rather than filtering.
5. Accept the minimal snapshot (id, name, lat/lng) now, with counts held back until step 2 is answered?
6. Accept the conservative cache bounds in #16 (3 h TTL, 10 km, 7 days, 100 results)?

## Sources

All checked 2026-11-06.

- eBird API 2.0 documentation (endpoints, parameters): https://documenter.getpostman.com/view/664302/S1ENwy59
- eBird API Terms of Use: https://www.birds.cornell.edu/home/ebird-api-terms-of-use/ (403 to automated fetch; excerpts via search only)
- eBird Data Access Terms of Use: https://www.birds.cornell.edu/home/ebird-data-access-terms-of-use/ (same limitation)
- How can your eBird data be used? https://support.ebird.org/en/support/solutions/articles/48001078113-ebird-data-privacy-and-data-use
- Download eBird data: https://support.ebird.org/en/support/solutions/articles/48000838205-download-ebird-data
- Macaulay Library media: https://support.ebird.org/en/support/solutions/articles/48001064551-using-and-requesting-media
- Sensitive species in eBird (Help Center): https://support.ebird.org/en/support/solutions/articles/48000803210
- Key request: https://ebird.org/api/keygen
