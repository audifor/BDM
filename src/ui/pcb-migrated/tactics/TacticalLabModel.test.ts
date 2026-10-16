import { describe, expect, it } from 'vitest'
import { buildTacticalZoneEvidence, tacticalZoneTarget, tacticalSpacingWarning } from './TacticalLabModel'
import type { PerformanceShotProfileModel } from '@/ui-ng/applications/player/data/buildPlayerPerformanceModel'

describe('Tactical Lab: evidence-gated recommendations', () => {
  const observed: PerformanceShotProfileModel = {
    totalAttempts: 49, zones: [], note: 'observed', detailedProvenance:'OBSERVED',
    detailedZones:[
      {id:'CORNER_THREE',label:'Corner',made:7,attempted:15,percentage:'46.7',share:31,points:21},
      {id:'MIDRANGE',label:'Mid',made:8,attempted:20,percentage:'40.0',share:40,points:16},
      {id:'DEEP',label:'Deep',made:5,attempted:14,percentage:'35.7',share:29,points:15},
    ],
  }
  it('recommends only adequately sampled observed zones, ranked by points per attempt', () => {
    const z=buildTacticalZoneEvidence(observed)
    expect(z.filter(row=>row.recommended).map(row=>row.id)).toEqual(['CORNER_THREE','DEEP'])
    expect(z.find(row=>row.id==='MIDRANGE')?.estimatedPointsPerShot).toBeCloseTo(.8)
  })
  it('never invents shot zones from blank or incomplete records', () => {
    expect(buildTacticalZoneEvidence(undefined).every(z=>!z.recommended&&z.attempts===0)).toBe(true)
    expect(buildTacticalZoneEvidence({ ...observed,detailedProvenance:'MODELLED' }).every(z=>!z.recommended)).toBe(true)
    expect(buildTacticalZoneEvidence({ ...observed,detailedProvenance:'MIXED' }).every(z=>!z.recommended)).toBe(true)
    expect(buildTacticalZoneEvidence({ ...observed,detailedZones:[{...observed.detailedZones![0]!,attempted:4}]}).every(z=>!z.recommended)).toBe(true)
  })
  it('produces court-bound destinations and detects teammate congestion', () => {
    const target=tacticalZoneTarget('CORNER_THREE',{x:400,y:200})
    expect(target.x).toBeGreaterThan(400)
    expect(tacticalZoneTarget('CORNER_THREE',{x:100,y:200}).x).toBeLessThan(100)
    expect(tacticalSpacingWarning(target,2,[{id:1,x:target.x+10,y:target.y},{id:2,x:200,y:200}])).toMatch(/compañero/)
    expect(tacticalSpacingWarning(target,2,[{id:2,x:target.x,y:target.y}])).toBeNull()
  })
})
