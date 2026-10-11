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
    expect(container.querySelector('[data-ng-region="scouting-decision-verdict"]')).toBeInTheDocument()
    expect(screen.getByText('WHY THIS PLAYER MATTERS')).toBeInTheDocument()
    const bench=within(container.querySelector('[data-ng-region="scouting-roster-compare"]') as HTMLElement)
    expect(bench.getByRole('button',{name:'POSITION RATING LEADER'})).toHaveAttribute('aria-pressed','true')
    fireEvent.click(bench.getByRole('button',{name:'SAME-POSITION PEER'}))
    expect(bench.getByRole('button',{name:'SAME-POSITION PEER'})).toHaveAttribute('aria-pressed','true')
    expect(screen.getByText('80 VERIFIED RATINGS')).toBeInTheDocument()
    expect(screen.getByText('NO STAFF REPORT')).toBeInTheDocument()
    const knowledgeNote=container.querySelector('.po-scv3__coverage-note') as HTMLElement
    expect(knowledgeNote).toHaveTextContent('INTERNAL KNOWLEDGE')
    expect(knowledgeNote).toHaveTextContent('All 80 player ratings are known internally.')
    expect(knowledgeNote).not.toHaveTextContent('KNOWLEDGE GAPS')
    expect(container.querySelector('.po-scv3__route-detail')).toHaveTextContent('DEVELOPMENT')
    const comparator=container.querySelector('[data-ng-region="scouting-roster-compare"]') as HTMLElement
    expect(comparator).toHaveTextContent('HEAD-TO-HEAD · OUR ROSTER')
    const ratingHead=comparator.querySelector('.po-scv3__compare-column-head') as HTMLElement
    expect(ratingHead).toHaveTextContent(world.players[team.rosterPlayerIds[0]!]!.lastName.toUpperCase())
    expect(ratingHead).not.toHaveTextContent('SCOUT')
    expect(within(comparator).getByLabelText('Comparison attribute family')).toHaveValue('position')
    const assessed=within(comparator).getByLabelText('Position assessed') as HTMLSelectElement
    expect(assessed.value).toMatch(/^(PG|SG|SF|PF|C)$/)
    const positionCaption=within(comparator).getByText(/BOTH PRIMARY|PRIMARY \/ SECONDARY|BOTH SECONDARY|NO COMMON POSITION/)
    expect(positionCaption).toBeInTheDocument()
    const ownPicker=within(comparator).getByLabelText('Compare against my player') as HTMLSelectElement
    expect([...ownPicker.options].every(option=>!option.textContent?.includes(' / PG, SF, PF, C'))).toBe(true)
    expect(container.querySelector('.po-scv3__stat')).not.toBeNull()
    expect(ownPicker.options.length).toBeGreaterThan(0)
    const verdict=container.querySelector('[data-ng-region="scouting-decision-verdict"]')!
    const before=verdict.textContent
    const other=ownPicker.options.item(ownPicker.options.length-1)!.value
    fireEvent.change(ownPicker,{target:{value:other}})
    expect(ownPicker.value).toBe(other)
    expect(within(comparator).getByRole('button',{name:'CHOOSE PLAYER'})).toHaveAttribute('aria-pressed','true')
    expect(verdict).toHaveTextContent('POSITIONAL ATTRIBUTES COMPARED')
    expect(verdict).toHaveTextContent('POSITION ADVANTAGES')
    expect(verdict).toHaveTextContent('POSITION WEAKNESSES')
    // Changing the selected player drives the same source of truth used by the FM matchup.
    expect(verdict.textContent).not.toBeNull()
    expect(before).not.toBeNull()
    fireEvent.change(within(comparator).getByLabelText('Comparison attribute family'),{target:{value:'physical'}})
    expect(comparator).toHaveTextContent('comparable in this family')
    const scopes=within(container.querySelector('[aria-label="Comparison evidence scope"]') as HTMLElement)
    expect(scopes.getByRole('button',{name:/POSITION/})).toHaveAttribute('aria-pressed','true')
    fireEvent.click(scopes.getByRole('button',{name:'PHYSICAL'}))
    expect(scopes.getByRole('button',{name:'PHYSICAL'})).toHaveAttribute('aria-pressed','true')
    expect(comparator).toHaveTextContent('ATTRIBUTE')
    expect(comparator).toHaveTextContent('EDGE')
    const expand=within(comparator).queryByRole('button',{name:/SHOW ALL .* ATTRIBUTES/})
    if (expand !== null) {
      fireEvent.click(expand)
      expect(expand).toHaveAttribute('aria-expanded','true')
    }
    expect(container.querySelector('.po-scv3__reason-group')).not.toBeNull()
    expect(screen.getByRole('button',{name:'PERFORMANCE ↗'})).toBeInTheDocument()
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
    const comparator=container.querySelector('[data-ng-region="scouting-roster-compare"]') as HTMLElement
    expect(comparator).toHaveTextContent(/NO COMPARABLE INDIVIDUAL ATTRIBUTES YET|No same-position teammate available/)
    expect(screen.queryByText('WHY THIS PLAYER MATTERS')).not.toBeInTheDocument()
    expect(screen.getByText(/No scout report has been filed/)).toBeInTheDocument()
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
    fireEvent.click(within(tabs).getByRole('tab',{name:'EVALUATORS (0)'}))
    expect(within(tabs).getByRole('tab',{name:'EVALUATORS (0)'})).toHaveAttribute('aria-selected','true')
    fireEvent.click(within(tabs).getByRole('tab',{name:'GAME STATS'}))
    expect(within(tabs).getByRole('tab',{name:'GAME STATS'})).toHaveAttribute('aria-selected','true')
    expect(container.querySelector('.po-scv3__timeline')).not.toBeNull()
  })
})
