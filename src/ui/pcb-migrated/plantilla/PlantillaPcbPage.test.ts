import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PlantillaPcbPage } from './PlantillaPcbPage'

describe('PlantillaPcbPage', () => {
  it('renders the PCB Plantilla content with UI-only mock rows and no PCB shell', () => {
    const markup = renderToStaticMarkup(createElement(PlantillaPcbPage))
    for (const label of ['Plantilla', 'Análisis + Dinámicas', 'Mentoring', 'Plantilla (12)', 'Casademont Zaragoza', 'EST', 'JUGADOR', 'CLUTCH', 'AVARICIA', 'OK']) expect(markup).toContain(label)
    for (const shellLabel of ['Hub', 'Scouting', 'Mercado']) expect(markup).not.toContain(shellLabel)
  })
})
