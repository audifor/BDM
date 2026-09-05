declare const PcbTacticsBoard: (props: {
  readonly teamId: number | string | undefined
  readonly roster: readonly unknown[]
  readonly tacticalRoles: Record<string, unknown>
  readonly onRolesChange: (roles: Record<string, unknown>) => void
  readonly onLineupSlotChange?: (slot: import('@/domain/tactics').LineupSlot, playerId: import('@/domain/ids').PlayerId) => void
  readonly onLineupSlotClear?: (slot: import('@/domain/tactics').LineupSlot) => void
  readonly onOpenPlayer?: (playerId: import('@/domain/ids').PlayerId) => void
}) => import('react').ReactNode
export default PcbTacticsBoard
