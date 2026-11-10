# Decisions

This file records where the build deliberately differs from the reference material (`cary-explorer-reference/`) and why. Read it before undoing one of these choices. Each entry names the file or setting it covers. When a decision changes, update its entry in the same pull request.

## 1. Five themes over eight categories

**Context:** Places need a small set of colours and filter chips, but the data needs finer labels such as `park`, `trail` and `history`.

**Decision:** Users see five themes. Each of the eight categories maps to one theme through `CATEGORY_THEME`. The `theme` field is derived when the catalog loads, not stored in the JSON.

**Reference's position:** The reference's frontend notes do not describe a theme layer; they work with place categories directly.

**Consequence:** Adding a category means adding it to `CATEGORY_THEME`, or the parser rejects it.

**Applies to:** `src/features/themes/themes.ts` (`THEMES`, `CATEGORY_THEME`), `src/features/places/catalog.ts` (`parsePlace`), `src/types/place.ts`.

## 2. Zustand store for shared UI state

**Context:** Selection, theme filters, search text and view mode are read by the map, the panel, the search box and the list at the same time.

**Decision:** One Zustand store holds `selectedPlaceId`, `activeThemes`, `searchQuery`, `view` and `sheetState`. The map camera stays inside OpenLayers, not in the store. The selected place, themes, view, search text and camera are mirrored to the URL (see decision 15, #35); `sheetState` and `panelCollapsed` are layout only and stay out of it.

**Reference's position:** The reference says to keep state small, store shareable state in the URL, and add a store only when several unrelated components need it. Its list of state (selected ID, search text, filters, view, camera) matches here, except that the camera stays in OpenLayers and `sheetState` is added.

**Consequence:** Components read state without prop chains. Any shareable field added later must also be mirrored to the URL, or deep links will break.

**Applies to:** `src/store/useAppStore.ts`.

## 3. Full ARIA combobox for search

**Context:** Search results must be usable by keyboard and by screen readers, and the map may be unavailable.

**Decision:** The search input is a combobox. It uses `aria-expanded`, `aria-controls`, `aria-activedescendant` and a `listbox` of options. Arrow keys move the active option, Enter selects it, and Escape closes the list (or clears the query when the list is closed). A `role="status"` region announces the result count.

**Reference's position:** The reference uses a labelled input and a list of buttons. It says this avoids a partly built combobox, and that a richer autocomplete must implement the full keyboard and screen-reader behaviour.

**Consequence:** Keyboard behaviour is more complex and needs testing with real screen readers. The test suite has no combobox test yet, so this behaviour is checked by hand only.

**Applies to:** `src/features/search/SearchBox.tsx`, `src/features/search/searchIndex.ts`.

## 4. Three-state mobile sheet, not modal

**Context:** On phones the place details sit in a bottom sheet over the map. The map must stay usable.

**Decision:** The sheet has three heights: `peek` (112 px plus the safe-area inset), `half` (50% of the viewport) and `full` (90%). An explicit handle button cycles through them and sets `aria-expanded`. The sheet is a plain `section`, not a dialog, so it does not trap focus. Drag gestures and snap points are not built.

**Reference's position:** The reference's layout is non-modal and has explicit expand and collapse controls. Its example has no drag gestures and no three snap positions, and it says a modal sheet would need a dialog with focus management.

**Consequence:** Users can reach the map while the sheet is open. Adding drag later is a new feature, not a fix. Making the sheet modal would require the dialog pattern the reference describes.

**Applies to:** `src/features/places/MobilePanel.tsx`, `SheetState` in `src/store/useAppStore.ts`.

## 5. Catalog file shape `{sources, places}`

**Context:** Places cite one or more sources, and the browser must reject bad data before it reaches the map or search.

**Decision:** `catalog.json` is an object with a `sources` array and a `places` array. Each place lists `sourceIds`, and every id must match a source. The parser builds new objects from an allowlist of fields, rejects unknown categories, and checks coordinates and URLs. `loadCatalog` caps decoded bytes at 2 MB by default.

**Reference's position:** The reference's `architecture.md` describes a `catalog.json` with places and separate `places/<id>.json` detail files. Its example `Place` type combines catalog and basic detail fields in one record.

**Consequence:** Source details are stored once and shared. Extra upstream fields are dropped on purpose, so a new field must be added to the parser before it is used.

**Applies to:** `src/features/places/catalog.ts`, `public/data/catalog.json`, `src/types/place.ts`.

## 6. Newer tooling versions than the reference pins

**Context:** The reference pins versions that were current when it was written. The app was started later.

**Decision:** The app uses newer versions. Installed versions match the ranges in `package.json`:
- React 19.3.1 (reference 19.2.8)
- OpenLayers 10.11.0 (reference 10.9.0)
- Fuse.js 7.5.0 (reference 7.1.0)
- TypeScript 7.0.2 (reference 5.9.3)
- Vitest 5.0.5 (reference 3.2.7)
- Vite 8.3.5 and oxlint 1.90.0 (not in the reference)

The seven test files (76 tests) pass on these versions.

**Reference's position:** Its `development.md` says the pins describe the checked environment, and that the tree should be reviewed and locked before adoption.

**Consequence:** Upgrades are deliberate. Re-run `npx vitest run` and `npm run typecheck` after any bump.

**Applies to:** `package.json`, lock file.

## 7. Libraries not adopted yet

**Context:** Several libraries from the planned stack are not needed yet.

**Decision:** Base UI, TanStack Router, TanStack Query and Turf are not installed. Each will be added when a task needs it, not before.

**Reference's position:** Base UI is an optional design-system choice in `frontend.md`. The reference says a data-fetching library can be added later for caching and retries.

**Consequence:** Routing and data fetching use plain code for now (for example `loadCatalog`). URL state (#35) used a small History API layer instead of TanStack Router (see decision 15). Revisit TanStack Router when geometry work starts or the URL needs many more fields.

**Applies to:** `package.json` (`dependencies`, `devDependencies`).

## 8. Desktop panel overlays the map

**Context:** On desktop, the place panel sits on the left and the map fills the rest of the screen.

**Decision:** The panel is an absolute overlay, 400 px wide, on top of a full-screen map. When a place is selected, the camera is padded so the place lands in the visible part of the map.

**Reference's position:** `frontend.md` prefers a desktop panel that resizes the map, rather than one that hides selected features.

**Consequence:** The map stays full-bleed. The panel width and the camera padding in `MapView` both come from `DESKTOP_PANEL_WIDTH` in `src/lib/layout.ts`, so they cannot drift apart. The map notes offset uses the same constant. See #34.

**Applies to:** `src/features/places/DesktopPanel.tsx` (inline `width`), `src/features/map/MapView.tsx` (`selectionPadding`), `src/features/map/MapNotes.tsx`, `src/features/map/map.css` (scale line, 416 px = 400 + 16).

## 9. The brief's source of truth

**Context:** The project brief first lived in a Google Doc (dated Nov 1). A newer copy was written later.

**Decision:** The newer `brief.md` (dated Nov 2) in the shared reference zip supersedes the Google Doc. The brief's text is deliberately not copied into this repo. `docs/README.md` links to the Google Doc and to this file.

**Reference's position:** The reference's `development.md` refers to the product brief as the source for the acceptance checklist.

**Consequence:** Contributors who need the brief should use the zip, which wins over the Google Doc. Copying its text here would create a second copy that drifts.

**Applies to:** `docs/README.md`; the shared reference zip `brief.md` (not in the repo).

## 10. Map engine: OpenLayers only

**Context:** Two map libraries are common: OpenLayers and MapLibre GL JS.

**Decision:** The app uses OpenLayers. MapLibre GL JS is added only if custom vector cartography becomes a priority. That is a product and team choice. Use one engine, never both.

**Reference's position:** `frontend.md` names OpenLayers for maps.

**Consequence:** Map code is written against OpenLayers APIs. Switching later means rewriting `MapView` and the pin styles.

**Applies to:** `package.json` (`ol`), `src/features/map/MapView.tsx`.

## 11. List view stays in the panel

**Context:** Users can switch between a map and a list of the same places.

**Decision:** The list renders inside the desktop panel (400 px) and inside the full-height sheet on phones. The map stays mounted behind it, so the camera survives a toggle. Switching to the list on a phone opens the sheet at `full` and hides the zoom buttons.

**Reference's position:** `frontend.md` says list mode gives the panel the whole page.

**Consequence:** The list is narrower on desktop, but the map state is kept without extra work. Keep the map mounted when changing the layout.

**Applies to:** `src/features/places/PanelBody.tsx`, `src/features/places/ListView.tsx`, `src/features/places/ViewToggle.tsx`, `setView` in `src/store/useAppStore.ts`, `src/app/App.tsx`.

## 12. Basemap created inside `MapView`

**Context:** The map needs a background layer. The source must be swappable once a provider is chosen (#3).

**Decision:** `MapView` calls `createBasemapLayer()` itself, passing a tile-status callback. The current source is public OpenStreetMap tiles, for development only. The production provider is tracked in #3.

**Reference's position:** `frontend.md` says the application passes a configured basemap layer into the map. `development.md` says to memoise configured basemap layers.

**Consequence:** Changing the provider means editing `basemap.ts`, not passing a prop. Move the call to a prop when #3 lands, or sooner if a second map needs a different basemap.

**Applies to:** `src/features/map/basemap.ts`, `src/features/map/MapView.tsx`.

## 13. Launch shape and deployment

**Context:** The brief describes three architecture levels: a static viewer, a static viewer plus a small cached service, and a database-backed app.

**Decision:** Build for level 2: a static site plus versioned data files. Add a small cached service only for keyed or on-demand data (eBird, geocoder; see #16). No database, accounts or server runtime for now. Hosting and deployment, including the existing dev server, belong to another team. This repo produces the static build (`npm run build` → `dist/`) and the data artifacts.

**Reference's position:** The brief recommends level 2 as the launch shape and defers a database until it is needed.

**Consequence:** Keep provider-specific code small. Do not add deploy config, server setup or hosting choices in this repo. Hand the built `dist/` and data files to the deploy team.

**Applies to:** `package.json` build script, `dist/`, #16, #3 (basemap only), #43 (closed: owned by another team).

## 14. Real catalog from Cary data

**Context:** Cary's parks dataset is land parcels, not park outlines: 867 records, of which 668 are greenway-corridor parcels and 46 are future parks. A park can be several parcels. Greenways come as segments. There is no county field and no stable id.

**Decision:** Parks are parcels with use level Existing Park, Natural Area or Community Use Facility, grouped by normalized name into one place. Community Use Facility maps to the community category. Street-side trails are excluded from greenway places by the name rule (for example Davis Dr Street-Side Trail, 3.9 mi); they can come back as a separate category later. Greenways are Existing segments grouped by name, and kept when they are at least 0.5 mi long and are not a connector, street-side, sidewalk or side-path. Ids are `cary-park-<slug>` and `cary-greenway-<slug>`, recorded once in `pipeline/ids.json` and never changed. A place's county comes from a point-in-polygon test of its point against Census county polygons. The official page link is joined from Cary's park points. Descriptions are one generated factual line until curated text arrives (#68). Sample places are removed. A Wake County park is skipped as a duplicate only when a Cary place has the same normalized name (or alias) and its centroid is within 1 km; every skip is logged and the Wake id stays in `ids.json`.

**Reference's position:** The brief asks for stable ids that do not depend on display names, canonical places linked to their source records, and no merging of records by proximity alone.

**Consequence:** Renaming a park in Cary's data creates a new id unless `ids.json` is updated by hand. The History, Water and Art themes have no real places until their own issues land (#22, #24, #26). Map pins are representative points; park and greenway shapes are drawn later (#38).

**Applies to:** `pipeline/scripts/build-catalog.mjs`, `pipeline/ids.json`, `pipeline/aliases.json`, `public/data/catalog.json`, `public/data/layers/`.

## 15. Shareable links with a small History API layer

**Context:** A selected place, view, filters, search text and map camera should survive a reload and be shareable. Sheet state and panel collapse are layout only.

**Decision:** The URL query string holds `place`, `themes` (omitted when all themes are on), `view`, `q` and `map=<zoom>/<lat>/<lon>`. Default values are omitted. Sheet state and panel collapse stay out of the URL. Selecting a place, changing the view and changing filters push a history entry. Camera moves and search typing replace the current entry, and typing is debounced. Values are validated on load. A place that is not in the current data shows a "not in the current data" note. There is no router library.

**Reference's position:** The brief's stack names TanStack Router and says shareable state belongs in the URL. `frontend.md` says to keep state small.

**Consequence:** The URL carries only a few fields, so no router is needed. Adding routes or many more URL fields later is the point to revisit TanStack Router. Query strings need no static-host fallback, so the deploy team needs no rewrite rules.

**Applies to:** `src/lib/urlState.ts`, `src/app/useUrlSync.ts`, `src/store/useAppStore.ts`, `src/features/map/MapView.tsx`, `src/features/places/PlaceCard.tsx`.

## 16. Data pipeline: adapters, release gates and refresh runner

**Context:** The brief's data preparation steps (snapshot, normalize, canonical places, overrides, relationships, publish) need a repeatable runner and must not take the site down when one source fails. The app has no database and no server runtime (#13). Sources differ in licence terms, and most are ArcGIS or opendatasoft feeds that cap responses per request.

**Decision:** Run the pipeline on a GitHub Actions weekly schedule (Mondays 09:00 UTC) plus manual dispatch. The job never pushes to `dev` or `main`; it opens a review PR from `data-refresh/<run_id>` when data changed, and it fails without pushing when any step fails. Use no secrets: only open, keyless sources are enabled. Write one Node adapter per source (ArcGIS and opendatasoft paging, count checks, field allowlists). Use Python only for one-off geometry preparation such as `pipeline/tools/make-scope-polygons.py`, and commit its output rather than running it in the job. Keep a source registry, `pipeline/sources.config.json`, with a licence and `licenceStatus` for each source. Only `open` sources can be enabled. Validation gates run before publish: schema, unique ids, coordinate ranges, geometry validity, coverage, feature counts, and samples in Wake, Chatham and Durham. A record-count change of more than ±30% against the last release blocks publish. Publish atomically from `pipeline/.staging/` into `public/data/` and keep the last good release for any source that fails. Manual corrections live in `pipeline/overrides.json`, which a refresh never rewrites. Classify features as core, nearby or outside (#4). Relationships are `contained`, `nearby` (within 400 m) or `curated`, and are never merged into places. `nearby` links carry `distanceM` (rounded metres of closest approach) and `basis` (`within-400m`), and a place with no link at all gets one `nearby` link with `basis: 'nearest'` to its closest place within 2,000 m (never farther). eBird stays out of the published pipeline: its output is local only until its API terms are confirmed (#5).

**Reference's position:** The brief lists steps 1 to 6 and asks for validation before publish, versioned output and a source registry with licence status. `architecture.md` asks for a publication job that validates before it writes. The brief leaves the runner open, and #13 asks for the choice to be made and recorded.

**Consequence:** Weekly data changes arrive as reviewable PRs, not as silent pushes. A Workers cron would need secrets and a server-side runtime, so it is deferred until keyed or on-demand data needs one (#16). A large real change in a source's count needs a human to check and override it before the release can publish. Adding a source means adding a registry entry, which keeps its licence visible.

**Applies to:** `pipeline/`, `pipeline/sources.config.json`, `pipeline/overrides.json`, `pipeline/tools/`, `.github/workflows/data-refresh.yml`, `src/types/data-model.ts`, #13, #16, #4, #5.

## 17. Town membership from Census boundaries

Municipality is decided by point-in-polygon of a place's centroid against US Census TIGERweb incorporated places (public domain; registry source `census-places`, snapshot in `pipeline/sources/census/places/`, restricted to the 12 study towns by a `where` clause). A centroid in none of them is "Unincorporated Wake County" when it is inside Wake, otherwise "<County> County". `county` comes from the Census county polygons and is now required by the catalog parser. ZIP and other postal fields are never used, because they do not follow municipal limits.

The full Wake County parks layer (`wake-parks`, CC BY 4.0) replaces the earlier sample. Per docs/source-matrix.md section 4, a Wake park whose point is inside Cary's corporate limits is skipped because Cary's CC0 data wins there; every other Wake park becomes a point-only `park` place. The layer's `JURISDICTION` field is shown in the description but does not decide municipality; disagreements with the polygons are reported by the build. Town portions outside Wake County follow source-matrix section 6. Because this raises the `wake-parks` place count from 1 to 243, the refresh used `PIPELINE_ALLOW_COUNT_CHANGE=wake-parks` once.

## 18. Visit information: known vs unknown

**Context:** Place cards must say what is verified about visiting and say "unknown" otherwise (#41). The brief says never to infer wheelchair access from paving. The sources are inventories: a "No" or an empty value there does not prove an amenity is absent.

**Decision:** Every catalog place gets `public/data/places/<id>.json` with exactly 14 fields in a fixed order: address, entrances, parking, restrooms, pavedSurface, stepsSlope, wheelchair, hours, water, dogPark, playground, picnicShelter, walkingTrails, phone. A field is `known` only when a source affirmatively states it (a "Yes"-like flag, a non-empty address or phone, a recorded surface type). `No`, `N`, empty and null all become `unknown`, so the app never shows "no". A known field carries `sourceId` and `verifiedAt` (the snapshot's `sourceModified` date, else `retrievedAt`). `hours`, `water` and `stepsSlope` have no source yet and are always unknown.

Observed raw values (snapshots of 2026-11-07): Wake parks flags (RESTROOMS, PLAYGROUND, PICNICSHELTER, WALKINGTRAILS, DOGPARK) are `"Yes"`, `"No"` or null; FISHING also has `"Yes Bank fishing only"` (not used). Entrance flags (VEHICLEENTRANCE, PEDESTRIANENTRANCE, GREENWAYENTRANCE, PARKINGLOT, PARKINGSTREET) are `"Yes"`, `"No"` or null. Cary park points (restroom, playground, dogpark, naturetrail) are `"Yes"` or `"No"`. Greenway `surftype` is Asphalt, Concrete, Aggregate, Decking, Limestone, Other or null; `ada` is null for 1,080 of 1,098 segments and `"Y"`, `"Yes"` or `"y"` for 18.

Sources by field: Wake parks layer for `wake-park-*` places (flags, ADDRESS plus Address2, PHONE); Cary park feature points inside the park's parcels for `cary-park-*` places; Wake park entrances for entrances, parking, and as a fallback for flags, address and phone (an entrance-level flag means "at an entrance", not for the whole park). Entrances join by park name within 5 km of the place, or by falling inside a Cary park's parcels unless they are named for a different catalog place (adjacent parks). A Cary park's address or phone comes from joined entrances only when they agree. Parking is "Parking lot" if any joined entrance has PARKINGLOT yes, else "Street parking" if PARKINGSTREET yes. Trails take `pavedSurface` from existing segments' `surftype` (asphalt and concrete count as paved; unrecorded segments are mentioned, not assumed).

`wheelchair` is known only from an explicit `ada` flag on Cary greenway segments ("Accessible (per Town of Cary greenway data)", or "on some segments" when only some are flagged). It is never derived from a paved surface. Release validation rejects a known `wheelchair` value from any other source, a missing or extra field, a wrong order, a known field without `sourceId` or `verifiedAt`, and any place without a detail file or any detail file without a place. The `places/` files are copied atomically with the release and are part of the manifest version hash. `wake-park-entrances` and `cary-park-features` are added to the catalog's sources because details cite them.

**Reference's position:** The brief asks to separate known paved surface, steps, slope and restroom information from unknown fields and not to infer wheelchair access from paving.

**Consequence:** Most fields are unknown today, wheelchair is known for one trail, and filters on amenities may rely on known fields only. Field-level corrections go through `pipeline/overrides.json` (#13).

**Applies to:** `pipeline/lib/visit.mjs`, `pipeline/scripts/build-catalog.mjs`, `pipeline/lib/validate.mjs`, `pipeline/scripts/publish.mjs`, `public/data/places/`, #41.

## 19. Release artifacts: hashed files, manifest last

**Context:** Overwriting `catalog.json` and friends in place forces short cache lifetimes and can serve a mix of old and new files mid-deploy (#37).

**Decision:** Every published file is content-hashed and immutable: `catalog.<h>.json`, `relationships.<h>.json`, `layers/<name>.<h>.geojson`, and a `places/<h>/` folder, where `<h>` is the first 12 hex of a SHA-256 (of the file text; for places, of every detail file in sorted id order). `manifest.json` is the only mutable file and lists the artifact paths, so hosting can cache hashed files forever and serve the manifest with `no-cache`. Publish writes missing artifacts first and `manifest.json` last (temp file, then rename); a failure before that leaves the old release live. The previous release stays on disk so open tabs keep working, and everything referenced by neither the new nor the previous manifest is pruned, including legacy unhashed files. The catalog/detail split is already in place (slim `catalog` vs `places/<id>.json`). Size limits live in `pipeline/budgets.json` and are enforced in CI (#20, `docs/performance.md`).

**Applies to:** `pipeline/scripts/publish.mjs`, `pipeline/lib/release.mjs`, `pipeline/scripts/check-budgets.mjs`, `public/data/`, #37, #20.

## 20. Trail lines and selected geometry

**Context:** Places had points only; trails and parks needed outlines linked to places, with the selected one clearly on top (#38).

**Decision:** Layers stack basemap < park areas < trail lines < point clusters < selected geometry < selected pin. Areas use a 25% theme fill with a 1 px stroke and show from zoom 13; existing trails are 3 px solid in the theme colour; proposed trails are 2 px dashed `[6, 6]` at 60% opacity, and a missing `status` counts as existing. Only places that pass the theme and town filters are drawn, plus the selected place, whose lines get a 7 px white casing under a 4 px line (a proposed part dashed inside the casing) and whose areas get a stronger fill and 2 px stroke on their own top layer. Clicks keep `singleclick` and the 8 px tolerance, test only pins, lines and areas, and prefer pin, then line, then area. A selection fits the union extent of its geometry, else its `bbox`, else centres on the point, using the panel and sheet padding with maxZoom 17; it re-frames when the sheet or desktop panel changes, and refits once if the layers arrive after a bbox or point frame, unless the user has moved the map. A selection restored from a shared link that also has `map=` is never framed: the shared camera wins. A failed layer fetch shows a small retry note and leaves points, filters and selection working.

**Applies to:** `src/features/map/` (`layers.ts`, `geometryStyles.ts`, `picking.ts`, `framing.ts`, `MapView.tsx`), `PlaceCard.tsx`, #38.

## 21. Theme defaults and layer switches

**Context:** Every theme chip toggled everything in its theme, and there were no finer switches (#58).

**Decision:** A layer is one category, or one of two geometry layers: `proposed-trails` (dashed greenway segments) and `park-outlines` (park polygons). `THEME_DEFAULTS` (`src/features/themes/layerSelection.ts`) lists the layers on per theme: every category is on except `proposed-trails` (not built, so not walkable) and `fire-station` (off by default to keep the first view focused; it is shown with the "Community services" switch under Art & community, and a fire-station search turns it on); park outlines are on. Turning a theme chip on or off resets that theme's layers to its defaults. A "Layers" disclosure under the chips holds one `aria-pressed` 44 px switch per layer for active themes only; the app never needs it. The store keeps only overrides on top of the defaults, and `useFilteredPlaces` is the one selector for pins, geometry, list and search (the selected place keeps its own outline). Search applies the same selection and does not look into switched-off layers, except that a category search ("fire stations", "firehouse", "fire station in Cary") is an intent that switches the category's layer and theme on (the same way "parks in Apex" does), so it shows the stations; when that leaves nothing, the empty state names the layers that hold matches, with a "Show all layers" button. The URL stores the deviation as `layers=-id,id` (`-` off, bare id on, unknown ids and inactive themes dropped); a link with only `themes=` uses the defaults, and a change is a pushState.

**Applies to:** `src/features/themes/`, `useFilteredPlaces.ts`, `src/features/search/useLayerSearch.ts`, `src/lib/urlState.ts`, `src/app/useUrlSync.ts`, #58.

## 22. Privacy statement and licence gate

**Context:** The brief asks for attribution and reuse terms for every source, but says nothing about a privacy statement or about enforcing licences in the pipeline (#19). Both are project decisions.

**Decision:** The credits dialog (`?about=1`) carries a privacy statement that describes only what the code does today: no accounts, cookies or analytics, and browser storage only for saved place ids (decision 26); device location only when the visitor presses "Near me", kept in memory in the browser and never sent, stored or put in the link (#42); the app's own data files plus basemap tiles (the tile host sees the visitor's IP), and what the page address holds. It must be re-checked whenever logging (#16), a production basemap (#3) lands, or when location is used for anything beyond sorting and distance. The pipeline refuses to publish a source without a licence: the registry only allows enabled sources with `licenceStatus: "open"`, and `validateRelease` fails on a missing or blank `license`. The credits list is generated from the manifest and catalog, never hand-typed.

**Applies to:** `src/features/about/`, `pipeline/lib/snapshot-core.mjs`, `pipeline/lib/validate.mjs`, #19.

## 23. Size budgets checked in CI

**Context:** The brief asks to measure startup and search speed on real data and lower-powered phones (#20). Device measurements need a person; file sizes can be checked on every change.

**Decision:** `pipeline/budgets.json` sets gzipped limits (initial data 256 KB, catalog 200 KB, each layer 150 KB, each place file 4 KB, manifest 4 KB, largest JS chunk about 1.25× its size when set). `npm run check:budgets` resolves files through the manifest and runs in CI after the build; going over fails the build. Budgets are raised only on purpose, with a note in `docs/performance.md`; dense geometry that misses its budget is simplified or moved to PMTiles rather than given a bigger budget. Phone measurements stay a human test in #20.

**Applies to:** `pipeline/budgets.json`, `pipeline/scripts/check-budgets.mjs`, `.github/workflows/ci.yml`, `docs/performance.md`, #20.

## 24. Regional trails from Wake County greenways

**Context:** Town trail layers have unclear licences, Chatham and Durham terms are pending, and `maps.wake.gov` times out from our build network (#67).

**Decision:** Trails outside Cary come only from Wake County's "Greenways in Wake County" (CC BY 4.0), fetched through the `arcgis-hub` source type: it downloads the public ArcGIS Hub export, refuses to run unless the Hub licence equals the registry licence, and fails unless the export count equals the live record count (a fresh export is requested, because the cached download is stale). Cary-owned and private segments are dropped (Cary's own data wins inside Cary), segments are grouped into places by trail name, unnamed segments and named trails under 0.5 mi are not shown, and a trail with the same name as an existing place within 1 km is skipped. Lines are `status: "existing"` and simplified to 5 m to stay inside the greenways layer budget. Regional trail places get `pavedSurface` from `TRAIL_SURFACE` (paved values give "Paved (...)", natural ones "Unpaved (natural surface)", a mix "Paved on some segments"; blank and "Other" stay unknown) and `wheelchair` only when `ACCESSIBILITY_STATUS` says "Accessible" (all segments, or "on some segments"), never from the surface; "Not accessible", "Not evaluated" and blanks stay unknown. A known unpaved surface shows on the card but does not count as the "Paved" amenity.

**Applies to:** `pipeline/lib/fetch-hub.mjs`, `pipeline/scripts/build-catalog.mjs`, `pipeline/sources.config.json`, `docs/source-matrix.md`, #67.

## 25. Amenity filters on verified fields

**Context:** People want to find places with restrooms, parking and similar, but the visit fields are mostly unknown (#84, decision 18).

**Decision:** An "Amenities" disclosure next to "Layers" offers one `aria-pressed` switch per amenity that some loaded place has. Several selected amenities combine with AND, and the filter runs inside `useFilteredPlaces` and the search selection, so pins, geometry, list and search agree. Unknown is never "no": a place without the key is simply not shown while the filter is on, and the UI says so. The URL stores `amenities=restrooms,parking` in fixed order (unknown values dropped, a change is a pushState). The data is the catalog's optional `amenities` list, derived by the pipeline from the same known visit fields (decision 18); the app never reads the per-place files to filter. Partial values ("on some segments", "Mostly paved") show on the card but do not match a filter; only fully confirmed values do.

**Applies to:** `src/features/places/amenities.ts`, `AmenityFilters.tsx`, `useFilteredPlaces.ts`, `src/lib/urlState.ts`, #84.

## 26. Search by simple intent

**Context:** People type "parks in Apex" or "trails near Bond Park" and expect a filter, not a fuzzy name match (#59).

**Decision:** `parseIntent` (`src/features/search/intent.ts`) accepts only `<category> in <town>` and `<category> near [this|the] [park|trail|greenway] <place>`, ignoring case and punctuation. Categories are singular or plural (greenways are trails); amenities such as playgrounds are not categories. A town is a known label or slug ("unincorporated" counts); a place needs an exact name or alias match from the search index and must be unique, so near-misses and duplicates give null. A match appears as the first suggestion row; anything else falls through to plain name search unchanged. "In town" sets the town, makes the requested categories' themes the only active themes and switches the other category layers in them off, all through the existing setters (so chips, Layers panel and URL show it) and shows "Showing parks in Apex" with Undo. "Near" lists precomputed relationships of that category (contained, nearby, nearest) with their labels and the note "Near = within 400 m in a straight line, or the closest place within 2 km"; no geometry is computed in the browser, and an empty result says so. No AI and no guessing from proximity alone.

**Applies to:** `src/features/search/`, #59.

## 27. Favorites and collections

**Context:** The brief asks for device-local favorites and a few curated collections (#45), and decision 22 said the app stores nothing in the browser.

**Decision:** Favorites are place ids only, in localStorage under `cary-explorer:favorites:v1`; every storage call is wrapped, and when storage is blocked the list stays in memory with a visible note. Ids missing from the catalog are skipped when shown and pruned on the next save. Collections are an optional release artifact `collections.<hash>.json` (`{ collections: [{ id, title, summary, placeIds, curation }] }`, 8 KB gz budget) built by `pipeline/lib/collections.mjs` from rules over existing data, each stating its rule in `curation`; the release gate rejects unknown place ids, duplicate or empty ids and missing titles. Shipped: "A short visit with a restroom nearby" (parks with restrooms and entrances both known, core first, max 12) and "Paved trails". History, creek, public art and birding collections stay pending (`docs/collections.md`); none is built around sensitive wildlife locations. While a collection is open (`collection=<id>`, pushState, unknown id ignored) the map and list show only its places; missing places are dropped. The privacy text now says saved ids stay in this browser.

**Applies to:** `src/features/favorites/`, `src/features/collections/`, `pipeline/lib/collections.mjs`, `src/lib/urlState.ts`, `PrivacyNotice.tsx`, #45.

## 28. Watersheds from USGS WBD

**Context:** "Which watershed am I in?" (#22) needs open watershed polygons for Wake County and the buffer.

**Decision:** The USGS Watershed Boundary Dataset HUC-12 layer (`hydro.nationalmap.gov/arcgis/rest/services/wbd/MapServer/6`, snapshot `pipeline/sources/usgs/wbd-huc12/`, with HUC-8 and HUC-6 name tables) supplies the units. The service says "None. All data are open and non-proprietary", and we credit USGS as it asks. WBD is no longer maintained and 3DHP is its successor; we use WBD because it has a ready HUC-12 layer on a REST service we could snapshot with a count check, and we did not evaluate 3DHP's coverage (re-check in a refresh). Each HUC-12 that touches the nearby area and has ground in Wake, Chatham or Durham becomes a `water` place ("<name> watershed", pin inside the counties so it keeps a county and town), drawn from `layers/water` (25 m simplified, shown with the Water category switch, not park outlines). Each park and trail gets a `contained` relationship with `basis: 'watershed'` from its centroid; a park whose sample points put at least 10% in a second watershed lists both and the card says it sits on a divide. Copy states membership only: no flow, downstream, drinking-water or utility claims (#28).

**Applies to:** `pipeline/lib/watersheds.mjs`, `pipeline/scripts/build-catalog.mjs`, `src/features/places/relationships.ts`, `src/features/map/layers.ts`, #22.

## 29. Data accuracy rules (audit)

**Decision:** A trail "runs through" a park (`contained`) only when at least 100 m of its length lies inside the park polygon (segments with both ends inside, plus the inside part of a segment that crosses the edge); below that the pair stays `nearby`. A trail links every watershed holding at least 15% of its length, or a single one when it holds 80% or more; trails with several carry `share` on each link and the card says "Passes through the X watershed" (parks are unchanged). Collections are titled by their data rule: "Parks with restrooms and mapped entrances" and "Paved trails" state the top 12 of N, and paved trails rank by the build's trail length, longest first. The unused Natural Surface Trails snapshot and the regional samples were removed.

**Applies to:** `pipeline/lib/relationships.mjs`, `pipeline/lib/watersheds.mjs`, `pipeline/lib/collections.mjs`, `src/features/places/relationships.ts`, `docs/collections.md`.

## 30. Coordinate search

**Context:** People paste coordinates from a map or a sign (#17). Address search needs a geocoder, and the provider choice waits on the owner and hosting (#17, #16, #3), so it is not built and no provider is called.

**Decision:** `parseCoordinates` (`src/features/search/coordinates.ts`) reads lat, lon locally: decimals (`35.79, -78.78`), hemisphere letters before or after (`35.79N 78.78W`), degrees-minutes-seconds and degrees-decimal-minutes. It returns null when unsure: out-of-range values, a sign next to a letter, bare integers without a comma, and anything with extra words. It swaps order only when the first number cannot be a latitude (over 90) and the second can. A match is the first suggestion row, "Go to 35.79000, -78.78000"; choosing it moves the map there at zoom 16 through `cameraRequest` and drops a temporary pin (`droppedPin` in the store, its own non-pickable layer, never a place), cleared by Clear, Escape on an empty search, or selecting a place. A line shows "Showing a point at …", the 3 nearest catalog places by straight line, and, outside roughly lat 35.4–36.2, lon −79.2 to −78.2, "This point is outside the area this guide covers." No network request is made, and the coordinates get no URL parameter: the camera `map=` parameter already records the position.

**Applies to:** `src/features/search/`, `src/features/map/MapView.tsx`, #17.

## 31. Creeks from USGS hydrography

**Context:** Creek cards, "trails near <creek>" and the creek-to-watershed link (#22, #59) need named creek places.

**Decision:** Named stream channels (`featuretypelabel = 'Channel Line'`, GNIS name present) from the USGS 3DHP flowline service (`3DHP_all/MapServer/50`; it holds the same 31,797 flowlines and 6,051 named ones in our box as the legacy NHD layer 6, and is the maintained successor; its text says "Use Constraints: None. All data are open and non-proprietary") are snapshotted to `pipeline/sources/usgs/3dhp-streams/` (4,231 channels). Segments are clipped to the nearby area, grouped by GNIS id and name, and chained when end points are within 200 m, so far-apart streams of one name stay separate (a lake or long gap also splits one stream into two places of the same name). Clusters under about one mile in the area are dropped; the rest become `water` places ("Stream, about N miles in this area (USGS hydrography)": length only, no flow or quality claim), pinned at the middle of the longest piece, with 12 m simplified lines in `layers/water`. Links: creek to watershed uses the 15% / 80% length rule (decision 29); a trail "follows" a creek (`nearby`, basis `along`, `alongM`) when at least 300 m of it lies within 50 m of the creek line; a creek is `contained` in a park when at least 100 m lies inside. The place card shows at most one watershed line plus "and N more watersheds", so nearby places keep the other slots.

**Applies to:** `pipeline/lib/creeks.mjs`, `pipeline/scripts/build-catalog.mjs`, `src/features/places/relationships.ts`, `ConnectedPlaces.tsx`, #22.

## 32. Fire stations from Wake County GIS

**Context:** Fire stations are a Community services layer (#27). Cary's own fire layer has no licence; Wake County's "FireStations" item (`e4a6be505f644561865753e7f7caa112`) states CC BY 4.0 in `licenseInfo`.

**Decision:** The 89 Wake stations in core or nearby become `fire-station` places (source `wake-fire-stations`, monthly, "Wake County GIS (CC BY 4.0)"), one per `STATIONID` (`ID` has duplicates), id `wake-fire-<stationid>`, town by Census point-in-polygon. The name comes from `LABEL`: "Cary #1" becomes "Cary Fire Station 1" (and stationNumber 1), "RFD #5" becomes "Raleigh Fire Station 5", a label with no number gets " Fire Station" added ("Hopkins Fire Station") and is never numbered. `department` is set only from AGENCY `CF` ("Cary Fire Department") and `RF` ("Raleigh Fire Department"); `FD` stays without one. The card says operator and address; the address is the only known visit field (its "last verified" date is the snapshot date, shown like other sources), and no service area or response time is claimed (#51). `website` (the place `url`, shown as "Website") is set for Raleigh stations only: `https://raleighnc.gov/fire` answered HTTP 200 on 2026-11-10. `carync.gov` answered HTTP 403 to every plain request that day, so no Cary page was confirmed and Cary stations have no website. No official "which station serves my address" page from the Town of Cary or Wake County was found (only parcel records and a GIS insurance-district layer), so no locator link is shown and no card says what area a station serves. Every fire-station card shows "Not for emergencies. In an emergency, call 911." Stations are not relationship items for the park/trail rules. Instead each park (Cary and Wake) gets ONE `nearby` link, basis `nearest`, to its closest station within 2,000 m, with an integer straight-line `distanceM` (closest park vertex to the station point, 0 if inside); the park card reads "Nearest fire station · N mi straight-line" in its own Connected slot, and the station card lists such parks back as "Nearby park · N mi straight-line". It is distance only, never "serves", "covers" or response time. They stay off by default (decision 21) and show under Layers.

**Applies to:** `pipeline/scripts/build-catalog.mjs`, `pipeline/lib/visit.mjs`, `pipeline/sources.config.json`, `docs/source-matrix.md`, #27.

## Spike outcomes

Each spike issue adds its outcome here when it closes.

- #1 Confirm scope and priorities with the author: pending, add when the issue closes.
- #2 Review Wander Wake County and define what we do differently: pending, add when the issue closes.
- #3 Choose a production basemap and hosting: pending, add when the issue closes.
- #4 Define geographic scope rules: done. Core = Wake ∪ full Cary limits; 5 mi buffer (cap 10 mi) in EPSG:32119; crossing features kept up to 5 km past the buffer; town filters default to the full limit with coverage labels. See [scope.md](scope.md).
- #5 Check eBird API terms, limits and place matching: done, with open owner questions (API key holder, non-commercial use, public snapshot). Prototype snapshot is minimal (id, name, location, link). See [ebird.md](ebird.md).
- #6 Snapshot and inspect the first data sources: done. Cary parks and greenways are CC0 and snapshotted; parcels must be dissolved into parks; Wake has an entrances layer; Chatham data stays out of git until its terms are confirmed. See [sources.md](sources.md).
