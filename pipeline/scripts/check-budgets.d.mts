export interface Budgets {
  manifest: number
  catalog: number
  relationships: number
  layer: number
  place: number
  initialData: number
  jsBundle: number
}
export interface BudgetRow {
  file: string
  gz: number
  limit: number
  ok: boolean
}
export function checkBudgets(opts?: { dataDir?: string; distDir?: string; budgets?: Budgets }): { rows: BudgetRow[]; over: BudgetRow[] }
export function formatTable(rows: BudgetRow[]): string
