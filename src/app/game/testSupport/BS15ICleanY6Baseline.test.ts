import { writeFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { deserializeGameWorldV4, serializeGameWorldV4, type SaveGameEnvelopeV4 } from '@/save/GameWorldSaveV4'
import { readLargeSaveV4File } from './LargeSaveV4File'
import { assertLongHorizonIntegrity } from './TalentLongHorizonCertification'
import { scalePayloadFingerprints, scaleWorldIdentity } from './ScaleSaveCertification'

it('proves exact real Y6 load idempotency twice without creating entities', () => {
  if (process.env.BS15I_CLEAN_Y6_BASELINE !== '1') return
  const { world, identity, fingerprints } = verify()
  const gc = (globalThis as typeof globalThis & { gc?: () => void }).gc
  gc?.(); gc?.()
  const memory = process.memoryUsage()
  assertLongHorizonIntegrity(world)
  const counts = Object.fromEntries(Object.entries(identity).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key, (value as unknown[]).length]))
  const report = { source: 'C:/Temp/BS15I-long-y6-save-v4.json', date: world.currentDate, loads: 3, repeatedLoads: 2, exactPayload: true, counts, identity, fingerprints, postGc: gc !== undefined, memory }
  writeFileSync('C:/Temp/BS15I-clean-y6-baseline.json', JSON.stringify(report, null, 2))
  process.stdout.write(`[BS15I clean Y6] ${JSON.stringify({ counts, memory, loads: 3, repeatedLoads: 2, exactPayload: true })}\n`)
}, 180_000)

function verify() {
  let envelope = readLargeSaveV4File('C:/Temp/BS15I-long-y6-save-v4.json') as SaveGameEnvelopeV4
  const fingerprints = scalePayloadFingerprints(envelope)
  let world = deserializeGameWorldV4(envelope)
  const identity = scaleWorldIdentity(world)
  expect(identity.staffContracts).toHaveLength(348)
  for (let load = 0; load < 2; load += 1) {
    envelope = serializeGameWorldV4(world, '2038-10-01T00:00:00.000Z')
    expect(scalePayloadFingerprints(envelope)).toEqual(fingerprints)
    world = deserializeGameWorldV4(envelope)
    expect(scaleWorldIdentity(world)).toEqual(identity)
  }
  expect(scalePayloadFingerprints(serializeGameWorldV4(world, '2038-10-01T00:00:00.000Z'))).toEqual(fingerprints)
  return { world, identity, fingerprints }
}
