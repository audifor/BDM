import { placeIdFromString, type CountryId, type PlaceId } from '@/domain/ids'
import { requireNonEmptyString } from '@/domain/validation'

/**
 * Extensible, non-exhaustive geographic granularity. A Place never absorbs Facility
 * characteristics (capacity, ownership, physical components): it is location only.
 */
export const PLACE_KINDS = [
  'COUNTRY_REGION',
  'CITY',
  'DISTRICT',
  'CAMPUS',
  'SPORTS_COMPLEX',
  'PARCEL',
  'ADDRESS',
  'OTHER',
] as const

export type PlaceKind = (typeof PLACE_KINDS)[number]

export interface Place {
  readonly id: PlaceId
  readonly kind: PlaceKind
  readonly name: string
  readonly countryId: CountryId | null
  /** A Place may nest inside a broader Place (e.g. a campus within a city). Never a Facility reference. */
  readonly parentPlaceId: PlaceId | null
  readonly latitude: number | null
  readonly longitude: number | null
}

export interface CreatePlaceInput {
  readonly id: PlaceId | string
  readonly kind: PlaceKind
  readonly name: string
  readonly countryId?: CountryId | string | null
  readonly parentPlaceId?: PlaceId | string | null
  readonly latitude?: number | null
  readonly longitude?: number | null
}

export function createPlace(input: CreatePlaceInput): Place {
  const id = placeIdFromString(input.id)
  if (!PLACE_KINDS.includes(input.kind)) throw new TypeError(`Place kind is invalid: ${String(input.kind)}`)
  const parentPlaceId = input.parentPlaceId === undefined || input.parentPlaceId === null ? null : placeIdFromString(input.parentPlaceId)
  if (parentPlaceId !== null && parentPlaceId === id) throw new RangeError('Place cannot be its own parent')
  const latitude = input.latitude ?? null
  const longitude = input.longitude ?? null
  if (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) throw new RangeError('Place latitude must be between -90 and 90')
  if (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) throw new RangeError('Place longitude must be between -180 and 180')
  return Object.freeze({
    id,
    kind: input.kind,
    name: requireNonEmptyString(input.name, 'Place name'),
    countryId: input.countryId === undefined || input.countryId === null ? null : (requireNonEmptyString(input.countryId, 'Place country id') as CountryId),
    parentPlaceId,
    latitude,
    longitude,
  })
}
