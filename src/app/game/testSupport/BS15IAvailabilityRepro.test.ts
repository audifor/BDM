import { readFileSync, writeFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { getScheduledGamesToday } from '@/engine/calendar'
import { evaluatePlayerEligibility, getAvailablePlayersForCompetition } from '@/engine/eligibility'
import { repairWorldAtLifecycleBoundary } from '@/app/repair'

it('keeps the saved Year 4 professional fixtures playable without changing identity', () => {
  const save = process.env.BS15I_AVAILABILITY_SAVE
  if (save === undefined) return
  const world = deserializeGameWorldV4(JSON.parse(readFileSync(save, 'utf8')))
  const games = getScheduledGamesToday(world)
  const repair = repairWorldAtLifecycleBoundary(world, [...new Set(games.flatMap(game => [game.homeTeamId, game.awayTeamId]))])
  const evidence = games.flatMap(game => [game.homeTeamId, game.awayTeamId].map(teamId => {
    const available = getAvailablePlayersForCompetition(repair.world, teamId, game.competitionId, game.seasonId, game.date)
    return { gameId: game.id, teamId, roster: repair.world.teams[teamId]!.rosterPlayerIds, available,
      unavailable: repair.world.teams[teamId]!.rosterPlayerIds.filter(playerId => !available.includes(playerId)).map(playerId => ({
        playerId, eligibility: evaluatePlayerEligibility(repair.world, { playerId, teamId, competitionId: game.competitionId, seasonId: game.seasonId, onDate: game.date }),
        injuries: Object.values(repair.world.injuriesById).filter(injury => injury.playerId === playerId),
      })),
    }
  }))
  writeFileSync('C:/Temp/BS15I-availability-failure.json', JSON.stringify({ date: world.currentDate, reports: repair.reports, teams: evidence }, null, 2))
  process.stdout.write(`[BS15I availability] ${JSON.stringify(evidence.map(team => ({ gameId: team.gameId, teamId: team.teamId, roster: team.roster.length, available: team.available.length, unavailable: team.unavailable.map(player => player.playerId) })))}\n`)
  for (const team of evidence) expect(team.available.length, String(team.teamId)).toBeGreaterThanOrEqual(5)
  expect(Object.keys(repair.world.players).sort()).toEqual(Object.keys(world.players).sort())
  const signedContracts = Object.values(repair.world.contractsById).filter(contract => world.contractsById[contract.id] === undefined)
  expect(signedContracts).toHaveLength(1)
  for (const contract of signedContracts) {
    expect(repair.world.players[contract.playerId]!.personId).toBe(world.players[contract.playerId]!.personId)
    expect(Object.values(repair.world.playerTransactionsById).filter(transaction => transaction.kind === 'signedFreeAgent' && transaction.contractId === contract.id)).toHaveLength(1)
  }
  expect(repairWorldAtLifecycleBoundary(repair.world, evidence.map(team => team.teamId)).world).toBe(repair.world)
  const restored = deserializeGameWorldV4(serializeGameWorldV4(repair.world, `${world.currentDate}T00:00:00.000Z`))
  for (const contract of signedContracts) {
    expect(restored.contractsById[contract.id]).toEqual(contract)
    expect(restored.players[contract.playerId]!.personId).toBe(world.players[contract.playerId]!.personId)
    expect(restored.teams[contract.teamId]!.rosterPlayerIds.filter(playerId => playerId === contract.playerId)).toHaveLength(1)
    expect(Object.values(restored.playerTransactionsById).filter(transaction => transaction.kind === 'signedFreeAgent' && transaction.contractId === contract.id)).toHaveLength(1)
  }
}, 60_000)
