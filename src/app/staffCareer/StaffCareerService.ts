import type { StaffPersonId, TeamId } from '@/domain/ids'
import type { GameDate } from '@/domain/date'
import { parseGameDate } from '@/domain/date'
import type { StaffRoleId } from '@/domain/staff'
import type { Responsibility } from '@/domain/responsibility'
import { calculateStaffRoleProficiencyByRoleId, isStaffRoleApplicableToEcosystem, staffRoleDefinition } from '@/domain/staff'
import {
  appointStaffToTeam,
  createStaffJobOpening,
  decideStaffJobOffer,
  evaluateStaffJobEligibility,
  fireStaff,
  promoteOrReassignStaff,
  staffJobCandidacyIdFromString,
  staffJobOfferIdFromString,
  staffJobOpeningIdFromString,
  staffLeaveForAnotherJob,
  transitionStaffInterview,
  transitionStaffJobCandidacy,
  type StaffCareerHistoryEntry,
  type StaffEmployment,
  type StaffJobOpening,
} from '@/domain/staffCareer'
import { createStaffContract, isStaffContractActiveOn, staffContractIdFromString, terminateStaffContract } from '@/domain/staffContract'
import { RESPONSIBILITY_REGISTRY } from '@/domain/responsibility'
import { staffReputationScore } from '@/domain/staffReputation'
import { addInboxItem, addNewsItem, canTeamAffordAdditionalStaffSalary, getTeamStaffPayroll, updateGameWorld, type GameWorld } from '@/domain/world'
import { getResponsibilitiesHeldByStaff } from '@/domain/world'

/**
 * Ecosystem role eligibility (Issue #19 review Blocker 3) is enforced HERE, at opening creation —
 * the earliest canonical application boundary — rather than only inside `rankStaffCandidates`'s
 * ranking filter. No opening ever exists for a `roleId` that `isStaffRoleApplicableToEcosystem`
 * rejects for the team's own ecosystem, which transitively makes it impossible to identify a
 * candidacy, interview, offer, or hire for that (team, role) pair — closing the manual-API bypass
 * where a caller could skip `rankStaffCandidates` entirely.
 */
export function createStaffJobOpeningForTeam(world: GameWorld, input: { readonly teamId: TeamId; readonly roleId: StaffRoleId; readonly id?: string }): { readonly world: GameWorld; readonly opening: StaffJobOpening } {
  const team = requireTeam(world, input.teamId)
  if (!isStaffRoleApplicableToEcosystem(input.roleId, teamEcosystemKind(world, team.id))) throw new Error('Staff role is not applicable to this Team\'s ecosystem')
  const existing = Object.values(world.staffJobOpeningsById).find((opening) => opening.teamId === team.id && opening.roleId === input.roleId && opening.status === 'open')
  if (existing !== undefined) return { world, opening: existing }
  const id = staffJobOpeningIdFromString(input.id ?? nextId(world, `staff-job:${team.id}:${input.roleId}:${world.currentDate}:`))
  const opening = createStaffJobOpening({ id, teamId: team.id, roleId: input.roleId, status: 'open', createdOn: world.currentDate })
  return { world: rebuild(world, { openings: { ...world.staffJobOpeningsById, [id]: opening } }), opening }
}

export function getOpenStaffJobs(world: GameWorld): readonly StaffJobOpening[] {
  return Object.values(world.staffJobOpeningsById).filter((opening) => opening.status === 'open').sort((a, b) => a.createdOn.localeCompare(b.createdOn) || a.id.localeCompare(b.id))
}

/** Lists canonically unemployed Staff and optionally filters by their primary market speciality. */
export function listFreeAgentStaff(world: GameWorld, roleId?: StaffRoleId): readonly StaffPersonId[] {
  return Object.values(world.staffPeopleById).filter((staff) => world.staffEmploymentByStaffId[staff.id]?.status === 'unemployed' && (roleId === undefined || staff.marketRole === roleId)).sort((a, b) => a.id.localeCompare(b.id)).map((staff) => staff.id)
}

/**
 * Ranks eligible candidates (real Staff not already assigned to `opening.teamId`, with an
 * ecosystem-valid opening) by their proficiency for `opening.roleId`. `marketRole` is a market
 * presentation speciality only; it deliberately does not restrict a later canonical assignment.
 * Ranking uses a linear blend of canonical role proficiency and Staff reputation, tie-broken by id for full
 * determinism. Neither purely reputation-driven nor a duplicate of `STAFF_ROLE_REGISTRY` weights —
 * proficiency is read directly from `calculateStaffRoleProficiencyByRoleId`.
 */
export function rankStaffCandidates(world: GameWorld, openingId: string): readonly StaffPersonId[] {
  const opening = requireOpening(world, openingId)
  const ecosystemKind = teamEcosystemKind(world, opening.teamId)
  return Object.values(world.staffPeopleById)
    .filter((staff) => world.staffEmploymentByStaffId[staff.id]?.status !== 'employed' || world.staffEmploymentByStaffId[staff.id]?.teamId !== opening.teamId)
    .filter((staff) => isStaffRoleApplicableToEcosystem(opening.roleId, ecosystemKind))
    .filter((staff) => world.staffReputationProfilesByStaffId[staff.id] !== undefined)
    .sort((a, b) => candidateScore(world, opening, b.id) - candidateScore(world, opening, a.id) || a.id.localeCompare(b.id))
    .map((staff) => staff.id)
}

export function identifyStaffCandidate(world: GameWorld, input: { readonly openingId: string; readonly staffId: StaffPersonId; readonly id?: string }): { readonly world: GameWorld; readonly candidacyId: string } {
  const opening = requireOpening(world, input.openingId)
  if (!evaluateStaffJobEligibility(opening).eligible) throw new Error('Staff job opening is not open')
  if (world.staffPeopleById[input.staffId] === undefined || world.staffReputationProfilesByStaffId[input.staffId] === undefined) throw new Error('Staff is not eligible for this job opening')
  // Defense-in-depth (Issue #19 review Blocker 3): `createStaffJobOpeningForTeam` is the primary
  // gate, but this re-check ensures no ecosystem-ineligible opening (however it came to exist) can
  // ever produce a candidacy.
  if (!isStaffRoleApplicableToEcosystem(opening.roleId, teamEcosystemKind(world, opening.teamId))) throw new Error('Staff role is not applicable to this Team\'s ecosystem')
  const existing = Object.values(world.staffJobCandidaciesById).find((candidacy) => candidacy.jobOpeningId === opening.id && candidacy.staffId === input.staffId && ['identified', 'interviewing', 'offered'].includes(candidacy.status))
  if (existing !== undefined) return { world, candidacyId: existing.id }
  const id = staffJobCandidacyIdFromString(input.id ?? nextId(world, `staff-candidacy:${opening.id}:${input.staffId}:`))
  return { world: rebuild(world, { candidacies: { ...world.staffJobCandidaciesById, [id]: { id, jobOpeningId: opening.id, staffId: input.staffId, status: 'identified', createdOn: world.currentDate } } }), candidacyId: id }
}

export function startStaffInterview(world: GameWorld, candidacyId: string): GameWorld {
  const candidacy = requireCandidacy(world, candidacyId)
  if (world.staffInterviewsByCandidacyId[candidacy.id] !== undefined) return world
  const transition = transitionStaffJobCandidacy(candidacy, 'interviewing')
  if (!transition.ok) throw new Error('Staff candidacy cannot start an interview')
  return rebuild(world, { candidacies: { ...world.staffJobCandidaciesById, [candidacy.id]: transition.candidacy }, interviews: { ...world.staffInterviewsByCandidacyId, [candidacy.id]: { candidacyId: candidacy.id, status: 'scheduled' } } })
}

export function completeStaffInterview(world: GameWorld, candidacyId: string): GameWorld {
  const interview = world.staffInterviewsByCandidacyId[staffJobCandidacyIdFromString(candidacyId)]
  if (interview === undefined) throw new Error('Staff interview does not exist')
  const transition = transitionStaffInterview(interview, 'completed')
  if (!transition.ok) throw new Error('Staff interview cannot be completed')
  return rebuild(world, { interviews: { ...world.staffInterviewsByCandidacyId, [interview.candidacyId]: transition.interview } })
}

export function createStaffJobOffer(world: GameWorld, input: { readonly candidacyId: string; readonly id?: string }): { readonly world: GameWorld; readonly offerId: string } {
  const candidacy = requireCandidacy(world, input.candidacyId)
  const opening = requireOpening(world, candidacy.jobOpeningId)
  const interview = world.staffInterviewsByCandidacyId[candidacy.id]
  if (candidacy.status !== 'interviewing' || interview?.status !== 'completed' || !evaluateStaffJobEligibility(opening).eligible) throw new Error('Staff job offer preconditions are not met')
  const existing = Object.values(world.staffJobOffersById).find((offer) => offer.jobOpeningId === opening.id && offer.staffId === candidacy.staffId && offer.status === 'pending')
  if (existing !== undefined) return { world, offerId: existing.id }
  const annualSalary = calculateStaffOfferSalary(world, opening, candidacy.staffId)
  if (!canTeamAffordAdditionalStaffSalary(world, opening.teamId, annualSalary)) throw new Error('Team cannot afford this Staff job offer under its Staff salary budget')
  const transitioned = transitionStaffJobCandidacy(candidacy, 'offered')
  if (!transitioned.ok) throw new Error('Staff candidacy cannot receive an offer')
  const id = staffJobOfferIdFromString(input.id ?? nextId(world, `staff-offer:${opening.id}:${candidacy.staffId}:`))
  const offer = { id, jobOpeningId: opening.id, staffId: candidacy.staffId, teamId: opening.teamId, annualSalary, createdOn: world.currentDate, status: 'pending' as const }
  return { world: rebuild(world, { candidacies: { ...world.staffJobCandidaciesById, [candidacy.id]: transitioned.candidacy }, offers: { ...world.staffJobOffersById, [id]: offer } }), offerId: id }
}

/**
 * The atomic hiring transaction (Issue #19 §4 "Hiring transaction"). Order of operations mirrors
 * `acceptCoachJobOffer` exactly, extended for contracts and responsibility vacating:
 * validate -> handle departure from prior team (leave, clear old assignment, terminate old
 * contract, vacate old-team responsibilities, reopen old-team vacancy) -> appoint to new team
 * (new StaffEmployment, new TeamStaffAssignment, new active StaffContract) -> mark opening filled
 * -> mark winning candidacy hired -> reject competing candidacies -> withdraw competing offers ->
 * emit generic Inbox/News items via existing canonical helpers only. No Staff memories/morale/
 * relationship events are created here (Wave 5's responsibility, per Issue #19 scope guard).
 */
export function acceptStaffJobOffer(world: GameWorld, offerId: string): GameWorld {
  const offer = requireOffer(world, offerId)
  const opening = requireOpening(world, offer.jobOpeningId)
  const candidacy = requireCandidacy(world, findCandidacy(world, offer))
  if (offer.status !== 'pending' || opening.status !== 'open') throw new Error('Staff job offer cannot be accepted')
  const currentAssignment = Object.values(world.teamStaffAssignmentsById).find((assignment) => assignment.staffPersonId === offer.staffId)
  if (currentAssignment !== undefined && currentAssignment.teamId === opening.teamId) throw new Error('Staff job offer cannot be accepted')
  // Re-check the Staff budget against the CURRENT world immediately before committing (Issue #19
  // review Blocker 2): the offer's salary was only valid against the budget at CREATE time — one or
  // more sibling offers created against the same remaining budget may have since been accepted, so
  // the same canonical check createStaffJobOffer used must run again here, or two individually-valid
  // offers could both be accepted and jointly exceed the team's Staff budget.
  const annualSalary = offer.annualSalary ?? calculateStaffOfferSalary(world, opening, offer.staffId)
  if (!canTeamAffordAdditionalStaffSalary(world, opening.teamId, annualSalary)) throw new Error('Team cannot afford this Staff job offer under its current Staff salary budget')

  const accepted = decideStaffJobOffer(offer, 'accepted')
  const hired = transitionStaffJobCandidacy(candidacy, 'hired')
  if (!accepted.ok || !hired.ok) throw new Error('Staff job offer cannot be accepted')

  let assignments = Object.values(world.teamStaffAssignmentsById)
  let employment = world.staffEmploymentByStaffId[offer.staffId] ?? { status: 'unemployed' as const }
  let history = world.staffCareerHistoryByStaffId[offer.staffId] ?? []
  let openings = { ...world.staffJobOpeningsById }
  let contracts = { ...world.staffContractsById }
  let responsibilities: readonly Responsibility[] = Object.values(world.responsibilitiesById)

  if (employment.status === 'employed') {
    const oldTeamId = employment.teamId!
    const leaving = staffLeaveForAnotherJob({ employment, history, staffId: offer.staffId, date: world.currentDate })
    if (!leaving.ok) throw new Error('Staff cannot leave current Team')
    employment = leaving.employment
    history = leaving.history
    assignments = assignments.filter((assignment) => assignment.staffPersonId !== offer.staffId)
    const activeOldContract = Object.values(contracts).find((contract) => contract.staffId === offer.staffId && isStaffContractActiveOn(contract, world.currentDate))
    if (activeOldContract !== undefined) contracts[activeOldContract.id] = terminateStaffContract(activeOldContract, world.currentDate, 'resigned')
    responsibilities = vacateResponsibilitiesHeldByStaffOnTeam(responsibilities, offer.staffId, oldTeamId)
    const reopened = createStaffJobOpeningForTeam(rebuild(world, { assignments, employment: { ...world.staffEmploymentByStaffId, [offer.staffId]: employment }, history: { ...world.staffCareerHistoryByStaffId, [offer.staffId]: history }, openings, contracts, responsibilities }), { teamId: oldTeamId, roleId: currentAssignment!.role })
    openings = { ...reopened.world.staffJobOpeningsById }
  }

  const appointed = appointStaffToTeam({ employment, history, staffId: offer.staffId, teamId: opening.teamId, roleId: opening.roleId, date: world.currentDate })
  if (!appointed.ok) throw new Error('Staff cannot be appointed')
  const newAssignmentId = `staff-assignment:${offer.staffId}:${opening.teamId}:${opening.roleId}:${world.currentDate}`
  assignments = [...assignments, { id: newAssignmentId as never, staffPersonId: offer.staffId, teamId: opening.teamId, role: opening.roleId, assignedOn: world.currentDate }]
  const newContractId = staffContractIdFromString(`staff-contract:${offer.staffId}:${opening.teamId}:${world.currentDate}`)
  contracts[newContractId] = createStaffContract({ id: newContractId, staffId: offer.staffId, teamId: opening.teamId, kind: 'standard', term: { startsOn: world.currentDate, expiresOn: addYears(world.currentDate, 2) }, compensation: { annualSalary } })

  openings[opening.id] = { ...opening, status: 'filled' }
  const candidacies: Record<string, unknown> = { ...world.staffJobCandidaciesById, [candidacy.id]: hired.candidacy }
  const offers: Record<string, unknown> = { ...world.staffJobOffersById, [offer.id]: accepted.offer }
  for (const candidate of Object.values(candidacies) as (typeof candidacy)[]) if (candidate.jobOpeningId === opening.id && candidate.id !== candidacy.id && ['identified', 'interviewing', 'offered'].includes(candidate.status)) { const rejected = transitionStaffJobCandidacy(candidate, 'rejected'); if (rejected.ok) candidacies[candidate.id] = rejected.candidacy }
  for (const other of Object.values(offers) as (typeof offer)[]) if (other.jobOpeningId === opening.id && other.id !== offer.id && other.status === 'pending') offers[other.id] = { ...other, status: 'withdrawn' }

  const next = rebuild(world, { assignments, openings, candidacies: candidacies as never, offers: offers as never, contracts, employment: { ...world.staffEmploymentByStaffId, [offer.staffId]: appointed.employment }, history: { ...world.staffCareerHistoryByStaffId, [offer.staffId]: appointed.history }, responsibilities })

  const staff = world.staffPeopleById[offer.staffId]!
  const team = world.teams[opening.teamId]!
  const withNews = addNewsItem(next, { id: `news:staff-hired:${offer.id}`, gameDate: world.currentDate, category: 'career', headline: `${staff.identity.firstName} ${staff.identity.lastName} joins ${team.name}`, body: `${staff.identity.firstName} ${staff.identity.lastName} has been appointed ${staffRoleDefinition(opening.roleId).id} at ${team.name}.`, context: { staffId: offer.staffId, teamId: team.id, offerId: offer.id } })
  return addInboxItem(withNews, { id: `inbox:staff-hired:${offer.id}:${world.userCoachId}`, coachId: world.userCoachId, gameDate: world.currentDate, category: 'career', priority: team.id === teamOfUserCoach(world) ? 'high' : 'low', title: `${staff.identity.firstName} ${staff.identity.lastName} joins ${team.name}`, body: `${staff.identity.firstName} ${staff.identity.lastName} has been hired as ${staffRoleDefinition(opening.roleId).id} for $${(offer.annualSalary ?? 0).toLocaleString()} per year.`, status: 'unread', context: { staffId: offer.staffId, teamId: team.id, offerId: offer.id } })
}

export function declineStaffJobOffer(world: GameWorld, offerId: string): GameWorld {
  const offer = requireOffer(world, offerId)
  const candidacy = requireCandidacy(world, findCandidacy(world, offer))
  const declined = decideStaffJobOffer(offer, 'declined')
  const rejected = transitionStaffJobCandidacy(candidacy, 'rejected')
  if (!declined.ok || !rejected.ok) throw new Error('Staff job offer cannot be declined')
  return rebuild(world, { offers: { ...world.staffJobOffersById, [offer.id]: declined.offer }, candidacies: { ...world.staffJobCandidaciesById, [candidacy.id]: rejected.candidacy } })
}

export function withdrawStaffJobOffer(world: GameWorld, offerId: string): GameWorld {
  const offer = requireOffer(world, offerId)
  const candidacy = requireCandidacy(world, findCandidacy(world, offer))
  const withdrawn = decideStaffJobOffer(offer, 'withdrawn')
  const result = transitionStaffJobCandidacy(candidacy, 'withdrawn')
  if (!withdrawn.ok || !result.ok) throw new Error('Staff job offer cannot be withdrawn')
  return rebuild(world, { offers: { ...world.staffJobOffersById, [offer.id]: withdrawn.offer }, candidacies: { ...world.staffJobCandidaciesById, [candidacy.id]: result.candidacy } })
}

/**
 * Same-team role change (Issue #19 §4 "Promote/reassign transaction"). Contract handling policy
 * (frozen, tested): the existing active contract is preserved unchanged when `newAnnualSalary` is
 * omitted or equal to the current one; otherwise the old active contract is terminated (`reason:
 * 'resigned'`, i.e. a mutually-agreed renewal, not a firing) and a new active contract is created
 * at the new salary — never two active contracts for the same Staff at once.
 */
export function promoteStaffWithinTeam(world: GameWorld, input: { readonly staffId: StaffPersonId; readonly newRoleId: StaffRoleId; readonly reason: 'promoted' | 'reassigned'; readonly newAnnualSalary?: number }): GameWorld {
  const employment = world.staffEmploymentByStaffId[input.staffId]
  if (employment === undefined || employment.status !== 'employed' || employment.teamId === undefined) throw new Error('Staff is not employed')
  const teamId = employment.teamId
  if (!isStaffRoleApplicableToEcosystem(input.newRoleId, teamEcosystemKind(world, teamId))) throw new Error('Staff role is not applicable to this Team\'s ecosystem')
  const history = world.staffCareerHistoryByStaffId[input.staffId] ?? []
  const transition = promoteOrReassignStaff({ employment, history, staffId: input.staffId, roleId: input.newRoleId, date: world.currentDate, reason: input.reason })
  if (!transition.ok) throw new Error('Staff cannot be promoted or reassigned')

  const oldAssignment = Object.values(world.teamStaffAssignmentsById).find((assignment) => assignment.staffPersonId === input.staffId)
  if (oldAssignment === undefined) throw new Error('Staff has no active Team assignment')
  const assignments = Object.values(world.teamStaffAssignmentsById).map((assignment) => assignment.staffPersonId === input.staffId ? { ...assignment, role: input.newRoleId } : assignment)

  const activeContract = Object.values(world.staffContractsById).find((contract) => contract.staffId === input.staffId && isStaffContractActiveOn(contract, world.currentDate))
  let contracts = { ...world.staffContractsById }
  if (activeContract !== undefined && input.newAnnualSalary !== undefined && input.newAnnualSalary !== activeContract.compensation.annualSalary) {
    contracts[activeContract.id] = terminateStaffContract(activeContract, world.currentDate, 'resigned')
    const renewedId = staffContractIdFromString(`staff-contract:${input.staffId}:${teamId}:${world.currentDate}:${input.reason}`)
    contracts[renewedId] = createStaffContract({ id: renewedId, staffId: input.staffId, teamId, kind: 'standard', term: { startsOn: world.currentDate, expiresOn: addYears(world.currentDate, 2) }, compensation: { annualSalary: input.newAnnualSalary } })
  }

  const responsibilities = vacateIneligibleResponsibilitiesForStaff(world, input.staffId, teamId, input.newRoleId)

  return rebuild(world, { assignments, employment: { ...world.staffEmploymentByStaffId, [input.staffId]: transition.employment }, history: { ...world.staffCareerHistoryByStaffId, [input.staffId]: transition.history }, contracts, responsibilities })
}

export function reassignStaffWithinTeam(world: GameWorld, input: { readonly staffId: StaffPersonId; readonly newRoleId: StaffRoleId; readonly newAnnualSalary?: number }): GameWorld {
  return promoteStaffWithinTeam(world, { ...input, reason: 'reassigned' })
}

/** The firing transaction (Issue #19 §4). */
export function fireStaffFromTeam(world: GameWorld, staffId: StaffPersonId): GameWorld {
  const employment = world.staffEmploymentByStaffId[staffId]
  if (employment === undefined || employment.status !== 'employed' || employment.teamId === undefined) throw new Error('Staff is not employed')
  const teamId = employment.teamId
  const roleId = employment.roleId!
  const history = world.staffCareerHistoryByStaffId[staffId] ?? []
  const result = fireStaff({ employment, history, decision: { staffId, teamId, date: world.currentDate, reason: 'performance' } })
  if (!result.ok) throw new Error('Staff cannot be fired')

  const assignments = Object.values(world.teamStaffAssignmentsById).filter((assignment) => assignment.staffPersonId !== staffId)
  const activeContract = Object.values(world.staffContractsById).find((contract) => contract.staffId === staffId && isStaffContractActiveOn(contract, world.currentDate))
  const contracts = activeContract === undefined ? world.staffContractsById : { ...world.staffContractsById, [activeContract.id]: terminateStaffContract(activeContract, world.currentDate, 'performance') }
  const responsibilities = vacateResponsibilitiesHeldByStaffOnTeam(Object.values(world.responsibilitiesById), staffId, teamId)

  const vacant = rebuild(world, { assignments, employment: { ...world.staffEmploymentByStaffId, [staffId]: result.employment }, history: { ...world.staffCareerHistoryByStaffId, [staffId]: result.history }, contracts, responsibilities })
  const opened = createStaffJobOpeningForTeam(vacant, { teamId, roleId }).world
  const staff = world.staffPeopleById[staffId]!
  const team = world.teams[teamId]!
  return addNewsItem(opened, { id: `news:staff-fired:${staffId}:${teamId}:${world.currentDate}`, gameDate: world.currentDate, category: 'career', headline: `${staff.identity.firstName} ${staff.identity.lastName} dismissed by ${team.name}`, body: `${staff.identity.firstName} ${staff.identity.lastName} is no longer ${staffRoleDefinition(roleId).id} at ${team.name}.`, context: { staffId, teamId } })
}

export function closeStaffJobOpening(world: GameWorld, openingId: string): GameWorld {
  const opening = requireOpening(world, openingId)
  if (opening.status !== 'open') throw new Error('Staff job opening is not open')
  return rebuild(world, { openings: { ...world.staffJobOpeningsById, [opening.id]: { ...opening, status: 'closed' } } })
}

/**
 * AI hiring autopilot (Issue #19 §8): same high-level lifecycle as `runCoachHiringProcessForOpening`
 * — deterministic top-ranked eligible candidate, identify -> interview -> offer -> accept, through
 * the same canonical StaffCareerService boundaries used by the user path. Same world + same
 * opening => same hire; no `Math.random`, no world iteration-order dependence (ranking is fully
 * deterministic — see `rankStaffCandidates`).
 */
export function runStaffHiringProcessForOpening(world: GameWorld, openingId: string): GameWorld {
  const staffId = rankStaffCandidates(world, openingId)[0]
  if (staffId === undefined) return world
  const candidate = identifyStaffCandidate(world, { openingId, staffId })
  const interviewed = completeStaffInterview(startStaffInterview(candidate.world, candidate.candidacyId), candidate.candidacyId)
  const offered = createStaffJobOffer(interviewed, { candidacyId: candidate.candidacyId })
  return acceptStaffJobOffer(offered.world, offered.offerId)
}

function candidateScore(world: GameWorld, opening: StaffJobOpening, staffId: StaffPersonId): number {
  const staff = world.staffPeopleById[staffId]!
  const proficiency = calculateStaffRoleProficiencyByRoleId(staff, opening.roleId)
  const reputation = staffReputationScore(world.staffReputationProfilesByStaffId[staffId]!)
  return proficiency * 0.7 + (reputation / 1000) * 100 * 0.3
}

const SALARY_BY_SENIORITY: Readonly<Record<string, number>> = { junior: 45_000, standard: 65_000, senior: 90_000, director: 130_000 }
const MIN_STAFF_OFFER_SALARY = 30_000
/** Bounded multiplier range applied on top of the seniority base from proficiency/reputation (Issue #19 §5) — a maxed-out candidate earns at most 30% above base, a minimum-quality one at most 20% below, never unbounded. */
const PROFICIENCY_REPUTATION_SWING_UP = 0.3
const PROFICIENCY_REPUTATION_SWING_DOWN = 0.2

/**
 * Centralized, deterministic Staff offer-salary policy (Issue #19 §5, review Blocker 4).
 * Provisional/prototype constants, but every input is explicit and bounded — never `Math.random`,
 * never a magic number scattered elsewhere in the service:
 *
 *   base        = SALARY_BY_SENIORITY[role.seniority] — the only per-role salary proxy that exists
 *                 (STAFF_ROLE_REGISTRY carries no salary weight of its own)
 *   quality     = 0.7 * calculateStaffRoleProficiencyByRoleId(staff, roleId) / 100
 *               + 0.3 * staffReputationScore(reputation) / 1000
 *               (the SAME 70/30 blend `candidateScore` uses for ranking — one canonical notion of
 *               "how good is this Staff person for this role", not two divergent formulas)
 *   multiplier  = 1 + (quality - 0.5) * 2 * SWING   (SWING = up-swing above 0.5 quality, down-swing below)
 *   salary      = round(base * multiplier / 1000) * 1000, clamped to
 *                 [MIN_STAFF_OFFER_SALARY, min(base * (1+swingUp), remaining Staff budget)]
 *
 * Same `world` + `opening` + `staffId` always yields the same salary. A higher-proficiency/
 * higher-reputation candidate for the identical opening never earns LESS than a lower one; the
 * offer never exceeds the team's currently remaining Staff budget, and is always positive.
 */
function calculateStaffOfferSalary(world: GameWorld, opening: StaffJobOpening, staffId: StaffPersonId): number {
  const staff = world.staffPeopleById[staffId]
  const reputation = world.staffReputationProfilesByStaffId[staffId]
  const base = SALARY_BY_SENIORITY[staffRoleDefinition(opening.roleId).seniority]!
  const quality = staff === undefined || reputation === undefined
    ? 0.5
    : 0.7 * (calculateStaffRoleProficiencyByRoleId(staff, opening.roleId) / 100) + 0.3 * (staffReputationScore(reputation) / 1000)
  const swing = quality >= 0.5 ? PROFICIENCY_REPUTATION_SWING_UP : PROFICIENCY_REPUTATION_SWING_DOWN
  const multiplier = 1 + (quality - 0.5) * 2 * swing
  const desired = Math.round((base * multiplier) / 1_000) * 1_000
  const payroll = getTeamStaffPayroll(world, opening.teamId)
  const affordable = Math.max(0, payroll.remainingBudget)
  return Math.max(MIN_STAFF_OFFER_SALARY, Math.min(desired, affordable))
}

/**
 * Vacates a held responsibility safely (Issue #19 §12): `holderStaffId` is cleared AND `mode` is
 * reset to `'userControlled'` — `RESPONSIBILITY_REGISTRY`'s `validateResponsibilityAssignment`
 * requires `'delegated'`/`'advisory'` modes to always have a holder, so simply clearing
 * `holderStaffId` while leaving a holder-requiring mode in place would itself be invalid state.
 * `'userControlled'` is always a supported mode for every responsibility kind and never requires a
 * holder — the safe universal fallback. This is never automatic reassignment to a new Staff member.
 */
function vacateResponsibility(responsibility: Responsibility): Responsibility {
  return { ...responsibility, mode: 'userControlled', holderStaffId: undefined }
}

function vacateResponsibilitiesHeldByStaffOnTeam(responsibilities: readonly Responsibility[], staffId: StaffPersonId, teamId: TeamId): readonly Responsibility[] {
  return responsibilities.map((responsibility) => responsibility.teamId === teamId && responsibility.holderStaffId === staffId ? vacateResponsibility(responsibility) : responsibility)
}

/** Vacates only the responsibilities this Staff holds that their NEW role is no longer eligible for — preserves the ones still eligible after a promotion/reassignment. */
function vacateIneligibleResponsibilitiesForStaff(world: GameWorld, staffId: StaffPersonId, teamId: TeamId, newRoleId: StaffRoleId): readonly Responsibility[] {
  const heldIds = new Set(getResponsibilitiesHeldByStaff(world, staffId).map((responsibility) => responsibility.id))
  return Object.values(world.responsibilitiesById).map((responsibility) => {
    if (!heldIds.has(responsibility.id) || responsibility.teamId !== teamId) return responsibility
    const eligible = (RESPONSIBILITY_REGISTRY[responsibility.kind].eligibleRoleIds as readonly string[]).includes(newRoleId)
    return eligible ? responsibility : vacateResponsibility(responsibility)
  })
}

function teamEcosystemKind(world: GameWorld, teamId: TeamId) {
  const competition = Object.values(world.competitions).find((item) => item.participantTeamIds.includes(teamId))!
  return world.ecosystems[competition.ecosystemId]!.kind
}

function teamOfUserCoach(world: GameWorld): TeamId | undefined {
  return Object.values(world.teams).find((team) => team.coachId === world.userCoachId)?.id
}

function addYears(date: GameDate, years: number): GameDate {
  const [year, month, day] = String(date).split('-').map(Number) as [number, number, number]
  return parseGameDate(`${String(year + years).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
}

function findCandidacy(world: GameWorld, offer: { readonly jobOpeningId: string; readonly staffId: StaffPersonId }): string {
  const candidacy = Object.values(world.staffJobCandidaciesById).find((item) => item.jobOpeningId === offer.jobOpeningId && item.staffId === offer.staffId && item.status === 'offered')
  if (candidacy === undefined) throw new Error('Staff offer has no active candidacy')
  return candidacy.id
}
function requireTeam(world: GameWorld, id: TeamId) { const team = world.teams[id]; if (team === undefined) throw new Error('Team does not exist'); return team }
function requireOpening(world: GameWorld, id: string) { const opening = world.staffJobOpeningsById[staffJobOpeningIdFromString(id)]; if (opening === undefined) throw new Error('Staff job opening does not exist'); return opening }
function requireCandidacy(world: GameWorld, id: string) { const candidacy = world.staffJobCandidaciesById[staffJobCandidacyIdFromString(id)]; if (candidacy === undefined) throw new Error('Staff candidacy does not exist'); return candidacy }
function requireOffer(world: GameWorld, id: string) { const offer = world.staffJobOffersById[staffJobOfferIdFromString(id)]; if (offer === undefined) throw new Error('Staff job offer does not exist'); return offer }
function nextId(world: GameWorld, prefix: string): string { return `${prefix}${Object.keys(world.staffJobOpeningsById).concat(Object.keys(world.staffJobCandidaciesById), Object.keys(world.staffJobOffersById)).filter((id) => id.startsWith(prefix)).length + 1}` }

function rebuild(world: GameWorld, changes: Partial<{
  assignments: readonly (typeof world.teamStaffAssignmentsById)[keyof typeof world.teamStaffAssignmentsById][]
  openings: typeof world.staffJobOpeningsById
  candidacies: typeof world.staffJobCandidaciesById
  interviews: typeof world.staffInterviewsByCandidacyId
  offers: typeof world.staffJobOffersById
  contracts: typeof world.staffContractsById
  employment: typeof world.staffEmploymentByStaffId
  history: typeof world.staffCareerHistoryByStaffId
  responsibilities: readonly (typeof world.responsibilitiesById)[keyof typeof world.responsibilitiesById][]
}>): GameWorld {
  return updateGameWorld(world, {
    ...(changes.assignments === undefined ? {} : { teamStaffAssignments: changes.assignments }),
    staffJobOpeningsById: changes.openings ?? world.staffJobOpeningsById,
    staffJobCandidaciesById: changes.candidacies ?? world.staffJobCandidaciesById,
    staffInterviewsByCandidacyId: changes.interviews ?? world.staffInterviewsByCandidacyId,
    staffJobOffersById: changes.offers ?? world.staffJobOffersById,
    staffContractsById: changes.contracts ?? world.staffContractsById,
    staffEmploymentByStaffId: changes.employment ?? world.staffEmploymentByStaffId,
    staffCareerHistoryByStaffId: changes.history ?? world.staffCareerHistoryByStaffId,
    ...(changes.responsibilities === undefined ? {} : { responsibilities: changes.responsibilities }),
  } as never)
}
