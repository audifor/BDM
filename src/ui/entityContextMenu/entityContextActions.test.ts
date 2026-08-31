import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game/createNewGame'
import { getTeamRoster } from '@/domain/world'
import { getNextUserGame, getUserTeam } from '@/engine/calendar'
import { setLineupSlot } from '@/engine/tactics/LineupEngine'

import { resolveEntityContextActions } from './entityContextActions'

function actionIds(entries: readonly ReturnType<typeof resolveEntityContextActions>[number][]): readonly string[] {
  return entries.flatMap((entry) => entry.kind === 'submenu' ? [entry.id, ...actionIds(entry.children)] : entry.kind === 'action' ? [entry.id] : [])
}

describe('resolveEntityContextActions matchup defenders', () => {
  it('uses canonical starter slots even when a starter plays outside their primary position', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const roster = getTeamRoster(base, team.id)
    const offPositionStarter = roster.find((player) => player.basketball.primaryPosition !== 'PG')!
    const world = setLineupSlot(base, team.id, 'PG', offPositionStarter.id)
    const starterIds = new Set(Object.values(world.lineupsByTeamId[team.id]!.starters).filter((id): id is NonNullable<typeof id> => id !== undefined))
    const nonStarter = roster.find((player) => !starterIds.has(player.id))!
    const game = getNextUserGame(world)!
    const opponentTeamId = game.homeTeamId === team.id ? game.awayTeamId : game.homeTeamId
    const opponentPlayerId = world.teams[opponentTeamId]!.rosterPlayerIds[0]!

    const ids = actionIds(resolveEntityContextActions(world, { type: 'player', id: opponentPlayerId }, { surface: 'matchups' }))

    expect(ids).toContain(`defender-${offPositionStarter.id}`)
    expect(ids).not.toContain(`defender-${nonStarter.id}`)
  })
})
