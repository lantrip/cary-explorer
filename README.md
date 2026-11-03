# cary-explorer

A public, mobile-friendly map "field guide" for Cary and Wake County, NC, covering parks, trails, birds, water and history. The data is static GeoJSON produced by an offline pipeline; there is no backend or database.

## Stack

- React + TypeScript + Vite
- OpenLayers (map)
- Tailwind CSS v4
- Zustand (state)
- Fuse.js (search)

## Folder map

```
src/
  app/                 App shell and responsive layout (map, side panel, bottom sheet)
  features/
    map/               OpenLayers map component
    search/            Search box and Fuse.js index
    places/            Place detail panel
    themes/            Theme catalogue
  store/               Zustand stores
  types/               Shared types (Place, Source)
  lib/                 Shared helpers
public/data/           Static GeoJSON served with the app
pipeline/              Data pipeline (planned; see pipeline/README.md)
docs/                  Technical notes (project brief is in an external doc)
```

## Development

```bash
npm install
npm run dev     # start the dev server
npm run build   # type-check and produce a production build in dist/
npm run lint    # run oxlint
```

Copy `.env.example` to `.env` for any server-side keys. Never expose them to the browser.

## Deployment

The `lantrip/cary-explorer` fork deploys to https://cary.lant.rip behind Keycloak.
Run `scripts/sync-upstream.sh` to merge upstream changes, push `dev`, then run
`scripts/release.sh vX.Y.Z` to publish a release. GitHub Actions builds a private
GHCR image; Flux updates k3s. See [the deployment runbook](docs/deployment.md) for
setup, access, monitoring, validation, and rollback.
