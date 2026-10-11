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
    expect(hero).toHaveTextContent('FATIGUE RECOVERY')
    expect(hero).toHaveTextContent('3 /day')
    const readiness=container.querySelector('[data-ng-region="medical-readiness"]')!
    expect(readiness).not.toHaveTextContent('FATIGUE RECOVERY')
    expect(readiness).toHaveTextContent('Match load (7D)')
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
    fireEvent.click(within(tablist).getByRole('tab',{name:'BODY'}))
    const ankle=screen.getByRole('button',{name:/Ankle \(L\): Ankle sprain/})
    fireEvent.click(ankle)
    const selected=container.querySelector('[data-ng-region="medical-selected-region"]')!
    expect(selected).toHaveTextContent('Ankle (L)')
    expect(selected).toHaveTextContent('Ankle sprain')
    expect(selected.querySelector('.po-med-v3__region-detail-status .is-warning')).not.toBeNull()
    expect(selected.querySelector('.po-med-v3__region-detail-main')).not.toBeNull()
    fireEvent.click(screen.getByRole('button',{name:/REHAB PLAN/}))
    const url=new URL(window.location.href)
    expect(url.searchParams.get('app')).toBe('medical')
    expect(url.searchParams.get('medicalTab')).toBe('injured')
    expect(url.searchParams.get('playerId')).toBe(playerId)
  })

  it('renders a selected clinical case with scheduled, not invented, absence and compact pattern intelligence',()=>{
    const world=createNewGame()
    const playerId=getUserTeam(world)!.rosterPlayerIds[0]!
    const event=createInjury({
      id:injuryIdFromString('medical-ledger-hand-case'),
      playerId,kind:'handInjury',severity:'moderate',injuredOn:world.currentDate,
      expectedReturnDate:addDays(world.currentDate,15),
    })
    const injured=updateGameWorld(world,{injuries:[...Object.values(world.injuriesById),event]})
    const {container}=loadPlayer(injured,playerId)
    expect(container.querySelector('[data-ng-region="medical-recovery-timeline"]')).toHaveTextContent('RECOVERY OUTLOOK')
    expect(container.querySelector('[data-ng-region="medical-recovery-timeline"]')).toHaveTextContent('NEXT RECORDED REVIEW')
    const tablist=screen.getByRole('tablist',{name:'Medical profile views'})
    const outlook=container.querySelector('[data-ng-region="medical-recovery-timeline"]')!
    expect(outlook).toHaveTextContent('TRAINING')
    expect(outlook).toHaveTextContent('Not recorded')
    expect(outlook).toHaveTextContent('MATCH PLAY')
    expect(outlook).toHaveTextContent('Unavailable')
    expect(container.querySelector('.po-med-v3__intelligence')).toBeNull()
    expect(screen.getByText('HAND INJURY · SIDE NOT RECORDED')).toBeInTheDocument()
    const right=screen.getByRole('button',{name:/Hand \(R\): Hand injury/})
    const left=screen.getByRole('button',{name:/Hand \(L\): Hand injury/})
    expect(right).toBeInTheDocument()
    expect(left).toBeInTheDocument()
    fireEvent.click(right)
    expect(container.querySelector('[data-ng-region="medical-selected-region"]')).toHaveTextContent('Laterality is unknown')
    fireEvent.click(within(tablist).getByRole('tab',{name:'HISTORY'}))
    const board=container.querySelector('[data-ng-region="medical-history"]')!
    expect(board.parentElement).toHaveClass('po-med-v3__history--compact')
    expect(board).toHaveTextContent('INJURY LEDGER')
    expect(board).toHaveTextContent('SELECTED INJURY CASE')
    expect(board).toHaveTextContent('PATTERN INSIGHT')
    expect(board).toHaveTextContent('SCHEDULED ABSENCE')
    expect(board).toHaveTextContent('15 days')
    expect(board).toHaveTextContent('BODY SIDE')
    expect(board).toHaveTextContent('NOT RECORDED')
    expect(container.querySelector('[data-ng-region="medical-staff-notes"]')).toBeNull()
    expect(container.querySelector('.po-med-v3__history-extras')).toBeNull()
    expect(container.querySelector('[data-ng-region="medical-selected-history-detail"]')).toHaveTextContent('Hand injury')
  })

  it('marks a due-today return-to-play review without declaring the player cleared',()=>{
    const world=createNewGame()
    const playerId=getUserTeam(world)!.rosterPlayerIds[0]!
    const injury=createInjury({
      id:injuryIdFromString('medical-due-today'),
      playerId, kind:'hamstringStrain', severity:'moderate',
      injuredOn:addDays(world.currentDate,-10),
      expectedReturnDate:world.currentDate,
    })
    const injured=updateGameWorld(world,{injuries:[...Object.values(world.injuriesById),injury]})
    const {container}=loadPlayer(injured,playerId)
    const outlook=container.querySelector('[data-ng-region="medical-recovery-timeline"]')!
    expect(outlook).toHaveTextContent('Training')
    expect(outlook).toHaveTextContent('Not recorded')
    expect(outlook).toHaveTextContent('Unavailable')
    expect(container.querySelector('.po-med-v3__intelligence')).toBeNull()
    const tabs=screen.getByRole('tablist',{name:'Medical profile views'})
    fireEvent.click(within(tabs).getByRole('tab',{name:'HISTORY'}))
    const board=container.querySelector('[data-ng-region="medical-history"]')!
    expect(board).toHaveTextContent('Return-to-play review due today')
    expect(board).not.toHaveTextContent('0 days until expected return')
    expect(board).toHaveTextContent('RETURN-TO-PLAY REVIEW')
    expect(board.parentElement).toHaveClass('po-med-v3__history--compact')
  })

  it('keeps independent ledger scrolling for players with multiple injury records',()=>{
    const world=createNewGame()
    const playerId=getUserTeam(world)!.rosterPlayerIds[0]!
    const injuries=[
      createInjury({id:injuryIdFromString('medical-history-one'),playerId,
        kind:'ankleSprain',severity:'minor',injuredOn:addDays(world.currentDate,-40),
        expectedReturnDate:addDays(world.currentDate,-28)}),
      createInjury({id:injuryIdFromString('medical-history-two'),playerId,
        kind:'hamstringStrain',severity:'moderate',injuredOn:addDays(world.currentDate,-8),
        expectedReturnDate:addDays(world.currentDate,8)}),
    ]
    const injured=updateGameWorld(world,{injuries:[...Object.values(world.injuriesById),...injuries]})
    const {container}=loadPlayer(injured,playerId)
    fireEvent.click(within(screen.getByRole('tablist',{name:'Medical profile views'}))
      .getByRole('tab',{name:'HISTORY'}))
    const board=container.querySelector('[data-ng-region="medical-history"]')!
    expect(board.parentElement).not.toHaveClass('po-med-v3__history--compact')
    expect(board.querySelectorAll('.po-med-caseboard__ledger-row')).toHaveLength(2)
    const ankle=within(board as HTMLElement).getByRole('button',{name:/Ankle sprain/})
    fireEvent.click(ankle)
    expect(container.querySelector('[data-ng-region="medical-selected-history-detail"]')).toHaveTextContent('Ankle sprain')
  })

  it('formats floating-point fatigue consistently in global header, medical hero and readiness',()=>{
    const world=createNewGame()
    const playerId=getUserTeam(world)!.rosterPlayerIds[0]!
    const fatigued=updateGameWorld(world,{
      careerFatigueByPlayerId:{...world.careerFatigueByPlayerId,[playerId]:1.7200000000000006},
    })
    const {container}=loadPlayer(fatigued,playerId)
    const hero=container.querySelector('[data-ng-region="medical-decision-hero"]')!
    const readiness=container.querySelector('[data-ng-region="medical-readiness"]')!
    expect(hero).toHaveTextContent('1.7/100')
    expect(readiness).toHaveTextContent('1.7%')
    expect(container).not.toHaveTextContent('1.7200000000000006')
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
    const detail=container.querySelector('[data-ng-region="medical-selected-region"]')!
    expect(detail).not.toBeNull()
    expect(detail.parentElement).toHaveClass('po-med-v3__right')
    expect(detail.previousElementSibling).toHaveAttribute('data-ng-region','medical-decisions')
    const regionSummary=within(detail as HTMLElement).getByText('Head')
    const statusSummary=within(detail as HTMLElement).getByText('No injury recorded')
    expect(regionSummary.parentElement).toBe(statusSummary.closest('.po-med-v3__region-detail-status')?.parentElement)
    expect(regionSummary.parentElement).toHaveClass('po-med-v3__region-detail-main')
    expect(statusSummary.closest('.po-med-v3__region-detail-status')).toHaveTextContent('No injury recorded')
    expect(container.querySelector('.po-med-v3__body .po-med-v3__region-detail')).toBeNull()
    expect(container.querySelector('.po-med-bodymap__legend')).toBeNull()
    expect(screen.queryByText('No injury recorded: no recorded injury maps to any region.')).not.toBeInTheDocument()
    fireEvent.click(head)
    expect(container.querySelector('[data-ng-region="medical-selected-region"]')).toBeNull()
    fireEvent.click(head)
    fireEvent.keyDown(head,{key:'Escape'})
    expect(container.querySelector('[data-ng-region="medical-selected-region"]')).toBeNull()
    fireEvent.click(head)
    fireEvent.click(screen.getByRole('button',{name:'Clear selected body region'}))
    expect(container.querySelector('[data-ng-region="medical-selected-region"]')).toBeNull()

    fireEvent.click(within(tablist).getByRole('tab',{name:'LOAD'}))
    expect(container.querySelector('[data-ng-region="medical-selected-region"]')).toBeNull()
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
