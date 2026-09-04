export type WorkspaceApplicationId =
  | 'home'
  | 'player'
  | 'roster'
  | 'scouting'
  | 'tactics'
  | 'placeholder'

export interface WorkspaceSession {
  readonly id: string
  readonly applicationId: WorkspaceApplicationId
  readonly title: string
}

export interface WorkspaceTab {
  readonly id: string
  readonly label: string
  readonly active?: boolean
}
