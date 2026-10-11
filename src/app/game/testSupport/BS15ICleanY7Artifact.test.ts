import { readFileSync, writeFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { deserializeGameWorldV4, serializeGameWorldV4, type SaveGameEnvelopeV4 } from '@/save/GameWorldSaveV4'
import { getPlayerContractStatus } from '@/domain/contract'
import { assessCollegeEligibility } from '@/engine/eligibility/EligibilityEngine'
import { assertLongHorizonIntegrity } from './TalentLongHorizonCertification'
import { readLargeSaveV4File } from './LargeSaveV4File'
import { scalePayloadFingerprints, scaleWorldIdentity } from './ScaleSaveCertification'
import { collectNcaaContinuity } from './NcaaContinuityCertification'

it('certifies the exact clean Y7 artifact and canonical continuity without another simulated day', () => {
  if (process.env.BS15I_CLEAN_Y7_ARTIFACT !== '1') return
  const { world, counts, exactPayload } = inspect()
  const gc = (globalThis as typeof globalThis & { gc?: () => void }).gc
  gc?.(); gc?.()
  const memory = process.memoryUsage()
  const report = { path: artifactPath(), date: world.currentDate, exactPayload, counts, singleReloadWorldAfterGc: memory, postGc: gc !== undefined }
  writeFileSync(process.env.BS15I_ARTIFACT_OUTPUT ?? 'C:/Temp/BS15I-clean-y7-artifact.json', JSON.stringify(report, null, 2))
  console.log('[BS15I clean Y7 artifact]', report)
}, 180_000)

function inspect() {
  const baseline = JSON.parse(readFileSync('C:/Temp/BS15I-clean-y6-baseline.json', 'utf8'))
  const original = readLargeSaveV4File(artifactPath()) as SaveGameEnvelopeV4
  const before = scalePayloadFingerprints(original)
  const world = deserializeGameWorldV4(original)
  expect(world.currentDate).toBe('2039-10-01')
  expect(scalePayloadFingerprints(serializeGameWorldV4(world, '2039-10-01T00:00:00.000Z'))).toEqual(before)
  assertLongHorizonIntegrity(world)
  const priorIds = new Set<string>(baseline.identity.players)
  const materializedIds = new Set(Object.values(world.talentMaterializationsByCandidateKey).map(item => item.playerId as string))
  const newPlayers = Object.values(world.players).filter(player => !priorIds.has(player.id))
  expect(newPlayers.filter(player => !materializedIds.has(player.id))).toEqual([])
  const ncaa = collectNcaaContinuity(world)
  expect(ncaa.teams.filter(team => team.deficit > 0)).toEqual([])
  const team17 = ncaa.teams.find(team => team.teamId === 'generated-team-0017')!
  expect(team17.eligible).toBeGreaterThanOrEqual(5)
  for (const team of ncaa.teams) for (const id of world.teams[team.teamId]!.rosterPlayerIds) {
    const ecosystemId = Object.values(world.competitions).find(competition => competition.participantTeamIds.includes(team.teamId))!.ecosystemId
    expect(assessCollegeEligibility(world, { playerId: id, teamId: team.teamId, ecosystemId })?.reasons.filter(reason => reason === 'ELIGIBILITY_CLOCK_EXPIRED' || reason === 'PARTICIPATION_LIMIT_REACHED')).toEqual([])
  }
  const retired = new Set(Object.values(world.players).filter(player => player.careerEnd !== undefined).map(player => player.id))
  expect(Object.values(world.teams).flatMap(team => team.rosterPlayerIds).filter(id => retired.has(id))).toEqual([])
  expect(Object.values(world.contractsById).filter(contract => retired.has(contract.playerId) && ['active', 'scheduled'].includes(getPlayerContractStatus(contract, world.currentDate)))).toEqual([])
  expect(Object.values(world.playerRightsById).filter(right => retired.has(right.playerId) && right.status === 'active')).toEqual([])
  expect(Object.values(world.playerEnrollmentsById).filter(enrollment => retired.has(enrollment.playerId) && enrollment.status === 'active')).toEqual([])
  const walkOns = Object.values(world.playerTransactionsById).filter(item => item.kind === 'ncaaWalkOn' && item.occurredOn > baseline.date)
  expect(walkOns.filter(item => !priorIds.has(item.playerId) && !materializedIds.has(item.playerId))).toEqual([])
  const identity = scaleWorldIdentity(world)
  const counts = { persons: identity.persons.length, players: identity.players.length, playerContracts: identity.playerContracts.length, staffContracts: identity.staffContracts.length, scheduledContracts: identity.scheduledPlayerContracts.length, newPlayers: newPlayers.length, newPlayersWithoutCanonicalMaterialization: 0, walkOnAdmissions: walkOns.length, retired: retired.size, activeRights: Object.values(world.playerRightsById).filter(right => right.status === 'active').length, undraftedContinuationTransitions: Object.values(world.ecosystemTransitionsById).filter(item => item.transitionType === 'ncaaToNbaUndrafted' && item.effectiveDate > baseline.date).length, team17, ncaaDeficits: 0, retiredActiveOwnership: 0 }
  return { world, counts, exactPayload: true }
}

function artifactPath(): string { return process.env.BS15I_ARTIFACT_SAVE ?? 'C:/Temp/BS15I-fast-y7-save-v4.json' }
