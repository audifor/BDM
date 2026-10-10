import { addDays, parseGameDate, type GameDate } from '@/domain/date'
import type { FacilityComponentId, FacilityId, TeamId } from '@/domain/ids'
export type PhysicalAllocationStatus = 'PENDING' | 'CONFIRMED' | 'RELEASED' | 'CANCELLED' | 'BLOCKED'
/** Facilities reservation subordinate to its canonical Training session; no second agenda. */
export interface PhysicalAllocation {
  readonly id: string
  /** Legacy Training allocations omit consumer; Medical always declares its typed owner. */
  readonly consumer?: { readonly kind: 'MEDICAL'; readonly id: string }
  readonly sessionId: string
  readonly teamId: TeamId
  readonly facilityId: FacilityId | null
  readonly componentId: FacilityComponentId
  readonly date: GameDate
  readonly startTime: string
  readonly durationMinutes: number
  readonly demand: number | null
  readonly unit: 'SIMULTANEOUS_PLAYERS' | null
  readonly status: PhysicalAllocationStatus
  readonly capacityAtConfirmation?: number
  readonly sharingAtConfirmation?: 'EXCLUSIVE' | 'SHARED_CAPACITY'
  readonly history: readonly { readonly onDate: GameDate; readonly status: PhysicalAllocationStatus; readonly reason: string }[]
}
const statuses: readonly string[] = ['PENDING', 'CONFIRMED', 'RELEASED', 'CANCELLED', 'BLOCKED']
export function createPhysicalAllocation(input: PhysicalAllocation): PhysicalAllocation {
  if ([input.id, input.sessionId, input.teamId, input.componentId].some(id => typeof id !== 'string' || !id.trim()) || input.facilityId !== null && (typeof input.facilityId !== 'string' || !input.facilityId.trim()) || !statuses.includes(input.status)) throw new RangeError('Invalid physical allocation identity/status')
  parseGameDate(input.date)
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.startTime) || !Number.isInteger(input.durationMinutes) || input.durationMinutes < 1 || input.durationMinutes > 240) throw new RangeError('Invalid physical allocation interval')
  if (input.demand !== null && (!Number.isInteger(input.demand) || input.demand < 0) || input.unit !== null && input.unit !== 'SIMULTANEOUS_PLAYERS') throw new RangeError('Invalid physical allocation demand')
  if (input.consumer !== undefined && (input.consumer.kind !== 'MEDICAL' || input.consumer.id !== input.sessionId)) throw new RangeError('Invalid physical consumer identity')
  const medicalExclusive = input.consumer?.kind === 'MEDICAL' && input.sharingAtConfirmation === 'EXCLUSIVE' && input.demand === null && input.unit === null
  if (!medicalExclusive && (input.status === 'CONFIRMED' || input.history?.some(item => item.status === 'CONFIRMED')) && (input.demand === null || input.unit === null || input.facilityId === null || !Number.isFinite(input.capacityAtConfirmation) || input.capacityAtConfirmation! < input.demand || !['EXCLUSIVE', 'SHARED_CAPACITY'].includes(input.sharingAtConfirmation!))) throw new RangeError('Confirmed allocation requires evidence')
  if (medicalExclusive && input.facilityId === null) throw new RangeError('Exclusive Medical allocation requires physical identity')
  if (!Array.isArray(input.history) || input.history.length === 0 || input.history.at(-1)?.status !== input.status) throw new RangeError('Invalid physical allocation history')
  for (const item of input.history) {
    parseGameDate(item.onDate)
    if (!statuses.includes(item.status) || typeof item.reason !== 'string' || !item.reason) throw new RangeError('Invalid physical allocation cause')
  }
  return Object.freeze({ ...input, ...(input.consumer === undefined ? {} : { consumer: Object.freeze({ ...input.consumer }) }), history: Object.freeze(input.history.map(item => Object.freeze({ ...item }))) })
}
export function physicalIntervalsOverlap(a: Pick<PhysicalAllocation, 'date' | 'startTime' | 'durationMinutes'>, b: Pick<PhysicalAllocation, 'date' | 'startTime' | 'durationMinutes'>): boolean {
  if (a.date > b.date) return physicalIntervalsOverlap(b, a)
  const offset = a.date === b.date ? 0 : addDays(a.date, 1) === b.date ? 1440 : null
  if (offset === null) return false
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
  const startA = minutes(a.startTime), startB = minutes(b.startTime) + offset
  return startA < startB + b.durationMinutes && startB < startA + a.durationMinutes
}
