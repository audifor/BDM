// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { WorkspaceErrorBoundary } from '@/ui-ng/workspace/WorkspaceErrorBoundary'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

function BrokenApp(): never { throw new Error('Missing Team finances for fixture') }

describe('Courtside error containment', () => {
  it('shows a recoverable application error instead of blanking the BDM desktop', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const goHome = vi.fn()
    render(<WorkspaceErrorBoundary app="Mercado" onReturnHome={goHome}><BrokenApp /></WorkspaceErrorBoundary>)
    expect(screen.getByRole('alert')).toHaveTextContent('No se ha podido abrir Mercado')
    expect(screen.getByRole('alert')).toHaveTextContent('Missing Team finances for fixture')
    fireEvent.click(screen.getByRole('button', { name: 'Volver a Inicio' }))
    expect(goHome).toHaveBeenCalledOnce()
  })
})
