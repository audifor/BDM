import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { createDefaultTacticalPlan } from '@/engine/match'
import { getUserTeam } from '@/engine/calendar'
import { getTeamStaffPresentation } from '@/ui/staffPresentation'
import type { DesktopAppActions } from './DesktopAppHost'
import { DesktopAppHost } from './DesktopAppHost'
import { DESKTOP_APPS } from './DesktopAppRegistry'

const actions: DesktopAppActions = { tacticalPlan: createDefaultTacticalPlan(), openApp: () => undefined, playGame: () => undefined, instantResult: () => undefined, simulateRemainingGamesToday: () => undefined, advanceDay: () => undefined, startNextSeason: () => undefined, releasePlayer: () => undefined, signFreeAgent: () => undefined, startStaffCandidacy: () => undefined, startStaffInterview: () => undefined, completeStaffInterview: () => undefined, createStaffOffer: () => undefined, acceptStaffOffer: () => undefined, declineStaffOffer: () => undefined, fireStaff: () => undefined, selectDraftProspect: () => undefined, purchaseSkill: () => undefined, purchasePerk: () => undefined, acceptOffer: () => undefined, declineOffer: () => undefined, applyForJob: () => undefined, setTacticalPlan: () => undefined, resetTacticalPlan: () => undefined, setTrainingIntensity: () => undefined, setTrainingFocus: () => undefined, scheduleTrainingSession: () => undefined, scheduleTeamModuleSession: () => undefined, cancelTrainingSession: () => undefined, saveUserTrainingModule: () => undefined, deleteUserTrainingModule: () => undefined, assignTrainingModuleToPlayer: () => undefined, setLineupSlot: () => undefined, clearLineupSlot: () => undefined, updateRotationMinutes: () => undefined, updateGamePlanMatchups: () => undefined, updateGamePlanTacticalOverride: () => undefined, saveDesignerPlay: () => undefined, deleteDesignerPlay: () => undefined, saveDesignerPlaybook: () => undefined, deleteDesignerPlaybook: () => undefined }

describe('DesktopAppHost', () => {
  it('migrates every functional legacy app to a window-capable registry entry', () => {
    for (const appId of ['squad', 'schedule', 'training', 'staff', 'coach', 'tactics', 'market', 'draft', 'match']) {
      const app = DESKTOP_APPS.find((candidate) => candidate.id === appId)
      expect(app?.window).toBeDefined()
      expect(app?.renderKey).toBeDefined()
    }
  })

  it('renders real Match Center data without fabricated placeholders', () => {
    const world = createNewGame()
    const match = renderToStaticMarkup(createElement(DesktopAppHost, { appId: 'match', world, actions }))
    expect(match).toContain('Centro de partido')
    expect(match).toContain('Avanzar día')
    expect(match).not.toContain('Team Chemistry')
  })

  it('opens Golden Manager sections while preserving unrelated application hosts', () => {
    const world = createNewGame()
    const labels = { training: 'Team Training', coach: 'REPUTATION', tactics: 'Pizarra', market: 'Free agents', draft: 'No draft available' }
    for (const [appId, label] of Object.entries(labels)) {
      expect(renderToStaticMarkup(createElement(DesktopAppHost, { appId, world, actions }))).toContain(label)
    }
  })

  it('keeps Plantilla focused on the roster while analysis and mentoring remain separate apps', () => {
    const world = createNewGame()
    const roster = renderToStaticMarkup(createElement(DesktopAppHost, { appId: 'squad', world, actions }))
    const analysis = renderToStaticMarkup(createElement(DesktopAppHost, { appId: 'analysis', world, actions }))
    const mentoring = renderToStaticMarkup(createElement(DesktopAppHost, { appId: 'mentoring', world, actions }))
    expect(roster).toContain('Buscar jugador')
    expect(roster).not.toContain('Análisis + Dinámicas')
    expect(analysis).toContain('Depth Chart')
    expect(mentoring).toContain('Mentoring')
  })

  it('keeps Legacy in Perfil and removes its separate launcher alongside Liga', () => {
    const world = createNewGame()
    expect(DESKTOP_APPS.find((app) => app.id === 'legacy')).toBeUndefined()
    expect(DESKTOP_APPS.find((app) => app.id === 'standings')).toBeUndefined()
    expect(renderToStaticMarkup(createElement(DesktopAppHost, { appId: 'coach', world, actions }))).toContain('>Legacy<')
  })

  it('opens Staff on the Wave 4C1 Staff Core UI, not the legacy Club Staff & Roles view', () => {
    const world = createNewGame()
    const markup = renderToStaticMarkup(createElement(DesktopAppHost, { appId: 'staff', world, actions }))
    // Wave 4C1 Staff Core UI signal: the staff-core BDMDataGrid and its CONTRACT STATUS column.
    expect(markup).toContain('staff-core')
    expect(markup).toContain('CONTRACT STATUS')
    // The current GameWorld's staff data is what renders (world-derived, not fabricated).
    const team = getUserTeam(world)
    expect(team).toBeDefined()
    const staff = getTeamStaffPresentation(world, team!.id)
    expect(staff.length).toBeGreaterThan(0)
    expect(markup).toContain(staff[0]!.name)
    // Legacy Club "Staff & Roles" tab content must NOT appear.
    expect(markup).not.toContain('Staff y Roles Funcionales')
    expect(markup).not.toContain('Bonificaciones del Staff')
  })

  it('leaves the Club app itself rendering ClubPcbPage unaffected by the Staff routing fix', () => {
    // ClubPcbPage's own "Staff & Roles" tab (reached via initialTab: 'staff', which DesktopAppHost
    // no longer passes for appId 'club' after the Staff routing fix) is covered directly by
    // ClubPcbPage.test.ts. This only needs to confirm 'club' still opens ClubPcbPage's default view.
    const markup = renderToStaticMarkup(createElement(DesktopAppHost, { appId: 'club', world: createNewGame(), actions }))
    expect(markup).toContain('pcb-club')
    expect(markup).toContain('club-dashboard')
  })
})
