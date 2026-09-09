import type { ReactNode } from 'react'

import type { TeamId } from '@/domain/ids'
import type { TeamSection } from '@/ui/navigation/entityNavigation'
import { EntityLink } from '@/ui/navigation/EntityLink'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'

export interface TeamLinkProps {
  readonly teamId: TeamId
  readonly children: ReactNode
  readonly className?: string
  /** Defaults to the canonical Team dossier; other sections reuse the same navigation. */
  readonly section?: TeamSection
}

/** Canonical team navigation: one component for every list, grid and result surface. */
export function TeamLink({ teamId, children, className, section = 'overview' }: TeamLinkProps) {
  const { openEntity } = useNgWorkspaceNavigation()
  return (
    <EntityLink
      className={['ng-canon__link', 'team-entity-link', className].filter(Boolean).join(' ')}
      destination={{ type: 'team', teamId, section }}
      onNavigate={openEntity}
    >
      {children}
    </EntityLink>
  )
}
