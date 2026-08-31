import { updateGameWorld, type GameWorld } from '@/domain/world'
import { createDefaultStaffReputationProfile } from '@/domain/staffReputation'
import { createStaffContract, isStaffContractActiveOn, staffContractIdFromString } from '@/domain/staffContract'
import { staffRoleDefinition } from '@/domain/staff'
import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'

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
 * with no non-terminated contract COVERING OR STARTING ON/AFTER `world.currentDate` (Issue #19 §9,
 * review Blocker 5) — using the single canonical `isStaffContractActiveOn` semantics as the
 * "already covered" test, not a `termination === undefined` proxy. This covers a Staff person with
 * no contract at all AND one whose only contract has lapsed (`expiresOn` in the past); it correctly
 * leaves alone a Staff person whose contract has not YET started (e.g. `startsOn` a few days ahead
 * of `world.currentDate`, as legitimately happens for a Staff person on a team whose own
 * generation/current-date offset differs from the merged world clock) — that contract is not a
 * gap, it will become active on its own. Stable, deterministic id keyed off `(staffId, currentDate)`
 * — never `Math.random` — so re-running on the same world is idempotent, while a genuinely NEW gap
 * (e.g. the prior backfilled contract later expires) gets a new id rather than colliding with the
 * old one. Salary derives from the assigned role's `seniority` band (the only per-role proxy that
 * exists; see `STAFF_ROLE_REGISTRY`), term is a flat `DEFAULT_CONTRACT_TERM_YEARS` from the
 * employment's `startedOn` (or the current date if absent).
 */
export function ensureStaffContractStructure(world: GameWorld): GameWorld {
  const additions = Object.entries(world.staffEmploymentByStaffId)
    .filter(([, employment]) => (employment as { readonly status: string }).status === 'employed')
    .filter(([staffId]) => !Object.values(world.staffContractsById).some((contract) => contract.staffId === staffId && (isStaffContractActiveOn(contract, world.currentDate) || (contract.termination === undefined && compareGameDates(contract.term.startsOn, world.currentDate) > 0))))
    .map(([staffId, employmentValue]) => {
      const employment = employmentValue as { readonly teamId: string; readonly roleId: string; readonly startedOn?: GameDate }
      // Prefer the real employment start date, but never backdate the new term far enough that it
      // would ALSO already be expired on `world.currentDate` — this is the reconciliation case
      // (the Staff's prior contract lapsed), so the fresh replacement must actually be active now.
      const candidateStartsOn = employment.startedOn ?? world.currentDate
      const wouldAlreadyBeExpired = compareGameDates(world.currentDate, addYears(candidateStartsOn, DEFAULT_CONTRACT_TERM_YEARS)) >= 0
      const startsOn = wouldAlreadyBeExpired ? world.currentDate : candidateStartsOn
      const seniority = staffRoleDefinition(employment.roleId as never).seniority
      const annualSalary = SALARY_BY_SENIORITY[seniority]!
      // The id is keyed off the computed `startsOn` (stable, derived from `employment.startedOn`),
      // never off `world.currentDate` — the latter would make the id depend on WHEN this enrichment
      // happens to run (e.g. once per gendered sub-world before merging, vs. once again on the
      // fully-merged world during a later reload), breaking true idempotency/determinism.
      return createStaffContract({
        id: staffContractIdFromString(`staff-contract-backfill-v1:${staffId}:${startsOn}`),
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

