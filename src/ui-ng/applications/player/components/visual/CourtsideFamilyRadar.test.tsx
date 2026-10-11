// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { RADAR_CATEGORY_ORDER } from '@/ui-ng/applications/player/data/ratingCatalog'
import { CourtsideFamilyRadar } from './CourtsideFamilyRadar'

const LABELS = ['SHOOT','FIN','HANDLE','PLAY','OFF','DEF','PHYS','MENT']
const VALUES = [38,47,49,56,64,60,66,52]
const axes = RADAR_CATEGORY_ORDER.map((key,index) => ({
  key,
  label: LABELS[index]!,
  value: VALUES[index]!,
}))

describe('Shared Courtside Family Radar', () => {
  it('uses the exact Overview geometry and typography hooks in both read-only and interactive views', () => {
    const { container, rerender } = render(
      <CourtsideFamilyRadar axes={axes} ariaLabel="Overview radar" />,
    )
    const readOnly = container.querySelector('svg')!
    expect(readOnly).toHaveAttribute('viewBox','0 0 340 325')
    expect(readOnly).toHaveClass('po-cs-radar__svg')
    expect(readOnly.querySelectorAll('polygon:not(.po-cs-radar__shape)')).toHaveLength(4)
    expect(readOnly.querySelectorAll('line')).toHaveLength(8)
    expect(readOnly.querySelectorAll('.po-cs-radar__label')).toHaveLength(8)
    expect(readOnly.querySelectorAll('.po-cs-radar__value')).toHaveLength(8)
    const overviewPolygon = readOnly.querySelector('.po-cs-radar__shape')!.getAttribute('points')
    expect(readOnly.querySelectorAll('[role=button]')).toHaveLength(0)

    rerender(
      <CourtsideFamilyRadar axes={axes} ariaLabel="Attributes radar"
        selectedCategory="shooting" onCategorySelect={() => {}} />,
    )
    const interactive = container.querySelector('svg')!
    expect(interactive.getAttribute('viewBox')).toBe(readOnly.getAttribute('viewBox'))
    expect(interactive.querySelector('.po-cs-radar__shape')!.getAttribute('points')).toBe(overviewPolygon)
    expect(interactive.querySelectorAll('polygon:not(.po-cs-radar__shape)')).toHaveLength(4)
    expect(interactive.querySelectorAll('.po-cs-radar__label')).toHaveLength(8)
    expect(interactive.querySelectorAll('.po-cs-radar__value')).toHaveLength(8)
  })

  it('preserves click and keyboard category selection for Attributes', () => {
    const onCategorySelect=vi.fn()
    render(<CourtsideFamilyRadar axes={axes} ariaLabel="Attributes radar"
      selectedCategory="shooting" onCategorySelect={onCategorySelect} />)
    const selected=screen.getByRole('button',{name:'Explorar SHOOT, 38'})
    expect(selected).toHaveAttribute('aria-pressed','true')
    fireEvent.click(screen.getByRole('button',{name:'Explorar FIN, 47'}))
    const mental=screen.getByRole('button',{name:'Explorar MENT, 52'})
    fireEvent.keyDown(mental,{key:'Enter'})
    fireEvent.keyDown(mental,{key:' '})
    expect(onCategorySelect.mock.calls.map(call=>call[0])).toEqual(['finishing','mental','mental'])
  })

  it('retains genuine optional comparison overlays without changing the player shape', () => {
    const baseline=render(<CourtsideFamilyRadar axes={axes} ariaLabel="Player"/>)
    const playerPolygon=baseline.container.querySelector('.po-cs-radar__shape')!.getAttribute('points')
    baseline.unmount()
    const profiles=[
      {key:'team',label:'Equipo',color:'var(--cs-orange2)',axes:Object.fromEntries(axes.map(a=>[a.key,60]))},
      {key:'league',label:'Liga',color:'var(--cs-negative)',axes:Object.fromEntries(axes.map(a=>[a.key,55]))},
      {key:'incomplete',label:'Incomplete',color:'red',axes:{shooting:99}},
    ]
    const {container}=render(<CourtsideFamilyRadar axes={axes} ariaLabel="Player comparisons" comparisonSeries={profiles}/>)
    expect(container.querySelector('.po-cs-radar__shape')!.getAttribute('points')).toBe(playerPolygon)
    const overlays=container.querySelectorAll('.po-cs-family-radar__comparison')
    expect(overlays).toHaveLength(2)
    expect(overlays[0]).toHaveAttribute('stroke','var(--cs-orange2)')
    expect(overlays[1]).toHaveAttribute('stroke','var(--cs-negative)')
  })

  it('does not draw a fake radar from incomplete family data', () => {
    const {container}=render(<CourtsideFamilyRadar axes={axes.slice(0,2)} ariaLabel="Incomplete"/>)
    expect(container.querySelector('svg')).toBeNull()
  })
})
