import { expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { materializeTalentCandidate } from '@/engine/world/TalentSupply'
import { createLongHorizonMutationGuard } from './LongHorizonMutationGuard'

it('checks newly materialized identities at the ledger mutation and preserves origin history', () => {
  const initial = createNewGame()
  const cohort = Object.values(initial.talentCohortsById)[0]!
  const addition = materializeTalentCandidate(initial, cohort.id, 100, 'SCOUTING_DISCOVERY').world
  const guard = createLongHorizonMutationGuard(initial)
  expect(() => guard(addition)).not.toThrow()
  const record = Object.values(addition.talentMaterializationsByCandidateKey).find(item => !initial.talentMaterializationsByCandidateKey[item.candidateKey])!
  const duplicate = { ...record, candidateKey: `${record.candidateKey}:duplicate` }
  expect(() => guard({ ...addition, talentMaterializationsByCandidateKey: { ...addition.talentMaterializationsByCandidateKey, [duplicate.candidateKey]: duplicate } })).toThrow('Duplicate or orphan materialization')
  const removalGuard = createLongHorizonMutationGuard(addition)
  expect(() => removalGuard({ ...addition, talentMaterializationsByCandidateKey: {} })).toThrow('history removed')
})

it('checks cross-team ownership and playable depth only after roster mutations', () => {
  const initial = createNewGame()
  const teams = Object.values(initial.teams)
  const first = teams[0]!, second = teams[1]!
  expect(() => createLongHorizonMutationGuard(initial)({ ...initial, teams: { ...initial.teams, [second.id]: { ...second, rosterPlayerIds: [...second.rosterPlayerIds, first.rosterPlayerIds[0]!] } } })).toThrow('Duplicate roster owner')
  expect(() => createLongHorizonMutationGuard(initial)({ ...initial, teams: { ...initial.teams, [first.id]: { ...first, rosterPlayerIds: first.rosterPlayerIds.slice(0, 4) } } })).toThrow('Roster survival failure')
})
