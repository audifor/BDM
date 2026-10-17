import type { ReactNode } from 'react'
import type { GameWorld } from '@/domain/world'
import { formatPrototypeDate } from '@/ui/formatters'

function LegacyPanel({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return <section className="coach-courtside__panel"><header className="coach-courtside__panel-header"><h2>{title}</h2></header><div className="coach-courtside__panel-body">{children}</div></section>
}

export function LegacyScreen({ world }: { readonly world: GameWorld }) {
  const id = world.userCoachId
  const legacy = world.coachLegacyByCoachId[id]
  const achievements = Object.values(world.coachAchievementsById).filter((item) => item.coachId === id)
  const tenures = Object.values(world.coachTenuresById).filter((item) => item.coachId === id).sort((a, b) => b.startedOn.localeCompare(a.startedOn))
  const clubs = Object.values(world.coachTeamLegacyByKey).filter((item) => item.coachId === id)
  const count = (type: string) => achievements.filter((item) => item.type === type).length
  const metrics = [
    { label: 'Seasons coached', value: tenures.reduce((sum, item) => sum + (item.seasonsManaged ?? 0), 0) },
    { label: 'Clubs', value: clubs.length }, { label: 'Championships', value: count('championship') },
    { label: 'Promotions', value: count('promotion') }, { label: 'Dynasties', value: count('dynasty') },
  ]
  return <div className="coach-courtside__stack coach-courtside__legacy">
    <LegacyPanel title="HISTORICAL STANDING">
      <div className="coach-courtside__legacy-standing">
        <div><small>LEGACY STATUS</small><strong>{legacy?.status ?? 'unproven'}</strong></div>
        <div><small>HALL STATUS</small><strong>{legacy?.hallStatus ?? 'not eligible'}</strong></div>
        <p>Reputation reflects your current standing. Legacy measures your lasting impact across your career.</p>
      </div>
      <div className="coach-courtside__legacy-metrics">{metrics.map((metric) => <div key={metric.label}><strong>{metric.value}</strong><small>{metric.label}</small></div>)}</div>
    </LegacyPanel>
    <div className="coach-courtside__development-grid">
      <LegacyPanel title="HONOURS">
        {achievements.length === 0 ? <p className="coach-courtside__empty">No historical achievements yet.</p> :
          <div className="coach-courtside__legacy-list">{achievements.map((item) => <div key={item.id}>
            <strong>{item.type}</strong><span>{world.teams[item.teamId!]?.name ?? 'Career'} · {world.competitions[item.competitionId!]?.name ?? 'Competition'}</span><small>{item.seasonId}</small>
          </div>)}</div>}
      </LegacyPanel>
      <LegacyPanel title="CAREER TIMELINE">
        {tenures.length === 0 ? <p className="coach-courtside__empty">No tenures recorded.</p> :
          <div className="coach-courtside__legacy-list">{tenures.map((item) => <div key={item.id}>
            <strong>{world.teams[item.teamId]?.name ?? item.teamId}</strong><span>{formatPrototypeDate(item.startedOn)} · {item.endedOn ? formatPrototypeDate(item.endedOn) : 'Present'}</span><small>{item.seasonsManaged ?? 0} seasons</small>
          </div>)}</div>}
      </LegacyPanel>
    </div>
    <LegacyPanel title="LEGACY BY CLUB">
      {clubs.length === 0 ? <p className="coach-courtside__empty">No club legacy yet.</p> :
        <div className="coach-courtside__table-scroll"><table className="coach-courtside__table"><thead><tr><th>CLUB</th><th>STATUS</th><th>LEGACY</th><th>TENURES</th><th>HONOURS</th></tr></thead><tbody>
          {clubs.map((item) => { const honours = achievements.filter((entry) => entry.teamId === item.teamId); return <tr key={item.coachId + ':' + item.teamId}>
            <td><strong>{world.teams[item.teamId]?.name ?? item.teamId}</strong></td><td>{item.status}</td><td>{item.legacyValue}</td><td>{item.tenureIds.length}</td>
            <td>{honours.filter((entry) => entry.type === 'championship').length} titles · {honours.filter((entry) => entry.type === 'promotion').length} promotions</td>
          </tr> })}</tbody></table></div>}
    </LegacyPanel>
    <LegacyPanel title="HALL & RECOGNITIONS">
      <p className="coach-courtside__legacy-hall">{legacy?.hallStatus === 'inducted' ? 'Inducted: permanent recognition.' : legacy?.hallStatus === 'candidate' ? 'Hall candidate.' : 'Not yet a Hall candidate.'}</p>
      {(legacy?.milestoneKeys ?? []).length > 0 && <div className="coach-courtside__legacy-milestones">{legacy!.milestoneKeys!.map((item) => <span className="coach-courtside__pill" key={item}>{item}</span>)}</div>}
    </LegacyPanel>
  </div>
}
