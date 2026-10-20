import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { getPlayerContractStatus } from '@/domain/contract'
import type { PlayerId, TeamId } from '@/domain/ids'
import { getTeamRoster, isPlayerAvailable, type GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import type { GameSaveRepository } from '@/app/save/GameSaveRepository'
import { loadSavedGame, saveCurrentGame } from '@/app/save/GameSaveService'
import { projectPersistentWorldTruth } from '@/save/persistentWorldTruth'
import { buildMarketViability } from '@/ui-ng/applications/market/marketViability'
import { buildMarketOperationsHistory } from '@/ui-ng/applications/market/marketOperationsHistory'
import { createF2Day0, runF2Window, matchSeedFor, type F2RunResult } from './testSupport/PlayableF2Support'
import { automaticPolicy } from './testSupport/PlayableF2Policies'
import { marketSigningPolicy } from './testSupport/PlayableF3Policies'

/**
 * F3 · comparación contrafactual. Un mismo GameWorld (ACB 2026/27, UCAM Murcia, 27 sep) en dos copias Save V4 idénticas, 30 días y
 * las mismas semillas. A no realiza ninguna operación; B completa UNA operación legítima de mercado (un escolta libre, con el ciclo
 * completo de contacto, oferta, Governance y firma) y lo coloca de titular. Las diferencias deben aparecer exactamente donde corresponde.
 */
const SALT = 13
const DAYS = 30
const savedAt = '2026-10-27T09:00:00.000Z'
const memoryRepository = (): GameSaveRepository & { file: string } => {
  const repository = { file: '', save: async (json: string) => { repository.file = json }, load: async () => repository.file, getInfo: async () => ({ savedAt }) }
  return repository
}
const roundTrip = async (world: GameWorld): Promise<GameWorld> => { const repository = memoryRepository(); await saveCurrentGame(world, repository, savedAt); return loadSavedGame(repository) }

let day0: GameWorld
let teamId: TeamId
let A: F2RunResult
let B: F2RunResult
let policy: ReturnType<typeof marketSigningPolicy>

const userGames = (run: F2RunResult) => run.games
const completed = (world: GameWorld) => Object.values(world.games).filter((game) => game.status === 'completed')
const margin = (world: GameWorld) => buildMarketViability(world, teamId).marginMajor!

beforeAll(async () => {
  day0 = await createF2Day0()
  teamId = getUserTeam(day0)!.id
  const copyA = await roundTrip(day0)
  const copyB = await roundTrip(day0)
  policy = marketSigningPolicy('SG')
  A = runF2Window(copyA, automaticPolicy, SALT, DAYS, 1)
  B = runF2Window(copyB, policy, SALT, DAYS, 1)
}, 1_800_000)

describe('F3 A/B · mismo mundo, una operación de mercado, treinta días', () => {
  it('0. parten del mismo estado Save V4 y la única entrada distinta es el registro de decisiones de B', async () => {
    expect(projectPersistentWorldTruth(await roundTrip(day0))).toEqual(projectPersistentWorldTruth(day0))
    expect(A.decisions).toHaveLength(0)
    expect(new Set(B.decisions.map((decision) => decision.action))).toEqual(new Set(['contactFreeAgent', 'submitFreeAgentOffer', 'startFreeAgentSigningGovernance', 'completeFreeAgentSigning', 'setLineupSlot']))
    expect(A.games.map((game) => game.gameId)).toEqual(B.games.map((game) => game.gameId))
    expect(A.games.map((game) => matchSeedFor(SALT, game.gameId))).toEqual(B.games.map((game) => matchSeedFor(SALT, game.gameId)))
    expect(A.games.length).toBeGreaterThanOrEqual(3)
  })

  it('1. contratos y plantilla: B tiene exactamente un contrato y un jugador más; A, ninguno', () => {
    const signed = policy.state.signedPlayerId!
    expect(signed).toBeDefined()
    expect(Object.keys(B.world.contractsById)).toHaveLength(Object.keys(A.world.contractsById).length + 1)
    const extra = Object.values(B.world.contractsById).filter((contract) => A.world.contractsById[contract.id] === undefined)
    expect(extra).toHaveLength(1)
    expect(extra[0]!.playerId).toBe(signed)
    expect(getPlayerContractStatus(extra[0]!, B.world.currentDate)).toBe('active')
    expect(getTeamRoster(B.world, teamId).map((p) => p.id)).toContain(signed)
    expect(getTeamRoster(A.world, teamId).map((p) => p.id)).not.toContain(signed)
    expect(getTeamRoster(B.world, teamId)).toHaveLength(getTeamRoster(A.world, teamId).length + 1)
  })

  it('2. presupuesto reconciliado con Finance: el margen de B es el de A menos el salario anual contratado, la autorización no cambia y no hay reserva abierta', () => {
    const contract = Object.values(B.world.contractsById).find((item) => item.playerId === policy.state.signedPlayerId)!
    expect(margin(B.world)).toBe(margin(A.world) - contract.compensation.annualSalary)
    expect(buildMarketViability(B.world, teamId).authorizedMajor).toBe(buildMarketViability(A.world, teamId).authorizedMajor)
    const open = (world: GameWorld) => Object.values(world.financialReservationsById).filter((reservation) => reservation.status === 'OPEN').map((reservation) => reservation.id).sort()
    expect(open(B.world)).toEqual(open(A.world)) // the signing leaves no reservation of its own
    const bridge = Object.values(B.world.financialReservationsById).filter((reservation) => reservation.sourceEntityId === contract.id)
    expect(bridge.map((reservation) => reservation.status)).toEqual(['CONSUMED'])
    // Same payroll mechanics for everyone else: the other clubs' authorization usage is identical in both worlds.
    for (const team of Object.values(B.world.teams).filter((item) => item.id !== teamId)) {
      expect(buildMarketViability(B.world, team.id).marginMajor).toBe(buildMarketViability(A.world, team.id).marginMajor)
    }
  })

  it('3. elegibilidad, rotaciones y partido: el fichado es elegible y titular en B; juega los partidos posteriores a la firma con minutos reales', () => {
    const signed = policy.state.signedPlayerId!
    expect(isPlayerAvailable(B.world, signed, B.world.currentDate)).toBe(true)
    expect(B.world.lineupsByTeamId[teamId]!.starters.SG).toBe(signed)
    expect(Object.values(A.world.lineupsByTeamId[teamId]!.starters)).not.toContain(signed)
    const after = userGames(B).filter((game) => game.date > policy.state.signedOn!)
    expect(after.length).toBeGreaterThanOrEqual(1)
    for (const game of after) expect(game.minutes[signed] ?? 0).toBeGreaterThan(0)
    for (const game of userGames(B).filter((item) => item.date <= policy.state.signedOn!)) expect(game.minutes[signed]).toBeUndefined()
    for (const game of userGames(A)) expect(game.minutes[signed]).toBeUndefined() // the engine never uses a player who is not on the team
  })

  it('4. historial: la operación consta una sola vez en B y no existe en A', () => {
    const signed = policy.state.signedPlayerId!
    expect(buildMarketOperationsHistory(A.world, teamId)).toHaveLength(0)
    const rows = buildMarketOperationsHistory(B.world, teamId)
    expect(rows.filter((row) => row.kind === 'FICHAJE' && row.playerId === signed)).toHaveLength(1)
    expect(Object.values(B.world.playerTransactionsById).filter((item) => item.playerId === signed)).toHaveLength(1)
    expect(B.decisions.filter((decision) => decision.action === 'completeFreeAgentSigning')).toHaveLength(1)
  })

  it('5. el resto del mundo no cambia por la operación: los demás clubes son idénticos hasta el primer partido del usuario con plantilla distinta', () => {
    const firstDifferent = userGames(B).find((game) => game.date > policy.state.signedOn!)!.date
    const others = (world: GameWorld, before: string) => completed(world).filter((game) => game.homeTeamId !== teamId && game.awayTeamId !== teamId && game.date <= before)
      .map((game) => `${game.id}:${game.result!.homeScore}-${game.result!.awayScore}`).sort()
    const untilThen = others(A.world, firstDifferent)
    expect(untilThen.length).toBeGreaterThan(9)
    expect(others(B.world, firstDifferent)).toEqual(untilThen)
    // The same calendar and the same number of resolved games; later divergence can only come through the league's own dynamics (standings), never from a bonus for signing.
    expect(completed(B.world)).toHaveLength(completed(A.world).length)
    expect(B.world.currentDate).toBe(A.world.currentDate)
  })

  it('6. Save V4 conserva las diferencias tras guardar y cargar ambos mundos finales', async () => {
    const loadedA = await roundTrip(A.world)
    const loadedB = await roundTrip(B.world)
    expect(projectPersistentWorldTruth(loadedA)).toEqual(projectPersistentWorldTruth(A.world))
    expect(projectPersistentWorldTruth(loadedB)).toEqual(projectPersistentWorldTruth(B.world))
    expect(Object.keys(loadedB.contractsById)).toHaveLength(Object.keys(loadedA.contractsById).length + 1)
    expect(margin(loadedB)).toBe(margin(B.world))
    expect(loadedB.lineupsByTeamId[teamId]!.starters.SG).toBe(policy.state.signedPlayerId)
    expect(buildMarketOperationsHistory(loadedB, teamId)).toEqual(buildMarketOperationsHistory(B.world, teamId))
  })

  it('7. evidencia: tabla A/B reproducible', () => {
    const signed = policy.state.signedPlayerId as PlayerId
    const contract = Object.values(B.world.contractsById).find((item) => item.playerId === signed)!
    const rows = {
      window: { from: day0.currentDate, to: A.world.currentDate, days: DAYS, userGames: A.games.map((game) => game.date) },
      operation: { player: signed, log: B.decisions, signedOn: policy.state.signedOn, annualSalary: contract.compensation.annualSalary, term: contract.term },
      contracts: { A: Object.keys(A.world.contractsById).length, B: Object.keys(B.world.contractsById).length },
      roster: { A: getTeamRoster(A.world, teamId).length, B: getTeamRoster(B.world, teamId).length },
      marginSalaryEUR: { day0: margin(day0), A: margin(A.world), B: margin(B.world) },
      minutesOfSignedPlayer: B.games.map((game) => ({ date: game.date, opponent: game.opponentId, minutes: Math.round((game.minutes[signed] ?? 0) * 10) / 10, score: `${game.pointsFor}-${game.pointsAgainst}` })),
      userResultsA: A.games.map((game) => ({ date: game.date, score: `${game.pointsFor}-${game.pointsAgainst}` })),
      history: buildMarketOperationsHistory(B.world, teamId),
    }
    const dir = join(process.cwd(), 'docs', 'playable', 'evidence', 'f3')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'ab-comparison.json'), JSON.stringify(rows, null, 2))
    expect(rows.contracts.B).toBe(rows.contracts.A + 1)
  })
})
