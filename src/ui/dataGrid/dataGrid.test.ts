import { describe, expect, it } from 'vitest'
import { normalizeColumns, reorderColumn } from './columns'
import { exportGridCsv } from './export'
import { filterRows, searchRows } from './filtering'
import { selectRow } from './selection'
import { cycleSort, sortRows } from './sorting'
import type { DataGridColumn } from './types'
type Row = { readonly id: string; readonly name: string; readonly score: number; readonly group: string }
const columns: readonly DataGridColumn<Row>[] = [{ id: 'name', label: 'Name', searchable: true, value: (row) => row.name, render: (row) => row.name }, { id: 'score', label: 'Score', value: (row) => row.score, render: (row) => row.score }, { id: 'group', label: 'Group', value: (row) => row.group, render: (row) => row.group }]
const rows: readonly Row[] = [{ id: 'a', name: 'Ada', score: 3, group: 'A' }, { id: 'b', name: 'Bea', score: 1, group: 'B' }, { id: 'c', name: 'Cia', score: 2, group: 'A' }]
describe('BDMDataGrid core', () => {
  it('normalizes new and removed columns while preserving order and visibility', () => expect(normalizeColumns(columns, ['score', 'missing'], ['group']).map((column) => column.id)).toEqual(['score', 'name']))
  it('reorders on both sides of a drop target', () => { expect(reorderColumn(['a', 'b', 'c', 'd'], 'c', 'a', false)).toEqual(['c', 'a', 'b', 'd']); expect(reorderColumn(['c', 'a', 'b', 'd'], 'c', 'd', true)).toEqual(['a', 'b', 'd', 'c']) })
  it('cycles and composes sorting deterministically', () => { expect(cycleSort([], 'group')).toEqual([{ id: 'group', direction: 'ascending' }]); expect(sortRows(rows, columns, [{ id: 'group', direction: 'ascending' }, { id: 'score', direction: 'descending' }]).map((row) => row.id)).toEqual(['a', 'c', 'b']) })
  it('searches declared columns and filters values', () => { expect(searchRows(rows, columns, 'a')).toHaveLength(3); expect(filterRows(rows, columns, [{ columnId: 'score', operator: 'between', value: 2, secondValue: 3 }]).map((row) => row.id)).toEqual(['a', 'c']) })
  it('ranges over visible rows and exports values', () => { expect(selectRow({ selectedIds: ['c'], anchorId: 'c', focusedId: 'c' }, ['a', 'c', 'e', 'g'], 'g', false, true).selectedIds).toEqual(['c', 'e', 'g']); expect(exportGridCsv(columns, rows.slice(0, 1))).toBe('"Name","Score","Group"\n"Ada","3","A"') })
})
