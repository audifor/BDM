// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MATCH_SHOT_ZONE_IDS } from '@/domain/stats/MatchStatLog'
import type { PerformanceShotProfileModel } from '../data/buildPlayerPerformanceModel'
import { PerformanceNineZoneCourt } from './PerformanceNineZoneCourt'

const fixture = (kind: 'OBSERVED' | 'MODELLED' = 'OBSERVED'): PerformanceShotProfileModel => ({
  zones: [], totalAttempts: 3, note: kind === 'OBSERVED'
    ? 'Observed zone events, no physical shot coordinates.' : 'Provisional modelled nine-zone distribution.',
  detailedProvenance: kind,
  detailedZones: MATCH_SHOT_ZONE_IDS.map((id) => ({
    id, label: id === 'CORNER_THREE' ? 'Corner 3' : id,
    made: id === 'CORNER_THREE' ? 1 : 0,
    attempted: id === 'CORNER_THREE' ? 2 : id === 'RIM' ? 1 : 0,
    points: id === 'CORNER_THREE' ? 3 : 0,
    share: id === 'CORNER_THREE' ? 67 : id === 'RIM' ? 33 : 0,
    percentage: id === 'CORNER_THREE' ? '50.0' : id === 'RIM' ? '0.0' : null,
  })),
})

describe('PLAYER PERFORMANCE nine-zone court', () => {
  it('exposes nine selectable true engine zones with accurate made/attempt totals', () => {
    render(<PerformanceNineZoneCourt profile={fixture()} />)
    expect(screen.getByText('RECORDED ZONES')).toBeInTheDocument()
    const buttons = screen.getAllByRole('button', { name: /zone|corner|rim|range|midrange|break|deep|paint|restricted/i })
    expect(buttons.length).toBeGreaterThanOrEqual(9)
    const target = screen.getByRole('button', { name: 'Corner 3: 1 made of 2 attempted' })
    fireEvent.click(target)
    expect(target).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('50.0%')).toBeInTheDocument()
    expect(screen.getByText(/3 field points/)).toBeInTheDocument()
    expect(screen.getByText(/no physical shot coordinates/i)).toBeInTheDocument()
  })

  it('always labels modeled data as provisional instead of observed', () => {
    render(<PerformanceNineZoneCourt profile={fixture('MODELLED')} />)
    expect(screen.getByText('MODELLED ZONES')).toBeInTheDocument()
    expect(screen.getByText(/Statistical subdivision · provisional/)).toBeInTheDocument()
    expect(screen.queryByText('RECORDED ZONES')).not.toBeInTheDocument()
  })
})
