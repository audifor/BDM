// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { PlayerWorkspace } from './PlayerWorkspace'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'

afterEach(cleanup)

function showPlayer(world:ReturnType<typeof createNewGame>,playerId:string){
  useGameStore.getState().replaceWorld(world)
  window.history.replaceState({},'',`/?ui=ng&app=player&playerId=${encodeURIComponent(playerId)}&playerView=scouting`)
  return render(<NgWorkspaceNavigationProvider><PlayerWorkspace/></NgWorkspaceNavigationProvider>)
}

describe('PLAYER Scouting Courtside V3',()=>{
  it('uses own-player verified internal ratings and switches player and rating family in FM comparison',()=>{
    const world=createNewGame()
    const team=getUserTeam(world)!
    const {container}=showPlayer(world,team.rosterPlayerIds[0]!)
    expect(container.querySelector('[data-ng-region="player-scouting"]')).toBeInTheDocument()
    expect(screen.getByText('INTERNAL ATTRIBUTE PROFILE')).toBeInTheDocument()
    expect(screen.getByText('INTERNAL EVALUATION')).toBeInTheDocument()
    const comparator=container.querySelector('[data-ng-region="scouting-roster-compare"]') as HTMLElement
    expect(comparator).toHaveTextContent('ROSTER COMPARISON')
    const ownPicker=within(comparator).getByLabelText('Compare against my player') as HTMLSelectElement
    expect(ownPicker.options.length).toBeGreaterThan(0)
    fireEvent.change(within(comparator).getByLabelText('Comparison attribute family'),{target:{value:'physical'}})
    expect(comparator).toHaveTextContent('individual attributes supported')
    expect(container.querySelector('.po-scv3__internal-row')).not.toBeNull()
    fireEvent.click(screen.getByRole('button',{name:'DEVELOPMENT'}))
    fireEvent.click(screen.getByRole('button',{name:'OPEN DEVELOPMENT ↗'}))
    expect(new URL(window.location.href).searchParams.get('playerView')).toBe('development')
  })

  it('never renders rival Player Truth when scouting is absent, but offers operational next steps',()=>{
    const world=createNewGame()
    const team=getUserTeam(world)!
    const rival=Object.values(world.players).find(p=>!team.rosterPlayerIds.includes(p.id))!
    const {container}=showPlayer(world,rival.id)
    expect(container.querySelector('[data-ng-region="player-scouting"]')).not.toBeNull()
    expect(screen.getByText('NO EVALUATION ON FILE')).toBeInTheDocument()
    expect(screen.getByText('NO COMPARABLE INDIVIDUAL ATTRIBUTES YET')).toBeInTheDocument()
    expect(screen.queryByText('INTERNAL ATTRIBUTE PROFILE')).not.toBeInTheDocument()
    expect(screen.getByText(/No staff report sources recorded/)).toBeInTheDocument()
    const comparator=container.querySelector('[data-ng-region="scouting-roster-compare"]') as HTMLElement
    expect(comparator).not.toHaveTextContent('≈72–78')
    expect(screen.getByRole('button',{name:'CONTACT ROUTES'})).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'CONTACT ROUTES'}))
    fireEvent.click(screen.getByRole('button',{name:'VIEW CONTRACT ROUTES ↗'}))
    expect(new URL(window.location.href).searchParams.get('playerView')).toBe('contract')
  })

  it('separates filed scouting reports from actual match statistics',()=>{
    const world=createNewGame()
    const playerId=getUserTeam(world)!.rosterPlayerIds[0]!
    const {container}=showPlayer(world,playerId)
    const tabs=screen.getByRole('tablist',{name:'Scouting evidence view'})
    expect(within(tabs).getByRole('tab',{name:'SCOUT REPORTS'})).toHaveAttribute('aria-selected','true')
    fireEvent.click(within(tabs).getByRole('tab',{name:'GAME STATS'}))
    expect(within(tabs).getByRole('tab',{name:'GAME STATS'})).toHaveAttribute('aria-selected','true')
    expect(container.querySelector('.po-scv3__timeline')).not.toBeNull()
  })
})
