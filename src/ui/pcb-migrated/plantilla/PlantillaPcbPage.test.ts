import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PlantillaPcbPage } from './PlantillaPcbPage'

describe('PlantillaPcbPage', () => {
  it('renders the canonical roster controls while keeping the PCB sections', () => {
    const markup = renderToStaticMarkup(createElement(PlantillaPcbPage))
    for (const label of ['Plantilla', 'Análisis + Dinámicas', 'Mentoring', 'Overview', 'Ratings', 'Physical', 'Contracts', 'ALL', 'PG', 'Buscar jugador', 'Filtros', 'Plantilla (12)', 'Casademont Zaragoza', 'SALARY', 'EXPIRES', 'OK']) expect(markup).toContain(label)
    for (const shellLabel of ['Hub', 'Scouting', 'Mercado']) expect(markup).not.toContain(shellLabel)
  })
})
