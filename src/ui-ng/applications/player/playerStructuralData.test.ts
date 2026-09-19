import { describe, expect, it } from 'vitest'

import {
  PLAYER_VIEW_LABELS,
  PLAYER_VIEW_PLACEHOLDERS,
  PLAYER_WORKSPACE_VIEWS,
} from './playerStructuralData'

describe('player page navigation', () => {
  it('keeps the eight definitive pages in spec order', () => {
    expect(PLAYER_WORKSPACE_VIEWS).toEqual([
      'overview',
      'attributes',
      'performance',
      'development',
      'contract',
      'medical',
      'scouting',
      'history',
    ])
  })

  it('has no compare page: comparison is a contextual action', () => {
    expect(PLAYER_WORKSPACE_VIEWS).not.toContain('compare')
  })

  it('labels every page, with Scouting Report spelled out', () => {
    for (const view of PLAYER_WORKSPACE_VIEWS) {
      expect(PLAYER_VIEW_LABELS[view].length).toBeGreaterThan(0)
    }
    expect(PLAYER_VIEW_LABELS.scouting).toBe('Scouting Report')
  })

  it('has no page left without a real implementation', () => {
    // Every page is implemented, so none may fall back to a "not implemented" message.
    for (const view of PLAYER_WORKSPACE_VIEWS) {
      expect(PLAYER_VIEW_PLACEHOLDERS[view]).toBeUndefined()
    }
  })
})
