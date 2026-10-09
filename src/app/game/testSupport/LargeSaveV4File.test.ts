import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { readLargeSaveV4File, writeLargeSaveV4File } from './LargeSaveV4File'

it('streams exactly the canonical Save V4 envelope including escaped text and UTF8 buffer boundaries', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bdm-save-v4-'))
  try {
    const world = createNewGame({ seed: 15015 })
    const envelope = serializeGameWorldV4(world, `${world.currentDate}T00:00:00.000Z`)
    const path = join(directory, 'save.json')
    writeLargeSaveV4File(path, envelope)
    const streamed = readLargeSaveV4File(path)
    expect(streamed).toEqual(JSON.parse(JSON.stringify(envelope)))
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(streamed)
    const restored = deserializeGameWorldV4(streamed)
    expect(restored.players).toEqual(world.players)
    const after = serializeGameWorldV4(restored, envelope.savedAt)
    const normalize = (save: typeof envelope) => ({ ...save, payload: { ...save.payload,
      personalities: [...save.payload.personalities!].sort((a,b)=>String(a.coachId).localeCompare(String(b.coachId))),
      morale: [...save.payload.morale!].sort((a,b)=>String(a.personId).localeCompare(String(b.personId))),
    } })
    expect(JSON.parse(JSON.stringify(normalize(after)))).toEqual(JSON.parse(JSON.stringify(normalize(envelope))))
    const textEnvelope = { ...envelope, savedAt: `é😀\\\"\n${'漢'.repeat(800_000)}` }
    writeLargeSaveV4File(path, textEnvelope)
    expect(readLargeSaveV4File(path)).toEqual(JSON.parse(JSON.stringify(textEnvelope)))
  } finally { rmSync(directory, { recursive: true }) }
}, 60_000)
