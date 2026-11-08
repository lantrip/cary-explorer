# Collections

Shipped collections are built by `pipeline/lib/collections.mjs` from data already in the release. Each states its rule in `curation`.

| id | Rule | Count |
|----|------|-------|
| `short-visit-restroom` (title "Parks with restrooms and mapped entrances") | Parks with restrooms and entrances both known; most confirmed facilities first, Cary first on ties, then name; top 12 of N qualifying parks (N is computed and stated in the summary) | 12 of 110 |
| `paved-trails` (title "Paved trails") | Trails with a confirmed paved surface; longest first by the trail length the build computes from the greenway data, then name; top 12 of N qualifying trails | 12 of 62 |

## Pending (not shipped, no data yet)

- Public art and a park: no art places in the catalog.
- History near a greenway: no history places.
- Meet your creek: no creek or water data.
- Places to watch for birds this month: no public birding data. Never build a collection around sensitive wildlife locations.

A pending collection is added only when its data exists and a rule can be stated; the release gate rejects unknown place ids, duplicate or empty ids and missing titles.
