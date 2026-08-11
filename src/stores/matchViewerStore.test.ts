import { createNewGame, prepareUserMatch } from '@/app/game'
import { describe, expect, it, beforeEach } from 'vitest'

import { useMatchViewerStore } from './matchViewerStore'

describe('matchViewerStore', () => {
  beforeEach(() => useMatchViewerStore.getState().clear())

  it('starts empty and controls ephemeral playback state', () => {
    expect(useMatchViewerStore.getState().simulation).toBeNull()
    const simulation = prepareUserMatch(createNewGame())
    const store = useMatchViewerStore.getState()
    store.startMatch(simulation)

    expect(useMatchViewerStore.getState()).toMatchObject({ simulation, currentEventIndex: 0, isPlaying: true, speed: 1 })
    store.pause()
    store.setSpeed(4)
    store.resume()
    store.revealNextEvent()
    expect(useMatchViewerStore.getState()).toMatchObject({ isPlaying: true, speed: 4, currentEventIndex: 1 })
  })

  it('skips to the end and applies the result marker only once', () => {
    const simulation = prepareUserMatch(createNewGame())
    useMatchViewerStore.getState().startMatch(simulation)
    useMatchViewerStore.getState().skipToEnd()

    expect(useMatchViewerStore.getState()).toMatchObject({ currentEventIndex: simulation.events.length, isPlaying: false })
    expect(useMatchViewerStore.getState().markResultApplied()).toBe(true)
    expect(useMatchViewerStore.getState().markResultApplied()).toBe(false)
  })
})
