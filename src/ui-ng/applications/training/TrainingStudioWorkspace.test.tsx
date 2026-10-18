// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { createNewGame } from '@/app/game'
import { useGameStore } from '@/stores/gameStore'
import { getUserTeam } from '@/engine/calendar'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import { TrainingStudioWorkspace } from './TrainingStudioWorkspace'
afterEach(()=>{cleanup();useGameStore.getState().resetGame()})
describe('Training Studio Courtside V1',()=>{
 it('plans a persisted macrocycle from the season view',()=>{
   window.history.replaceState({}, '', '/?ui=ng&app=training')
   const world=createNewGame()
   useGameStore.getState().replaceWorld(world)
   render(<NgWorkspaceNavigationProvider><TrainingStudioWorkspace /></NgWorkspaceNavigationProvider>)
   expect(screen.getByText('TRAINING')).toBeInTheDocument()
   fireEvent.click(screen.getByRole('button',{name:'Temporada'}))
   fireEvent.click(screen.getByRole('button',{name:'+ Macrociclo'}))
   const team=getUserTeam(world)!
   expect(useGameStore.getState().world?.trainingStudioPlansByTeamId[team.id]?.macrocycles).toHaveLength(1)
 })
})
