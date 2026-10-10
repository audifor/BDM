import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { PerformanceShotProfileModel } from '@/ui-ng/applications/player/data/buildPlayerPerformanceModel'
import { PerformanceShotProfilePanel } from './PerformanceBoardPanels'

function court(profile: PerformanceShotProfileModel): string {
  return renderToStaticMarkup(<PerformanceShotProfilePanel profile={profile} />)
}

describe('Courtside shooting: evidence-only two-zone court', () => {
  it('shows actual makes, attempts, volume and field points without invented locations', () => {
    const html = court({
      zones: [
        { id: 'inside-arc', label: 'Inside the arc', court: 'paint',
          made: 1, attempted: 2, percentage: '50.0', share: 67 },
        { id: 'outside-arc', label: 'Beyond the arc', court: 'arc',
          made: 0, attempted: 1, percentage: '0.0', share: 33 },
      ],
      totalAttempts: 3,
      note: 'Only two-point and three-point box scores are recorded.',
    })
    expect(html).toContain('Half basketball court.')
    expect(html).toContain('INSIDE THE ARC')
    expect(html).toContain('BEYOND THE ARC')
    expect(html).toContain('50.0%')
    expect(html).toContain('0.0%')
    expect(html).toContain('1/2')
    expect(html).toContain('0/1')
    expect(html).toContain('67%')
    expect(html).toContain('33%')
    expect(html).toContain('100% of recorded field-goal points')
    expect(html).toContain('Conversion is higher inside the arc.')
    expect(html).toContain('Small sample of 3 attempts.')
    expect(html).not.toContain('heatmap')
    expect(html).not.toContain('SHOT PROFILE')
  })

  it('preserves unavailable efficiency when nobody attempted a field goal', () => {
    const html = court({
      zones: [
        { id:'inside-arc',label:'Inside the arc',court:'paint',
          made:0,attempted:0,percentage:null,share:0 },
        { id:'outside-arc',label:'Beyond the arc',court:'arc',
          made:0,attempted:0,percentage:null,share:0 },
      ],
      totalAttempts:0,
      note:'No attempt coordinates recorded.',
    })
    expect(html).toContain('No field-goal attempts recorded in this selection.')
    expect(html).toContain('0/0')
    expect(html).not.toContain('NaN')
    expect(html).not.toContain('Infinity')
    expect(html).not.toContain('100.0%')
  })

  it('derives the points share from shot values, not attempt share', () => {
    const html = court({
      zones: [
        { id:'inside-arc',label:'Inside the arc',court:'paint',
          made:1,attempted:2,percentage:'50.0',share:40 },
        { id:'outside-arc',label:'Beyond the arc',court:'arc',
          made:2,attempted:3,percentage:'66.7',share:60 },
      ],
      totalAttempts:5,
      note:'',
    })
    expect(html).toContain('25% of recorded field-goal points')
    expect(html).toContain('75% of recorded field-goal points')
    expect(html).toContain('Conversion is higher beyond the arc.')
  })
})
