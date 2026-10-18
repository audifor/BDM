// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { playerIdFromString } from '@/domain/ids'
import { MedicalSquadMonitor } from './MedicalCourtsideVisuals'
import { formatMedicalOneDecimal } from './formatMedicalOneDecimal'
import type { MedicalRiskRow } from './medicalWorkspaceModel'

afterEach(cleanup)

describe('Courtside Medical density and precision', () => {
  it('formats all finite numbers to exactly one decimal without changing their stored value', () => {
    expect(formatMedicalOneDecimal(7.890000000000001)).toBe('7.9')
    expect(formatMedicalOneDecimal(0)).toBe('0.0')
    expect(formatMedicalOneDecimal(14.5555)).toBe('14.6')
    expect(formatMedicalOneDecimal(99.95)).toBe('100.0')
    expect(formatMedicalOneDecimal(Number.NaN)).toBe('0.0')
  })

  it('renders one direct layout row with five visible fields per player and formatted tooltips', () => {
    const player: MedicalRiskRow = {
      playerId: playerIdFromString('courtside-medical-compact'),
      playerName: 'Very Long Player Surname',
      position: 'PG',
      fatigue: 7.890000000000001,
      fatigueLabel: 'Low load',
      riskScore: 14.5555,
      riskBand: 'low',
      riskBandLabel: 'Low',
      reasons: [],
      quality: null,
      available: true,
    }
    render(<MedicalSquadMonitor rows={[player]} onOpenPlayer={() => undefined} />)

    const row = screen.getByRole('button', { name: /Open medical profile for Very Long Player Surname/ })
    expect(row.children).toHaveLength(5)
    expect(row.querySelector('.medical-cs__squad-name')).toHaveTextContent('Very Long Player Surname')
    expect(row.querySelectorAll('.medical-cs__squad-metric')).toHaveLength(2)
    expect(screen.getByText('7.9')).toBeInTheDocument()
    expect(screen.getByText('14.6')).toBeInTheDocument()
    expect(row).toHaveAccessibleName(/fatigue 7\.9, risk 14\.6/)
    expect(screen.getByRole('img', { name: /fatigue: 7\.9 of 100/ })).toBeInTheDocument()
    expect(player.fatigue).toBe(7.890000000000001)
  })
})
