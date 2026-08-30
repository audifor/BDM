import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { PlantillaPcbPage } from './PlantillaPcbPage'

describe('PlantillaPcbPage', () => {
  it('renders the canonical roster controls with real roster data', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const markup = renderToStaticMarkup(createElement(PlantillaPcbPage, { world }))

    for (const label of [
      'Plantilla',
      `Plantilla (${team.rosterPlayerIds.length})`,
      team.name,
      'JUGADOR',
      'POS',
      'CONTRATO',
      'FATIGA',
      'OK',
    ]) {
      expect(markup).toContain(label)
    }

    for (const shellLabel of ['Hub', 'Scouting', 'Mercado']) {
      expect(markup).not.toContain(shellLabel)
    }
  })
})
