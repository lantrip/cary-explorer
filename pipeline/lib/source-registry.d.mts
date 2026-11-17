export const COVERAGE: Record<string, string>
export function sourceRegistryFields(
  id: string,
  meta: { attribution?: unknown; sourceModified?: unknown } | undefined,
): { attribution: string; sourceModified?: string; coverage: string }
