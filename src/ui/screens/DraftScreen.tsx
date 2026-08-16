import { getPlayerAge, getPlayerPotentialBand } from '@/domain/player'
import type { PlayerId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { getAvailableDraftProspects, getCurrentDraftPick, getDraftPicks } from '@/engine/draft'

export function DraftScreen({ world, onSelectProspect }: { readonly world: GameWorld; readonly onSelectProspect: (draftId: string, playerId: PlayerId) => void }) {
  const drafts = Object.values(world.draftsById).sort((a, b) => b.scheduledOn.localeCompare(a.scheduledOn) || a.id.localeCompare(b.id))
  if (drafts.length === 0) return <section className="screen"><div className="page-heading"><div><p className="eyebrow">DRAFT</p><h1>No draft available</h1></div></div><p className="content-panel">No Draft-specific Inbox integration in V1.</p></section>
  return <section className="screen draft-screen"><div className="page-heading"><div><p className="eyebrow">DRAFT</p><h1>Draft board</h1></div></div>{drafts.map((draft) => <DraftCycle draftId={draft.id} key={draft.id} onSelectProspect={onSelectProspect} world={world} />)}</section>
}

function DraftCycle({ world, draftId, onSelectProspect }: { readonly world: GameWorld; readonly draftId: string; readonly onSelectProspect: (draftId: string, playerId: PlayerId) => void }) {
  const draft = world.draftsById[draftId]!
  const sourceSeason = world.seasons[draft.sourceSeasonId]!
  const current = getCurrentDraftPick(world, draftId)
  const userTeam = getUserTeam(world)
  const userOnClock = current !== undefined && current.ownerTeamId === userTeam?.id
  const available = getAvailableDraftProspects(world, draftId)
  const picks = getDraftPicks(world, draftId)
  const currentOwner = current === undefined ? undefined : world.teams[current.ownerTeamId]!
  const original = current === undefined || current.originalTeamId === current.ownerTeamId ? undefined : world.teams[current.originalTeamId]!
  return <article className="content-panel draft-screen__cycle"><header><p className="eyebrow">{world.ecosystems[draft.ecosystemId]!.name}</p><h2>{sourceSeason.label} Draft</h2><p>Status: <strong>{draft.status}</strong></p>{current === undefined ? <p>Draft completed</p> : <p>Round {current.round} · Pick #{current.order} · {currentOwner!.name}{original === undefined ? '' : ` · from ${original.name}`}</p>}</header>
    {draft.status === 'inProgress' && current !== undefined && <section className="draft-screen__selection"><h3>{userOnClock ? 'You are on the clock' : `${currentOwner!.name} is on the clock`}</h3>{userOnClock ? <p>Select an available prospect to confirm this pick.</p> : <p>Selection is unavailable until your team owns the current pick.</p>}{userOnClock && <div className="table-wrap"><table><thead><tr><th>PROSPECT</th><th>POS</th><th>AGE</th><th>POTENTIAL</th><th>FIN</th><th>SHT</th><th>PLY</th><th>ACTION</th></tr></thead><tbody>{available.map((playerId) => { const player = world.players[playerId]!; return <tr key={player.id}><td>{player.firstName} {player.lastName}</td><td>{player.basketball.primaryPosition}</td><td>{getPlayerAge(world, player.id)}</td><td>{getPlayerPotentialBand(player.potential).toUpperCase()}</td><td>{player.basketball.ratings.finishing}</td><td>{player.basketball.ratings.shooting}</td><td>{player.basketball.ratings.playmaking}</td><td><button className="primary-button" onClick={() => onSelectProspect(draftId, player.id)} type="button">SELECT</button></td></tr> })}</tbody></table></div>}</section>}
    <section className="draft-screen__history"><h3>Draft history</h3><div className="table-wrap"><table><thead><tr><th>ROUND</th><th>PICK</th><th>OWNER</th><th>ORIGIN</th><th>SELECTED PLAYER</th></tr></thead><tbody>{picks.map((pick) => { const selected = pick.selection === undefined ? undefined : world.players[pick.selection.playerId]!; return <tr key={pick.id}><td>{pick.round}</td><td>#{pick.order}</td><td>{world.teams[pick.ownerTeamId]!.name}</td><td>{pick.originalTeamId === pick.ownerTeamId ? '—' : world.teams[pick.originalTeamId]!.name}</td><td>{selected === undefined ? 'Pending' : `${selected.firstName} ${selected.lastName} · ${selected.basketball.primaryPosition}`}</td></tr> })}</tbody></table></div></section>
  </article>
}
