// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createNewGame } from '@/app/game/createNewGame'
import {
  coachJobCandidacyIdFromString,
  coachJobOfferIdFromString,
  coachJobOpeningIdFromString,
  createCoachJobOpening,
  type CoachJobCandidacy,
  type CoachJobOpening,
} from '@/domain/coachCareer'
import { COACH_REPUTATION_MAX, getCoachReputationBand } from '@/domain/coachReputation'
import type { CoachJobCandidacyId, CoachJobOfferId } from '@/domain/coachCareer'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import {
  COACH_OPPORTUNITIES_MOCK,
  buildCoachOpportunitiesModel,
  CoachOpportunitiesScreen,
} from '@/ui-ng/applications/coach/CoachOpportunitiesScreen'

afterEach(cleanup)

const PANEL_HEADINGS = [
  /Market overview/,
  /Personal fit profile/,
  /Opportunity signals/,
  /Opportunity board/,
  /Network & contacts/,
  /Decision factors/,
  /Opportunity timeline/,
]

/** Scopes queries to the panel that owns the given heading — several labels repeat across panels. */
function panel(container: HTMLElement, heading: RegExp) {
  const section = within(container).getByRole('heading', { name: heading }).closest('section')
  if (section === null) throw new Error(`No <section> panel for heading ${String(heading)}`)
  return within(section)
}

/** The generated world already ships open head coach openings; create one if a future seed does not. */
function withOpenOpening(base: GameWorld): { readonly opening: CoachJobOpening; readonly world: GameWorld } {
  const existing = Object.values(base.coachJobOpeningsById).find((opening) => opening.status === 'open')
  if (existing !== undefined) return { opening: existing, world: base }
  const team = Object.values(base.teams)[0]
  if (team === undefined) throw new Error('The generated world has no teams')
  const opening = createCoachJobOpening({
    createdOn: base.currentDate,
    id: coachJobOpeningIdFromString('opening:test'),
    status: 'open',
    teamId: team.id,
  })
  return { opening, world: updateGameWorld(base, { coachJobOpeningsById: { ...base.coachJobOpeningsById, [opening.id]: opening } }) }
}

/** A world in which the user coach is shortlisted for (or has been offered) the first open job. */
function worldWithCandidacy(status: CoachJobCandidacy['status'] = 'identified') {
  const seeded = withOpenOpening(createNewGame())
  const candidacyId = coachJobCandidacyIdFromString('candidacy:test')
  const offerId = coachJobOfferIdFromString('offer:test')
  const candidacy: CoachJobCandidacy = {
    coachId: seeded.world.userCoachId,
    createdOn: seeded.world.currentDate,
    id: candidacyId,
    jobOpeningId: seeded.opening.id,
    status,
  }
  const candidacies: Record<CoachJobCandidacyId, CoachJobCandidacy> = { [candidacyId]: candidacy }
  const offers: Record<CoachJobOfferId, CoachJobOfferFixture> = status === 'offered'
    ? {
        [offerId]: {
          annualSalary: 1_500_000,
          coachId: seeded.world.userCoachId,
          createdOn: seeded.world.currentDate,
          id: offerId,
          jobOpeningId: seeded.opening.id,
          status: 'pending',
          teamId: seeded.opening.teamId,
        },
      }
    : {}
  const world = updateGameWorld(seeded.world, { coachJobCandidaciesById: candidacies, coachJobOffersById: offers })
  return { offerId, opening: seeded.opening, world }
}

type CoachJobOfferFixture = {
  readonly annualSalary: number
  readonly coachId: GameWorld['userCoachId']
  readonly createdOn: GameWorld['currentDate']
  readonly id: CoachJobOfferId
  readonly jobOpeningId: CoachJobOpening['id']
  readonly status: 'pending'
  readonly teamId: CoachJobOpening['teamId']
}

/** A world with a single opening whose requirement the coach cannot meet. */
function worldWithUnmetRequirement() {
  const seeded = withOpenOpening(createNewGame())
  const opening = createCoachJobOpening({
    ...seeded.opening,
    reputationRequirement: { minimum: { competitive: COACH_REPUTATION_MAX } },
  })
  return updateGameWorld(seeded.world, {
    coachInterviewsByCandidacyId: {},
    coachJobCandidaciesById: {},
    coachJobOffersById: {},
    coachJobOpeningsById: { [opening.id]: opening },
  })
}

/** A world with nothing on the market at all. */
function worldWithEmptyMarket() {
  return updateGameWorld(createNewGame(), {
    coachInterviewsByCandidacyId: {},
    coachJobCandidaciesById: {},
    coachJobOffersById: {},
    coachJobOpeningsById: {},
  })
}

describe('CoachOpportunitiesScreen', () => {
  it('renders the seven panels of the personal professional market', () => {
    const { container } = render(<CoachOpportunitiesScreen world={createNewGame()} />)

    for (const heading of PANEL_HEADINGS) {
      expect(within(container).getByRole('heading', { name: heading })).toBeInTheDocument()
    }
  })

  it('reports the real market numbers straight off the world', () => {
    const world = createNewGame()
    const { container } = render(<CoachOpportunitiesScreen world={world} />)

    const openOpenings = Object.values(world.coachJobOpeningsById).filter((opening) => opening.status === 'open')
    const openings = container.querySelector<HTMLElement>('[data-metric="active-openings"]')
    expect(openings).toHaveAttribute('data-source', 'live')
    expect(within(openings!).getByText(String(openOpenings.length))).toBeInTheDocument()

    // No candidacy exists yet in a fresh game: interested clubs must read zero, not a placeholder.
    const interested = container.querySelector<HTMLElement>('[data-metric="clubs-interested"]')
    expect(within(interested!).getByText('0')).toBeInTheDocument()

    // Leverage is the mean reputation band, read from the domain's own authority.
    const reputation = world.coachReputationProfilesByCoachId[world.userCoachId]!
    const values = Object.values(reputation.values)
    const mean = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    const band = getCoachReputationBand(mean)
    const leverage = container.querySelector<HTMLElement>('[data-metric="leverage"]')
    expect(within(leverage!).getByText(band[0]!.toUpperCase() + band.slice(1))).toBeInTheDocument()

    // Momentum has no runtime source: it must be marked as invented on the screen.
    const momentum = container.querySelector<HTMLElement>('.cop-market__momentum')
    expect(momentum).toHaveAttribute('data-source', 'mock')
    expect(within(momentum!).getByText(COACH_OPPORTUNITIES_MOCK.momentum.caption)).toBeInTheDocument()
  })

  it('builds the fit profile from the real professional attributes and flags the invented row', () => {
    const world = createNewGame()
    const coach = world.coaches[world.userCoachId]!
    const professional = world.staffPeopleById[coach.staffProfileId]!.professional
    const { container } = render(<CoachOpportunitiesScreen world={world} />)

    const cases = [
      ['tactical', 'tacticalKnowledge'],
      ['youth', 'playerDevelopment'],
      ['pressure', 'discipline'],
      ['politics', 'communication'],
      ['ambition', 'motivation'],
    ] as const
    for (const [id, attribute] of cases) {
      const row = container.querySelector<HTMLElement>(`[data-fit="${id}"]`)
      expect(row).toHaveAttribute('data-source', 'live')
      expect(within(row!).getByText(String(professional.attributes[attribute]))).toBeInTheDocument()
    }

    const salary = container.querySelector<HTMLElement>('[data-fit="salary"]')
    expect(salary).toHaveAttribute('data-source', 'mock')
    expect(within(salary!).getByText(String(COACH_OPPORTUNITIES_MOCK.salaryExpectations))).toBeInTheDocument()
  })

  it('builds the live fit profile from canonical Staff when the legacy Coach profile map is absent', () => {
    const world = updateGameWorld(createNewGame(), { coachProfessionalProfilesByCoachId: {} })
    const coach = world.coaches[world.userCoachId]!
    const professional = world.staffPeopleById[coach.staffProfileId]!.professional

    const model = buildCoachOpportunitiesModel(world)

    expect(model).not.toBeNull()
    for (const [id, attribute] of [
      ['tactical', 'tacticalKnowledge'],
      ['youth', 'playerDevelopment'],
      ['pressure', 'discipline'],
      ['politics', 'communication'],
      ['ambition', 'motivation'],
    ] as const) {
      expect(model!.fit.find((row) => row.id === id)).toMatchObject({ source: 'live', value: professional.attributes[attribute] })
    }
  })

  it('turns a live candidacy into signals, board status and pipeline events', () => {
    const onOpenTab = vi.fn()
    const { opening, world } = worldWithCandidacy('interviewing')
    const club = world.teams[opening.teamId]!.name
    const { container } = render(<CoachOpportunitiesScreen onOpenTab={onOpenTab} world={world} />)

    expect(screen.getByText(`Interview stage with ${club}`)).toBeInTheDocument()
    expect(container.querySelector('[data-status="INTERVIEW"]')).toBeInTheDocument()
    expect(screen.getByText(`Shortlisted by ${club}`)).toBeInTheDocument()

    // The "Clubs interested" metric is driven by the candidacy, not by the openings list.
    const interested = container.querySelector<HTMLElement>('[data-metric="clubs-interested"]')
    expect(within(interested!).getByText('1')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Interview stage with/ }))
    expect(onOpenTab).toHaveBeenCalledWith('career')
  })

  it('offers the real salary and the accept/decline decision on a live offer', () => {
    const onAcceptOffer = vi.fn()
    const onDeclineOffer = vi.fn()
    const { offerId, world } = worldWithCandidacy('offered')
    render(
      <CoachOpportunitiesScreen onAcceptOffer={onAcceptOffer} onDeclineOffer={onDeclineOffer} world={world} />,
    )

    // 1.5M goes through the shared money formatter, and it is real data, not a band guess.
    expect(screen.getByText('$1.50M')).toHaveAttribute('data-source', 'live')
    expect(screen.getByText(/Offer on the table from/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(onAcceptOffer).toHaveBeenCalledWith(offerId)

    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    expect(onDeclineOffer).toHaveBeenCalledWith(offerId)
  })

  it('recovers the eligibility reasons that used to be discarded', () => {
    const world = worldWithUnmetRequirement()
    const { container } = render(<CoachOpportunitiesScreen world={world} />)

    const row = container.querySelector<HTMLElement>('[data-status="HIGH RISK"]')
    expect(row).toBeInTheDocument()

    const fit = container.querySelector<HTMLElement>('[data-fit-cell]')
    expect(fit).toHaveClass('cop-tone-text--negative')
    expect(fit?.getAttribute('title')).toContain('Requirement not met · Competitive')
    expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeInTheDocument()
  })

  it('shows the quiet-market empty state when there is nothing to apply for', () => {
    const { container } = render(<CoachOpportunitiesScreen world={worldWithEmptyMarket()} />)

    expect(screen.getByText(/No open positions and no active candidacies/)).toBeInTheDocument()
    expect(container.querySelector('[data-board-empty="true"]')).toBeInTheDocument()
  })

  it('renders read-only when no callbacks are wired yet', () => {
    const { container } = render(<CoachOpportunitiesScreen world={createNewGame()} />)

    // Navigation-free rendering must not expose dead affordances.
    expect(container.querySelectorAll('.cop-link')).toHaveLength(0)
    for (const button of screen.getAllByRole('button')) {
      fireEvent.click(button)
    }
  })

  it('renders the empty shell without a world and uses canonical Staff without legacy Coach profiles', () => {
    const { unmount } = render(<CoachOpportunitiesScreen />)
    expect(screen.getByText('No career loaded.')).toBeInTheDocument()
    unmount()

    const world = updateGameWorld(createNewGame(), { coachProfessionalProfilesByCoachId: {} })
    render(<CoachOpportunitiesScreen world={world} />)
    expect(screen.getByRole('heading', { name: /Market overview/ })).toBeInTheDocument()
    expect(screen.queryByText('Coach profile unavailable.')).not.toBeInTheDocument()
  })
})
