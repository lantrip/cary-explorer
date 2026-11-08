export function fetchHub(
  source: { id: string; hubItemId?: string; hubLayer?: number; licence: string; where?: string },
  deps?: { fetch?: typeof fetch; sleep?: (ms: number) => Promise<void> },
): Promise<{ features: any[]; expectedCount: number; sourceModified: string | null; idField: string }>
