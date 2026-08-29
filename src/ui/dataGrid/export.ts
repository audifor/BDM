import type { DataGridColumn } from './types'
const csv = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
export function exportGridCsv<Row>(columns: readonly DataGridColumn<Row>[], rows: readonly Row[]) { return [columns.map((column) => csv(column.label)).join(','), ...rows.map((row) => columns.map((column) => csv((column.exportValue ?? column.value)?.(row) ?? '')).join(','))].join('\n') }
