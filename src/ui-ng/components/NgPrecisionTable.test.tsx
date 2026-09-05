// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { ngCol, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'

type Row = { readonly id: string; readonly name: string; readonly score: number }

const columns = [
  ngCol<Row>('name', 'Name', (row) => row.name, { value: (row) => row.name }),
  ngCol<Row>('score', 'Score', (row) => row.score, { numeric: true, value: (row) => row.score }),
]
const rows: readonly Row[] = [
  { id: 'a', name: 'Ada', score: 3 },
  { id: 'b', name: 'Bea', score: 1 },
]

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe('NgPrecisionTable', () => {
  it('exposes canonical resize handles and draggable headers', () => {
    render(<NgPrecisionTable className="ng-canon__table" columns={columns} gridId="ng-test-canon" rows={rows} />)

    const grid = document.querySelector('.bdm-data-grid--ng.ng-precision-grid.ng-canon__table')
    expect(grid).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Name/ }).closest('th')).toHaveAttribute('draggable', 'true')
    expect(screen.getByLabelText('Resize Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Resize Score')).toBeInTheDocument()
  })

  it('keeps headers in a real table so they share columns with the body', () => {
    render(<NgPrecisionTable columns={columns} gridId="ng-test-table-semantics" rows={rows} />)

    const table = document.querySelector('.ng-precision-grid table')
    const headers = table?.querySelectorAll('thead th')
    const firstRowCells = table?.querySelectorAll('tbody tr:first-child td')
    expect(table?.querySelector('thead')).toBeInTheDocument()
    expect(table?.querySelector('tbody')).toBeInTheDocument()
    expect(headers?.length).toBe(columns.length)
    expect(firstRowCells?.length).toBe(columns.length)
    expect(screen.getByRole('columnheader', { name: /Name/ })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Score/ })).toBeInTheDocument()
  })

  it('sorts from the header and opens the column context menu', () => {
    render(<NgPrecisionTable columns={columns} gridId="ng-test-sort" rows={rows} />)

    fireEvent.click(screen.getByRole('button', { name: /Name/ }))
    const firstCell = document.querySelector('tbody tr td')
    expect(firstCell?.textContent).toBe('Ada')

    fireEvent.click(screen.getByRole('button', { name: /Score/ }))
    expect(document.querySelector('tbody tr td')?.textContent).toBe('Bea')

    const scoreHeader = screen.getByRole('button', { name: /Score/ }).closest('th')
    fireEvent.contextMenu(scoreHeader!)
    expect(screen.getByRole('button', { name: 'Sort ascending' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset width' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Customise view' })).toBeInTheDocument()
  })
})
