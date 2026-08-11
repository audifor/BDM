import type { CountryId } from '@/domain/ids'
import { requireNonEmptyString } from '@/domain/validation'

export interface Country {
  readonly id: CountryId
  readonly name: string
  readonly code: string
}

export interface CreateCountryInput {
  id: CountryId
  name: string
  code: string
}

export function createCountry(input: CreateCountryInput): Country {
  return {
    id: requireNonEmptyString(input.id, 'Country id') as CountryId,
    name: requireNonEmptyString(input.name, 'Country name'),
    code: requireNonEmptyString(input.code, 'Country code'),
  }
}
