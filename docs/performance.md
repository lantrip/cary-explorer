# Performance

## Targets

- Map usable in under 3 s on a mid-range Android phone with Fast 3G-class throttling.
- Search results in under 100 ms per keystroke with the full catalog.
- Initial data (manifest + catalog + relationships) at most 256 KB gzipped, about 2 s on a roughly 1 Mbps phone connection.

## Budgets

Limits are gzipped bytes in `pipeline/budgets.json`. `npm run check:budgets` enforces them (CI runs it after the build; `tests/budgets.test.ts` checks the real data).

| Item | Limit | Measured now |
|------|-------|--------------|
| manifest.json | 4,096 | 438 |
| catalog | 204,800 | 15,860 |
| relationships | 51,200 | 4,964 |
| each layer | 153,600 | greenways 66,692; parks 41,485 |
| each place file | 4,096 | largest 457 (of 363) |
| initial data | 262,144 | 21,262 |
| largest JS bundle | 237,568 | 189,293 (set to measured size x 1.25, rounded up to the next KB) |

PMTiles is not needed while the layers meet these budgets. Revisit if a layer goes over its limit.

## Measuring on real phones

Run a production build (`npm run build && npm run preview`, or the deployed site) and test with a cold cache.

- Android (Chrome): enable USB debugging, open `chrome://inspect` on the desktop, inspect the page, then in DevTools Network select a Fast 3G preset and CPU 4x slowdown. Record time until the map shows places and tap response, and time per keystroke in search from the Performance panel.
- iPhone (Safari): enable Web Inspector in Settings > Safari > Advanced, connect to a Mac, open Safari > Develop > the device. Use the Network Link Conditioner (or a throttled Wi-Fi) for Fast 3G-class speed, and read timings from the Timelines tab.

| Device | Map usable (target < 3 s) | Search per keystroke (target < 100 ms) |
|--------|---------------------------|----------------------------------------|
| Mid-range Android | pending human test | pending human test |
| iPhone | pending human test | pending human test |

## Hosting cache rules

Published data is content-hashed, so caching is simple (`docs/decisions.md` #19):

- `manifest.json`: `Cache-Control: no-cache`
- Every hashed file (`catalog.*.json`, `relationships.*.json`, `layers/*`, `places/<hash>/*`, and Vite's `assets/*`): `Cache-Control: public, max-age=31536000, immutable`
