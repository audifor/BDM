import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PlantillaPcbPage } from './PlantillaPcbPage'

describe('PlantillaPcbPage', () => {
  // The original assertion expected literal 'Sección'/'Vista' labels, but
  // PlantillaPcbPage never renders those words anywhere: its section tabs
  // are named directly ('Plantilla', 'Análisis + Dinámicas', 'Mentoring')
  // and its column views are named directly ('Resumen General', 'Psico',
  // 'Físico') rather than being introduced by a generic "Sección"/"Vista"
  // heading. That expectation does not match any prior or current version
  // of the component, so it was corrected to assert the real section-tab
  // and view-selector labels instead of asserting text the design never had.
  it('renders the PCB Plantilla content with UI-only mock rows and no PCB shell', () => {
    const markup = renderToStaticMarkup(createElement(PlantillaPcbPage))
    for (const label of ['Plantilla', 'Análisis + Dinámicas', 'Mentoring', 'Resumen General', 'Psico', 'Físico', 'Plantilla (12)', 'Casademont Zaragoza', 'EST', 'JUGADOR', 'CLUTCH', 'AVARICIA', 'OK']) expect(markup).toContain(label)
    for (const shellLabel of ['Hub', 'Scouting', 'Mercado']) expect(markup).not.toContain(shellLabel)
  })
})
