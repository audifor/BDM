import { expect, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { getPlayerContractStatus } from '@/domain/contract'
import { assessNbaDraftEligibility } from '@/engine/draft/DraftEligibility'
import { evaluateProfessionalAcquisition, progressAiProfessionalPathways } from '@/engine/career/AiProfessionalPathways'
import { buildPlayerHistoryModel } from '@/ui-ng/applications/player/data/buildPlayerHistoryModel'
import { collectNcaaContinuity } from './NcaaContinuityCertification'

it('audits final pathway funnels, all unsigned rights, source replacement and international eligibility', () => {
  const prefix = process.env.BS15I_PATHWAY_FINAL_SAVE_PREFIX
  if (!prefix) return
  const world = deserializeGameWorldV4(JSON.parse(readFileSync(`${prefix}.2037-10-01.json`, 'utf8')))
  const evidence = JSON.parse(readFileSync('C:/Temp/BS15I-pathway-five-year-routes.json', 'utf8')) as { decisions: Record<string, { evaluations: number; attempted: number; signed: number; blockers: Record<string, number> }> }
  const portal = Object.values(world.transferPortalEntriesById).filter(item => item.movement !== undefined)
  const professional = Object.values(world.ecosystemTransitionsById)
  const firstProPlayers = JSON.parse(readFileSync('C:/Temp/BS15I-pathway-integrated-professional-save-v4.json', 'utf8')).payload.players as readonly { id: string; personId: string }[]
  const savedPersons = new Map(firstProPlayers.map(player => [player.id, player.personId]))
  const firstPortalPlayers = JSON.parse(readFileSync('C:/Temp/BS15I-pathway-integrated-portal-save-v4.json', 'utf8')).payload.players as readonly { id: string; personId: string }[]
  const portalSavedPersons = new Map(firstPortalPlayers.map(player => [player.id, player.personId]))
  expect(portal.length).toBeGreaterThan(0); expect(professional.length).toBeGreaterThan(0)
  for (const entry of portal) {
    expect(world.players[entry.playerId]!.personId).toBe(portalSavedPersons.get(entry.playerId))
    expect(world.personsById[world.players[entry.playerId]!.personId!]).toBeDefined()
    expect(world.playerEnrollmentsById[entry.movement!.sourceEnrollmentId]!.status).toBe('ended')
    expect(world.playerEnrollmentsById[entry.movement!.destinationEnrollmentId]!.playerId).toBe(entry.playerId)
    expect(world.collegeEligibilityAssessmentsById[entry.movement!.eligibilityAssessmentId]).toBeDefined()
    expect(buildPlayerHistoryModel(world, entry.playerId)!.items.some(item => item.id === `career:portal:${entry.id}`)).toBe(true)
  }
  for (const route of professional) {
    const personId = world.players[route.playerId]!.personId!
    expect(world.personsById[personId]).toBeDefined()
    if (savedPersons.has(route.playerId)) expect(personId).toBe(savedPersons.get(route.playerId))
    expect(Object.values(world.playerEnrollmentsById).filter(item => item.playerId === route.playerId && item.status === 'active')).toEqual([])
    expect(Object.values(world.ecosystemTransitionsById).filter(item => item.playerId === route.playerId)).toHaveLength(1)
    expect(buildPlayerHistoryModel(world, route.playerId)!.items.some(item => item.id === `ecosystem:${route.id}`)).toBe(true)
  }
  expect(progressAiProfessionalPathways(world).world).toBe(world)
  const rights = Object.values(world.playerRightsById).filter(item => item.rightsType === 'draft')
  const unsigned = rights.filter(item => item.contractId === undefined).map(right => {
    const pick = Object.values(world.draftPicksById).find(item => item.selection?.playerId === right.playerId)!
    expect(pick).toBeDefined()
    const evaluation = evaluateProfessionalAcquisition(world, { playerId: right.playerId, teamId: right.ownerTeamId, draftId: pick.draftId, rightsId: right.id })
    expect(evaluation.blocker).toBeDefined()
    const source = Object.values(world.teams).find(team => team.rosterPlayerIds.includes(right.playerId))
    return { right, personId: world.players[right.playerId]!.personId, pick, sourceTeamId: source?.id, activeContracts: Object.values(world.contractsById).filter(item => item.playerId === right.playerId && getPlayerContractStatus(item, world.currentDate) === 'active').map(item => item.id), evaluation, execution: evidence.decisions[right.id] }
  })
  const groups: Record<string, number> = {}
  for (const row of unsigned) groups[row.evaluation.blocker!] = (groups[row.evaluation.blocker!] ?? 0) + 1
  const decisions = rights.map(right => evidence.decisions[right.id]).filter(item => item !== undefined)
  const ncaa = collectNcaaContinuity(world)
  const signings = Object.values(world.recruitSigningsById).filter(item => world.recruitProfilesById[item.recruitId]?.origin !== 'transfer')
  const materials = new Set(Object.values(world.talentMaterializationsByCandidateKey).map(item => item.playerId))
  const departures = [...portal.map(item => ({ playerId: item.playerId, sourceTeamId: item.sourceTeamId, date: item.movement!.transferredOn })), ...professional.filter(item => item.transitionType.startsWith('ncaa')).map(item => ({ playerId: item.playerId, sourceTeamId: item.fromTeamId!, date: item.effectiveDate }))]
  const replacement = departures.map(departure => ({ ...departure, teamViability: ncaa.teams.find(team => team.teamId === departure.sourceTeamId), followingSeasonArrivals: signings.filter(item => item.programTeamId === departure.sourceTeamId && world.recruitProfilesById[item.recruitId]?.status === 'arrived' && world.seasons[item.targetSeasonId]!.startDate > departure.date), pendingFollowingSeasonSignings: signings.filter(item => item.programTeamId === departure.sourceTeamId && world.recruitProfilesById[item.recruitId]?.status === 'incoming' && world.seasons[item.targetSeasonId]!.startDate > departure.date) }))
  expect(replacement.every(row => row.teamViability?.deficit === 0)).toBe(true)
  const international = Object.values(world.teams).flatMap(team => {
    const competition = Object.values(world.competitions).find(item => item.participantTeamIds.includes(team.id) && world.ecosystems[item.ecosystemId]?.kind === 'fibaLike')
    if (!competition) return []
    const draft = Object.values(world.draftsById).filter(item => item.status === 'completed' && world.ecosystems[item.ecosystemId]?.category === world.ecosystems[competition.ecosystemId]!.category).sort((a, b) => b.scheduledOn.localeCompare(a.scheduledOn))[0]!
    return team.rosterPlayerIds.map(playerId => ({ playerId, personId: world.players[playerId]!.personId, teamId: team.id, eligibility: assessNbaDraftEligibility(world, playerId, draft), activeSourceContracts: Object.values(world.contractsById).filter(item => item.playerId === playerId && getPlayerContractStatus(item, world.currentDate) === 'active').map(item => item.id) }))
  })
  const entries = Object.values(world.draftsById).flatMap(item => item.entries ?? [])
  const annualDraftMembership = [2033, 2034, 2035, 2036, 2037].map(year => {
    const start = `${year - 1}-10-01`, end = `${year}-10-01`
    const pool = entries.filter(entry => entry.history?.some(event => event.status === 'finalPool' && event.occurredOn > start && event.occurredOn <= end))
    return { date: end, declarations: entries.filter(entry => entry.declaredOn !== undefined && entry.declaredOn > start && entry.declaredOn <= end).length, finalPoolEntries: pool.length, finalPoolDistinctPlayers: new Set(pool.map(entry => entry.playerId)).size, undraftedDistinctPlayers: new Set(pool.filter(entry => entry.status === 'undrafted').map(entry => entry.playerId)).size }
  })
  const report = { date: world.currentDate, annualDraftMembership, rightsFunnel: { drafted: Object.values(world.draftPicksById).filter(item => item.selection !== undefined).length, rightsCreated: rights.length, rightsEvaluated: decisions.length, uniqueRightsAttempted: decisions.filter(item => item.attempted > 0).length, uniqueRightsBlockedAtLeastOnce: decisions.filter(item => Object.keys(item.blockers).length > 0).length, rightsSigned: rights.filter(item => item.contractId !== undefined).length, currentUnsignedRights: unsigned.length, currentlyRosteredSignedRights: rights.filter(item => item.contractId !== undefined && Object.values(world.teams).some(team => team.rosterPlayerIds.includes(item.playerId))).length },
    transferFunnel: { confirmedLeaveCandidatesReachingNotice: Object.keys(world.transferPortalEntriesById).length, notices: Object.keys(world.transferPortalEntriesById).length, authorized: Object.values(world.transferPortalEntriesById).filter(item => item.processedOn !== undefined).length, recruitingTargets: Object.values(world.recruitProfilesById).filter(item => item.origin === 'transfer').length, commitments: Object.values(world.recruitingCommitmentsById).filter(item => world.recruitProfilesById[item.recruitId]?.origin === 'transfer').length, signings: Object.values(world.recruitSigningsById).filter(item => world.recruitProfilesById[item.recruitId]?.origin === 'transfer').length, completed: portal.length },
    unsignedRights: unsigned, unsignedGroups: groups, replacement, international, talentCohortSignings: signings.filter(item => materials.has(item.playerId)), talentCohortArrivals: signings.filter(item => materials.has(item.playerId) && world.recruitProfilesById[item.recruitId]?.status === 'arrived'), portal, professional, retryWorldUnchanged: true }
  writeFileSync('C:/BDM-BS15I/docs/strengthening/BS15I_PATHWAY_FINAL_AUDIT.json', JSON.stringify(report, null, 2))
  process.stdout.write(`[pathway final audit] ${JSON.stringify({ rights: report.rightsFunnel, transfer: report.transferFunnel, unsignedGroups: groups, talentCohortArrivals: report.talentCohortArrivals.length, internationalEligible: international.filter(item => item.eligibility.eligible).length })}\n`)
}, 120_000)
