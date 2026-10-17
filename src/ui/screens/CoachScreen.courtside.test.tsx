// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createNewGame } from '@/app/game'
import { CoachScreen } from './CoachScreen'

afterEach(cleanup)

describe('Coach Courtside navigation and canonical actions', () => {
  it('makes all seven sections available without leaving the Coach workspace', () => {
    render(<CoachScreen world={createNewGame()} onSkill={() => undefined} onPerk={() => undefined} />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((item) => item.textContent?.trim())).toEqual([
      'Overview', 'Opportunities', 'Career', 'Reputation', 'Relationships', 'Development', 'Legacy',
    ])
    expect(screen.getByRole('heading', { name: 'PROFESSIONAL ATTRIBUTES' })).toBeDefined()
    fireEvent.click(screen.getByRole('tab', { name: 'Opportunities' }))
    expect(screen.getByRole('heading', { name: 'OPPORTUNITIES' })).toBeDefined()
    fireEvent.click(screen.getByRole('tab', { name: 'Career' }))
    expect(screen.getByRole('heading', { name: 'CAREER HISTORY' })).toBeDefined()
    fireEvent.click(screen.getByRole('tab', { name: 'Reputation' }))
    expect(screen.getByRole('heading', { name: 'REPUTATION EVENTS' })).toBeDefined()
    fireEvent.click(screen.getByRole('tab', { name: 'Relationships' }))
    expect(screen.getByRole('heading', { name: 'RELATIONSHIPS' })).toBeDefined()
    fireEvent.click(screen.getByRole('tab', { name: 'Development' }))
    expect(screen.getByRole('heading', { name: 'SKILLS' })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'PERKS' })).toBeDefined()
    fireEvent.click(screen.getByRole('tab', { name: 'Legacy' }))
    expect(screen.getByRole('heading', { name: 'HISTORICAL STANDING' })).toBeDefined()
  })

  it('keeps skill purchases delegated to the existing gameplay callback', () => {
    const onSkill = vi.fn()
    render(<CoachScreen world={createNewGame()} onSkill={onSkill} onPerk={() => undefined} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Development' }))
    const develop = screen.getAllByRole('button', { name: 'Develop' }).find((button) => !(button as HTMLButtonElement).disabled)
    expect(develop).toBeDefined()
    fireEvent.click(develop!)
    expect(onSkill).toHaveBeenCalledTimes(1)
  })

  it('filters opportunities without changing the saved world', () => {
    const world = createNewGame()
    render(<CoachScreen world={world} onSkill={() => undefined} onPerk={() => undefined} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Opportunities' }))
    fireEvent.click(screen.getByRole('button', { name: 'offers' }))
    expect(screen.getByRole('button', { name: 'offers' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'openings' }))
    expect(screen.getByRole('button', { name: 'openings' }).getAttribute('aria-pressed')).toBe('true')
    expect(world.coachJobOpeningsById).toBeDefined()
  })
})
