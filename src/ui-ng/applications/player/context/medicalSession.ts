import type { InjuryId } from '@/domain/ids'

export interface MedicalSession {
  readonly selectedEventId: InjuryId | null
  readonly setSelectedEventId: (eventId: InjuryId | null) => void
}
