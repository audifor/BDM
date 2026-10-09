import { parseGameDate } from '@/domain/date'
import { createFacility, createFacilityTeamRelationship, createPlace, type FacilityPurpose, type FacilityTeamRelationshipKind, type PlaceKind } from '@/domain/facilities'
import type { WorldDbPhysicalContentV1 } from '@/domain/worldDb/GameBootstrap'

const USAGE_KINDS: Readonly<Record<string, readonly [FacilityTeamRelationshipKind, FacilityPurpose]>> = {
  home: ['HOME_VENUE', 'MATCH_HOSTING'], training: ['TRAINING', 'TRAINING'],
  academy: ['ACADEMY', 'ACADEMY_DEVELOPMENT'], medical: ['MEDICAL', 'MEDICAL_TREATMENT'],
  administration: ['ADMINISTRATION', 'ADMINISTRATION'], storage: ['STORAGE', 'STORAGE'],
}

/** A structural use record is not ownership or a legal/sporting usage entitlement. */
export function projectWorldDbPhysicalContent(content?: WorldDbPhysicalContentV1) {
  const usages = [...(content?.teamUsages ?? [])].sort((a, b) => a.usageId.localeCompare(b.usageId))
  return {
    places: [...(content?.places ?? [])].sort((a, b) => a.placeId.localeCompare(b.placeId)).map((place) => createPlace({
      id: place.placeId, name: place.name, kind: placeKind(place.placeType),
      parentPlaceId: place.parentPlaceId, latitude: place.latitude, longitude: place.longitude,
    })),
    facilities: [...(content?.facilities ?? [])].sort((a, b) => a.facilityId.localeCompare(b.facilityId)).map((facility) => {
      const purposes = [...new Set(usages.filter((usage) => usage.facilityId === facility.facilityId).flatMap((usage) => USAGE_KINDS[usage.usageType.toLowerCase()]?.[1] ?? []))].sort()
      return createFacility({ id: facility.facilityId, placeId: facility.placeId, canonicalName: facility.name,
        // DDL-12 entity_type FACILITY does not classify a building as ARENA or prove it open.
        type: 'OTHER', status: 'UNKNOWN', purposes: purposes.length > 0 ? purposes : ['OTHER'],
        physical: { totalCapacity: facility.capacity },
      })
    }),
    facilityTeamRelationships: usages.flatMap((usage) => {
      const kind = USAGE_KINDS[usage.usageType.toLowerCase()]?.[0]
      if (kind === undefined) return []
      // Season/year labels are not exact dates. The association remains known but its
      // date precision is unknown. It never creates a FacilityUsageRight or access gate.
      return [createFacilityTeamRelationship({ id: usage.usageId, facilityId: usage.facilityId, teamId: usage.teamId, kind,
        validFrom: exactDateOrUnknown(usage.validFrom), validTo: exactDateOrUnknown(usage.validTo) })]
    }),
  }
}

function exactDateOrUnknown(value: string | null) {
  return value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseGameDate(value) : null
}

function placeKind(source: string): PlaceKind {
  const kinds: Readonly<Record<string, PlaceKind>> = { CITY: 'CITY', DISTRICT: 'DISTRICT', CAMPUS: 'CAMPUS', SPORTS_COMPLEX: 'SPORTS_COMPLEX', PARCEL: 'PARCEL', ADDRESS: 'ADDRESS', COUNTRY_REGION: 'COUNTRY_REGION' }
  return kinds[source.toUpperCase()] ?? 'OTHER'
}
