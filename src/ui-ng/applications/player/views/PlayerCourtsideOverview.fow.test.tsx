import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import type { PlayerKnowledgeAccess } from '@/app/player/PlayerKnowledgeAccess'
import type { PlayerWorkspaceContextValue } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'
import { PlayerWorkspaceProvider } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'
import { RADAR_CATEGORY_ORDER } from '@/ui-ng/applications/player/data/ratingCatalog'
import { PlayerOverviewView } from './PlayerOverviewView'

const SECRET_MORALE = 'SECRET_OPPONENT_MORALE_97'
const SECRET_AVAILABILITY = 'SECRET_OPPONENT_AVAILABILITY'
const SECRET_RISK = 'SECRET_OPPONENT_INJURY_RISK'
const SECRET_RADAR = 99

function opponentAccess(known: boolean): PlayerKnowledgeAccess {
  return {
    kind: known ? 'scouted' : 'unknown',
    organizationId: null,
    viewingTeamId: null,
    knownDimensions: [],
    knownPotential: [],
    ratingEvaluations: known
      ? RADAR_CATEGORY_ORDER.map((family, index) => ({
          id: 'rating:FREE_THROW' as const,
          key: 'FREE_THROW' as const,
          label: 'Estimated scouting ' + family,
          family,
          displayLabel: (50 + index) + '–' + (66 + index),
          coveragePercent: 80,
          evaluation: {
            mode: 'RANGE' as const, estimate: 58 + index, uncertainty: 8,
            confidence: 85, freshness: 0.8, disagreement: 'MODERATE' as const,
          },
        }))
      : [],
  }
}

function renderOpponentOverview(known: boolean): string {
  const model = {
    knowledgeAccess: opponentAccess(known),
    // Deliberately inject private/raw data. None may enter opponent Overview,
    // even when the PlayerWorkspaceModel itself carries them for other pages.
    status: {
      morale: { status: 'available', value: SECRET_MORALE },
      availability: { status: 'available', value: SECRET_AVAILABILITY },
      risk: { status: 'available', value: SECRET_RISK },
    },
    radarAxes: RADAR_CATEGORY_ORDER.map((key) => ({
      key, label: key, value: SECRET_RADAR,
    })),
    ratings: [{ id: 'DECISION_MAKING', value: 99, category: 'mental' }],
    overview: {
      identityModule: { archetypeTitle: 'NOT SCOUTED', roleTitle: 'Guard', chips: [] },
      season: {
        status: 'unavailable', headline: [], gamesPlayed: 0,
        seasonLabel: '2025-26', competitionLabel: 'League',
      },
      recentForm: { games: [], windowLabel: 'Last 5', averageLabel: 'No games' },
    },
  }
  const context = {
    model,
    session: { setActiveView: () => {}, setAttributesCategory: () => {} },
  } as unknown as PlayerWorkspaceContextValue
  return renderToStaticMarkup(
    <PlayerWorkspaceProvider value={context}>
      <PlayerOverviewView />
    </PlayerWorkspaceProvider>,
  )
}

describe('PLAYER Courtside Overview FOW', () => {
  it('uses authorized per-rating estimates and never shows a rival\'s private state or raw radar', () => {
    const html = renderOpponentOverview(true)
    expect(html).toContain('RADAR ESTIMADO')
    expect(html).toContain('SCOUTING PROFILE')
    expect(html).toContain('8/8 atributos estimados por tu club')
    expect(html).toContain('Estimación de tu club')
    expect(html).toContain('Mentalidad')
    expect(html).toContain('58–74')
    expect(html).toContain('ESTIMACIÓN MAYOR')
    expect(html).toContain('Forma aproximada basada en scouting')
    expect(html).not.toContain('Atributos individuales no conocidos')
    expect(html).not.toContain(SECRET_MORALE)
    expect(html).not.toContain(SECRET_AVAILABILITY)
    expect(html).not.toContain(SECRET_RISK)
    expect(html).not.toContain('99/100')
    expect(html).not.toContain('EXPLORAR ANÁLISIS COMPLETO')
  })

  it('does not render an invented radar or private metrics for an unknown opponent', () => {
    const html = renderOpponentOverview(false)
    expect(html).toContain('PERFIL POR COMPLETAR')
    expect(html).toContain('0/0 atributos estimados')
    expect(html).toContain('No disponemos de una fuente autorizada')
    expect(html).not.toContain('po-cs-radar__shape')
    expect(html).not.toContain(SECRET_MORALE)
    expect(html).not.toContain(SECRET_AVAILABILITY)
    expect(html).not.toContain(SECRET_RISK)
    expect(html).not.toContain('EXPLORAR ANÁLISIS COMPLETO')
  })
})
