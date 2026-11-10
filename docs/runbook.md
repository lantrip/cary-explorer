# Runbook

What to do when the data pipeline or the app misbehaves. Background: `docs/decisions.md` 16, 19, 22, 23; pipeline details in `pipeline/README.md`.

## Who owns what

| Area | Owner |
|------|-------|
| Pipeline, workflows, app code, runbook | This repo's maintainer |
| Hosting, CDN, deployment, server logs, transfer cost | The hosting team (not this repo) |
| Remote error reporting and any backend | Waits on #16 and the hosting team |

## A refresh failed

The weekly `Data refresh` workflow (Mondays 09:00 UTC) opens a GitHub issue titled **Data refresh failed** (label `data-refresh`). If one is already open it adds a comment instead, so there is never more than one. The issue gives the run URL, the failed step and a pointer here. A failed run publishes nothing: the last good release stays live.

1. Open the run from the issue and read the failed step's log.
2. Decide what failed:
   - **Snapshot step, one source down or a truncated fetch:** usually an upstream outage. Rerun the workflow (Actions, Data refresh, Run workflow) later. If it keeps failing for days, see "A feed is stale".
   - **Publish gates** (count change, licence, schema, coverage): read the error lines. Fix the cause, do not bypass it.
   - **Test, typecheck, build or budgets:** a code or size problem that the new data exposed. Reproduce locally with `npm run data:refresh`, then the same npm script that failed.
3. Rerun, or run `npm run data:refresh` locally and open the PR by hand.
4. Close the issue once a refresh succeeds.

### Overrides

- `--allow-stale` (for example `npm run data:refresh -- --allow-stale`): publish even though a source failed this run, keeping that source's previous snapshot. Acceptable for a short upstream outage when the other sources have real changes to ship. The source is then marked `ok: false` in the manifest and the credits dialog says so. Not acceptable as a routine setting, or when the old data is wrong.
- `PIPELINE_ALLOW_COUNT_CHANGE=<source id,...>`: allows a record count change of more than 30% for the listed catalog source ids. Acceptable only after you checked the upstream dataset and the change is real (a dataset was restructured or filled in). Not acceptable to get past a truncated or empty fetch.

Never add either to the scheduled workflow permanently.

### Testing the alert

Run the `Data refresh` workflow manually (Actions, Data refresh, Run workflow) and tick **simulate_failure**. A step named "Simulated failure (test only)" fails and the alert step opens or comments on the **Data refresh failed** issue. Close that test issue afterwards. The `Source freshness` workflow can be run manually too, but only alerts if a source is actually stale.

## A feed is stale

The manifest records each source's `lastSuccess`, `cadence` and `cadenceDays`. The app and `npm run check:freshness` compare the current time with them. The weekly `Source freshness` workflow (Wednesdays 09:00 UTC) runs the check on `dev` and opens or comments on an issue titled **Source data is stale** (label `data-refresh`).

| Cadence | Days between refreshes | Margin | Stale after |
|---------|------------------------|--------|-------------|
| weekly | 7 | 3 | 10 days since `lastSuccess` |
| monthly | 31 | 7 | 38 days since `lastSuccess` |

Between the cadence and the end of the margin a source is "due" (not an alert). Past the margin it is "stale": the credits dialog shows "Older than expected" on that row and place cards that use it say "Some source data is older than expected." Manifests without `cadenceDays` (older releases) are never reported stale.

Sources with a count check: `wake-fire-stations` (Wake County fire stations, monthly, snapshot in `pipeline/sources/wake/fire-stations/`, 89 places in the published catalog, shown as the "Community services" layer). The count gate stops a publish if the record count moves by more than 30% (see "Overrides"); check that Wake County has really added or closed stations before using `PIPELINE_ALLOW_COUNT_CHANGE=wake-fire-stations`.

When it fires:

1. Run `npm run check:freshness` (add `-- --now 2026-12-01` to check a date) to see which sources and how old.
2. Check whether the Monday refresh ran and whether its PR was merged. A refresh PR waiting for review is the most common cause: review and merge it.
3. If the refresh runs but the source keeps failing, check the upstream portal. A dataset moved or renamed needs a change in `pipeline/sources.config.json`.
4. If the source is permanently gone, disable it in the registry (`enabled: false`) with a note.

## The app shows "Something went wrong"

The error card replaces the app when a render error escapes. It only offers Reload. The error is logged with `console.error` in the visitor's browser; nothing is sent anywhere.

- Reload fixes transient problems. If it recurs for you, open the browser console, copy the "Unhandled app error" entry and reproduce it with `npm run dev`.
- Likely causes: a malformed data file that passed the gates, a new browser API, or a stale tab holding a pruned release (reload gets the current one).
- **Remote reporting is not built.** It waits on the backend (#16) and the hosting team. When it lands, update the privacy text in `src/features/about/PrivacyNotice.tsx` and decision 22 before turning it on, because the page then sends data off the device.

## Transfer cost

Host-side, owned by the hosting team; no code in this repo. What to watch:

- Bytes served per page view against the budgets in `docs/performance.md` and `pipeline/budgets.json` (gzipped): initial data 256 KB, catalog 200 KB, each layer 150 KB, each place file 4 KB, manifest 4 KB, largest JS chunk about 232 KB.
- Hashed files (`catalog.<h>.json`, `layers/`, `places/<h>/`) are immutable and should be cached for a long time. Only `manifest.json` should be `no-cache`. A rising share of requests for hashed files that miss the cache means headers are wrong.
- The basemap tiles come from OpenStreetMap's servers, not from this host, and cost nothing here.
- A release adds files before it prunes, so storage briefly holds two releases.

## Hosting

The app is static files from `dist/` plus `public/data/`. Hosting, deployment and its logs belong to the hosting team. If the site is down or serving the wrong release, contact them; this repo cannot fix it.
