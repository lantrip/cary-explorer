import { describe, expect, it } from 'vitest'
import { checkBudgets } from '../pipeline/scripts/check-budgets.mjs'

describe('size budgets', () => {
  it('keeps every published artifact within pipeline/budgets.json', () => {
    // distDir points at a missing folder so the test does not depend on a build.
    const { rows, over } = checkBudgets({ distDir: '/nonexistent-dist' })
    expect(rows.length).toBeGreaterThan(4)
    expect(over, JSON.stringify(over)).toEqual([])
  })

  it('flags an artifact that exceeds a budget', () => {
    const { over } = checkBudgets({
      distDir: '/nonexistent-dist',
      budgets: { manifest: 1, catalog: 1, relationships: 1, layer: 1, place: 1, initialData: 1, jsBundle: 1 },
    })
    expect(over.length).toBeGreaterThan(0)
  })
})
