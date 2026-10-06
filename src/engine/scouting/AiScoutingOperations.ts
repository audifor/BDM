import type { OrganizationId, PlayerId, StaffPersonId, TeamId } from '@/domain/ids'
import { compareGameDates } from '@/domain/date'
import { PLAYER_TRUTH_RATING_KEYS } from '@/domain/player'
import { deriveOrganizationPlayerValuation } from '@/domain/intelligence'
import { SCOUTING_TERRITORY_WORKLOAD_COST, scoutingTerritoryKey, type ScoutingTerritory, type ScoutingMission } from '@/domain/scouting'
import { calculateStaffRoleProficiencyByRoleId, staffRoleIdsInDepartment, type StaffRoleId } from '@/domain/staff'
import { calculateStaffWorkload, getFreeAgents, getNextScheduledGame, getPlayersInScoutingTerritory, isStaffRoleSuitableForScoutingTerritory, type GameWorld } from '@/domain/world'
import { getNextScheduledGameForTeam } from '@/engine/calendar/CalendarQueries'
import { getAvailableDraftProspects } from '@/engine/draft'
import { getPlayerKnowledgeSummary, hasScoutingCapacityForMission, activeWorkload, isScoutingEvaluatorEligible, requestScouting } from './ScoutingEngine'
import { createScoutingTerritoryAssignment, endScoutingTerritoryAssignment, getScoutingTerritoryCoverage } from './ScoutingTerritoryOperations'

const PLAN_DAYS = new Set([1, 8, 15, 22, 29])
const MAX_ACTIVE_TERRITORIES_PER_ORGANIZATION = 3
const MAX_REPORTS_PER_ORGANIZATION_PER_CYCLE = 2
const MAX_CANDIDATES_PER_ORGANIZATION = 120
const REFRESH_FRESHNESS_THRESHOLD = 0.65
const FULL_REPORT_PRIORITY_THRESHOLD = 80
const SCOUTING_ROLE_IDS = new Set(staffRoleIdsInDepartment('scouting'))

interface ScoutSlot {
  readonly teamId: TeamId
  readonly staffId: StaffPersonId
  readonly roleId: StaffRoleId
}

interface AiCandidate {
  readonly playerId: PlayerId
  priority: number
  readonly sources: Set<CandidateSource>
}

type CandidateSource = 'FREE_AGENT' | 'MARKET' | 'DRAFT' | 'RECRUITING' | 'OPPONENT' | 'AWARENESS' | 'KNOWN'

interface CandidateProjection {
  readonly playerId: PlayerId
  readonly priority: number
  readonly context: 'FREE_AGENCY' | 'TRADE' | 'DRAFT' | 'RECRUITING'
}

export function isAiScoutingPlanningDay(date: string): boolean {
  return PLAN_DAYS.has(Number(date.slice(-2)))
}

/**
 * Bounded strategic Scouting planning. Daily discovery/report execution remains in the existing
 * Calendar phases; this planner only runs on days 1, 8, 15, 22 and 29 of each month.
 */
export function progressAiScoutingOperations(world: GameWorld): GameWorld {
  if (!isAiScoutingPlanningDay(world.currentDate)) return world
  const teamsByOrganization = aiTeamsByOrganization(world)
  if (teamsByOrganization.size === 0) return world

  const freeAgentsByPosition = groupFreeAgentsByPosition(world)
  let next = world
  for (const [organizationId, teams] of [...teamsByOrganization.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    next = endInvalidAiOperations(next, organizationId, new Set(teams.map((team) => team.id)))
    const slots = teams.flatMap((team) => employedScoutSlots(next, team.id))
    next = establishTerritoryFootprint(next, organizationId, teams, slots)
    next = requestRelevantReports(next, organizationId, teams, slots, freeAgentsByPosition)
  }
  return next
}

function aiTeamsByOrganization(world: GameWorld): Map<OrganizationId, readonly GameWorld['teams'][TeamId][]> {
  const grouped = new Map<OrganizationId, GameWorld['teams'][TeamId][]>()
  for (const team of Object.values(world.teams).filter((item) => item.coachId !== undefined && item.coachId !== world.userCoachId).sort((a, b) => a.id.localeCompare(b.id))) {
    const prior = grouped.get(team.organizationId) ?? []
    prior.push(team)
    grouped.set(team.organizationId, prior)
  }
  return grouped
}

function employedScoutSlots(world: GameWorld, teamId: TeamId): readonly ScoutSlot[] {
  return Object.values(world.teamStaffAssignmentsById)
    .filter((assignment) => assignment.teamId === teamId && SCOUTING_ROLE_IDS.has(assignment.role))
    .filter((assignment) => {
      const employment = world.staffEmploymentByStaffId[assignment.staffPersonId]
      return employment?.status === 'employed' && employment.teamId === teamId
    })
    .map((assignment) => ({ teamId, staffId: assignment.staffPersonId, roleId: assignment.role }))
    .sort((a, b) => a.staffId.localeCompare(b.staffId))
}

function endInvalidAiOperations(world: GameWorld, organizationId: OrganizationId, aiTeamIds: ReadonlySet<TeamId>): GameWorld {
  let next = world
  for (const assignment of Object.values(world.scoutingTerritoryAssignmentsById).filter((item) => item.organizationId === organizationId && aiTeamIds.has(item.requestingTeamId) && item.status === 'ACTIVE').sort((a, b) => a.id.localeCompare(b.id))) {
    const team = next.teams[assignment.requestingTeamId]
    const employment = next.staffEmploymentByStaffId[assignment.scoutStaffId]
    const teamAssignment = Object.values(next.teamStaffAssignmentsById).find((item) => item.teamId === assignment.requestingTeamId && item.staffPersonId === assignment.scoutStaffId)
    if (team === undefined || team.coachId === undefined || team.coachId === next.userCoachId || employment?.status !== 'employed' || employment.teamId !== team.id || teamAssignment === undefined || !isStaffRoleSuitableForScoutingTerritory(next, team.id, teamAssignment.role, assignment.territory)) {
      next = endScoutingTerritoryAssignment(next, assignment.id)
    }
  }
  return next
}

function establishTerritoryFootprint(world: GameWorld, organizationId: OrganizationId, teams: readonly GameWorld['teams'][TeamId][], slots: readonly ScoutSlot[]): GameWorld {
  let next = world
  const current = () => Object.values(next.scoutingTerritoryAssignmentsById).filter((item) => item.organizationId === organizationId && item.status === 'ACTIVE')
  const capacity = Math.min(MAX_ACTIVE_TERRITORIES_PER_ORGANIZATION, slots.length)
  for (const slot of slots) {
    const active = current()
    if (active.length >= capacity) break
    if (active.some((item) => item.scoutStaffId === slot.staffId)) continue
    const workload = calculateStaffWorkload(next, slot.staffId)
    if (workload.overloaded || workload.totalCapacityUsed + SCOUTING_TERRITORY_WORKLOAD_COST > workload.capacityLimit || activeWorkload(next, slot.staffId) >= 4) continue
    const team = next.teams[slot.teamId]!
    const candidates = territoryCandidates(next, organizationId, team.id, slot.roleId, teams)
      .filter((candidate) => !active.some((item) => scoutingTerritoryKey(item.territory) === scoutingTerritoryKey(candidate.territory)))
      .sort((a, b) => b.score - a.score || scoutingTerritoryKey(a.territory).localeCompare(scoutingTerritoryKey(b.territory)))
    const selected = candidates[0]
    if (selected === undefined) continue
    next = createScoutingTerritoryAssignment(next, { requestingTeamId: team.id, scoutStaffId: slot.staffId, territory: selected.territory })
  }
  return next
}

function territoryCandidates(world: GameWorld, organizationId: OrganizationId, teamId: TeamId, roleId: StaffRoleId, organizationTeams: readonly GameWorld['teams'][TeamId][]): readonly { readonly territory: ScoutingTerritory; readonly score: number }[] {
  const team = world.teams[teamId]!
  const nextGame = getNextScheduledGameForTeam(world, teamId)
  const ownCompetitionId = nextGame?.competitionId ?? Object.values(world.competitions).filter((item) => item.participantTeamIds.includes(teamId)).map((item) => item.id).sort()[0]
  const acquisitionEcosystems = new Set(organizationTeams.flatMap((item) => Object.values(world.competitions).filter((competition) => competition.participantTeamIds.includes(item.id)).map((competition) => competition.ecosystemId)))
  for (const draft of Object.values(world.draftsById)) if (draft.status === 'scheduled' && compareGameDates(draft.scheduledOn, world.currentDate) >= 0 && daysUntil(world.currentDate, draft.scheduledOn) <= 90) acquisitionEcosystems.add(draft.ecosystemId)
  for (const cycle of Object.values(world.recruitingCyclesById)) if (cycle.status === 'open' || cycle.status === 'signing') acquisitionEcosystems.add(cycle.ecosystemId)

  const candidates = new Map<string, { territory: ScoutingTerritory; score: number }>()
  const add = (territory: ScoutingTerritory, base: number) => {
    if (!isStaffRoleSuitableForScoutingTerritory(world, teamId, roleId, territory)) return
    const key = scoutingTerritoryKey(territory)
    const poolSize = getPlayersInScoutingTerritory(world, territory).length
    if (poolSize === 0) return
    const coverage = getScoutingTerritoryCoverage(world, organizationId, territory).coverage
    const score = base + Math.min(8, Math.log2(poolSize + 1)) - coverage * 25
    const prior = candidates.get(key)
    if (prior === undefined || score > prior.score) candidates.set(key, { territory, score })
  }

  for (const competition of Object.values(world.competitions).filter((item) => item.participantTeamIds.includes(teamId)).sort((a, b) => a.id.localeCompare(b.id))) {
    add({ kind: 'COMPETITION', competitionId: competition.id }, competition.id === ownCompetitionId ? 130 : 95)
  }
  if (roleId === 'regionalScout' || roleId === 'headScout') add({ kind: 'COUNTRY', countryId: team.countryId }, 85)

  if (roleId === 'internationalScout' || roleId === 'collegeScout' || roleId === 'proScout') {
    for (const competition of Object.values(world.competitions).filter((item) => {
      const ecosystem = world.ecosystems[item.ecosystemId]
      const participantTeams = item.participantTeamIds.map((id) => world.teams[id]).filter((value): value is NonNullable<typeof value> => value !== undefined)
      if (roleId === 'collegeScout' && ecosystem?.kind !== 'ncaaLike') return false
      if (roleId === 'proScout' && ecosystem?.kind !== 'fibaLike' && ecosystem?.kind !== 'nbaLike') return false
      if (roleId === 'internationalScout' && !participantTeams.some((participant) => participant.countryId !== team.countryId)) return false
      return acquisitionEcosystems.has(item.ecosystemId) || participantTeams.some((participant) => participant.countryId !== team.countryId)
    }).sort((a, b) => a.id.localeCompare(b.id))) {
      const ecosystem = world.ecosystems[competition.ecosystemId]
      const relevant = acquisitionEcosystems.has(competition.ecosystemId)
      add({ kind: 'COMPETITION', competitionId: competition.id }, roleId === 'internationalScout' ? (relevant ? 105 : 90) : (relevant ? 110 : 80) + (ecosystem?.kind === 'ncaaLike' ? 5 : 0))
    }
  }
  return [...candidates.values()]
}

function requestRelevantReports(world: GameWorld, organizationId: OrganizationId, teams: readonly GameWorld['teams'][TeamId][], slots: readonly ScoutSlot[], freeAgentsByPosition: ReadonlyMap<string, readonly PlayerId[]>): GameWorld {
  if (slots.length === 0) return world
  const pool = collectCandidates(world, organizationId, teams, freeAgentsByPosition)
  const ordered = [...pool.values()].map((candidate) => scoreCandidate(world, organizationId, teams, candidate)).filter((item): item is CandidateProjection => item !== undefined)
    .sort((a, b) => b.priority - a.priority || a.playerId.localeCompare(b.playerId))
  let next = world
  const usedStaff = new Set<StaffPersonId>()
  let created = 0
  for (const candidate of ordered) {
    if (created >= MAX_REPORTS_PER_ORGANIZATION_PER_CYCLE) break
    if (hasNonterminalAssignment(next, organizationId, candidate.playerId) || hasSameDayReport(next, organizationId, candidate.playerId)) continue
    const mission = chooseMission(next, organizationId, candidate)
    if (mission === undefined) continue
    const evaluator = chooseEvaluator(next, slots, mission)
    if (evaluator === undefined || usedStaff.has(evaluator.staffId)) continue
    const previousAssignmentIds = new Set(Object.keys(next.scoutingAssignmentsById))
    next = requestScouting(next, { organizationId, playerId: candidate.playerId, missionType: mission, evaluatorStaffId: evaluator.staffId, requestedBy: 'SCOUTING_DEPARTMENT', teamContextId: evaluator.teamId })
    if (Object.keys(next.scoutingAssignmentsById).some((id) => !previousAssignmentIds.has(id))) {
      usedStaff.add(evaluator.staffId)
      created += 1
    }
  }
  return next
}

function collectCandidates(world: GameWorld, organizationId: OrganizationId, teams: readonly GameWorld['teams'][TeamId][], freeAgentsByPosition: ReadonlyMap<string, readonly PlayerId[]>): Map<PlayerId, AiCandidate> {
  const candidates = new Map<PlayerId, AiCandidate>()
  const ownRoster = new Set(teams.flatMap((team) => team.rosterPlayerIds))
  const positionNeeds = positionalNeeds(world, teams)
  const add = (playerId: PlayerId, source: CandidateSource, base: number) => {
    if (ownRoster.has(playerId) || world.players[playerId] === undefined || candidates.size >= MAX_CANDIDATES_PER_ORGANIZATION && !candidates.has(playerId)) return
    const current = candidates.get(playerId)
    if (current === undefined) candidates.set(playerId, { playerId, priority: base, sources: new Set([source]) })
    else { current.sources.add(source); current.priority = Math.max(current.priority, base) }
  }

  for (const [position, need] of Object.entries(positionNeeds)) {
    if (need <= 0) continue
    for (const playerId of (freeAgentsByPosition.get(position) ?? []).slice(0, 5)) add(playerId, 'FREE_AGENT', 85)
  }
  for (const entry of world.marketKnowledge.filter((item) => item.organizationId === organizationId && item.availability !== 'NOT_FOR_SALE').sort((a, b) => (b.confidence - a.confidence) || a.playerId.localeCompare(b.playerId)).slice(0, 24)) add(entry.playerId, 'MARKET', 78)
  for (const item of world.organizationKnowledge.filter((entry) => entry.organizationId === organizationId).sort((a, b) => a.subjectPlayerId.localeCompare(b.subjectPlayerId)).slice(0, 24)) add(item.subjectPlayerId, 'KNOWN', 68)

  for (const draft of Object.values(world.draftsById).filter((item) => item.status === 'scheduled' && compareGameDates(item.scheduledOn, world.currentDate) > 0 && daysUntil(world.currentDate, item.scheduledOn) <= 90).sort((a, b) => compareGameDates(a.scheduledOn, b.scheduledOn) || a.id.localeCompare(b.id))) {
    const ecosystemRelevant = teams.some((team) => Object.values(world.competitions).some((competition) => competition.ecosystemId === draft.ecosystemId && competition.participantTeamIds.includes(team.id)))
    if (!ecosystemRelevant) continue
    const base = Math.max(70, 100 - Math.floor(daysUntil(world.currentDate, draft.scheduledOn) / 4))
    for (const playerId of getAvailableDraftProspects(world, draft.id).slice(0, 32)) add(playerId, 'DRAFT', base)
  }
  const teamIds = new Set(teams.map((team) => team.id))
  const boardEntries = world.recruitingBoards.filter((entry) => teamIds.has(entry.programTeamId)).map((entry) => ({ entry, profile: world.recruitProfilesById[entry.recruitId] })).filter((item) => item.profile?.status === 'open').sort((a, b) => recruitingPriority(a.entry.priority) - recruitingPriority(b.entry.priority) || a.entry.recruitId.localeCompare(b.entry.recruitId))
  for (const { entry, profile } of boardEntries.slice(0, 24)) add(profile!.playerId, 'RECRUITING', entry.priority === 'high' ? 105 : entry.priority === 'normal' ? 95 : 85)

  for (const team of teams) {
    const game = getNextScheduledGame(world, team.id)
    if (game !== undefined) {
      const opponentTeamId = game.homeTeamId === team.id ? game.awayTeamId : game.homeTeamId
      for (const playerId of world.teams[opponentTeamId]?.rosterPlayerIds ?? []) add(playerId, 'OPPONENT', 40)
    }
  }
  for (const item of Object.values(world.organizationPlayerAwarenessById).filter((entry) => entry.organizationId === organizationId).sort((a, b) => a.discoveredAt.localeCompare(b.discoveredAt) || a.playerId.localeCompare(b.playerId)).slice(0, 48)) add(item.playerId, 'AWARENESS', 55)
  return candidates
}

function scoreCandidate(world: GameWorld, organizationId: OrganizationId, teams: readonly GameWorld['teams'][TeamId][], candidate: AiCandidate): CandidateProjection | undefined {
  const player = world.players[candidate.playerId]
  if (player === undefined) return undefined
  const need = positionalNeeds(world, teams)[player.basketball.primaryPosition] ?? 0
  if (need <= 0 && !candidate.sources.has('DRAFT') && !candidate.sources.has('RECRUITING')) return undefined
  const context = candidate.sources.has('RECRUITING') ? 'RECRUITING' : candidate.sources.has('DRAFT') ? 'DRAFT' : candidate.sources.has('MARKET') ? 'TRADE' : 'FREE_AGENCY'
  const valuation = deriveOrganizationPlayerValuation({ organizationId, playerId: candidate.playerId, knowledge: world.organizationKnowledge, currentDate: world.currentDate, context, publicPosition: player.basketball.primaryPosition, policy: world.organizationEvaluationPoliciesById[organizationId] })
  return { playerId: candidate.playerId, priority: candidate.priority + need * 12 + valuation.priorityScore * .1, context }
}

function chooseMission(world: GameWorld, organizationId: OrganizationId, candidate: CandidateProjection): ScoutingMission | undefined {
  const summary = getPlayerKnowledgeSummary(world, organizationId, candidate.playerId)
  if (summary.knownDomains.length === 0) return 'QUICK_LOOK'
  const knowledge = world.organizationKnowledge.find((item) => item.organizationId === organizationId && item.subjectPlayerId === candidate.playerId)
  const ratingCount = Object.keys(knowledge?.dimensions ?? {}).filter((dimension) => dimension.startsWith('rating:')).length
  if (ratingCount >= PLAYER_TRUTH_RATING_KEYS.length && summary.freshness > REFRESH_FRESHNESS_THRESHOLD) return undefined
  if (summary.freshness <= REFRESH_FRESHNESS_THRESHOLD && candidate.priority >= 65) return 'FULL_REPORT'
  if (ratingCount === 0 && candidate.priority >= FULL_REPORT_PRIORITY_THRESHOLD) return 'FULL_REPORT'
  if (ratingCount > 0) return undefined
  return undefined
}

function chooseEvaluator(world: GameWorld, slots: readonly ScoutSlot[], mission: ScoutingMission): ScoutSlot | undefined {
  const attribute = mission === 'POTENTIAL_EVALUATION' ? 'potentialEvaluation' : 'talentEvaluation'
  // The pool must honour the same evaluator-eligibility contract `requestScouting` enforces (role, employment and the
  // advance-scout mission restriction); otherwise a chosen slot is rejected mid-request and the day transition fails.
  return slots.filter((slot) => isScoutingEvaluatorEligible(world, slot.teamId, slot.staffId, mission) && !calculateStaffWorkload(world, slot.staffId).overloaded && hasScoutingCapacityForMission(world, slot.staffId, mission))
    .map((slot) => {
      const staff = world.staffPeopleById[slot.staffId]!
      const roleFit = calculateStaffRoleProficiencyByRoleId(staff, slot.roleId)
      const attributes = staff.professional.attributes
      const rank = roleFit * .55 + attributes[attribute] * .3 + attributes.analysis * .15 - activeWorkload(world, slot.staffId) * 8
      return { slot, rank }
    })
    .sort((a, b) => b.rank - a.rank || a.slot.staffId.localeCompare(b.slot.staffId))[0]?.slot
}

function hasNonterminalAssignment(world: GameWorld, organizationId: OrganizationId, playerId: PlayerId): boolean {
  return Object.values(world.scoutingAssignmentsById).some((item) => item.organizationId === organizationId && item.subjectPlayerId === playerId && item.status !== 'COMPLETED' && item.status !== 'CANCELLED')
}

function hasSameDayReport(world: GameWorld, organizationId: OrganizationId, playerId: PlayerId): boolean {
  return Object.values(world.evaluatorReportsById).some((item) => item.organizationId === organizationId && item.subjectPlayerId === playerId && item.createdAt === world.currentDate)
}

function positionalNeeds(world: GameWorld, teams: readonly GameWorld['teams'][TeamId][]): Readonly<Record<string, number>> {
  const counts: Record<string, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 }
  for (const playerId of teams.flatMap((team) => team.rosterPlayerIds)) {
    const position = world.players[playerId]?.basketball.primaryPosition
    if (position !== undefined) counts[position] = (counts[position] ?? 0) + 1
  }
  return Object.freeze(Object.fromEntries(Object.entries(counts).map(([position, count]) => [position, Math.max(0, 2 - count)])))
}

function groupFreeAgentsByPosition(world: GameWorld): ReadonlyMap<string, readonly PlayerId[]> {
  const groups = new Map<string, PlayerId[]>()
  for (const player of getFreeAgents(world)) {
    const bucket = groups.get(player.basketball.primaryPosition) ?? []
    bucket.push(player.id)
    groups.set(player.basketball.primaryPosition, bucket)
  }
  for (const bucket of groups.values()) bucket.sort((a, b) => a.localeCompare(b))
  return groups
}

function daysUntil(from: string, to: string): number {
  const fromValue = Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)))
  const toValue = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)))
  return Math.max(0, Math.round((toValue - fromValue) / 86_400_000))
}

function recruitingPriority(priority: 'high' | 'normal' | 'low'): number { return priority === 'high' ? 0 : priority === 'normal' ? 1 : 2 }
