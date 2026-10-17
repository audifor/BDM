import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { getAddressableScoutingPlayerIds } from '@/app/scouting'
import { addMarketTarget, archiveMarketTarget, getMarketTargetsForTeam, setMarketTargetNote, setMarketTargetPriority } from '@/app/market/MarketTargetService'
import { marketTargetId } from '@/domain/market/MarketTarget'
import { serializeGameWorldV4, deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'

function fixture() {
  const world = createNewGame()
  const team = getUserTeam(world)!
  const playerId = getAddressableScoutingPlayerIds(world, team.id).find((id) => !team.rosterPlayerIds.includes(id))
  if (playerId === undefined) throw new Error('Fixture requires an addressable external player')
  return { world, team, playerId }
}
describe('Market objectives are canonical and save-backed', () => {
  it('keeps priority, notes and chronological history across Save V4 round trips', () => {
    const { world, team, playerId } = fixture()
    let current = addMarketTarget(world, team.id, playerId)
    current = setMarketTargetPriority(current, team.id, playerId, 'HIGH')
    current = setMarketTargetNote(current, team.id, playerId, 'Seguir rendimiento durante la temporada')
    const target = current.marketTargetsById[marketTargetId(team.id, playerId)]!
    expect(target.history.map((item) => item.kind)).toEqual(['ADDED','PRIORITY_CHANGED','NOTE_UPDATED'])
    expect(target.priority).toBe('HIGH')
    const saved = serializeGameWorldV4(current, '2026-10-17T12:00:00.000Z')
    const loaded = deserializeGameWorldV4(saved)
    expect(loaded.marketTargetsById[target.id]).toEqual(target)
    expect(getMarketTargetsForTeam(loaded, team.id)).toHaveLength(1)
    const archived = archiveMarketTarget(loaded, team.id, playerId)
    expect(getMarketTargetsForTeam(archived, team.id)).toHaveLength(0)
    expect(getMarketTargetsForTeam(archived, team.id, true)[0]?.status).toBe('ARCHIVED')
    const restored = addMarketTarget(archived, team.id, playerId)
    expect(restored.marketTargetsById[target.id]?.history.at(-1)?.kind).toBe('RESTORED')
  })
  it('does not allow non-addressable players or own roster to enter the market target list', () => {
    const { world, team } = fixture()
    expect(() => addMarketTarget(world, team.id, team.rosterPlayerIds[0]!)).toThrow(/not an external addressable/)
    const absent = Object.keys(world.players).find((id) => !getAddressableScoutingPlayerIds(world, team.id).includes(id as never))
    if (absent) expect(() => addMarketTarget(world, team.id, absent as never)).toThrow(/not an external addressable/)
  })
  it('loads earlier Save V4 payloads without target collections as an empty shortlist', () => {
    const { world, team } = fixture()
    const envelope = structuredClone(serializeGameWorldV4(world, '2026-10-17T12:00:00.000Z'))
    delete (envelope.payload as { marketTargets?: unknown }).marketTargets
    const restored = deserializeGameWorldV4(envelope)
    expect(getMarketTargetsForTeam(restored, team.id)).toEqual([])
  })
  it('enforces note size and rejects duplicate save records', () => {
    const { world, team, playerId } = fixture()
    const current = addMarketTarget(world, team.id, playerId)
    expect(() => setMarketTargetNote(current, team.id, playerId, 'x'.repeat(501))).toThrow()
    const envelope = serializeGameWorldV4(current, '2026-10-17T12:00:00.000Z')
    const tampered = structuredClone(envelope)
    const rawTargets = tampered.payload.marketTargets as unknown[]
    rawTargets.push(rawTargets[0])
    expect(() => deserializeGameWorldV4(tampered)).toThrow(/Duplicate market targets/)
  })
})
