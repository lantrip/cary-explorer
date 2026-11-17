import type { Position } from './geo.mjs'
export interface Library {
  code: string
  name: string
  aliases: string[]
  address?: string
  hours?: string
  description: string
  pt: Position
}
export function libraryHours(p?: Record<string, unknown>): string | undefined
export function libraryDescription(type: unknown): string
export function groupLibraries(features: { properties?: Record<string, unknown> | null; geometry?: { coordinates?: unknown } | null }[]): { libraries: Library[]; skipped: number }
