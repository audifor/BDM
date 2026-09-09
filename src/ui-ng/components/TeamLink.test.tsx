// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import type { TeamId } from '@/domain/ids'
import { TeamLink } from '@/ui-ng/components/TeamLink'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'

afterEach(cleanup)

beforeEach(() => {
  window.history.replaceState({}, '', '/?ui=ng&app=home')
})

function currentSearchParams() {
  return new URL(window.location.href).searchParams
}

const LEYMA = 'team:leyma' as TeamId
const PORTLAND = 'team:portland' as TeamId

describe('TeamLink', () => {
  it('opens the canonical Team dossier carrying only the teamId', () => {
    render(
      <NgWorkspaceNavigationProvider>
        <TeamLink teamId={LEYMA}>Leyma</TeamLink>
      </NgWorkspaceNavigationProvider>,
    )

    const link = screen.getByRole('button', { name: 'Leyma' })
    expect(link).toBeInTheDocument()
    expect(link).toHaveClass('team-entity-link')

    fireEvent.click(link)
    expect(currentSearchParams().get('app')).toBe('team')
    expect(currentSearchParams().get('teamId')).toBe(LEYMA)
  })

  it('uses the requested section through the same navigation mechanism', () => {
    render(
      <NgWorkspaceNavigationProvider>
        <TeamLink section="squad" teamId={PORTLAND}>
          Portland
        </TeamLink>
      </NgWorkspaceNavigationProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Portland' }))
    expect(currentSearchParams().get('app')).toBe('roster')
    expect(currentSearchParams().get('teamId')).toBe(PORTLAND)
  })

  it('navigates from a list row to the right team detail', () => {
    render(
      <NgWorkspaceNavigationProvider>
        <ul>
          <li>
            <TeamLink teamId={LEYMA}>Leyma</TeamLink>
          </li>
          <li>
            <TeamLink teamId={PORTLAND}>Portland</TeamLink>
          </li>
        </ul>
      </NgWorkspaceNavigationProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Portland' }))
    expect(currentSearchParams().get('app')).toBe('team')
    expect(currentSearchParams().get('teamId')).toBe(PORTLAND)
    expect(screen.getByRole('button', { name: 'Leyma' })).toBeInTheDocument()
  })
})
