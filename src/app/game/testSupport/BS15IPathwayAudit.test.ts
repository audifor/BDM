import { readFileSync, writeFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { getPlayerContractStatus } from '@/domain/contract'
import { assessCollegeContinuation } from '@/engine/eligibility/CollegeContinuationAssessment'
import { evaluateProfessionalAcquisition } from '@/engine/career/AiProfessionalPathways'

it('audits all original unsigned rights and native annual pathway conditions', () => {
  const prefix = process.env.BS15I_PATHWAY_AUDIT_SAVE_PREFIX
  if (prefix === undefined) return
  const annual = []
  let rights: unknown[] = []
  const originalRightsGroupedReasons: Record<string, number> = {}
  for (const year of [2033, 2034, 2035, 2036, 2037]) {
    const world = deserializeGameWorldV4(JSON.parse(readFileSync(`${prefix}.${year}-10-01.json`, 'utf8')))
    const continuations = Object.values(world.teams).flatMap(team => {
      const competition = Object.values(world.competitions).find(item => item.participantTeamIds.includes(team.id) && world.ecosystems[item.ecosystemId]?.kind === 'ncaaLike')
      if (competition === undefined) return []
      const season = Object.values(world.seasons).filter(item => item.competitionId === competition.id && world.seasonHistoryBySeasonId[item.id] !== undefined).sort((a, b) => b.startDate.localeCompare(a.startDate))[0]
      return season === undefined ? [] : team.rosterPlayerIds.map(id => assessCollegeContinuation(world, id, team.id, season.id)!)
    })
    annual.push({ date: world.currentDate, portalNotices: Object.keys(world.transferPortalEntriesById).length, portalAuthorizations: Object.values(world.transferPortalEntriesById).filter(item => item.processedOn !== undefined).length, collegeTransfers: Object.values(world.transferPortalEntriesById).filter(item => item.movement !== undefined).length,
      draftDeclarations: Object.values(world.draftsById).flatMap(item => item.entries ?? []).filter(item => item.declaredOn !== undefined).length,
      finalPoolPlayers: Object.values(world.draftsById).flatMap(item => item.entries ?? []).filter(item => item.history?.some(record => record.status === 'finalPool')).length,
      drafted: Object.values(world.draftPicksById).filter(item => item.selection !== undefined).length,
      undrafted: Object.values(world.draftsById).flatMap(item => item.entries ?? []).filter(item => item.status === 'undrafted').length,
      rightsCreated: Object.keys(world.playerRightsById).length, rightsSigned: Object.values(world.playerRightsById).filter(item => item.contractId !== undefined).length,
      professionalExits: Object.keys(world.ecosystemTransitionsById).length,
      // Retrospective, immutable completed-season/public relationship context; not a reconstructed execution log.
      continuationContext: { assessed: continuations.length, strongLeaveCandidates: continuations.filter(item => item.leavePressure > item.stayPressure + 1).length, lowTrust: continuations.filter(item => item.relationshipTrust !== null && item.relationshipTrust < 40).length, coachingChanges: continuations.filter(item => item.coachingChange).length, brokenPromises: continuations.filter(item => item.promiseAssessments.some(promise => promise.fulfillment === 'BROKEN' || promise.fulfillment === 'PARTIALLY_BROKEN')).length, fewerThanFiveAppearances: continuations.filter(item => item.experience.gamesPlayed < 5).length, toneCounts: Object.fromEntries(['content', 'unsettled', 'concerned', 'seriouslyConsideringPortal'].map(tone => [tone, continuations.filter(item => item.tone === tone).length])) },
    })
    if (year === 2037) rights = Object.values(world.playerRightsById).filter(right => right.rightsType === 'draft' && right.contractId === undefined).map(right => {
      const pick = Object.values(world.draftPicksById).find(item => item.selection?.playerId === right.playerId)!
      const draft = world.draftsById[pick.draftId]!
      const source = Object.values(world.teams).find(team => team.rosterPlayerIds.includes(right.playerId))!
      const competition = Object.values(world.competitions).find(item => item.participantTeamIds.includes(source.id))!
      const sourceContracts = Object.values(world.contractsById).filter(contract => contract.playerId === right.playerId && getPlayerContractStatus(contract, world.currentDate) === 'active')
      const prospectiveEvaluation = evaluateProfessionalAcquisition(world, { playerId: right.playerId, teamId: right.ownerTeamId, draftId: draft.id, rightsId: right.id })
      const unsignedReason = prospectiveEvaluation.blocker ?? 'SIGNABLE_WITH_NO_HISTORICAL_CONSUMER'
      originalRightsGroupedReasons[unsignedReason] = (originalRightsGroupedReasons[unsignedReason] ?? 0) + 1
      return { playerId: right.playerId, personId: world.players[right.playerId]!.personId, draftingTeamId: right.originalTeamId, ownerTeamId: right.ownerTeamId, pick: pick.order, round: pick.round, draftId: draft.id, draftYear: draft.scheduledOn.slice(0, 4), createdOn: right.acquiredAt, currentTeamId: source.id, currentEcosystemId: competition.ecosystemId, sourceContracts: sourceContracts.map(contract => contract.id), canonicalSigningEligible: sourceContracts.length === 0,
        historicalAiEvaluation: 'NOT_INVOKED', historicalAttempted: false, historicalBlocker: 'NO_CALENDAR_SIGNING_CONSUMER', prospectiveEvaluation,
        currentEcosystemKind: world.ecosystems[competition.ecosystemId]!.kind, activeContract: sourceContracts.length > 0, sourceContractActive: sourceContracts.length > 0,
        prospectiveSigningBlocked: prospectiveEvaluation.blocker !== undefined, legitimatelyUnsignedUnderCurrentAiState: prospectiveEvaluation.blocker !== undefined, unsignedReason }
    })
  }
  expect(rights).toHaveLength(32)
  const report = { annual, originalRights: rights, originalRightsGroupedReasons }
  writeFileSync('C:/BDM-BS15I/docs/strengthening/BS15I_PATHWAY_BEFORE_AUDIT.json', JSON.stringify(report, null, 2))
  process.stdout.write(`[BS15I pathway before] ${JSON.stringify(annual)}\n`)
}, 120_000)
