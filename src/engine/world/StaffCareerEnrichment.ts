import { updateGameWorld, type GameWorld } from '@/domain/world'
import { createDefaultStaffReputationProfile } from '@/domain/staffReputation'
import { createStaffContract, staffContractIdFromString } from '@/domain/staffContract'
import { staffRoleDefinition } from '@/domain/staff'
import { parseGameDate, type GameDate } from '@/domain/date'

/**
 * Backfills canonical `StaffEmployment`/`StaffCareerHistoryEntry` state for every `StaffPerson`
 * missing it (Issue #19 §9). For a Staff person with a live `TeamStaffAssignment`, creates
 * `{status:'employed', teamId, roleId, startedOn}` plus one `initialAppointment` history entry
 * mirroring the assignment's own `assignedOn` date — the assignment itself, not a separate
 * decision, is treated as the origin of this employment. A Staff person without any assignment
 * becomes `{status:'unemployed'}` with empty history. Pure, idempotent: only ever fills in missing
 * entries, never touches a Staff person that already has canonical employment state.
 */
export function ensureStaffEmploymentStructure(world: GameWorld): GameWorld {
  const missingStaffIds = Object.keys(world.staffPeopleById).filter((staffId) => world.staffEmploymentByStaffId[staffId as never] === undefined)
  if (missingStaffIds.length === 0) return world

  const employmentAdditions: Record<string, unknown> = {}
  const historyAdditions: Record<string, unknown> = {}
  for (const staffId of missingStaffIds) {
    const assignment = Object.values(world.teamStaffAssignmentsById).find((item) => item.staffPersonId === (staffId as never))
    if (assignment === undefined) {
      employmentAdditions[staffId] = { status: 'unemployed' }
      historyAdditions[staffId] = []
      continue
    }
    employmentAdditions[staffId] = { status: 'employed', teamId: assignment.teamId, roleId: assignment.role, startedOn: assignment.assignedOn }
    historyAdditions[staffId] = [{ kind: 'appointment', staffId, teamId: assignment.teamId, roleId: assignment.role, date: assignment.assignedOn, reason: 'initialAppointment' }]
  }

  return updateGameWorld(world, {
    staffEmploymentByStaffId: { ...world.staffEmploymentByStaffId, ...employmentAdditions } as never,
    staffCareerHistoryByStaffId: { ...world.staffCareerHistoryByStaffId, ...historyAdditions } as never,
  })
}

const DEFAULT_CONTRACT_TERM_YEARS = 2
const SALARY_BY_SENIORITY: Readonly<Record<string, number>> = { junior: 45_000, standard: 65_000, senior: 90_000, director: 130_000 }

/**
 * Backfills one deterministic default `StaffContract` for every currently-employed Staff person
 * missing an active one (Issue #19 §9). Stable id keyed off `(staffId, teamId, roleId)` — never
 * `Math.random`. Salary derives from the assigned role's `seniority` band (the only per-role
 * proxy that exists; see `STAFF_ROLE_REGISTRY`), term is a flat `DEFAULT_CONTRACT_TERM_YEARS` from
 * the employment's `startedOn` (or the current date if absent). Idempotent: skips any Staff who
 * already has an active contract.
 */
export function ensureStaffContractStructure(world: GameWorld): GameWorld {
  const additions = Object.entries(world.staffEmploymentByStaffId)
    .filter(([, employment]) => (employment as { readonly status: string }).status === 'employed')
    .filter(([staffId]) => !Object.values(world.staffContractsById).some((contract) => contract.staffId === staffId && contract.termination === undefined))
    .map(([staffId, employmentValue]) => {
      const employment = employmentValue as { readonly teamId: string; readonly roleId: string; readonly startedOn?: GameDate }
      const startsOn = employment.startedOn ?? world.currentDate
      const seniority = staffRoleDefinition(employment.roleId as never).seniority
      const annualSalary = SALARY_BY_SENIORITY[seniority]!
      return createStaffContract({
        id: staffContractIdFromString(`staff-contract-backfill-v1:${staffId}`),
        staffId: staffId as never,
        teamId: employment.teamId as never,
        kind: 'standard' as const,
        term: { startsOn, expiresOn: addYears(startsOn, DEFAULT_CONTRACT_TERM_YEARS) },
        compensation: { annualSalary },
      })
    })
  if (additions.length === 0) return world
  return updateGameWorld(world, { staffContracts: [...Object.values(world.staffContractsById), ...additions] })
}

/** Every StaffPerson gets exactly one valid default reputation profile if missing (Issue #19 §9). */
export function ensureStaffReputationStructure(world: GameWorld): GameWorld {
  const missingStaffIds = Object.keys(world.staffPeopleById).filter((staffId) => world.staffReputationProfilesByStaffId[staffId as never] === undefined)
  if (missingStaffIds.length === 0) return world
  const additions = Object.fromEntries(missingStaffIds.map((staffId) => [staffId, createDefaultStaffReputationProfile()]))
  return updateGameWorld(world, { staffReputationProfilesByStaffId: { ...world.staffReputationProfilesByStaffId, ...additions } as never })
}

function addYears(date: GameDate, years: number): GameDate {
  const [year, month, day] = String(date).split('-').map(Number) as [number, number, number]
  return parseGameDate(`${String(year + years).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
}

