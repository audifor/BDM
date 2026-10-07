// @vitest-environment jsdom
/*
 * MX0.6 closure — Board production initialization.
 *
 * The Board workspace is the real NG read surface for canonical Board confidence/objectives/reasons.
 * A career world in which the user coach is attached to a club must therefore carry that club's
 * Board truth on every entry path: new career (already true) and load (the defect this suite pins).
 * Nothing here invents Board content: the assertions are about the canonical initializer running,
 * and about the workspace rendering it instead of its initialization placeholder.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createNewGame } from '@/app/game'
import { fireCoachFromTeam } from '@/app/coachCareer'
import { loadSavedGame, saveCurrentGame } from '@/app/save/GameSaveService'
import type { GameSaveRepository } from '@/app/save/GameSaveRepository'
import { updateGameWorld } from '@/domain/world'
import { getBoardSummary } from '@/engine/board'
import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'

import { BoardWorkspace } from './BoardWorkspace'

afterEach(cleanup)

beforeEach(() => {
  window.history.replaceState({}, '', '/?ui=ng&app=board')
  useGameStore.getState().resetGame()
})

function repository(initial = ''): GameSaveRepository & { value: string } {
  return {
    value: initial,
    async save(value) { this.value = value },
    async load() { return this.value },
    async getInfo() { return null },
  }
}

/** A career saved before Board initialization existed: a coached club, canonical seasons, no Board truth. */
function careerWithoutBoardTruth() {
  const world = createNewGame()
  const userTeam = getUserTeam(world)!
  return { world: updateGameWorld(world, { boardStatesByTeamId: {} }), userTeam }
}

describe('MX0.6 closure — BoardWorkspace production initialization', () => {
  it('opens a loaded career with canonical Board truth instead of the initialization placeholder', async () => {
    const { world, userTeam } = careerWithoutBoardTruth()
    const repo = repository()
    await saveCurrentGame(world, repo, world.currentDate)

    const restored = await loadSavedGame(repo)
    const summary = getBoardSummary(restored, userTeam.id)
    expect(summary).toBeDefined()
    expect(summary!.state.confidence).toBe(60)
    expect(summary!.state.objectives).toHaveLength(1)

    useGameStore.getState().replaceWorld(restored)
    render(<BoardWorkspace />)

    expect(screen.queryByText('The board will initialize when this project starts.')).toBeNull()
    expect(screen.getByText('Confidence')).toBeInTheDocument()
    expect(screen.getByText(String(summary!.state.confidence))).toBeInTheDocument()
    expect(screen.getAllByText(summary!.state.expectation.summary).length).toBeGreaterThan(0)
  })

  it('leaves an already-initialized career untouched and never duplicates Board truth', async () => {
    const world = createNewGame()
    const userTeam = getUserTeam(world)!
    const before = world.boardStatesByTeamId[userTeam.id]!
    const repo = repository()
    await saveCurrentGame(world, repo, world.currentDate)

    const restored = await loadSavedGame(repo)
    expect(restored.boardStatesByTeamId[userTeam.id]).toEqual(before)
    expect(Object.keys(restored.boardStatesByTeamId)).toEqual([userTeam.id])

    const again = await loadSavedGame(repo)
    expect(again.boardStatesByTeamId).toEqual(restored.boardStatesByTeamId)
  })

  it('renders a fresh prototype career board without any placeholder', () => {
    const world = createNewGame()
    const userTeam = getUserTeam(world)!
    const summary = getBoardSummary(world, userTeam.id)!

    useGameStore.getState().replaceWorld(world)
    render(<BoardWorkspace />)

    expect(screen.queryByText('The board will initialize when this project starts.')).toBeNull()
    expect(screen.getByText('Mandate')).toBeInTheDocument()
    expect(screen.getAllByText(summary.state.expectation.summary).length).toBeGreaterThan(0)
    expect(screen.getAllByText(summary.state.objectives[0]!.label).length).toBeGreaterThan(0)
  })

  it('never fabricates Board truth for a club the user coach is not managing', async () => {
    const world = createNewGame()
    const userTeam = getUserTeam(world)!
    // Canonical coach-career command: the user coach leaves the club, so there is no coached club left
    // to initialize and the surface must say so instead of inventing a board.
    const departed = fireCoachFromTeam(world, userTeam.id)
    const repo = repository()
    await saveCurrentGame(departed, repo, departed.currentDate)
    const restored = await loadSavedGame(repo)

    expect(getUserTeam(restored)).toBeUndefined()
    expect(restored.boardStatesByTeamId).toEqual(departed.boardStatesByTeamId)

    useGameStore.getState().replaceWorld(restored)
    render(<BoardWorkspace />)
    expect(screen.getByText('No team assigned to the user coach.')).toBeInTheDocument()
  })
})
