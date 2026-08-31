import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { getNextScheduledGame, updateGameWorld, type GameWorld } from '@/domain/world'
import { CANONICAL_RATING_KEYS, TENDENCY_KEYS, canonicalizeLegacyRatings } from '@/domain/player'
import { playerIdFromString } from '@/domain/ids'
import { organizationIdForTeam, staffPersonIdFromString, teamStaffAssignmentIdFromString, type TeamId } from '@/domain/ids'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { deriveOrganizationPlayerValuation } from '@/domain/intelligence'
import { requestScouting } from '@/engine/scouting'
import { progressOppositionScoutingReports } from '@/engine/tactics/OppositionScoutingReportEngine'
import { serializeGameWorldV1 } from './GameWorldSaveV1'
import { deserializeGameWorldSave, deserializeGameWorldV2, migrateGameWorldSaveV1ToV2, parseCanonicalRatingsV2, parsePlayerTendenciesV2, serializeGameWorldV2 } from './GameWorldSaveV2'
import { ensurePlayerKnowledge } from '@/engine/world'
import { setLineupSlot } from '@/engine/tactics/LineupEngine'

const savedAt = '2032-10-01T00:00:00.000Z'
describe('GameWorldSaveV2', () => {
  it('serializes canonical player truth only and round-trips V2', () => {
    const world = createNewGame(); const saved = serializeGameWorldV2(world, savedAt)
    expect(saved.schemaVersion).toBe(2)
    const player = saved.payload.players[0] as { basketball: { ratings: Record<string, number>; tendencies: Record<string, number> } }
    expect(Object.keys(player.basketball.ratings)).toEqual(CANONICAL_RATING_KEYS)
    expect(Object.keys(player.basketball.tendencies)).toEqual(TENDENCY_KEYS)
    expect(deserializeGameWorldV2(saved).players).toEqual(world.players)
  })
  it('round-trips sparse tactical and game-plan state with neutral legacy defaults', () => {
    const base=createNewGame();const team=Object.values(base.teams)[0]!,game=Object.values(base.games)[0]!
    const world=updateGameWorld(base,{tacticalPlansByTeamId:{...base.tacticalPlansByTeamId,[team.id]:{teamId:team.id,instructions:{pace:1,shotProfile:{rim:1,midRange:0,threePoint:-1},defense:{interior:0,perimeter:0}}}},gamePlansByKey:{[`${game.id}:${team.id}`]:{gameId:game.id,teamId:team.id,tacticalOverride:{pace:-1}}}})
    const loaded=deserializeGameWorldV2(serializeGameWorldV2(world,savedAt))
    expect(loaded.tacticalPlansByTeamId).toEqual(world.tacticalPlansByTeamId);expect(loaded.gamePlansByKey).toEqual(world.gamePlansByKey)
  })
  it('round-trips a canonical team lineup through save/load', () => {
    const base = createNewGame()
    const team = Object.values(base.teams)[0]!
    const [first, second] = team.rosterPlayerIds
    const world = setLineupSlot(setLineupSlot(base, team.id, 'PG', first!), team.id, 'B1', second!)

    const loaded = deserializeGameWorldV2(serializeGameWorldV2(world, savedAt))
    expect(loaded.lineupsByTeamId[team.id]).toEqual(world.lineupsByTeamId[team.id])
    expect(loaded.lineupsByTeamId[team.id]!.starters.PG).toBe(first)
    expect(loaded.lineupsByTeamId[team.id]!.bench.B1).toBe(second)
  })
  it('migrates a V1 envelope deterministically without mutating it', () => {
    const v1 = serializeGameWorldV1(ensurePlayerKnowledge(createNewGame()), savedAt); const snapshot = JSON.stringify(v1)
    const first = migrateGameWorldSaveV1ToV2(v1), second = migrateGameWorldSaveV1ToV2(v1)
    const loaded = deserializeGameWorldV2(first)
    expect(first).toEqual(second); expect(JSON.stringify(v1)).toBe(snapshot); expect(deserializeGameWorldSave(v1)).toEqual(loaded)
    expect(first.payload.playerKnowledge).toEqual([])
    expect(loaded.organizationKnowledge).toHaveLength(v1.payload.playerKnowledge.length)
    const source = v1.payload.playerKnowledge[0] as { observerTeamId: string; subjectPlayerId: string; assessedOn: string; basketball: { ratings: { shooting: { estimatedValue: number; uncertainty: number } } } }
    const migrated = loaded.organizationKnowledge[0]!
    expect(migrated.organizationId).toBe(source.observerTeamId); expect(migrated.subjectPlayerId).toBe(source.subjectPlayerId)
    expect(migrated.dimensions.shooting).toMatchObject({ assessedAt: source.assessedOn, provenance: 'legacyBaseline', estimate: source.basketball.ratings.shooting.estimatedValue, uncertainty: source.basketball.ratings.shooting.uncertainty })
    expect(deserializeGameWorldV2(serializeGameWorldV2(loaded, savedAt)).organizationKnowledge).toEqual(loaded.organizationKnowledge)
  })

  it('enforces independent closed V2 player contracts', () => {
    const world = createNewGame(); const saved = serializeGameWorldV2(world, savedAt)
    const first = saved.payload.players[0] as { basketball: { ratings: Record<string, unknown>; tendencies: Record<string, unknown> }; development: { ceilings: Record<string, unknown> } }
    expect(Object.keys(parseCanonicalRatingsV2(first.basketball.ratings))).toHaveLength(35)
    expect(parsePlayerTendenciesV2(first.basketball.tendencies)).toMatchObject(first.basketball.tendencies)
    for (const mutate of [
      (copy: typeof saved) => { delete (copy.payload.players[0] as { basketball: { ratings: Record<string, unknown> } }).basketball.ratings.midRangeShooting },
      (copy: typeof saved) => { (copy.payload.players[0] as { basketball: { ratings: Record<string, unknown> } }).basketball.ratings.unknown = 50 },
      (copy: typeof saved) => { (copy.payload.players[0] as { basketball: { ratings: Record<string, unknown> } }).basketball.ratings.midRangeShooting = 0 },
      (copy: typeof saved) => { (copy.payload.players[0] as { basketball: { ratings: Record<string, unknown> } }).basketball.ratings.midRangeShooting = 101 },
      (copy: typeof saved) => { (copy.payload.players[0] as { basketball: { ratings: Record<string, unknown> } }).basketball.ratings.midRangeShooting = Number.NaN },
      (copy: typeof saved) => { delete (copy.payload.players[0] as { basketball: { tendencies: Record<string, unknown> } }).basketball.tendencies.drive },
      (copy: typeof saved) => { (copy.payload.players[0] as { basketball: { tendencies: Record<string, unknown> } }).basketball.tendencies.unknown = 50 },
      (copy: typeof saved) => { delete (copy.payload.players[0] as { development: { ceilings: Record<string, unknown> } }).development.ceilings.shooting },
      (copy: typeof saved) => { (copy.payload.players[0] as { development: { ceilings: Record<string, unknown> } }).development.ceilings.unknown = 70 },
    ]) {
      const copy = structuredClone(saved); mutate(copy); expect(() => deserializeGameWorldV2(copy)).toThrow()
    }
    const v1Ratings = { finishing: 50, shooting: 50, playmaking: 50, perimeterDefense: 50, interiorDefense: 50, rebounding: 50, athleticism: 50 }
    const wrongShape = structuredClone(saved); (wrongShape.payload.players[0] as { basketball: { ratings: unknown } }).basketball.ratings = v1Ratings
    expect(() => deserializeGameWorldV2(wrongShape)).toThrow()
    const legacyPotential = structuredClone(saved); const player = legacyPotential.payload.players[0] as Record<string, unknown>; delete player.development; player.potential = { ceiling: 80 }
    expect(() => deserializeGameWorldV2(legacyPotential)).toThrow()
  })

  it('keeps V2 knowledge sparse on creation, V1 migration, and V2 load', () => {
    const world = createNewGame(); expect(world.organizationKnowledge).toEqual([])
    const v1 = serializeGameWorldV1(ensurePlayerKnowledge(world), savedAt)
    const sourceRecords = v1.payload.playerKnowledge.slice(0, 3)
    const sparseV1 = structuredClone(v1); (sparseV1.payload as unknown as { playerKnowledge: readonly typeof sourceRecords[number][] }).playerKnowledge = sourceRecords
    const migrated = migrateGameWorldSaveV1ToV2(sparseV1)
    const loaded = deserializeGameWorldV2(migrated)
    expect(loaded.organizationKnowledge).toHaveLength(3)
    expect(new Set(loaded.organizationKnowledge.map((entry) => entry.subjectPlayerId))).toEqual(new Set(sourceRecords.map((entry) => (entry as { subjectPlayerId: string }).subjectPlayerId)))
    const unseen = Object.keys(world.players).find((id) => !sourceRecords.some((entry) => (entry as { subjectPlayerId: string }).subjectPlayerId === id))!
    expect(loaded.organizationKnowledge.some((entry) => entry.subjectPlayerId === unseen)).toBe(false)
    expect(deserializeGameWorldV2(serializeGameWorldV2(loaded, savedAt)).organizationKnowledge).toHaveLength(3)
    expect(loaded.organizationKnowledge.every((entry) => Object.keys(entry.dimensions).length === 7)).toBe(true)
  })

  it('round-trips policy, knowledge, and derived valuation without persisting valuation authority', () => {
    const base = createNewGame(); const team = Object.values(base.teams)[0]!, player = Object.values(base.players)[0]!, organizationId = organizationIdForTeam(team.id)
    const world = updateGameWorld(base, { organizationKnowledge: [{ organizationId, subjectPlayerId: player.id, dimensions: { shooting: { coverage: .8, confidence: .9, assessedAt: base.currentDate, provenance: 'scoutReport', estimate: 82, uncertainty: 4 } } }] })
    const before = deriveOrganizationPlayerValuation({ organizationId, playerId: player.id, knowledge: world.organizationKnowledge, currentDate: world.currentDate, context: 'TRADE', policy: world.organizationEvaluationPoliciesById[organizationId] })
    const saved = serializeGameWorldV2(world, savedAt); const loaded = deserializeGameWorldV2(saved)
    expect(loaded.organizationEvaluationPoliciesById).toEqual(world.organizationEvaluationPoliciesById); expect(loaded.organizationKnowledge).toEqual(world.organizationKnowledge)
    expect(deriveOrganizationPlayerValuation({ organizationId, playerId: player.id, knowledge: loaded.organizationKnowledge, currentDate: loaded.currentDate, context: 'TRADE', policy: loaded.organizationEvaluationPoliciesById[organizationId] })).toEqual(before)
    expect(JSON.stringify(saved)).not.toMatch(/derivedPlayerValue|organizationPlayerValue|draftTalentScore|recruitingTalentScore|freeAgentTalentScore|tradeTalentScore/)
    const old = structuredClone(saved); delete (old.payload.scoutingRuntime as Record<string, unknown>).organizationPolicies
    expect(deserializeGameWorldV2(old).organizationEvaluationPoliciesById).toEqual(world.organizationEvaluationPoliciesById)
  })

  it('V2 round-trip preserves OrganizationKnowledge.provenance === "staffFamiliarity"', () => {
    const base = createNewGame(); const team = Object.values(base.teams)[0]!, player = Object.values(base.players)[0]!, organizationId = organizationIdForTeam(team.id)
    const world = updateGameWorld(base, { organizationKnowledge: [{ organizationId, subjectPlayerId: player.id, dimensions: { shooting: { coverage: .5, confidence: .5, assessedAt: base.currentDate, provenance: 'staffFamiliarity', estimate: 60, uncertainty: 6 } } }] })
    const loaded = deserializeGameWorldV2(serializeGameWorldV2(world, savedAt))
    expect(loaded.organizationKnowledge).toEqual(world.organizationKnowledge)
    expect(loaded.organizationKnowledge[0]!.dimensions.shooting!.provenance).toBe('staffFamiliarity')
  })

  it('V2 round-trip preserves ScoutingAssignment.staffQualityScore', () => {
    const base = createNewGame(); const team = Object.values(base.teams)[0]!, player = Object.values(base.players).find((candidate) => !team.rosterPlayerIds.includes(candidate.id))!
    const scout = Object.values(base.teamStaffAssignmentsById).find((item) => item.teamId === team.id && item.role === 'regionalScout')!
    const world = requestScouting(base, { organizationId: organizationIdForTeam(team.id), playerId: player.id, missionType: 'QUICK_LOOK', evaluatorStaffId: scout.staffPersonId, requestedBy: 'SCOUTING_DEPARTMENT', staffQualityScore: 73 })
    const assignment = Object.values(world.scoutingAssignmentsById)[0]!
    expect(assignment.staffQualityScore).toBe(73)
    const loaded = deserializeGameWorldV2(serializeGameWorldV2(world, savedAt))
    expect(Object.values(loaded.scoutingAssignmentsById)[0]!.staffQualityScore).toBe(73)
  })

  it('HEAD_COACH assignment without staffQualityScore round-trips identically (still undefined)', () => {
    const base = createNewGame(); const team = Object.values(base.teams)[0]!, player = Object.values(base.players).find((candidate) => !team.rosterPlayerIds.includes(candidate.id))!
    const scout = Object.values(base.teamStaffAssignmentsById).find((item) => item.teamId === team.id && item.role === 'regionalScout')!
    const world = requestScouting(base, { organizationId: organizationIdForTeam(team.id), playerId: player.id, missionType: 'QUICK_LOOK', evaluatorStaffId: scout.staffPersonId, requestedBy: 'HEAD_COACH' })
    const assignment = Object.values(world.scoutingAssignmentsById)[0]!
    expect(assignment.staffQualityScore).toBeUndefined()
    const loaded = deserializeGameWorldV2(serializeGameWorldV2(world, savedAt))
    expect(Object.values(loaded.scoutingAssignmentsById)[0]!.staffQualityScore).toBeUndefined()
    expect(Object.values(loaded.scoutingAssignmentsById)[0]!).toEqual(assignment)
  })

  it('rejects a saved ScoutingAssignment.staffQualityScore below 0', () => {
    const base = createNewGame(); const team = Object.values(base.teams)[0]!, player = Object.values(base.players).find((candidate) => !team.rosterPlayerIds.includes(candidate.id))!
    const scout = Object.values(base.teamStaffAssignmentsById).find((item) => item.teamId === team.id && item.role === 'regionalScout')!
    const world = requestScouting(base, { organizationId: organizationIdForTeam(team.id), playerId: player.id, missionType: 'QUICK_LOOK', evaluatorStaffId: scout.staffPersonId, requestedBy: 'SCOUTING_DEPARTMENT', staffQualityScore: 50 })
    const saved = serializeGameWorldV2(world, savedAt)
    const tampered = structuredClone(saved); (tampered.payload.scoutingRuntime as { assignments: Record<string, unknown>[] }).assignments[0]!.staffQualityScore = -1
    expect(() => deserializeGameWorldV2(tampered)).toThrow()
  })

  it('rejects a saved ScoutingAssignment.staffQualityScore above 100', () => {
    const base = createNewGame(); const team = Object.values(base.teams)[0]!, player = Object.values(base.players).find((candidate) => !team.rosterPlayerIds.includes(candidate.id))!
    const scout = Object.values(base.teamStaffAssignmentsById).find((item) => item.teamId === team.id && item.role === 'regionalScout')!
    const world = requestScouting(base, { organizationId: organizationIdForTeam(team.id), playerId: player.id, missionType: 'QUICK_LOOK', evaluatorStaffId: scout.staffPersonId, requestedBy: 'SCOUTING_DEPARTMENT', staffQualityScore: 50 })
    const saved = serializeGameWorldV2(world, savedAt)
    const tampered = structuredClone(saved); (tampered.payload.scoutingRuntime as { assignments: Record<string, unknown>[] }).assignments[0]!.staffQualityScore = 101
    expect(() => deserializeGameWorldV2(tampered)).toThrow()
  })

  it('V2 round-trip preserves OppositionScoutingReport through the canonical runtime flow', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams).map((team) => team.id).find((id) => getNextScheduledGame(base, id) !== undefined) as TeamId | undefined
    if (teamId === undefined) return
    const staffId = staffPersonIdFromString(`v2-opp-report-staff-${teamId}`)
    const flatAttributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 50])) as Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>
    const withStaff = updateGameWorld(base, {
      staffPeople: [...Object.values(base.staffPeopleById), { id: staffId, identity: { firstName: 'V2', lastName: 'Report' }, professional: { attributes: flatAttributes } }],
      teamStaffAssignments: [...Object.values(base.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString(`v2-opp-report-assignment-${teamId}`), staffPersonId: staffId, teamId, role: 'advanceScout', assignedOn: base.currentDate }],
    })
    const delegated = updateGameWorld(withStaff, {
      responsibilities: [...Object.values(withStaff.responsibilitiesById).filter((r) => r.id !== (`responsibility:${teamId}:oppositionScouting` as never)), { id: `responsibility:${teamId}:oppositionScouting` as never, teamId, kind: 'oppositionScouting', mode: 'advisory', holderStaffId: staffId }],
    })
    const progressed = progressOppositionScoutingReports(delegated)
    expect(Object.keys(progressed.oppositionScoutingReportsById)).toHaveLength(1)
    const loaded = deserializeGameWorldV2(serializeGameWorldV2(progressed, savedAt))
    expect(loaded.oppositionScoutingReportsById).toEqual(progressed.oppositionScoutingReportsById)
  })

  it('a V2 save predating oppositionScoutingReports/staffQualityScore (additive fields absent) still loads correctly', () => {
    const base = createNewGame(); const saved = serializeGameWorldV2(base, savedAt)
    const legacyPayload = structuredClone(saved)
    delete (legacyPayload.payload as unknown as Record<string, unknown>).oppositionScoutingReports
    const loaded = deserializeGameWorldV2(legacyPayload)
    expect(loaded.oppositionScoutingReportsById).toEqual({})
    expect(loaded.scoutingAssignmentsById).toEqual({})
  })

  it('migrates identical legacy inputs deterministically while identity diversifies canonical detail', () => {
    const legacy = { finishing: 50, shooting: 50, playmaking: 50, perimeterDefense: 50, interiorDefense: 50, rebounding: 50, athleticism: 50 }
    const first = canonicalizeLegacyRatings(playerIdFromString('migration-a'), legacy)
    expect(canonicalizeLegacyRatings(playerIdFromString('migration-a'), legacy)).toEqual(first)
    const second = canonicalizeLegacyRatings(playerIdFromString('migration-b'), legacy)
    expect(CANONICAL_RATING_KEYS.some((key) => first[key] !== second[key])).toBe(true)
    for (const ratings of [first, second]) for (const value of Object.values(ratings)) expect(value).toBeGreaterThanOrEqual(1)
  })
})
