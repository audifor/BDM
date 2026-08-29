import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { updateGameWorld } from '@/domain/world'
import { CANONICAL_RATING_KEYS, TENDENCY_KEYS, canonicalizeLegacyRatings } from '@/domain/player'
import { playerIdFromString } from '@/domain/ids'
import { organizationIdForTeam } from '@/domain/ids'
import { deriveOrganizationPlayerValuation } from '@/domain/intelligence'
import { serializeGameWorldV1 } from './GameWorldSaveV1'
import { deserializeGameWorldSave, deserializeGameWorldV2, migrateGameWorldSaveV1ToV2, parseCanonicalRatingsV2, parsePlayerTendenciesV2, serializeGameWorldV2 } from './GameWorldSaveV2'
import { ensurePlayerKnowledge } from '@/engine/world'

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

  it('migrates identical legacy inputs deterministically while identity diversifies canonical detail', () => {
    const legacy = { finishing: 50, shooting: 50, playmaking: 50, perimeterDefense: 50, interiorDefense: 50, rebounding: 50, athleticism: 50 }
    const first = canonicalizeLegacyRatings(playerIdFromString('migration-a'), legacy)
    expect(canonicalizeLegacyRatings(playerIdFromString('migration-a'), legacy)).toEqual(first)
    const second = canonicalizeLegacyRatings(playerIdFromString('migration-b'), legacy)
    expect(CANONICAL_RATING_KEYS.some((key) => first[key] !== second[key])).toBe(true)
    for (const ratings of [first, second]) for (const value of Object.values(ratings)) expect(value).toBeGreaterThanOrEqual(1)
  })
})
