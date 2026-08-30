// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { BDMDataGrid } from './BDMDataGrid'
import { loadGridPreferences } from './persistence'
import type { DataGridColumn, DataGridView } from './types'

type Row = { readonly id: string; readonly name: string; readonly score: number; readonly group: string }

const columns: readonly DataGridColumn<Row>[] = [
  { id: 'name', label: 'Name', required: true, value: (row) => row.name, render: (row) => row.name },
  { id: 'score', label: 'Score', value: (row) => row.score, render: (row) => row.score },
  { id: 'group', label: 'Group', value: (row) => row.group, render: (row) => row.group },
]
const rows: readonly Row[] = [{ id: 'a', name: 'Ada', score: 3, group: 'A' }]
const views: readonly DataGridView[] = [{ id: 'default', name: 'Default', columnIds: ['name', 'score', 'group'] }]

afterEach(cleanup)
afterEach(() => window.localStorage.clear())

describe('BDMDataGrid / custom view visibility persistence', () => {
  it('hiding a column, saving a custom view, changing config, and reapplying the view keeps the column hidden', () => {
    vi.spyOn(window, 'prompt').mockReturnValue('My view')
    const gridId = 'test-grid-1'

    render(createElement(BDMDataGrid<Row>, { columns, gridId, rows, views }))

    // Hide the optional "score" column via the column manager.
    fireEvent.click(screen.getByRole('button', { name: 'Customise columns' }))
    const scoreCheckbox = screen.getByRole('checkbox', { name: 'Score' })
    fireEvent.click(scoreCheckbox)
    expect(screen.queryByRole('columnheader', { name: /Score/ })).not.toBeInTheDocument()

    // Save a custom view from the current (Score-hidden) configuration.
    fireEvent.click(screen.getByRole('button', { name: 'Save view' }))

    // Change configuration: switch back to the system view, which restores Score.
    fireEvent.change(screen.getByLabelText('View'), { target: { value: 'default' } })
    expect(screen.getByRole('columnheader', { name: /Score/ })).toBeInTheDocument()

    // Reapply the saved custom view - the hidden column must remain hidden.
    fireEvent.change(screen.getByLabelText('View'), { target: { value: screen.getByText('My view').closest('option')!.getAttribute('value')! } })
    expect(screen.queryByRole('columnheader', { name: /Score/ })).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Name/ })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Group/ })).toBeInTheDocument()
  })

  it('persists the visible (non-hidden) column set to localStorage, not the raw hidden-inclusive order', () => {
    vi.spyOn(window, 'prompt').mockReturnValue('My view')
    const gridId = 'test-grid-2'

    render(createElement(BDMDataGrid<Row>, { columns, gridId, rows, views }))
    fireEvent.click(screen.getByRole('button', { name: 'Customise columns' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Score' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save view' }))

    const stored = loadGridPreferences(gridId)!
    const savedView = stored.customViews.find((view) => view.name === 'My view')!
    expect(savedView.columnIds).not.toContain('score')
    expect(savedView.columnIds).toEqual(['name', 'group'])
  })
})
