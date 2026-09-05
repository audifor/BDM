import { useState } from 'react'

import { COACH_REPUTATION_DIMENSIONS, getCoachReputationBand, getRecentCoachReputationEvents } from '@/domain/coachReputation'
import { evaluateCoachJobEligibility } from '@/domain/coachCareer'
import { getRelationshipBandForPeople, getRelationshipsForPerson } from '@/domain/world'
import { COACH_PERK_CATALOG, COACH_SKILL_CATALOG } from '@/engine/coach'
import { useGameStore } from '@/stores/gameStore'
import { coachReputationEventLabel, coachReputationSourceLabel, formatCoachReputationDelta } from '@/ui/coachReputationPresentation'
import { formatPrototypeDate } from '@/ui/formatters'
import { ngCol, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'
import { NgHoloShell, NgMetric } from '@/ui-ng/workspace/NgHoloShell'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'career', label: 'Career' },
  { id: 'reputation', label: 'Reputation' },
  { id: 'relationships', label: 'Relationships' },
  { id: 'development', label: 'Development' },
  { id: 'legacy', label: 'Legacy' },
] as const

const REPUTATION_LABELS = {
  competitive: 'Competitive',
  development: 'Development',
  professional: 'Professional',
  publicStanding: 'Public Standing',
} as const

export function CoachWorkspace() {
  const world = useGameStore((state) => state.world)
  const purchaseUserCoachSkill = useGameStore((state) => state.purchaseUserCoachSkill)
  const purchaseUserCoachPerk = useGameStore((state) => state.purchaseUserCoachPerk)
  const applyUserCoachForJob = useGameStore((state) => state.applyUserCoachForJob)
  const acceptUserCoachOffer = useGameStore((state) => state.acceptUserCoachOffer)
  const declineUserCoachOffer = useGameStore((state) => state.declineUserCoachOffer)
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('overview')

  if (world === null) {
    return <NgHoloShell appLabel="Coach" empty emptyMessage="No career loaded." region="coach-workspace" />
  }

  const coach = world.coaches[world.userCoachId]
  const reputation = world.coachReputationProfilesByCoachId[world.userCoachId]
  const rpg = world.coachRpgProfilesByCoachId[world.userCoachId]
  const professional = world.coachProfessionalProfilesByCoachId[world.userCoachId]
  if (coach === undefined || reputation === undefined || rpg === undefined || professional === undefined) {
    return <NgHoloShell appLabel="Coach" empty emptyMessage="Coach profile unavailable." region="coach-workspace" />
  }

  const employment = world.coachEmploymentByCoachId[world.userCoachId]
  const history = world.coachCareerHistoryByCoachId[world.userCoachId] ?? []
  const offers = Object.values(world.coachJobOffersById).filter((offer) => offer.coachId === coach.id)
  const openings = Object.values(world.coachJobOpeningsById).filter((opening) => opening.status === 'open')
  const relationships = getRelationshipsForPerson(world, coach.id)
  const teamName =
    employment?.status === 'employed' && employment.teamId !== undefined ? world.teams[employment.teamId]?.name ?? 'Employed' : 'Unemployed'
  const recent = getRecentCoachReputationEvents(reputation, 5)
  const personName = (id: string) => {
    const player = world.players[id as never]
    if (player !== undefined) return `${player.firstName} ${player.lastName}`
    const other = world.coaches[id as never]
    return other === undefined ? id : `${other.firstName} ${other.lastName}`
  }
  const legacy = world.coachLegacyByCoachId[coach.id]
  const achievements = Object.values(world.coachAchievementsById).filter((item) => item.coachId === coach.id)
  const tenures = Object.values(world.coachTenuresById).filter((item) => item.coachId === coach.id)

  return (
    <NgHoloShell
      activeTabId={tab}
      appLabel="Coach"
      meta={teamName}
      onTabSelect={(id) => setTab(id as (typeof TABS)[number]['id'])}
      region="coach-workspace"
      tabs={TABS}
      teamId={employment?.teamId}
      title={`${coach.firstName} ${coach.lastName}`}
    >
      {tab === 'overview' ? (
        <div className="ng-canon__overview">
          <section className="ng-canon__card ng-holo-panel">
            <p className="ng-canon__eyebrow">Employment</p>
            <h3 className="ng-canon__title">{teamName}</h3>
            <dl className="ng-canon__metrics">
              <NgMetric label="Points" value={rpg.development.developmentPoints} />
              <NgMetric label="Progress" value={`${rpg.development.globalProgress} / 100`} />
            </dl>
          </section>
          <section className="ng-canon__card ng-holo-panel">
            <p className="ng-canon__eyebrow">Reputation</p>
            <dl className="ng-canon__metrics">
              {COACH_REPUTATION_DIMENSIONS.map((dimension) => (
                <NgMetric
                  key={dimension}
                  label={REPUTATION_LABELS[dimension]}
                  value={`${reputation.values[dimension]} · ${getCoachReputationBand(reputation.values[dimension])}`}
                />
              ))}
            </dl>
          </section>
          <section className="ng-canon__card ng-holo-panel">
            <p className="ng-canon__eyebrow">Recent changes</p>
            {recent.length === 0 ? (
              <p className="ng-canon__empty">No reputation changes yet.</p>
            ) : (
              <ul className="ng-canon__list">
                {recent.map((event) => (
                  <li key={event.id}>
                    {coachReputationEventLabel(world, event)} · {coachReputationSourceLabel(event.source)} ·{' '}
                    {Object.values(event.deltas)
                      .map((delta) => formatCoachReputationDelta(delta ?? 0))
                      .join(' ')}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
      {tab === 'opportunities' ? (
        <div className="ng-canon__panel ng-holo-panel">
          {offers.length === 0 && openings.length === 0 ? (
            <p className="ng-canon__empty">No active career opportunities.</p>
          ) : (
            <NgPrecisionTable
              className="ng-canon__table"
              columns={[
                ngCol('type', 'Type', (row) => row.kind, { value: (row) => row.kind }),
                ngCol('team', 'Team', (row) => row.teamName, { value: (row) => row.teamName }),
                ngCol('status', 'Status', (row) => row.status, { value: (row) => row.status }),
                ngCol('actions', '', (row) => {
                  if (row.kind === 'Offer') {
                    return row.offerPending ? (
                      <div className="ng-canon__actions">
                        <button className="ng-canon__action" onClick={() => acceptUserCoachOffer(row.id)} type="button">
                          Accept
                        </button>
                        <button className="ng-canon__action" onClick={() => declineUserCoachOffer(row.id)} type="button">
                          Decline
                        </button>
                      </div>
                    ) : null
                  }
                  return (
                    <button
                      className="ng-canon__action"
                      disabled={!row.openingEligible}
                      onClick={() => applyUserCoachForJob(row.id)}
                      type="button"
                    >
                      Apply
                    </button>
                  )
                }, { sortable: false }),
              ]}
              gridId="ng-coach-opportunities"
              rows={[
                ...offers.map((offer) => ({
                  id: offer.id,
                  kind: 'Offer' as const,
                  teamName: world.teams[offer.teamId]?.name ?? offer.teamId,
                  status: offer.status,
                  offerPending: offer.status === 'pending',
                  openingEligible: false,
                })),
                ...openings.map((opening) => {
                  const eligibility =
                    employment === undefined
                      ? { eligible: false, reasons: [] }
                      : evaluateCoachJobEligibility(employment, reputation, opening)
                  return {
                    id: opening.id,
                    kind: 'Opening' as const,
                    teamName: world.teams[opening.teamId]?.name ?? opening.teamId,
                    status: opening.status,
                    offerPending: false,
                    openingEligible: eligibility.eligible,
                  }
                }),
              ]}
            />
          )}
        </div>
      ) : null}
      {tab === 'career' ? (
        <div className="ng-canon__panel ng-holo-panel">
          {history.length === 0 ? (
            <p className="ng-canon__empty">No prior career history.</p>
          ) : (
            <NgPrecisionTable
              className="ng-canon__table"
              columns={[
                ngCol('date', 'Date', (row) => row.dateLabel, { value: (row) => row.dateLabel }),
                ngCol('team', 'Team', (row) => row.teamName, { value: (row) => row.teamName }),
                ngCol('event', 'Event', (row) => row.reason, { value: (row) => row.reason }),
              ]}
              gridId="ng-coach-career"
              rows={history.map((item, index) => ({
                id: `${item.date}-${index}`,
                dateLabel: formatPrototypeDate(item.date as never),
                teamName: world.teams[item.teamId as never]?.name ?? item.teamId,
                reason: item.reason,
              }))}
            />
          )}
        </div>
      ) : null}
      {tab === 'reputation' ? (
        <section className="ng-canon__card ng-holo-panel">
          <dl className="ng-canon__metrics">
            {COACH_REPUTATION_DIMENSIONS.map((dimension) => (
              <NgMetric key={dimension} label={REPUTATION_LABELS[dimension]} value={reputation.values[dimension]} />
            ))}
          </dl>
        </section>
      ) : null}
      {tab === 'relationships' ? (
        <div className="ng-canon__panel ng-holo-panel">
          {relationships.length === 0 ? (
            <p className="ng-canon__empty">No materialized relationships.</p>
          ) : (
            <NgPrecisionTable
              className="ng-canon__table"
              columns={[
                ngCol('person', 'Person', (row) => row.name, { value: (row) => row.name }),
                ngCol('value', 'Value', (row) => row.value, { numeric: true, value: (row) => row.value }),
                ngCol('band', 'Band', (row) => row.band, { value: (row) => row.band }),
              ]}
              gridId="ng-coach-relationships"
              rows={relationships.map((item) => {
                const otherId = item.sourceId === world.userCoachId ? item.targetId : item.sourceId
                return {
                  id: `${item.sourceId}-${item.targetId}`,
                  name: personName(otherId),
                  value: item.value,
                  band: getRelationshipBandForPeople(world, item.sourceId, item.targetId),
                }
              })}
            />
          )}
        </div>
      ) : null}
      {tab === 'development' ? (
        <div className="ng-canon__split">
          <section className="ng-canon__panel ng-holo-panel">
            <p className="ng-canon__eyebrow">Skills</p>
            <ul className="ng-canon__list">
              {COACH_SKILL_CATALOG.map((skill) => {
                const rank = rpg.skills[skill.id]?.rank ?? 0
                return (
                  <li key={skill.id}>
                    {skill.id} · rank {rank}{' '}
                    <button className="ng-canon__action" disabled={rank === 3} onClick={() => purchaseUserCoachSkill(skill.id)} type="button">
                      Develop
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
          <section className="ng-canon__inspector ng-holo-panel">
            <p className="ng-canon__eyebrow">Perks</p>
            <ul className="ng-canon__list">
              {COACH_PERK_CATALOG.map((perk) => (
                <li key={perk.id}>
                  {perk.id} · {rpg.perks[perk.id] ? 'owned' : (
                    <button className="ng-canon__action" onClick={() => purchaseUserCoachPerk(perk.id)} type="button">
                      Purchase
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}
      {tab === 'legacy' ? (
        <section className="ng-canon__card ng-holo-panel">
          <p className="ng-canon__eyebrow">Historical standing</p>
          <h3 className="ng-canon__title">{legacy?.status ?? 'unproven'}</h3>
          <p className="ng-canon__note">
            Hall {legacy?.hallStatus ?? 'not eligible'} · {tenures.length} tenures · {achievements.length} honours
          </p>
          {achievements.length === 0 ? (
            <p className="ng-canon__empty">No historical achievements yet.</p>
          ) : (
            <ul className="ng-canon__list">
              {achievements.map((item) => (
                <li key={item.id}>
                  {item.type} · {item.teamId === undefined ? 'Career' : world.teams[item.teamId]?.name ?? item.teamId} · {item.seasonId}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </NgHoloShell>
  )
}
