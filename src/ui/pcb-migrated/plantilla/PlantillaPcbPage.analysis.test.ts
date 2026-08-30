// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { PlantillaPcbPage } from './PlantillaPcbPage'

afterEach(cleanup)

describe('PlantillaPcbPage', () => {
  it('keeps the roster as its only internal app surface', () => {
    render(createElement(PlantillaPcbPage))
    expect(screen.queryByRole('button', { name: 'Análisis + Dinámicas' })).not.toBeInTheDocument()
  })
})
