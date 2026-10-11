import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { createAcbTestGame } from './createAcbTestGame'
import { addDays } from '@/domain/date'
import { createInjury } from '@/domain/injury'
import { injuryIdFromString } from '@/domain/ids'
import { updateGameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { serializeGameWorldV4, deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { simulateUntilDate } from './simulateUntilDate'
import { classifyContinueEvidence, createLongitudinalEvidence, fingerprint } from './WorldDbCertificationDiagnostics'

it('persists seeds, unresolved decisions and compatible checkpoints, retaining the stop when an assertion fails', () => {
  const initial = createAcbTestGame()
  const injury = createInjury({ id: injuryIdFromString('v2:evidence-review'), playerId: getUserTeam(initial)!.rosterPlayerIds[0]!, kind: 'ankleSprain', severity: 'moderate', injuredOn: addDays(initial.currentDate, -10), expectedReturnDate: initial.currentDate })
  const due = updateGameWorld(initial, { injuries: [injury] })
  const before = serializeGameWorldV4(due, '2025-10-01T00:00:00.000Z')
  const target = addDays(due.currentDate, 1)
  const source = { fixture: 'ACB diagnostic writer test', sourceVersion: 1 }
  const evidence = createLongitudinalEvidence(due, target, source, 151617)
  expect(evidence.createSeed()).toBe(151617)
  const stopped = simulateUntilDate(due, target, evidence.createSeed)
  expect(classifyContinueEvidence(stopped, target)).toBe('CANONICAL_DECISION')
  evidence.observeWorld(stopped.world, 'CANONICAL_REQUIRED_DECISION', { command: 'STOP', reason: stopped.stopReason })
  evidence.finish(stopped)
  const read = () => JSON.parse(readFileSync(join(evidence.directory, 'diagnostic.json'), 'utf8'))
  expect(read()).toMatchObject({ seed: 151617, seedCalls: 1, sourceFingerprint: fingerprint(source), initialDate: due.currentDate, finalDate: due.currentDate, target, stopReason: stopped.stopReason, result: 'CANONICAL_DECISION', historical2029Cause: 'UNRESOLVED_HISTORICAL_CAUSE' })
  expect(read().pendingDecisions).toContainEqual(expect.objectContaining({ sourceId: injury.id, sourceKind: 'USER_RTP_REVIEW' }))
  const loaded = deserializeGameWorldV4(JSON.parse(readFileSync(join(evidence.directory, read().lastCheckpoint), 'utf8')))
  expect(serializeGameWorldV4(loaded, '2025-10-01T00:00:00.000Z')).toEqual(before)
  expect(JSON.parse(readFileSync(join(evidence.directory, 'source.json'), 'utf8'))).toEqual(source)
  expect(readFileSync(join(evidence.directory, 'seeds.jsonl'), 'utf8')).toContain('151617')
  expect(readFileSync(join(evidence.directory, 'decisions.jsonl'), 'utf8')).toContain('"automaticDecisionResolution":false')
  evidence.fail(new Error('Injected longitudinal assertion failure'))
  expect(read()).toMatchObject({ result: 'FAIL', stopReason: stopped.stopReason, error: { message: 'Injected longitudinal assertion failure' } })
  expect(serializeGameWorldV4(due, '2025-10-01T00:00:00.000Z')).toEqual(before)
  expect(classifyContinueEvidence({ ...stopped, stopReason: { type: 'arrived' } }, target)).toBe('SIMULATION_ERROR')
  expect(classifyContinueEvidence({ ...stopped, stopReason: { type: 'safetyLimit' } }, target)).toBe('SIMULATION_ERROR')
  if (stopped.stopReason.type !== 'breakpoint') throw new Error('Expected RTP breakpoint')
  expect(classifyContinueEvidence({ ...stopped, stopReason: { ...stopped.stopReason, breakpoint: { ...stopped.stopReason.breakpoint, sourceId: 'wrong-injury-id' } } }, target)).toBe('SIMULATION_ERROR')
}, 120_000)
