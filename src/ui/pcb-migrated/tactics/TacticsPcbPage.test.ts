import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TacticsPcbPage } from './TacticsPcbPage'

describe('TacticsPcbPage', () => {
  it('renders the five PCB tactics sections inside BDMOS content only', () => {
    const markup = renderToStaticMarkup(createElement(TacticsPcbPage))
    for (const label of ['Pizarra', 'Diseñador', 'Emparejamientos', 'Rotaciones', 'Partido', 'BANQUILLO', 'LIMPIAR']) expect(markup).toContain(label)
    for (const shellLabel of ['Hub', 'Mercado', 'Scouting']) expect(markup).not.toContain(shellLabel)
  })
})
