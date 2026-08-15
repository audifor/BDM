import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { createDefaultTacticalPlan } from '@/engine/match'
import type { DesktopAppActions } from './DesktopAppHost'
import { DesktopAppHost } from './DesktopAppHost'
import { DESKTOP_APPS } from './DesktopAppRegistry'

const actions: DesktopAppActions = { tacticalPlan: createDefaultTacticalPlan(), openApp: () => undefined, playGame: () => undefined, instantResult: () => undefined, simulateRemainingGamesToday: () => undefined, advanceDay: () => undefined, startNextSeason: () => undefined, releasePlayer: () => undefined, signFreeAgent: () => undefined, purchaseSkill: () => undefined, purchasePerk: () => undefined, acceptOffer: () => undefined, declineOffer: () => undefined, setTacticalPlan: () => undefined, resetTacticalPlan: () => undefined, setTrainingIntensity: () => undefined, setTrainingFocus: () => undefined }

describe('DesktopAppHost', () => {
  it('migrates every functional legacy app to a window-capable registry entry', () => {
    for (const appId of ['squad', 'schedule', 'standings', 'training', 'staff', 'coach', 'tactics', 'market', 'match']) {
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

  it('wraps Training, League, Staff, Coach, Tactics and Market in their existing components', () => {
    const world = createNewGame()
    const labels = { training: 'Active plan', standings: 'STANDINGS', staff: 'STAFF', coach: 'REPUTATION', tactics: 'TACTICS', market: 'FREE AGENTS' }
    for (const [appId, label] of Object.entries(labels)) {
      expect(renderToStaticMarkup(createElement(DesktopAppHost, { appId, world, actions }))).toContain(label)
    }
  })
})
