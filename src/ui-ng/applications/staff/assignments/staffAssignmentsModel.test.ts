import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { runStaffAssignmentStrategy } from '@/app/staffAssignments'
import type { TeamId } from '@/domain/ids'
import { staffAssignmentSuitability } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import {
  buildStaffAssignmentsModel,
  coverageTone,
  fitBand,
  fullCandidateList,
  loadTone,
  matrixFilterForKpi,
  matchesMatrixFilter,
} from '@/ui-ng/applications/staff/assignments/staffAssignmentsModel'

function build(transform?: (world: ReturnType<typeof createNewGame>, teamId: TeamId) => ReturnType<typeof createNewGame>) {
  const world = createNewGame()
  const teamId = getUserTeam(world)!.id
  const projected = transform === undefined ? world : transform(world, teamId)
  return buildStaffAssignmentsModel(projected, teamId)
}

const delegateAll = (world: ReturnType<typeof createNewGame>, teamId: TeamId) => runStaffAssignmentStrategy(world, teamId, 'delegateMore').world

describe('staff assignment tone thresholds', () => {
  it('maps load to the documented bands', () => {
    expect(loadTone(0.4)).toBe('positive')
    expect(loadTone(0.7)).toBe('warning')
    expect(loadTone(0.85)).toBe('negative')
    expect(loadTone(Number.POSITIVE_INFINITY)).toBe('negative')
  })

  it('maps coverage to the documented bands', () => {
    expect(coverageTone(95)).toBe('positive')
    expect(coverageTone(80)).toBe('cyan')
    expect(coverageTone(65)).toBe('warning')
    expect(coverageTone(40)).toBe('negative')
  })

  it('maps suitability to fit bands', () => {
    expect(fitBand(92)).toBe('EXCELLENT')
    expect(fitBand(85)).toBe('STRONG')
    expect(fitBand(74)).toBe('GOOD')
    expect(fitBand(62)).toBe('FAIR')
    expect(fitBand(41)).toBe('POOR')
  })

  it('discounts suitability as projected workload grows', () => {
    expect(staffAssignmentSuitability(90, 0.3)).toBe(90)
    expect(staffAssignmentSuitability(90, 1.2)).toBeLessThan(staffAssignmentSuitability(90, 0.8))
  })
})

describe('buildStaffAssignmentsModel', () => {
  it('marks every staff-eligible responsibility as vacant while the head coach performs the work', () => {
    const model = build()
    const training = model.rowsByKind.get('createTeamTrainingPlan')!
    expect(training.holder).toBeUndefined()
    expect(training.postureLabel).toBe('YOU')
    expect(training.statusLabel).toBe('VACANT')
    expect(training.loadLabel).toBe('—')
    expect(training.coverageLabel).toBe('—')
    expect(training.assignable).toBe(true)
    expect(training.recommendations.length).toBeGreaterThan(0)
    expect(training.managerOption?.name).toBe('YOU')
    expect(model.kpis.find((kpi) => kpi.id === 'vacancies')?.value).toBeGreaterThan(0)
  })

  it('never offers candidates for Head-Coach-only responsibilities', () => {
    const model = build()
    const rotation = model.rowsByKind.get('rotationPlanning')!
    expect(rotation.assignable).toBe(false)
    expect(rotation.recommendations).toEqual([])
    expect(rotation.managerOption).toBeUndefined()
    expect(rotation.statusLabel).toBe('OK')
    expect(rotation.postureLabel).toBe('HEAD COACH')
  })

  it('excludes the current holder from the quick assign list and flags them separately', () => {
    const model = build(delegateAll)
    const held = [...model.rowsByKind.values()].filter((row) => row.holder !== undefined)
    expect(held.length).toBeGreaterThan(0)
    for (const row of held) {
      expect(row.recommendations.some((candidate) => candidate.staffPersonId === row.holder?.staffPersonId)).toBe(false)
      expect(['OK', 'NO BACKUP', 'OVERLOAD', 'LOW FIT']).toContain(row.statusLabel)
    }
  })

  it('reports no-backup when the holder is the only eligible person', () => {
    const model = build(delegateAll)
    for (const row of model.rowsByKind.values()) {
      if (row.holder === undefined || row.backup !== undefined) continue
      expect(['NO BACKUP', 'OVERLOAD', 'LOW FIT']).toContain(row.statusLabel)
    }
  })

  it('keeps the backup column purely derived — never a second holder', () => {
    const model = build(delegateAll)
    for (const row of model.rowsByKind.values()) {
      if (row.backup === undefined) continue
      expect(row.backup.staffPersonId).not.toBe(row.holder?.staffPersonId)
    }
  })

  it('fills the summary KPIs from canonical staff state', () => {
    const model = build(delegateAll)
    expect(model.kpis.find((kpi) => kpi.id === 'staff')?.value).toBe(model.staff.length)
    const assigned = model.staff.filter((row) => row.heldCount > 0).length
    expect(model.kpis.find((kpi) => kpi.id === 'assigned')?.value).toBe(assigned)
    expect(model.kpis.find((kpi) => kpi.id === 'available')?.value).toBe(model.staff.length - assigned)
    expect(model.coverage.some((block) => block.ratio > 0)).toBe(true)
  })

  it('counts open work per section for the section AUTO control', () => {
    const model = build()
    for (const group of model.groups) {
      const open = group.rows.filter((row) => row.assignable && row.holder === undefined).length
      expect(group.openCount).toBe(open)
    }
    expect(model.groups.every((group) => group.rows.every((row) => row.domain === group.domain))).toBe(true)
  })
})

describe('matrix filters', () => {
  it('maps the clickable KPIs to their filter', () => {
    expect(matrixFilterForKpi('vacancies')).toBe('vacant')
    expect(matrixFilterForKpi('overloaded')).toBe('overloaded')
    expect(matrixFilterForKpi('assigned')).toBe('assigned')
    expect(matrixFilterForKpi('staff')).toBeUndefined()
    expect(matrixFilterForKpi('available')).toBeUndefined()
  })

  it('filters vacant, assigned and overloaded rows', () => {
    const vacant = build()
    expect([...vacant.rowsByKind.values()].filter((row) => matchesMatrixFilter(row, 'vacant')).length).toBeGreaterThan(0)

    const delegated = build(delegateAll)
    for (const row of delegated.rowsByKind.values()) {
      expect(matchesMatrixFilter(row, 'assigned')).toBe(row.holder !== undefined)
      expect(matchesMatrixFilter(row, 'vacant')).toBe(row.assignable && row.holder === undefined)
      expect(matchesMatrixFilter(row, 'overloaded')).toBe(row.holder?.workloadState === 'overloaded')
    }
  })
})

describe('fullCandidateList', () => {
  it('returns every eligible candidate, best fit first', () => {
    const world = createNewGame()
    const teamId = getUserTeam(world)!.id
    const list = fullCandidateList(world, teamId, 'createTeamTrainingPlan', undefined)
    expect(list.length).toBeGreaterThan(0)
    for (let index = 1; index < list.length; index += 1) {
      expect(list[index - 1]!.suitability).toBeGreaterThanOrEqual(list[index]!.suitability)
    }
  })

  it('returns nothing for a Head-Coach-only responsibility', () => {
    const world = createNewGame()
    const teamId = getUserTeam(world)!.id
    expect(fullCandidateList(world, teamId, 'rotationPlanning', undefined)).toEqual([])
  })
})
