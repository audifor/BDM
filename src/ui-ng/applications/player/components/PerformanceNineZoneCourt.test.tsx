// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MATCH_SHOT_ZONE_IDS } from '@/domain/stats/MatchStatLog'
import type { PerformanceShotProfileModel } from '../data/buildPlayerPerformanceModel'
import { COURT_ZONE_PATHS, courtZoneTemperature, PerformanceNineZoneCourt } from './PerformanceNineZoneCourt'

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
    expect(screen.getAllByText('50.0%').length).toBeGreaterThan(0)
    expect(screen.getByText(/3 field points/)).toBeInTheDocument()
    expect(screen.getByText(/no physical shot coordinates/i)).toBeInTheDocument()
  })

  it('draws nine identifiable basketball districts and exposes an efficiency key', () => {
    render(<PerformanceNineZoneCourt profile={fixture()} />)
    expect(Object.keys(COURT_ZONE_PATHS)).toHaveLength(9)
    expect(COURT_ZONE_PATHS.CORNER_THREE).toHaveLength(2)
    expect(COURT_ZONE_PATHS.MIDRANGE).toHaveLength(2)
    expect(screen.getByLabelText(/Selectable schematic basketball half-court zones/i)).toBeInTheDocument()
    expect(screen.getByText('No attempts')).toBeInTheDocument()
    expect(screen.getByText('0–29%')).toBeInTheDocument()
    expect(screen.getByText('70%+')).toBeInTheDocument()
    const corner = screen.getByRole('button', { name: 'Corner 3: 1 made of 2 attempted' })
    expect(corner).toHaveClass('is-good')
    const noAttempts = screen.getByRole('button', { name: 'Restricted: 0 made of 0 attempted' })
    expect(noAttempts).toHaveClass('is-unobserved')
  })

  it('can expand the map without changing its selected zone and closes with Escape', () => {
    render(<PerformanceNineZoneCourt profile={fixture()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Corner 3: 1 made of 2 attempted' }))
    const open = screen.getByRole('button', { name: 'Enlarge shot map' })
    fireEvent.click(open)
    const dialog = screen.getByRole('dialog', { name: 'Nine-zone basketball shooting map' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(document.querySelector('.po-pf-nine__portal .po-pf-nine.is-expanded')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Corner 3: 1 made of 2 attempted' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.querySelector('.po-pf-nine__portal')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enlarge shot map' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('bases temperature on actual field goals and leaves zero-attempt zones neutral', () => {
    expect(courtZoneTemperature({ id:'DEEP',label:'Deep 3',made:0,attempted:0,percentage:null,share:0,points:0 })).toBe('unobserved')
    expect(courtZoneTemperature({ id:'DEEP',label:'Deep 3',made:0,attempted:3,percentage:'0.0',share:10,points:0 })).toBe('low')
    expect(courtZoneTemperature({ id:'MIDRANGE',label:'Midrange',made:1,attempted:3,percentage:'33.3',share:10,points:2 })).toBe('moderate')
    expect(courtZoneTemperature({ id:'RIM',label:'At the rim',made:1,attempted:2,percentage:'50.0',share:10,points:2 })).toBe('good')
    expect(courtZoneTemperature({ id:'RESTRICTED',label:'Restricted',made:2,attempted:2,percentage:'100.0',share:10,points:4 })).toBe('strong')
  })

  it('always labels modeled data as provisional instead of observed', () => {
    render(<PerformanceNineZoneCourt profile={fixture('MODELLED')} />)
    expect(screen.getByText('MODELLED ZONES')).toBeInTheDocument()
    expect(screen.getByText(/Statistical subdivision · provisional/)).toBeInTheDocument()
    expect(screen.queryByText('RECORDED ZONES')).not.toBeInTheDocument()
  })
})
