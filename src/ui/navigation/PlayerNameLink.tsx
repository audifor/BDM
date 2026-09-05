import type { ReactNode } from 'react'

import type { PlayerId } from '@/domain/ids'

import { EntityLink } from '@/ui/navigation/EntityLink'

export function PlayerNameLink({
  playerId,
  children,
  className = 'pcb-player-link',
  onOpenPlayer,
}: {
  readonly playerId: PlayerId
  readonly children: ReactNode
  readonly className?: string
  readonly onOpenPlayer?: (playerId: PlayerId) => void
}) {
  if (onOpenPlayer === undefined) {
    return children
  }

  return (
    <EntityLink
      className={className}
      destination={{ type: 'player', playerId, section: 'overview' }}
      onNavigate={(destination) => {
        if (destination.type === 'player') onOpenPlayer(destination.playerId)
      }}
    >
      {children}
    </EntityLink>
  )
}
