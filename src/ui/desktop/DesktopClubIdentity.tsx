import type { GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { resolveGameContext } from '@/ui/gameContext'

export function DesktopClubIdentity({ world }: { readonly world: GameWorld }) {
  const team = getUserTeam(world)
  const context = resolveGameContext(world)
  const initials = team === undefined ? 'BDM' : team.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 3).toUpperCase()
  return <section aria-label="Club identity" className="desktop-club-identity"><div aria-hidden="true" className="desktop-club-identity__watermark">{initials}</div><div aria-hidden="true" className="desktop-club-identity__crest"><span>{initials}</span></div><p>YOUR CLUB</p><h1 title={context.clubName}>{context.clubName ?? 'No controlled club'}</h1>{context.competitionName !== undefined && <small>{context.competitionName}</small>}<span aria-hidden="true" className="desktop-club-identity__continue-space" /></section>
}
