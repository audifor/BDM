// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
    expect(container.querySelector('[data-ng-region="medical-history"]')).toHaveTextContent('Ankle sprain')
    expect(container.querySelector('[data-ng-region="medical-selected-history-detail"]')).toHaveTextContent('Ankle sprain')
    fireEvent.click(screen.getByRole('button',{name:/REHAB PLAN/}))
    const url=new URL(window.location.href)
    expect(url.searchParams.get('app')).toBe('medical')
    expect(url.searchParams.get('medicalTab')).toBe('injured')
    expect(url.searchParams.get('playerId')).toBe(playerId)
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
    expect(screen.getByRole('tab',{name:/Risk/})).toHaveAttribute('aria-selected','true')
  })
})
