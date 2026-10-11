// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

import { createNewGame } from '@/app/game'
import { addDays } from '@/domain/date'
import { createInjury } from '@/domain/injury'
import { injuryIdFromString } from '@/domain/ids'
import { updateGameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { PlayerWorkspace } from '@/ui-ng/applications/player/PlayerWorkspace'
import { MedicalWorkspace } from '@/ui-ng/applications/medical/MedicalWorkspace'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'

afterEach(cleanup)

function loadPlayer(world: ReturnType<typeof createNewGame>, id: string) {
  useGameStore.getState().replaceWorld(world)
  window.history.replaceState({}, '', '/?ui=ng&app=player&playerId='+encodeURIComponent(id)+'&playerView=medical')
  return render(<NgWorkspaceNavigationProvider><PlayerWorkspace /></NgWorkspaceNavigationProvider>)
}

describe('Courtside PLAYER Medical decisions',()=>{
  it('displays real readiness values, a selectable body map, and routes to the actual Risk workspace',()=>{
    const world=createNewGame()
    const team=getUserTeam(world)!
    const playerId=team.rosterPlayerIds[0]!
    const {container}=loadPlayer(world,playerId)
    const hero=container.querySelector('[data-ng-region="medical-decision-hero"]')!
    expect(hero).toHaveTextContent('CAREER FATIGUE')
    expect(hero).toHaveTextContent('ENGINE INJURY RISK')
    expect(hero).toHaveTextContent('AVAILABLE')
    expect(container.querySelector('[data-ng-region="medical-decisions"]')).not.toBeNull()
    expect(container.querySelector('[data-ng-region="medical-bodymap"]') ?? container.querySelector('.po-med-bodymap')).not.toBeNull()
    expect(screen.queryByText('Medical Detail')).not.toBeInTheDocument()
    expect(container.querySelector('.po-med-filters')).toBeNull()
    expect(container.querySelector('.po-med-v3__recent')).toBeNull()
    expect(container.querySelector('.po-med-v3__snapshot')).toBeNull()
    expect(screen.queryByText('CLEARED FOR PLAY')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:/REVIEW MEDICAL RISK/}))
    const url=new URL(window.location.href)
    expect(url.searchParams.get('app')).toBe('medical')
    expect(url.searchParams.get('medicalTab')).toBe('risk')
    expect(url.searchParams.get('playerId')).toBe(playerId)
  })

  it('supports actual injury actions via the department and keeps injury inspection in the main canvas',()=>{
    const world=createNewGame()
    const playerId=getUserTeam(world)!.rosterPlayerIds[0]!
    const injury=createInjury({
      id:injuryIdFromString('player-medical-v2-test'),
      playerId, kind:'ankleSprain', severity:'moderate',
      injuredOn:world.currentDate,
      expectedReturnDate:addDays(world.currentDate,14),
    })
    const injured=updateGameWorld(world,{injuries:[...Object.values(world.injuriesById),injury]})
    const {container}=loadPlayer(injured,playerId)
    expect(screen.getByText('INJURY RECORDED')).toBeInTheDocument()
    const tablist=screen.getByRole('tablist',{name:'Medical profile views'})
    fireEvent.click(within(tablist).getByRole('tab',{name:'HISTORY'}))
    expect(container.querySelector('[data-ng-region="medical-history"]')).toHaveTextContent('Ankle sprain')
    const row=within(container.querySelector('[data-ng-region="medical-history"]') as HTMLElement)
      .getByRole('button',{name:/Ankle sprain/})
    fireEvent.click(row)
    expect(container.querySelector('[data-ng-region="medical-selected-history-detail"]')).toHaveTextContent('Ankle sprain')
    fireEvent.click(screen.getByRole('button',{name:/REHAB PLAN/}))
    const url=new URL(window.location.href)
    expect(url.searchParams.get('app')).toBe('medical')
    expect(url.searchParams.get('medicalTab')).toBe('injured')
    expect(url.searchParams.get('playerId')).toBe(playerId)
  })

  it('keeps BODY, LOAD and HISTORY as interactive views without displaying all sections at once',()=>{
    const world=createNewGame()
    const playerId=getUserTeam(world)!.rosterPlayerIds[0]!
    const {container}=loadPlayer(world,playerId)
    const tablist=screen.getByRole('tablist',{name:'Medical profile views'})
    expect(within(tablist).getByRole('tab',{name:'BODY'})).toHaveAttribute('aria-selected','true')
    expect(container.querySelector('.po-med-bodymap')).not.toBeNull()
    expect(container.querySelector('[data-ng-region="medical-load"]')).toBeNull()

    const head=container.querySelector('.po-med-bodymap__region') as SVGGElement
    const mapStage=container.querySelector('.po-med-bodymap__stage')!
    const initialRadius=head.querySelector('.po-med-bodymap__node')?.getAttribute('r')
    fireEvent.click(head)
    expect(container.querySelector('[data-ng-region="medical-selected-region"]')).toHaveTextContent('Head')
    expect(head).toHaveClass('is-selected')
    expect(mapStage.querySelector('.po-med-bodymap__node')?.getAttribute('r')).toBe(initialRadius)
    expect(container.querySelector('.po-med-v3__region-detail')).not.toBeNull()
    fireEvent.click(head)
    expect(container.querySelector('[data-ng-region="medical-selected-region"]')).toBeNull()
    fireEvent.click(head)
    fireEvent.keyDown(head,{key:'Escape'})
    expect(container.querySelector('[data-ng-region="medical-selected-region"]')).toBeNull()
    fireEvent.click(head)
    fireEvent.click(screen.getByRole('button',{name:'Clear selected body region'}))
    expect(container.querySelector('[data-ng-region="medical-selected-region"]')).toBeNull()

    fireEvent.click(within(tablist).getByRole('tab',{name:'LOAD'}))
    expect(container.querySelector('[data-ng-region="medical-load"]')).not.toBeNull()
    expect(screen.getByText('NO WORKLOAD LOGGED YET')).toBeInTheDocument()
    expect(container.querySelector('.po-med-bodymap')).toBeNull()
    fireEvent.click(within(tablist).getByRole('tab',{name:'HISTORY'}))
    expect(within(tablist).getByRole('tab',{name:'HISTORY'})).toHaveAttribute('aria-selected','true')
    expect(container.querySelector('[data-ng-region="medical-history"]')).not.toBeNull()
  })

  it('hides healthy-state repetition without losing accessible regional details',()=>{
    const world=createNewGame()
    const playerId=getUserTeam(world)!.rosterPlayerIds[0]!
    const {container}=loadPlayer(world,playerId)
    const map=container.querySelector('.po-med-bodymap')!
    expect(map.querySelectorAll('.po-med-bodymap__region')).toHaveLength(13)
    expect(map.querySelectorAll('.po-med-bodymap__state')).toHaveLength(0)
    expect(screen.getByRole('button',{name:/Head: No injury recorded/})).toBeInTheDocument()
    expect(container.querySelector('.po-med-v3__recent')).toBeNull()
    expect(container.querySelector('.po-med-filters')).toBeNull()
    expect(container.querySelector('.po-med-v3__intelligence')).toBeNull()
  })

  it('preserves Medical and Training navigation as genuinely executable route choices',()=>{
    const world=createNewGame()
    const playerId=getUserTeam(world)!.rosterPlayerIds[0]!
    loadPlayer(world,playerId)
    fireEvent.click(screen.getByRole('button',{name:/TRAINING PLAN/}))
    expect(new URL(window.location.href).searchParams.get('app')).toBe('training')
  })

  it('never exposes private rival diagnoses, fatigue, risk or injury records',()=>{
    const world=createNewGame()
    const team=getUserTeam(world)!
    const rival=Object.values(world.players).find(p=>!team.rosterPlayerIds.includes(p.id))!
    const injury=createInjury({
      id:injuryIdFromString('secret-rival-injury'),
      playerId:rival.id,kind:'ankleSprain',severity:'serious',
      injuredOn:world.currentDate,
      expectedReturnDate:addDays(world.currentDate,60),
    })
    const injured=updateGameWorld(world,{injuries:[...Object.values(world.injuriesById),injury]})
    const {container}=loadPlayer(injured,rival.id)
    expect(container.querySelector('[data-ng-region="medical-rival-knowledge"]')).toHaveTextContent('HEALTH STATUS UNVERIFIED')
    expect(container.querySelector('[data-ng-region="medical-readiness"]')).toBeNull()
    expect(container.querySelector('[data-ng-region="medical-history"]')).toBeNull()
    expect(container.querySelector('[data-ng-region="medical-bodymap"]')).toBeNull()
    expect(screen.queryByText(/Ankle sprain/)).not.toBeInTheDocument()
    expect(screen.getByRole('button',{name:/OPEN SCOUTING REPORT/})).toBeInTheDocument()
  })

  it('opens the real medical department with the linked player and requested tab selected',()=>{
    const world=createNewGame()
    const playerId=getUserTeam(world)!.rosterPlayerIds[0]!
    useGameStore.getState().replaceWorld(world)
    window.history.replaceState({},'','/?ui=ng&app=medical&playerId='+encodeURIComponent(playerId)+'&medicalTab=risk')
    const {container}=render(<NgWorkspaceNavigationProvider><MedicalWorkspace /></NgWorkspaceNavigationProvider>)
    expect(container.querySelector('[data-ng-region="medical-workspace"]')).not.toBeNull()
    expect(within(screen.getByRole('navigation',{name:'Workspace tabs'}))
      .getByRole('button',{name:'Risk'})).toHaveAttribute('aria-current','page')
  })
})
