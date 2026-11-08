// One shared `build({ write: false })` per test file. Vitest isolates modules per file, so the build runs
// once for each file that needs it instead of once per describe/it. Callers must treat the result as read-only.
import { build } from '../../pipeline/scripts/build-catalog.mjs'

let cached: ReturnType<typeof build> | undefined

export function builtCatalog(): ReturnType<typeof build> {
  cached ??= build({ write: false })
  return cached
}
