import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createNewGame } from './createNewGame'
import { createLiveUserMatch, prepareUserMatch } from './playUserGame'
import { getUserTeam } from '@/engine/calendar'
import { getTeamRoster } from '@/domain/world'
import { setLineupSlot } from '@/engine/tactics/LineupEngine'
import { calculatePlayerImpact } from '@/engine/team'
import type { GameWorld } from '@/domain/world'
import type { PlayerId, TeamId } from '@/domain/ids'

const STARTER_SLOTS = ['PG', 'SG', 'SF', 'PF', 'C'] as const
const BENCH_SLOTS = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'] as const

function withUserLineup(world: GameWorld, starterIds: readonly PlayerId[], benchIds: readonly PlayerId[]): GameWorld {
  const team = getUserTeam(world)!
  const withStarters = STARTER_SLOTS.reduce((next, slot, index) => setLineupSlot(next, team.id, slot, starterIds[index]!), world)
  return benchIds.reduce((next, playerId, index) => setLineupSlot(next, team.id, BENCH_SLOTS[index]!, playerId), withStarters)
}

function firstAutomaticReplacementFor(simulation: ReturnType<typeof prepareUserMatch>, teamId: TeamId, starterIds: readonly PlayerId[]): PlayerId | undefined {
  const event = simulation.events.find((candidate) => candidate.type === 'substitution' && candidate.source === 'automatic' && candidate.teamId === teamId && starterIds.includes(candidate.playerOutId))
  return event !== undefined && event.type === 'substitution' ? event.playerInId : undefined
}

describe('rotation bench candidate selection is quality-independent (MG2C / MG1 BUG-4)', () => {
  it('Test A: candidate eligibility contains only real bench players, never on-court starters', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const roster = getTeamRoster(base, team.id)
    const starterIds = roster.slice(0, 5).map((p) => p.id)
    const benchIds = roster.slice(5, 12).map((p) => p.id)
    const world = withUserLineup(base, starterIds, benchIds)

    const controller = createLiveUserMatch(world)
    const snapshot = controller.snapshot()
    const isHome = snapshot.homeTeamId === team.id
    const active = isHome ? snapshot.lineups.home : snapshot.lineups.away
    const squad = isHome ? snapshot.squads.home : snapshot.squads.away

    for (const playerId of active) {
      const candidates = controller.replacementCandidates(team.id, playerId)
      expect(candidates.every((candidateId) => squad.includes(candidateId))).toBe(true)
      expect(candidates.every((candidateId) => !active.includes(candidateId))).toBe(true)
    }
  })

  it('Test B: reordering the configured bench priority changes which player the automatic rotation brings in first, independent of ratings', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const roster = getTeamRoster(base, team.id)
    const starterIds = roster.slice(0, 5).map((p) => p.id)
    const benchPool = roster.slice(5, 12).map((p) => p.id)
    expect(benchPool.length).toBe(7)
    const reversedBench = [...benchPool].reverse()

    const worldA = withUserLineup(base, starterIds, benchPool)
    const worldB = withUserLineup(base, starterIds, reversedBench)

    const firstInA = firstAutomaticReplacementFor(prepareUserMatch(worldA), team.id, starterIds)
    const firstInB = firstAutomaticReplacementFor(prepareUserMatch(worldB), team.id, starterIds)

    // The two configurations rank the exact same bench pool in opposite order; the automatic
    // rotation's first replacement must follow that structural order, never a fixed
    // ratings-based winner — so the two runs must disagree on who comes in first.
    expect(firstInA).not.toBe(firstInB)
  })

  it('Test C: the same roster/lineup/state produces the same candidate order every time', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const roster = getTeamRoster(base, team.id)
    const starterIds = roster.slice(0, 5).map((p) => p.id)
    const benchIds = roster.slice(5, 12).map((p) => p.id)
    const world = withUserLineup(base, starterIds, benchIds)

    const first = createLiveUserMatch(world)
    const second = createLiveUserMatch(world)
    const firstSnapshot = first.snapshot()
    const isHome = firstSnapshot.homeTeamId === team.id
    const active = isHome ? firstSnapshot.lineups.home : firstSnapshot.lineups.away

    expect(first.replacementCandidates(team.id, active[0]!)).toEqual(second.replacementCandidates(team.id, active[0]!))
  })

  it('Test D: a manual substitution can bring in any valid bench candidate, not just the first one listed', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const roster = getTeamRoster(base, team.id)
    const starterIds = roster.slice(0, 5).map((p) => p.id)
    const benchIds = roster.slice(5, 12).map((p) => p.id)
    const world = withUserLineup(base, starterIds, benchIds)

    const controller = createLiveUserMatch(world)
    const snapshot = controller.snapshot()
    const isHome = snapshot.homeTeamId === team.id
    const active = isHome ? snapshot.lineups.home : snapshot.lineups.away
    const candidates = controller.replacementCandidates(team.id, active[0]!)
    const chosen = candidates[candidates.length - 1]! // deliberately not the first candidate

    const result = controller.applyManualSubstitutions(team.id, [{ playerOutId: active[0]!, playerInId: chosen }])

    expect(result).toEqual({ status: 'applied' })
  })

  it('Test E (MG2A regression): configured starters remain authoritative after the rotation-authority cleanup', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const roster = getTeamRoster(base, team.id)
    // The five lowest-impact roster players: selectStartingFive would never choose them.
    const configuredStarters = [...roster].sort((a, b) => calculatePlayerImpact(a) - calculatePlayerImpact(b)).slice(0, 5).map((p) => p.id)
    const world = withUserLineup(base, configuredStarters, roster.filter((p) => !configuredStarters.includes(p.id)).slice(0, 7).map((p) => p.id))

    const simulation = prepareUserMatch(world)
    const isHome = simulation.homeTeamId === team.id
    const actualStarters = isHome ? simulation.lineups.home : simulation.lineups.away

    expect(new Set(actualStarters)).toEqual(new Set(configuredStarters))
  })

  it('Test F (MG2B regression): live substitutions and tactical changes remain functional', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const roster = getTeamRoster(base, team.id)
    const starterIds = roster.slice(0, 5).map((p) => p.id)
    const benchIds = roster.slice(5, 12).map((p) => p.id)
    const world = withUserLineup(base, starterIds, benchIds)

    const controller = createLiveUserMatch(world)
    const snapshot = controller.snapshot()
    const isHome = snapshot.homeTeamId === team.id
    const active = isHome ? snapshot.lineups.home : snapshot.lineups.away

    const subResult = controller.applyManualSubstitutions(team.id, [{ playerOutId: active[0]!, playerInId: benchIds[0]! }])
    expect(subResult).toEqual({ status: 'applied' })

    const tacticsResult = controller.applyTactics(team.id, { pace: 1, shotProfile: { rim: 0, midRange: 0, threePoint: 0 }, defense: { interior: 0, perimeter: 0 } })
    expect(tacticsResult).toEqual({ status: 'applied' })
  })

  it('Test G: the replacement-ranking path (RotationPlan.ts) no longer imports calculatePlayerImpact', () => {
    const source = readFileSync(path.join(__dirname, '../../engine/match/rotation/RotationPlan.ts'), 'utf-8')
    expect(source).not.toContain('calculatePlayerImpact')
  })

  it('Test G: LiveMatchController.replacementCandidates (MG2B) contains no player-quality ranking', () => {
    const source = readFileSync(path.join(__dirname, './LiveMatchController.ts'), 'utf-8')
    expect(source).not.toContain('calculatePlayerImpact')
  })
})
