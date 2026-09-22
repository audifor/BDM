import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { parseGameDate } from '@/domain/date'
import { organizationControlIdFromString, organizationIdFromString, organizationOwnershipIdFromString, personIdFromString, type OrganizationId } from '@/domain/ids'
import { createPerson } from '@/domain/person'
import { updateGameWorld } from '@/domain/world'
import {
  createOrganizationControl,
  createOrganizationOwnership,
  getActiveOrganizationControllers,
  getActiveOrganizationOwnership,
  getTeamOrganizationControl,
  getTeamOrganizationOwnership,
} from './OrganizationOwnership'

const ownerPerson = createPerson({ id: personIdFromString('person:owner'), firstName: 'Owner', lastName: 'Person', profileRefs: [] })
function targetOrganizationId(world: ReturnType<typeof createNewGame>): OrganizationId {
  return Object.values(world.teams)[0]!.organizationId
}

describe('organization ownership and control', () => {
  it('validates actor kinds, percentages, and temporal intervals', () => {
    expect(createOrganizationOwnership({ id: 'ownership:person', organizationId: 'organization:target', owner: { kind: 'PERSON', personId: ownerPerson.id }, ownershipPercentage: 0, validFrom: '2030-01-01', validTo: '2030-12-31' })).toMatchObject({ ownershipPercentage: 0, validFrom: '2030-01-01', validTo: '2030-12-31' })
    expect(createOrganizationOwnership({ id: 'ownership:organization', organizationId: 'organization:target', owner: { kind: 'ORGANIZATION', organizationId: organizationIdFromString('organization:holding') }, ownershipPercentage: 100, validFrom: null, validTo: null })).toMatchObject({ ownershipPercentage: 100 })
    expect(createOrganizationOwnership({ id: 'ownership:unknown-percentage', organizationId: 'organization:target', owner: { kind: 'PERSON', personId: ownerPerson.id }, ownershipPercentage: null })).toMatchObject({ ownershipPercentage: null, validFrom: null, validTo: null })
    expect(() => createOrganizationOwnership({ id: 'ownership:negative', organizationId: 'organization:target', owner: { kind: 'PERSON', personId: ownerPerson.id }, ownershipPercentage: -1 })).toThrow(RangeError)
    expect(() => createOrganizationOwnership({ id: 'ownership:over', organizationId: 'organization:target', owner: { kind: 'PERSON', personId: ownerPerson.id }, ownershipPercentage: 100.01 })).toThrow(RangeError)
    expect(() => createOrganizationOwnership({ id: 'ownership:reverse', organizationId: 'organization:target', owner: { kind: 'PERSON', personId: ownerPerson.id }, ownershipPercentage: 10, validFrom: '2031-01-02', validTo: '2031-01-01' })).toThrow(RangeError)
    expect(createOrganizationControl({ id: 'control:person', organizationId: 'organization:target', controller: { kind: 'PERSON', personId: ownerPerson.id }, validFrom: '2030-01-01' })).toMatchObject({ validTo: null })
  })

  it('keeps ownership and control independent, direct, temporal, and deterministic', () => {
    const base = createNewGame()
    const target = targetOrganizationId(base)
    const holdingOrganization = Object.values(base.organizationsById).find((organization) => organization.id !== target)!
    const world = updateGameWorld(base, {
      persons: [...Object.values(base.personsById), ownerPerson],
      organizationOwnership: [
        createOrganizationOwnership({ id: 'ownership:z', organizationId: target, owner: { kind: 'PERSON', personId: ownerPerson.id }, ownershipPercentage: 70, validFrom: '2030-01-01', validTo: null }),
        createOrganizationOwnership({ id: 'ownership:a', organizationId: target, owner: { kind: 'ORGANIZATION', organizationId: holdingOrganization.id }, ownershipPercentage: 30, validFrom: '2030-01-01', validTo: null }),
        createOrganizationOwnership({ id: 'ownership:historical', organizationId: target, owner: { kind: 'PERSON', personId: ownerPerson.id }, ownershipPercentage: 100, validFrom: '2020-01-01', validTo: '2020-12-31' }),
        createOrganizationOwnership({ id: 'ownership:holding', organizationId: holdingOrganization.id, owner: { kind: 'PERSON', personId: ownerPerson.id }, ownershipPercentage: null, validFrom: null, validTo: null }),
      ],
      organizationControl: [createOrganizationControl({ id: 'control:person', organizationId: target, controller: { kind: 'PERSON', personId: ownerPerson.id }, validFrom: '2030-01-01', validTo: null })],
    })

    expect(getActiveOrganizationOwnership(world, target, parseGameDate('2030-06-01')).map((item) => item.id)).toEqual(['ownership:a', 'ownership:z'])
    expect(getActiveOrganizationControllers(world, target, parseGameDate('2030-06-01')).map((item) => item.id)).toEqual(['control:person'])
    expect(getTeamOrganizationOwnership(world, Object.values(world.teams)[0]!.id, parseGameDate('2030-06-01')).map((item) => item.id)).toEqual(['ownership:a', 'ownership:z'])
    expect(getTeamOrganizationControl(world, Object.values(world.teams)[0]!.id, parseGameDate('2030-06-01'))).toHaveLength(1)
    expect(getActiveOrganizationOwnership(world, target, parseGameDate('2020-06-01')).map((item) => item.id)).toEqual(['ownership:historical'])
    expect(getActiveOrganizationOwnership(world, holdingOrganization.id, parseGameDate('2030-06-01')).map((item) => item.id)).toEqual(['ownership:holding'])
    expect(world.governanceInstitutionsById).toEqual({})
    expect(getActiveOrganizationOwnership(world, target, parseGameDate('2030-06-01')).some((item) => item.owner.kind === 'PERSON' && item.owner.personId === ownerPerson.id)).toBe(true)
  })

  it('allows control without ownership and rejects missing identities and self-relations', () => {
    const base = createNewGame()
    const target = targetOrganizationId(base)
    const holdingOrganization = Object.values(base.organizationsById).find((organization) => organization.id !== target)!
    expect(() => updateGameWorld(base, { organizationControl: [createOrganizationControl({ id: organizationControlIdFromString('control:missing'), organizationId: target, controller: { kind: 'PERSON', personId: personIdFromString('person:missing') }, validFrom: null, validTo: null })] })).toThrow(/Person controller/)
    expect(() => updateGameWorld(base, { organizationOwnership: [createOrganizationOwnership({ id: organizationOwnershipIdFromString('ownership:missing-target'), organizationId: organizationIdFromString('organization:missing'), owner: { kind: 'PERSON', personId: personIdFromString('person:missing') }, ownershipPercentage: 10, validFrom: null, validTo: null })] })).toThrow(/target/)
    const withHolding = base
    expect(() => updateGameWorld(withHolding, { organizationOwnership: [createOrganizationOwnership({ id: 'ownership:self', organizationId: holdingOrganization.id, owner: { kind: 'ORGANIZATION', organizationId: holdingOrganization.id }, ownershipPercentage: 100, validFrom: null, validTo: null })] })).toThrow(/self-own/)
    expect(() => updateGameWorld(withHolding, { organizationControl: [createOrganizationControl({ id: 'control:self', organizationId: holdingOrganization.id, controller: { kind: 'ORGANIZATION', organizationId: holdingOrganization.id }, validFrom: null, validTo: null })] })).toThrow(/self-control/)
  })
})
