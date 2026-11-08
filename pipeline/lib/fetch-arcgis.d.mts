export function fetchArcgis(
  source: { url: string; fields?: string[]; where?: string; bbox?: number[]; geometry?: boolean; geometryPrecision?: number },
  deps?: { fetch?: typeof fetch },
): Promise<{ features: any[]; expectedCount: number; sourceModified: string | null; idField: string }>
