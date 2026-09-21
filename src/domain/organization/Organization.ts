import { organizationIdFromString, organizationSectionIdFromString, type OrganizationId, type OrganizationSectionId } from '@/domain/ids'
import { requireNonEmptyString } from '@/domain/validation'

export interface Organization {
  readonly id: OrganizationId
  readonly entityId: string | null
  readonly legalName: string | null
  readonly foundedYear: number | null
  readonly dissolvedYear: number | null
  readonly primaryPlaceId: string | null
  readonly website: string | null
}

export interface CreateOrganizationInput extends Organization {}

export interface OrganizationSection {
  readonly id: OrganizationSectionId
  readonly organizationId: OrganizationId
  readonly sport: string | null
  readonly gender: string | null
  readonly categoryScope: string | null
  readonly canonicalName: string
  readonly validFrom: string | null
  readonly validTo: string | null
}

export interface CreateOrganizationSectionInput extends OrganizationSection {}

export function createOrganization(input: CreateOrganizationInput): Organization {
  const id = organizationIdFromString(input.id)
  if (input.foundedYear !== null && !Number.isInteger(input.foundedYear)) throw new TypeError('Organization founded year must be an integer or null')
  if (input.dissolvedYear !== null && !Number.isInteger(input.dissolvedYear)) throw new TypeError('Organization dissolved year must be an integer or null')
  return Object.freeze({
    id,
    entityId: nullableText(input.entityId, 'Organization entity id'),
    legalName: nullableText(input.legalName, 'Organization legal name'),
    foundedYear: input.foundedYear,
    dissolvedYear: input.dissolvedYear,
    primaryPlaceId: nullableText(input.primaryPlaceId, 'Organization primary place id'),
    website: nullableText(input.website, 'Organization website'),
  })
}

export function createOrganizationSection(input: CreateOrganizationSectionInput): OrganizationSection {
  return Object.freeze({
    id: organizationSectionIdFromString(input.id),
    organizationId: organizationIdFromString(input.organizationId),
    sport: nullableText(input.sport, 'Organization section sport'),
    gender: nullableText(input.gender, 'Organization section gender'),
    categoryScope: nullableText(input.categoryScope, 'Organization section category scope'),
    canonicalName: requireNonEmptyString(input.canonicalName, 'Organization section canonical name'),
    validFrom: nullableText(input.validFrom, 'Organization section valid from'),
    validTo: nullableText(input.validTo, 'Organization section valid to'),
  })
}

function nullableText(value: string | null, label: string): string | null {
  if (value !== null && typeof value !== 'string') throw new TypeError(`${label} must be a string or null`)
  return value
}
