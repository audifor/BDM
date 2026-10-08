import { expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { lightGate } from './BS15IFinalLongHorizon.test'
const source = createNewGame({ seed: 15015 })
const ids = new Set(Object.keys(source.players))
it('rejects an unprocessed NCAA roster deficit before writing recovery', () => {
  expect(() => lightGate(source, source.currentDate, ids, 0, 0)).toThrow('Playable roster deficit')
})
it('rejects duplicate ownership before writing a recovery checkpoint', () => {
  const [a,b] = Object.values(source.teams)
  const world = { ...source, teams: { ...source.teams, [b!.id]: { ...b!, rosterPlayerIds: [...b!.rosterPlayerIds,a!.rosterPlayerIds[0]!] } } }
  expect(() => lightGate(world, source.currentDate, ids, 0, 0)).toThrow('ownership')
})
it('rejects an orphan identity before writing a recovery checkpoint', () => {
  const player = Object.values(source.players)[0]!
  const world = { ...source, players: { ...source.players, [player.id]: { ...player, personId: 'missing-person' as never } } }
  expect(() => lightGate(world, source.currentDate, ids, 0, 0)).toThrow('Orphan')
})
