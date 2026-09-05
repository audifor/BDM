import type { ReactNode } from 'react'

import { BDMDataGrid } from '@/ui/dataGrid/BDMDataGrid'
import type { DataGridColumn } from '@/ui/dataGrid/types'
import type { EntityRef } from '@/app/entityActions/EntityRef'

export type NgPrecisionTableProps<Row extends { readonly id: string }> = {
  readonly gridId: string
  readonly columns: readonly DataGridColumn<Row>[]
  readonly rows: readonly Row[]
  readonly className?: string
  readonly emptyTitle?: string
  readonly emptyDescription?: string
  readonly multiSelect?: boolean
  readonly selectedId?: string
  readonly selectedIds?: readonly string[]
  readonly searchQuery?: string
  readonly onSearchQueryChange?: (query: string) => void
  readonly onRowClick?: (row: Row) => void
  readonly onSelectionChange?: (ids: readonly string[]) => void
  readonly entityForRow?: (row: Row) => EntityRef
  readonly entitySurface?: 'roster' | 'training' | 'tactics' | 'matchups'
}

export function ngCol<Row extends { readonly id: string }>(
  id: string,
  label: string,
  render: (row: Row) => ReactNode,
  extra: Partial<Omit<DataGridColumn<Row>, 'id' | 'label' | 'render'>> = {},
): DataGridColumn<Row> {
  return {
    sortable: true,
    searchable: extra.value !== undefined,
    resizable: true,
    ...extra,
    id,
    label,
    render,
  }
}

/** Bind column Row inference to the same rows expression passed to NgPrecisionTable. */
export function ngTableColumns<Row extends { readonly id: string }>(
  _rows: readonly Row[],
  columns: readonly DataGridColumn<NoInfer<Row>>[],
): readonly DataGridColumn<Row>[] {
  return columns
}

export function NgPrecisionTable<Row extends { readonly id: string }>({
  gridId,
  columns,
  rows,
  className,
  emptyTitle,
  emptyDescription,
  multiSelect,
  selectedId,
  selectedIds,
  searchQuery,
  onSearchQueryChange,
  onRowClick,
  onSelectionChange,
  entityForRow,
  entitySurface,
}: NgPrecisionTableProps<Row>) {
  return (
    <BDMDataGrid
      className={className}
      columns={columns}
      emptyDescription={emptyDescription}
      emptyTitle={emptyTitle}
      entityForRow={entityForRow}
      entitySurface={entitySurface}
      gridId={gridId}
      multiSelect={multiSelect}
      onRowClick={onRowClick}
      onSearchQueryChange={onSearchQueryChange}
      onSelectionChange={onSelectionChange}
      presentation="default"
      rows={rows}
      searchQuery={searchQuery}
      selectedId={selectedId}
      selectedIds={selectedIds}
      visualMode="ng"
    />
  )
}
