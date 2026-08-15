import { getCurrentSeason } from '@/app/game'
import type { GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { formatPrototypeDate } from '@/ui/formatters'

export function DesktopAmbientLayer({ world }: { readonly world: GameWorld }) {
  const team = getUserTeam(world)
  if (team === undefined) return null
  return <aside aria-label="Contexto de carrera" className="desktop-ambient" data-testid="desktop-ambient"><strong>{team.name}</strong><span>{getCurrentSeason(world).label}</span><time>{formatPrototypeDate(world.currentDate)}</time></aside>
}
