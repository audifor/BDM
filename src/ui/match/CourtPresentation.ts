import type { Player } from '@/domain/player'
import type { TeamId } from '@/domain/ids'
import type { MatchEvent, MatchLineups } from '@/engine/match'

export type CourtVisualRole = 'point' | 'wingLeft' | 'wingRight' | 'forward' | 'interior'

export interface CourtPlayerPresentation {
  readonly player: Player
  readonly teamId: TeamId
  readonly side: 'offense' | 'defense'
  readonly visualRole: CourtVisualRole
  readonly x: number
  readonly y: number
  readonly focused: boolean
}

const ROLES: readonly CourtVisualRole[] = ['point', 'wingLeft', 'wingRight', 'forward', 'interior']
const ROLE_POSITION = { PG: 'point', SG: 'wingLeft', SF: 'wingRight', PF: 'forward', C: 'interior' } as const
const OFFENSE_RIGHT = { point: [43, 50], wingLeft: [57, 20], wingRight: [57, 80], forward: [72, 30], interior: [82, 50] } as const

export function createCourtPresentation(input: { readonly homeTeamId: TeamId; readonly awayTeamId: TeamId; readonly lineups: MatchLineups; readonly attackingTeamId: TeamId; readonly period: number; readonly players: Readonly<Record<string, Player>>; readonly events: readonly MatchEvent[]; readonly progress: number }): readonly CourtPlayerPresentation[] {
  const attackingRight = attacksRight(input.attackingTeamId, input.homeTeamId, input.period)
  const attackingLineup = input.attackingTeamId === input.homeTeamId ? input.lineups.home : input.lineups.away
  const focus = focusPlayer(input.events, attackingLineup, input.players)
  const offense = playersFor(input.attackingTeamId, input.attackingTeamId === input.homeTeamId ? input.lineups.home : input.lineups.away, 'offense', attackingRight, input, focus)
  const defenseTeamId = input.attackingTeamId === input.homeTeamId ? input.awayTeamId : input.homeTeamId
  const defense = playersFor(defenseTeamId, defenseTeamId === input.homeTeamId ? input.lineups.home : input.lineups.away, 'defense', attackingRight, input, focus)
  return [...offense, ...defense]
}

export function attacksRight(teamId: TeamId, homeTeamId: TeamId, period: number): boolean {
  const homeRight = period <= 2
  return teamId === homeTeamId ? homeRight : !homeRight
}

function playersFor(teamId: TeamId, ids: readonly Player['id'][], side: 'offense' | 'defense', offenseRight: boolean, input: Parameters<typeof createCourtPresentation>[0], focusedPlayerId: Player['id']): readonly CourtPlayerPresentation[] {
  const assignments = assignRoles(ids, input.players)
  return assignments.map(({ player, role }, index) => {
    const [baseX, baseY] = OFFENSE_RIGHT[role]
    const attackX = offenseRight ? baseX : 100 - baseX
    const defenseOffset = offenseRight ? 7 : -7
    const wave = Math.sin(input.progress * Math.PI) * (side === 'offense' ? (index - 2) * 1.4 : (2 - index) * .8)
    let x = side === 'offense' ? attackX + wave : attackX + defenseOffset + wave
    let y = side === 'offense' ? baseY + Math.cos(input.progress * Math.PI + index) * 2 : baseY + Math.cos(input.progress * Math.PI + index) * 1.2
    if (side === 'offense' && player.id === focusedPlayerId) [x, y] = focusTarget(input.events, x, y, input.progress, offenseRight)
    return { player, teamId, side, visualRole: role, x: clamp(x), y: clamp(y), focused: player.id === focusedPlayerId }
  })
}

function assignRoles(ids: readonly Player['id'][], players: Readonly<Record<string, Player>>): readonly { readonly player: Player; readonly role: CourtVisualRole }[] {
  const available = [...ROLES]
  return [...ids].map((id) => players[id]!).sort((left, right) => left.id.localeCompare(right.id)).map((player) => {
    const preferred = ROLE_POSITION[player.basketball.primaryPosition]
    const role = available.includes(preferred) ? preferred : available[0]!
    available.splice(available.indexOf(role), 1)
    return { player, role }
  })
}

function focusPlayer(events: readonly MatchEvent[], attackingLineup: readonly Player['id'][], players: Readonly<Record<string, Player>>): Player['id'] {
  const event = [...events].reverse().find((candidate) => candidate.type === 'shotMade' || candidate.type === 'shotMissed' || candidate.type === 'turnover' || candidate.type === 'rebound' || candidate.type === 'freeThrowMade' || candidate.type === 'freeThrowMissed')
  if (event !== undefined && 'playerId' in event) return event.playerId
  return assignRoles(attackingLineup, players).find((entry) => entry.role === 'point')?.player.id ?? attackingLineup[0]!
}

function focusTarget(events: readonly MatchEvent[], x: number, y: number, progress: number, offenseRight: boolean): readonly [number, number] {
  const event = [...events].reverse().find((candidate) => candidate.type === 'shotMade' || candidate.type === 'shotMissed')
  if (event === undefined || progress < .75) return [x, y]
  const target = event.shotZone === 'rim' ? [offenseRight ? 91 : 9, 50] : event.shotZone === 'midRange' ? [offenseRight ? 72 : 28, 50] : [offenseRight ? 61 : 39, 18]
  const amount = (progress - .75) / .25
  return [x + (target[0] - x) * amount, y + (target[1] - y) * amount]
}

function clamp(value: number): number { return Math.max(0, Math.min(100, value)) }
