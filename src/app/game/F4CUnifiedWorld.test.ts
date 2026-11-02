import { describe, expect, it } from 'vitest'

import { createConfiguredGameAsync } from './createConfiguredGame'
import { WORLD_DB_V2_UNIVERSE_ID } from './NewGameUniverseCatalog'
import { buildNcaaD1Real2026ConferenceSnapshot } from './NcaaD1Real2026Conferences'
import { createWorldDbV2UniverseFromSnapshots, mergeGameWorlds } from './WorldDbV2Universe'
import { WORLDDB_V2_COMPETITIONS } from './WorldDbV2Competitions'
import type { WorldDbV2Snapshot } from '@/tauri/TauriWorldDbV2'
import { getUserTeam } from '@/engine/calendar'
import { deserializeGameWorldSaveV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'

describe('F4C unified WorldDB career', () => {
  it('creates both NCAA categories in one GameWorld and preserves them through Save V4', async () => {
    const women = buildNcaaD1Real2026ConferenceSnapshot('women')
    const world = await createConfiguredGameAsync({
      universeId: WORLD_DB_V2_UNIVERSE_ID,
      worldDbV2: {
        sourceRoot: 'unused-for-ncaa-only-unified-fixture',
        startDate: '2026-10-01',
        seed: 'f4c-unified-world',
        activeCompetitionIds: [],
        reducedCompetitionIds: [],
        includeNcaa: true,
      },
      userTeamKey: String(women.teams[0]!.id),
      ncaaSeed: 202627,
      userCoachCreation: {
        firstName: 'F4C', lastName: 'Unified', dateOfBirth: '1988-01-01', gender: 'female',
        nationalityCountryCode: 'USA', background: 'academyCoach', ambition: 'talentDeveloper', biography: '',
        coachingStyle: 'developer', disposition: 'balanced',
      },
    })

    expect(world.currentSeasonId).toContain('ncaa-d1-women')
    expect(Object.keys(world.teams)).toHaveLength(728)
    expect(Object.values(world.competitions).filter(item => item.ecosystemId.toString().includes('ncaa-d1-men'))).toHaveLength(1)
    expect(Object.values(world.competitions).filter(item => item.ecosystemId.toString().includes('ncaa-d1-women'))).toHaveLength(1)
    expect(getUserTeam(world)?.id).toBe(women.teams[0]!.id)

    const restored = deserializeGameWorldSaveV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, '2026-10-01T12:00:00Z'))))
    expect(Object.keys(restored.teams)).toHaveLength(728)
    expect(Object.keys(restored.teams).sort()).toEqual(Object.keys(world.teams).sort())
    expect(Object.keys(restored.competitions).sort()).toEqual(Object.keys(world.competitions).sort())
    expect(Object.keys(restored.seasons).sort()).toEqual(Object.keys(world.seasons).sort())
    const membershipKey = (item: typeof world.conferenceMemberships[number]) => JSON.stringify({ teamId: item.teamId, conferenceId: item.conferenceId, seasonId: item.seasonId })
    expect(new Set(restored.conferenceMemberships.map(membershipKey))).toEqual(new Set(world.conferenceMemberships.map(membershipKey)))
    expect(Object.keys(restored.personalitiesByPersonId).sort()).toEqual(Object.keys(world.personalitiesByPersonId).sort())
    expect(Object.keys(restored.staffReputationProfilesByStaffId)).toHaveLength(728)
    expect(restored.userCoachId).toBe(world.userCoachId)
  }, 120_000)

  it('composes a selected WorldDB competition with the same NCAA world and clock', async () => {
    const women = buildNcaaD1Real2026ConferenceSnapshot('women')
    const competition = WORLDDB_V2_COMPETITIONS[0]!
    const snapshot = fixtureSnapshot(competition.sourceCompetitionId, competition.countryId, competition.countryCode, competition.teamCount)
    const pbm = await createWorldDbV2UniverseFromSnapshots([snapshot], snapshot.clubs[0]!.entity_id)
    const ncaa = await createConfiguredGameAsync({
      universeId: WORLD_DB_V2_UNIVERSE_ID,
      worldDbV2: {
        sourceRoot: 'unused-for-ncaa-only-unified-fixture',
        startDate: '2026-10-01',
        seed: 'f4c-mixed-world',
        activeCompetitionIds: [],
        reducedCompetitionIds: [],
        includeNcaa: true,
      },
      userTeamKey: String(women.teams[0]!.id),
      ncaaSeed: 202627,
    })
    const world = mergeGameWorlds(pbm, ncaa)

    expect(Object.keys(world.teams)).toHaveLength(728 + competition.teamCount)
    expect(Object.values(world.competitions).some(item => item.ecosystemId.toString().includes('ncaa-d1-men'))).toBe(true)
    expect(Object.values(world.competitions).some(item => item.ecosystemId.toString().includes('ncaa-d1-women'))).toBe(true)
    expect(world.worldDbCompetitionRuntime?.worldDbV2?.activeCompetitionIds).toEqual([competition.sourceCompetitionId])
    expect(getUserTeam(world)?.id).toBe(snapshot.clubs[0]!.entity_id)
  }, 180_000)
})

function fixtureSnapshot(sourceCompetitionId: string, countryId: number, countryCode: string, teamCount: number): WorldDbV2Snapshot {
  const countries = [{ entity_id: `pbm:DYN_pays:${countryId}`, parent_id: null, source_table: 'DYN_pays', reference_data: { nom_pays: countryCode, abreviation: countryCode } }]
  const clubs = Array.from({ length: teamCount }, (_, i) => ({ entity_id: `f4c:club:${i}`, parent_id: `pbm:DYN_pays:${countryId}`, source_table: 'DYN_equipe', reference_data: { nom_equipe: `F4C Club ${i}`, sexe: 0 } }))
  const people = clubs.flatMap(club => Array.from({ length: 6 }, (_, i) => ({ entity_id: `${club.entity_id}:${i === 5 ? 'staff' : 'player'}:${i}`, parent_id: club.entity_id, source_table: i === 5 ? 'DYN_person' : 'DYN_joueur', reference_data: { is_alive: 1, retraite: 0, sexe: 0, annee_naissance: 1995, mois_naissance: 1, jour_naissance: 1, joueur_prenom: 'F4C', joueur_nom: `${club.entity_id}:${i}`, prenom: 'F4C', nom: club.entity_id, nationalite: countryId, nationalite_id: countryId, job_preference_coach: 1, aptitude_meneur: i === 0 ? 100 : 1, aptitude_arriere: i === 1 ? 100 : 1, aptitude_ailier: i === 2 ? 100 : 1, aptitude_interieur: i === 3 ? 100 : 1, aptitude_pivot: i === 4 ? 100 : 1 } })))
  return { manifest: { master: { sha256: 'f'.repeat(64) }, configuration: { start_date: '2026-10-01', seed: 'f4c-mixed-world' } }, countries, clubs, people, competitions: [{ entity_id: sourceCompetitionId, parent_id: null, source_table: 'DYN_championnat', reference_data: {} }] }
}
