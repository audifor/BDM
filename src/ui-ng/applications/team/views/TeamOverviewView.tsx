import type { ReactNode } from 'react'

import { TeamLink } from '@/ui-ng/components/TeamLink'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import { navigateToStaff, syncWorkspaceAppQuery } from '@/ui-ng/workspace/workspaceApps'

import type {
  TeamCompetitionRow,
  TeamHeadCoachInfo,
  TeamHonourRow,
  TeamPersonRow,
  TeamRecentResultRow,
  TeamWorkspaceModel,
} from '../buildTeamWorkspaceModel'

function Panel({
  eyebrow,
  action,
  children,
  className,
}: {
  readonly eyebrow: string
  readonly action?: ReactNode
  readonly children: ReactNode
  readonly className?: string
}) {
  return (
    <section className={`ng-canon__panel ng-holo-panel team-panel${className === undefined ? '' : ` ${className}`}`}>
      <header className="team-panel__header">
        <p className="ng-canon__eyebrow">{eyebrow}</p>
        {action}
      </header>
      <div className="team-panel__body">{children}</div>
    </section>
  )
}

function Fact({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="team-fact">
      <span className="team-fact__label">{label}</span>
      <span className="team-fact__value">{value}</span>
    </div>
  )
}

function TeamDetailsBlock({ model }: { readonly model: TeamWorkspaceModel }) {
  const facts = [
    { label: 'Country', value: model.countryName },
    { label: 'Gender', value: model.genderLabel },
    { label: 'Ecosystem', value: model.ecosystemName },
    { label: 'Roster', value: String(model.rosterCount) },
    { label: 'Staff', value: String(model.staffCount) },
  ].filter((fact): fact is { readonly label: string; readonly value: string } => fact.value !== null)

  return (
    <Panel eyebrow="Team Details">
      <div className="team-facts">
        {facts.map((fact) => (
          <Fact key={fact.label} label={fact.label} value={fact.value} />
        ))}
      </div>
    </Panel>
  )
}

function PersonRow({ person }: { readonly person: TeamPersonRow }) {
  return (
    <div className="team-person">
      <button
        className="team-person__name ng-canon__link"
        onClick={() => navigateToStaff(person.staffPersonId)}
        title={`Open ${person.name} profile`}
        type="button"
      >
        {person.name}
      </button>
      <span className="team-person__role">{person.roleLabel}</span>
    </div>
  )
}

function HeadCoachRow({ coach }: { readonly coach: TeamHeadCoachInfo }) {
  return (
    <div className="team-person">
      {coach.isUserCoach ? (
        <button
          className="team-person__name ng-canon__link"
          onClick={() => syncWorkspaceAppQuery('coach')}
          type="button"
        >
          {coach.name}
        </button>
      ) : (
        <span className="team-person__name">{coach.name}</span>
      )}
      <span className="team-person__role">Head Coach</span>
    </div>
  )
}

function KeyPeopleBlock({ model }: { readonly model: TeamWorkspaceModel }) {
  if (model.headCoach === null && model.people.length === 0) return null
  return (
    <Panel eyebrow="Key People">
      <div className="team-people">
        {model.headCoach !== null && <HeadCoachRow coach={model.headCoach} />}
        {model.people.map((person) => (
          <PersonRow key={person.staffPersonId} person={person} />
        ))}
      </div>
    </Panel>
  )
}

function CompetitionRow({ row }: { readonly row: TeamCompetitionRow }) {
  const { openEntity } = useNgWorkspaceNavigation()
  const record =
    row.wins !== undefined && row.losses !== undefined ? `${row.wins}–${row.losses}` : null
  return (
    <div className="team-comp">
      <button
        className="team-comp__link ng-canon__link"
        onClick={() =>
          openEntity({ type: 'competition', competitionId: row.competitionId, section: 'overview' })
        }
        type="button"
      >
        {row.name}
      </button>
      <div className="team-comp__meta">
        {row.isCurrentSeason ? <span className="team-chip team-chip--cyan">Current season</span> : null}
        <span className="team-comp__season">{row.seasonLabel}</span>
        {row.conferenceName === undefined ? null : (
          <span className="team-chip">{row.conferenceName}</span>
        )}
      </div>
      <div className="team-comp__line">
        <span className="team-comp__pos">{row.position === undefined ? '—' : `#${row.position}`}</span>
        {record === null ? null : <span className="team-comp__record">{record}</span>}
      </div>
    </div>
  )
}

function CompetitionBlock({ model }: { readonly model: TeamWorkspaceModel }) {
  if (model.competitions.length === 0) return null
  return (
    <Panel eyebrow="Competition">
      <div className="team-comps">
        {model.competitions.map((row) => (
          <CompetitionRow key={row.competitionId} row={row} />
        ))}
      </div>
    </Panel>
  )
}

function ResultRow({ row }: { readonly row: TeamRecentResultRow }) {
  return (
    <div className="team-result">
      <span aria-hidden className={`team-result__badge is-${row.outcome}`}>
        {row.outcome === 'win' ? 'W' : 'L'}
      </span>
      <div className="team-result__body">
        <div className="team-result__top">
          <TeamLink teamId={row.opponentTeamId}>{row.opponentName}</TeamLink>
          <span className={`team-result__score is-${row.outcome}`}>{row.scoreLabel}</span>
        </div>
        <div className="team-result__sub">
          {row.dateLabel} · {row.isHome ? 'Home' : 'Away'} · {row.competitionName}
        </div>
      </div>
    </div>
  )
}

function RecentResultsBlock({ model }: { readonly model: TeamWorkspaceModel }) {
  if (model.recentResults.length === 0) return null
  return (
    <Panel eyebrow="Recent Results">
      {model.recentForm.length > 0 && (
        <div className="team-form">
          <span className="team-form__label">Form</span>
          {model.recentForm.map((outcome, index) => (
            <span aria-label={`${outcome === 'win' ? 'Win' : 'Loss'} ${index + 1}`} className={`team-form__letter is-${outcome}`} key={`${outcome}-${index}`}>
              {outcome === 'win' ? 'W' : 'L'}
            </span>
          ))}
        </div>
      )}
      <div className="team-results">
        {model.recentResults.map((row) => (
          <ResultRow key={row.gameId} row={row} />
        ))}
      </div>
    </Panel>
  )
}

function HonourRow({ honour }: { readonly honour: TeamHonourRow }) {
  return (
    <div className="team-honour">
      <span className="team-honour__medal" aria-hidden>
        C
      </span>
      <div className="team-honour__body">
        <span className="team-honour__name">{honour.competitionName}</span>
        <span className="team-honour__meta">
          {honour.seasonLabel} · {honour.completedOnLabel}
        </span>
      </div>
    </div>
  )
}

function HonoursBlock({ model }: { readonly model: TeamWorkspaceModel }) {
  if (model.honours.length === 0) return null
  return (
    <Panel eyebrow="Honours">
      <div className="team-honours">
        {model.honours.map((honour) => (
          <HonourRow honour={honour} key={`${honour.competitionName}-${honour.seasonLabel}`} />
        ))}
      </div>
    </Panel>
  )
}

export function TeamOverviewView({ model }: { readonly model: TeamWorkspaceModel }) {
  const hasPeople = model.headCoach !== null || model.people.length > 0
  return (
    <div className="team-overview" data-ng-region="team-overview">
      <div className={`team-overview__main${hasPeople ? '' : ' team-overview__main--single'}`}>
        <TeamDetailsBlock model={model} />
        <KeyPeopleBlock model={model} />
      </div>
      <aside className="team-overview__rail">
        <CompetitionBlock model={model} />
        <RecentResultsBlock model={model} />
        <HonoursBlock model={model} />
      </aside>
    </div>
  )
}
