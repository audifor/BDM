import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { AppFrame, AppHeader, DataTable, dataTableGridTemplate, SplitWorkspace, type DataColumn } from './AppFramework'

describe('OS 3.0 application framework', () => {
  it('renders fixed application chrome with a selectable dense table', () => {
    const table = createElement(DataTable<{ id: string; name: string; value: number }>, { columns: [{ id: 'name', label: 'NAME', render: (row) => row.name }, { id: 'value', label: 'VALUE', numeric: true, render: (row) => row.value }], rows: [{ id: 'one', name: 'One', value: 12 }], selectedId: 'one' })
    const workspace = createElement(SplitWorkspace, { inspector: 'details', children: table })
    const markup = renderToStaticMarkup(createElement(AppFrame, { header: createElement(AppHeader, { eyebrow: 'TEST', title: 'Workspace' }), toolbar: 'filters', children: workspace }))
    expect(markup).toContain('bdm-app-frame')
    expect(markup).toContain('bdm-data-table')
    expect(markup).toContain('is-selected')
    expect(markup).toContain('is-numeric')
  })

  it('derives fixed, minimum, and weighted flexible tracks from column declarations', () => {
    const columns: readonly DataColumn<{ id: string }>[] = [
      { id: 'position', label: 'POS', width: 48, render: () => 'PG' },
      { id: 'player', label: 'PLAYER', minWidth: 150, flex: 2, render: () => 'Player' },
      { id: 'status', label: 'STATUS', minWidth: 100, flex: 1, render: () => 'Available' },
      { id: 'salary', label: 'SALARY', minWidth: 76, render: () => '1.00M' },
    ]

    expect(dataTableGridTemplate(columns)).toBe('48px minmax(150px, 2fr) minmax(100px, 1fr) minmax(76px, auto)')
  })

  it('keeps automatic columns compatible when sizing metadata is absent', () => {
    const columns: readonly DataColumn<{ id: string }>[] = [{ id: 'name', label: 'NAME', render: () => 'One' }]
    const markup = renderToStaticMarkup(createElement(DataTable, { columns, rows: [{ id: 'one' }] }))
    expect(dataTableGridTemplate(columns)).toBe('minmax(0, auto)')
    expect(markup).toContain('--bdm-data-table-columns:minmax(0, auto)')
  })
})
