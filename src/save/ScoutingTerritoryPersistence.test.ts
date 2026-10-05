import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game/createNewGame'
import { createRecruitmentFocus, endScoutingTerritoryAssignment } from '@/app/scouting'
import { getUserTeam } from '@/engine/calendar'
import { progressScoutingTerritoryAssignments } from '@/engine/scouting'
import { serializeGameWorldV2, deserializeGameWorldV2 } from './GameWorldSaveV2'
import { serializeGameWorldV3, deserializeGameWorldV3 } from './GameWorldSaveV3'
import { serializeGameWorldV4, deserializeGameWorldV4 } from './GameWorldSaveV4'

const savedAt = '2032-10-01T00:00:00.000Z'

describe('scouting territory persistence', () => {
  it.each([
    ['V2', serializeGameWorldV2, deserializeGameWorldV2],
    ['V3', serializeGameWorldV3, deserializeGameWorldV3],
    ['V4', serializeGameWorldV4, deserializeGameWorldV4],
  ] as const)('%s preserves active/ended operations and awareness', (_version, serialize, deserialize) => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const game = Object.values(base.games).find((candidate) => candidate.homeTeamId === team.id || candidate.awayTeamId === team.id)!
    const scout = Object.values(base.teamStaffAssignmentsById).find((item) => item.teamId === team.id && item.role === 'regionalScout')!
    const territory = { kind: 'COMPETITION' as const, competitionId: game.competitionId }
    const focused = createRecruitmentFocus(base, team.id, { name: 'Young guards', positions: ['PG', 'SG'], minimumAge: 18, maximumAge: 24, territories: [territory], scoutStaffIds: [scout.staffPersonId], priority: 'HIGH', duration: 'MEDIUM' })
    const active = focused
    const discovered = progressScoutingTerritoryAssignments(active)
    const ended = endScoutingTerritoryAssignment(discovered, Object.keys(discovered.scoutingTerritoryAssignmentsById)[0]!)
    const restored = deserialize(serialize(ended, savedAt))
    expect(restored.scoutingTerritoryAssignmentsById).toEqual(ended.scoutingTerritoryAssignmentsById)
    expect(restored.organizationPlayerAwarenessById).toEqual(ended.organizationPlayerAwarenessById)
    expect(restored.scoutingRecruitmentFocusesById).toEqual(ended.scoutingRecruitmentFocusesById)
  })

  it('defaults old V2 scouting runtimes without territory state to empty collections', () => {
    const saved = serializeGameWorldV2(createNewGame(), savedAt)
    const scoutingRuntime = { ...saved.payload.scoutingRuntime! } as Record<string, unknown>
    delete scoutingRuntime.territoryAssignments
    delete scoutingRuntime.playerAwareness
    const restored = deserializeGameWorldV2({ ...saved, payload: { ...saved.payload, scoutingRuntime } })
    expect(restored.scoutingTerritoryAssignmentsById).toEqual({})
    expect(restored.organizationPlayerAwarenessById).toEqual({})
  })
})
