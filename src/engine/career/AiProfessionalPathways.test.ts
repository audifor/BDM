import { readFileSync, writeFileSync } from 'node:fs'
import { beforeAll, expect, it } from 'vitest'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { evaluateProfessionalAcquisition, progressAiProfessionalPathways } from './AiProfessionalPathways'
import { reconcileExpiredPlayerContracts } from '@/engine/market'
import { contractIdFromString } from '@/domain/ids'
import { advanceDayWithTrace } from '@/engine/calendar'

let native: GameWorld | undefined
beforeAll(() => {
  const path = process.env.BS15I_PATHWAY_PRO_REPRO_SAVE
  if (path !== undefined) native = deserializeGameWorldV4(JSON.parse(readFileSync(path, 'utf8')))
}, 30_000)

it('reevaluates existing unsigned rights through the monthly production Calendar phase', () => {
  if (!native) return
  // Replay the immediately preceding calendar boundary with the saved canonical
  // state; do not skip a month of unrelated training/medical obligations.
  const result = advanceDayWithTrace(updateGameWorld(native, { currentDate: '2037-09-30' as never }))
  expect(result.status).toBe('COMPLETED')
  const phase = result.phases.find(item => item.phaseId === 'PROFESSIONAL_PATHWAYS')!
  expect(phase.ran).toBe(true)
  expect(phase.diagnostics.some(item => item.code === 'AI_PROFESSIONAL_SIGNED')).toBe(true)
  expect(Object.values(result.world.playerRightsById).some(right => right.contractId !== undefined)).toBe(true)
  expect(result.phases.findIndex(item => item.phaseId === 'DRAFT')).toBeLessThan(result.phases.indexOf(phase))
}, 90_000)

it('evaluates actual rights, signs through the shared gateway, and preserves identity/history after Save V4/retry', () => {
  if (!native) return
  const before = native
  const result = progressAiProfessionalPathways(before)
  const signed = result.decisions.filter(item => item.rightsId !== undefined && item.signed)
  expect(signed.length).toBeGreaterThan(0)
  for (const decision of signed) {
    const original = before.players[decision.playerId]!
    const source = Object.values(before.teams).find(team => team.rosterPlayerIds.includes(decision.playerId))!
    expect(result.world.players[decision.playerId]!.personId).toBe(original.personId)
    expect(result.world.teams[source.id]!.rosterPlayerIds).not.toContain(decision.playerId)
    expect(result.world.teams[decision.teamId]!.rosterPlayerIds.filter(id => id === decision.playerId)).toHaveLength(1)
    expect(Object.values(result.world.playerEnrollmentsById).filter(enrollment => enrollment.playerId === decision.playerId && enrollment.status === 'active')).toEqual([])
    const right = result.world.playerRightsById[decision.rightsId!]!
    expect(result.world.contractsById[contractIdFromString(right.contractId!)]!.playerId).toBe(decision.playerId)
    expect(Object.values(result.world.ecosystemTransitionsById).filter(item => item.playerId === decision.playerId)).toHaveLength(1)
  }
  expect(result.decisions.some(item => item.blocker === 'NO_CONFIGURED_RIGHTS_TERMS')).toBe(true)
  expect(result.decisions.some(item => item.blocker === 'PLAYER_PREFERS_COLLEGE')).toBe(true)
  const restored = deserializeGameWorldV4(serializeGameWorldV4(result.world, `${result.world.currentDate}T00:00:00.000Z`))
  const retry = progressAiProfessionalPathways(restored)
  for (const decision of signed) {
    expect(Object.values(retry.world.contractsById).filter(item => item.playerId === decision.playerId)).toEqual(Object.values(restored.contractsById).filter(item => item.playerId === decision.playerId))
    expect(Object.values(retry.world.ecosystemTransitionsById).filter(item => item.playerId === decision.playerId)).toHaveLength(1)
    expect(Object.values(retry.world.playerTransactionsById).filter(item => item.playerId === decision.playerId)).toEqual(Object.values(restored.playerTransactionsById).filter(item => item.playerId === decision.playerId))
  }
  writeFileSync('C:/Temp/BS15I-pathway-professional-signed-save-v4.json', JSON.stringify(serializeGameWorldV4(result.world, `${result.world.currentDate}T00:00:00.000Z`)))
  process.stdout.write(`[BS15I AI professional] ${JSON.stringify({ rightsSigned: signed.map(item => item.playerId), undraftedSigned: result.decisions.filter(item => item.rightsId === undefined && item.signed).map(item => item.playerId), remainingRights: Object.values(result.world.playerRightsById).filter(item => item.contractId === undefined).length })}\n`)
}, 90_000)

it('keeps an actual AI rights decision invariant under hidden ratings with public knowledge and terms fixed', () => {
  if (!native) return
  const right = Object.values(native.playerRightsById).find(item => {
    const pick = Object.values(native!.draftPicksById).find(pick => pick.selection?.playerId === item.playerId)!
    return evaluateProfessionalAcquisition(native!, { playerId: item.playerId, teamId: item.ownerTeamId, draftId: pick.draftId, rightsId: item.id }).blocker === undefined
  })!
  expect(right).toBeDefined()
  const pick = Object.values(native.draftPicksById).find(item => item.selection?.playerId === right.playerId)!
  const input = { playerId: right.playerId, teamId: right.ownerTeamId, draftId: pick.draftId, rightsId: right.id }
  const changed = updateGameWorld(native, { players: Object.values(native.players).map(player => player.id !== right.playerId ? player : { ...player, basketball: { ...player.basketball, ratings: Object.fromEntries(Object.keys(player.basketball.ratings).map(key => [key, 1])) as typeof player.basketball.ratings } }) })
  expect(changed.organizationKnowledge).toEqual(native.organizationKnowledge)
  expect(evaluateProfessionalAcquisition(changed, input)).toEqual(evaluateProfessionalAcquisition(native, input))
}, 30_000)

it('exposes real undrafted college Players to AI Market after canonical contract expiry creates a pro vacancy', () => {
  if (!native) return
  const nbaTeamIds = Object.values(native.competitions).filter(item => native!.ecosystems[item.ecosystemId]?.kind === 'nbaLike').flatMap(item => item.participantTeamIds)
  const expiry = Object.values(native.contractsById).filter(item => nbaTeamIds.includes(item.teamId) && item.term.expiresOn > native!.currentDate).map(item => item.term.expiresOn).sort()[0]!
  const expired = reconcileExpiredPlayerContracts(updateGameWorld(native, { currentDate: expiry }), expiry)
  expect(nbaTeamIds.some(id => expired.teams[id]!.rosterPlayerIds.length < 5)).toBe(true)
  const result = progressAiProfessionalPathways(expired)
  const signed = result.decisions.find(item => item.rightsId === undefined && item.signed)!
  expect(signed).toBeDefined()
  const transition = result.world.ecosystemTransitionsById[`professional:undrafted:${signed.draftId}:${signed.playerId}`]!
  expect(transition.transitionType).toBe('ncaaToNbaUndrafted')
  expect(result.world.players[signed.playerId]!.personId).toBe(expired.players[signed.playerId]!.personId)
  expect(result.world.teams[transition.fromTeamId!]!.rosterPlayerIds).not.toContain(signed.playerId)
  expect(result.world.teams[signed.teamId]!.rosterPlayerIds).toContain(signed.playerId)
  expect(Object.values(result.world.playerEnrollmentsById).filter(item => item.playerId === signed.playerId && item.status === 'active')).toEqual([])
  const transactions = Object.values(result.world.playerTransactionsById).filter(item => item.playerId === signed.playerId && item.kind === 'signedFreeAgent')
  expect(transactions).toHaveLength(1)
  expect(transactions[0]!.contractId).toBe(transition.contractId)
  const restored = deserializeGameWorldV4(serializeGameWorldV4(result.world, `${expiry}T00:00:00.000Z`))
  const retry = progressAiProfessionalPathways(restored)
  expect(Object.values(retry.world.playerTransactionsById).filter(item => item.playerId === signed.playerId && item.kind === 'signedFreeAgent')).toHaveLength(1)
  expect(Object.values(retry.world.ecosystemTransitionsById).filter(item => item.playerId === signed.playerId)).toHaveLength(1)
  process.stdout.write(`[BS15I AI undrafted] ${JSON.stringify({ date: expiry, playerId: signed.playerId, personId: result.world.players[signed.playerId]!.personId, contractId: transition.contractId })}\n`)
}, 90_000)


it('defers an individually affordable rookie contract that would leave the minimum roster unfunded', async () => {
  const { createNewGame } = await import('@/app/game')
  const { createDraftForCompletedSeason, openDraft, getCurrentDraftPick, makeDraftSelection } = await import('@/engine/draft')
  const { applyMatchResult } = await import('@/engine/match')
  const { finalizeSeason } = await import('@/engine/season')
  const { getFreeAgents, getTeamFinancialSnapshot } = await import('@/domain/world')
  const { getPlayerMarketTerms } = await import('@/engine/market/PlayerMarketTerms')
  const { releasePlayer } = await import('@/app/market/MarketService')
  let world = createNewGame()
  const season = Object.values(world.seasons).find(item => world.ecosystems[world.competitions[item.competitionId]!.ecosystemId]?.kind === 'nbaLike')!
  for (const game of Object.values(world.games).filter(item => item.seasonId === season.id)) world = applyMatchResult(world, { gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: 90, awayScore: 80 })
  world = finalizeSeason(world, season.id)
  const college = Object.values(world.competitions).find(item => world.ecosystems[item.ecosystemId]?.kind === 'ncaaLike')!
  const playerId = world.teams[college.participantTeamIds[0]!]!.rosterPlayerIds[0]!
  const nba = world.competitions[season.competitionId]!
  world = createDraftForCompletedSeason(updateGameWorld(world, { drafts: [], draftPicks: [] }), nba.ecosystemId, season.id, { rounds: 1, orderMethod: 'reverseStandings', scheduledAfterDays: 1 }, [playerId])
  const draft = Object.values(world.draftsById)[0]!
  world = openDraft(updateGameWorld(world, { currentDate: draft.scheduledOn }), draft.id)
  const pick = getCurrentDraftPick(world, draft.id)!
  world = makeDraftSelection(world, draft.id, pick.ownerTeamId, playerId)
  const team = world.teams[pick.ownerTeamId]!
  const rights = Object.values(world.playerRightsById).find(item => item.playerId === playerId)!
  const donor = Object.values(world.teams).find(item => item.id !== team.id && item.gender === team.gender && !college.participantTeamIds.includes(item.id))!
  for (const id of donor.rosterPlayerIds.slice(0, 3)) world = releasePlayer(world, donor.id, id)
  world = updateGameWorld(world, { teams: Object.values(world.teams).map(item => item.id === team.id ? { ...item, rosterPlayerIds: item.rosterPlayerIds.slice(0, 1) } : item) })
  const completion = getFreeAgents(world).filter(item => item.gender === team.gender).map(item => getPlayerMarketTerms(world, item.id).annualSalary).sort((a,b) => a-b).slice(0,3).reduce((sum,salary) => sum+salary,0)
  expect(completion).toBeGreaterThan(0)
  const salary = world.salaryRulesBySeasonId[season.id]!.rookieScale!.entries.find(item => item.pickOrder === pick.order)!.cashSalary
  const payroll = getTeamFinancialSnapshot(world, team.id).currentPlayerPayroll
  const quoteWorld = updateGameWorld(world, { teamFinances: Object.values(world.teamFinancesByTeamId).map(item => item.teamId === team.id ? { ...item, playerSalaryBudget: payroll + salary + completion - 1 } : item) })
  const input = { playerId, teamId: team.id, draftId: draft.id, rightsId: rights.id }
  expect(evaluateProfessionalAcquisition(quoteWorld, input).blocker).toBe('AI_MINIMUM_ROSTER_UNFUNDED')
  const funded = updateGameWorld(quoteWorld, { teamFinances: Object.values(quoteWorld.teamFinancesByTeamId).map(item => item.teamId === team.id ? { ...item, playerSalaryBudget: item.playerSalaryBudget + 1 } : item) })
  expect(evaluateProfessionalAcquisition(funded, input).blocker).not.toBe('AI_MINIMUM_ROSTER_UNFUNDED')
  expect(quoteWorld.playerRightsById[rights.id]).toEqual(world.playerRightsById[rights.id])
  expect(quoteWorld.salaryRulesBySeasonId).toBe(world.salaryRulesBySeasonId)
})
