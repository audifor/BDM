import { facilityComponentIdFromString, type FacilityComponentId } from '@/domain/ids'
import { requireNonEmptyString } from '@/domain/validation'
import { isFacilityComponentType, type CreateFacilityComponentInput, type FacilityComponentType } from './FacilityComponent'
import { isFacilityTechnicalStandard, type FacilityTechnicalStandard } from './FacilityCondition'
import type { CreateFacilityComponentSpecificationInput } from './FacilityComponentSpecification'
import { isFacilityType, type FacilityType } from './FacilityType'

/**
 * A `FacilityDevelopmentProject`'s scope is structured data, never free text — each project type
 * (see `FacilityDevelopmentProjectType`) is paired with exactly the shape of change it can make to
 * world truth. A discriminated union rather than one mega-shape with optional fields, so a given
 * scope value is only ever one concrete kind of change and can be exhaustively switched over.
 *
 * CFI6 deliberately keeps every field here a plain physical/structural fact — no cost, no budget, no
 * approval metadata (that is CFI7's/Governance's concern; see `FacilityDevelopmentProject.status`
 * for the one piece of approval world-truth CFI6 itself records).
 *
 * This is the CANONICAL, already-validated shape — every component ID here is a branded
 * `FacilityComponentId`. Construction input accepts plain strings for those IDs (see
 * `CreateFacilityDevelopmentProjectScopeInput` and its per-kind `Create...ScopeInput` members),
 * exactly like every other `createXxx`/`CreateXxxInput` pair in this domain.
 */
export type FacilityDevelopmentProjectScope =
  | CreateFacilityScope
  | AddComponentScope
  | ReplaceComponentScope
  | RenovateComponentScope
  | RemoveComponentScope
  | ExpandFacilityScope
  | ReconfigureFacilityScope
  | DemolishFacilityScope

export type CreateFacilityDevelopmentProjectScopeInput =
  | CreateFacilityScopeInput
  | AddComponentScopeInput
  | ReplaceComponentScopeInput
  | RenovateComponentScopeInput
  | RemoveComponentScopeInput
  | ExpandFacilityScopeInput
  | ReconfigureFacilityScopeInput
  | DemolishFacilityScopeInput

/** NEW_FACILITY: the blueprint for a Facility that does not exist yet (see `FacilityDevelopmentProject` for when the real `Facility` entity is created). */
export interface CreateFacilityScope {
  readonly kind: 'CREATE_FACILITY'
  readonly placeId: string
  readonly facilityType: FacilityType
  readonly canonicalName: string
  readonly initialComponents: readonly ComponentBlueprint[]
}
export type CreateFacilityScopeInput = CreateFacilityScope

/** COMPONENT_ADDITION / FACILITY_EXPANSION: one or more brand-new components to add to an existing Facility. */
export interface AddComponentScope {
  readonly kind: 'ADD_COMPONENT'
  readonly components: readonly ComponentBlueprint[]
}
export type AddComponentScopeInput = AddComponentScope

/**
 * COMPONENT_REPLACEMENT: old identity ends, new identity begins. `retiredComponentId` must
 * reference a real, existing component; `replacement` is the blueprint for the new one. CFI6 never
 * reuses the old component's ID for the replacement — see the CFI6 certification report's
 * "Renovation vs. Replacement" section for the rationale.
 */
export interface ReplaceComponentScope {
  readonly kind: 'REPLACE_COMPONENT'
  readonly retiredComponentId: FacilityComponentId
  readonly replacement: ComponentBlueprint
  readonly resultingCondition: number
}
export interface ReplaceComponentScopeInput {
  readonly kind: 'REPLACE_COMPONENT'
  readonly retiredComponentId: FacilityComponentId | string
  readonly replacement: ComponentBlueprint
  readonly resultingCondition: number
}

/**
 * COMPONENT_RENOVATION / FACILITY_MODERNIZATION (component-scale): same identity, improved/changed
 * asset. `componentId` continues to exist; only its recorded specification/technical
 * standard/equipment tags and CFI4 condition may change. `resultingCondition` is mandatory and
 * explicit — CFI6 never assumes a renovated component becomes condition 100 (see the "Condition
 * after project" policy in the certification report).
 */
export interface RenovateComponentScope {
  readonly kind: 'RENOVATE_COMPONENT'
  readonly componentId: FacilityComponentId
  readonly updatedSpecification: CreateFacilityComponentSpecificationInput | null
  readonly updatedTechnicalStandard: FacilityTechnicalStandard | null
  readonly updatedEquipmentTags?: readonly string[]
  readonly resultingCondition: number
}
export interface RenovateComponentScopeInput {
  readonly kind: 'RENOVATE_COMPONENT'
  readonly componentId: FacilityComponentId | string
  readonly updatedSpecification?: CreateFacilityComponentSpecificationInput | null
  readonly updatedTechnicalStandard?: FacilityTechnicalStandard | null
  readonly updatedEquipmentTags?: readonly string[]
  readonly resultingCondition: number
}

/** COMPONENT_REMOVAL / DEMOLITION (component-scale): retires a component without deleting its history — see `FacilityDevelopmentEngine.ts`'s removal handling. */
export interface RemoveComponentScope {
  readonly kind: 'REMOVE_COMPONENT'
  readonly componentId: FacilityComponentId
}
export interface RemoveComponentScopeInput {
  readonly kind: 'REMOVE_COMPONENT'
  readonly componentId: FacilityComponentId | string
}

/** FACILITY_EXPANSION (facility-scale convenience): identical semantics to `ADD_COMPONENT`, named separately only so a caller/report can distinguish "this project's primary intent was expansion" from an incidental component addition inside a larger renovation. */
export interface ExpandFacilityScope {
  readonly kind: 'EXPAND_FACILITY'
  readonly components: readonly ComponentBlueprint[]
}
export type ExpandFacilityScopeInput = ExpandFacilityScope

/** RECONFIGURATION: a bundle of renovate/replace/add/remove sub-scopes applied atomically as one project — e.g. "convert 2 practice courts + add hydrotherapy + replace strength room" in a single Performance Center Expansion. */
export interface ReconfigureFacilityScope {
  readonly kind: 'RECONFIGURE_FACILITY'
  readonly additions: readonly ComponentBlueprint[]
  readonly renovations: readonly Omit<RenovateComponentScope, 'kind'>[]
  readonly replacements: readonly Omit<ReplaceComponentScope, 'kind'>[]
  readonly removals: readonly FacilityComponentId[]
}
export interface ReconfigureFacilityScopeInput {
  readonly kind: 'RECONFIGURE_FACILITY'
  readonly additions: readonly ComponentBlueprint[]
  readonly renovations: readonly Omit<RenovateComponentScopeInput, 'kind'>[]
  readonly replacements: readonly Omit<ReplaceComponentScopeInput, 'kind'>[]
  readonly removals: readonly (FacilityComponentId | string)[]
}

/** DEMOLITION (facility-scale): the whole Facility's own lifecycle transitions to DECOMMISSIONED/DEMOLISHED; see `FacilityLifecycle`. No component-level scope is needed — every active component is implicitly retired. */
export interface DemolishFacilityScope {
  readonly kind: 'DEMOLISH_FACILITY'
  readonly facilityId: string
}
export type DemolishFacilityScopeInput = DemolishFacilityScope

/**
 * The blueprint for one new `FacilityComponent`, reusing `CreateFacilityComponentInput`'s shape
 * minus the fields that only make sense once the component is real (`id`, `facilityId`, `status`,
 * `openedAt`/`closedAt`) — those are supplied by the engine at completion time, never by the scope
 * itself, so a planned-but-not-yet-built component can never accidentally claim to already exist.
 */
export interface ComponentBlueprint {
  readonly type: FacilityComponentType
  readonly name?: string | null
  readonly capacity?: number | null
  readonly quantity?: number | null
  readonly parentComponentId?: FacilityComponentId | string | null
  readonly specification?: CreateFacilityComponentSpecificationInput | null
  readonly equipmentTags?: readonly string[]
}

export function createFacilityDevelopmentProjectScope(input: CreateFacilityDevelopmentProjectScopeInput): FacilityDevelopmentProjectScope {
  switch (input.kind) {
    case 'CREATE_FACILITY':
      return createCreateFacilityScope(input)
    case 'ADD_COMPONENT':
      return createAddComponentScope(input)
    case 'EXPAND_FACILITY':
      return Object.freeze({ kind: 'EXPAND_FACILITY', components: validateComponentBlueprints(input.components) })
    case 'REPLACE_COMPONENT':
      return createReplaceComponentScope(input)
    case 'RENOVATE_COMPONENT':
      return createRenovateComponentScope(input)
    case 'REMOVE_COMPONENT':
      return Object.freeze({ kind: 'REMOVE_COMPONENT', componentId: facilityComponentIdFromString(input.componentId) })
    case 'RECONFIGURE_FACILITY':
      return createReconfigureFacilityScope(input)
    case 'DEMOLISH_FACILITY':
      return Object.freeze({ kind: 'DEMOLISH_FACILITY', facilityId: requireNonEmptyString(input.facilityId, 'Demolish facility scope facilityId') })
    default:
      throw new TypeError(`Facility development project scope kind is invalid: ${String((input as { kind: unknown }).kind)}`)
  }
}

function createCreateFacilityScope(input: CreateFacilityScopeInput): CreateFacilityScope {
  if (!isFacilityType(input.facilityType)) throw new TypeError(`Create facility scope facilityType is invalid: ${String(input.facilityType)}`)
  return Object.freeze({
    kind: 'CREATE_FACILITY',
    placeId: requireNonEmptyString(input.placeId, 'Create facility scope placeId'),
    facilityType: input.facilityType,
    canonicalName: requireNonEmptyString(input.canonicalName, 'Create facility scope canonicalName'),
    initialComponents: validateComponentBlueprints(input.initialComponents),
  })
}

function createAddComponentScope(input: AddComponentScopeInput): AddComponentScope {
  return Object.freeze({ kind: 'ADD_COMPONENT', components: validateComponentBlueprints(input.components) })
}

function createReplaceComponentScope(input: ReplaceComponentScopeInput): ReplaceComponentScope {
  if (!Number.isFinite(input.resultingCondition) || input.resultingCondition < 0 || input.resultingCondition > 100) {
    throw new RangeError('Replace component scope resultingCondition must be between 0 and 100')
  }
  return Object.freeze({
    kind: 'REPLACE_COMPONENT',
    retiredComponentId: facilityComponentIdFromString(input.retiredComponentId),
    replacement: validateComponentBlueprint(input.replacement),
    resultingCondition: input.resultingCondition,
  })
}

function createRenovateComponentScope(input: RenovateComponentScopeInput): RenovateComponentScope {
  if (!Number.isFinite(input.resultingCondition) || input.resultingCondition < 0 || input.resultingCondition > 100) {
    throw new RangeError('Renovate component scope resultingCondition must be between 0 and 100')
  }
  const updatedTechnicalStandard = input.updatedTechnicalStandard ?? null
  if (updatedTechnicalStandard !== null && !isFacilityTechnicalStandard(updatedTechnicalStandard)) {
    throw new TypeError(`Renovate component scope updatedTechnicalStandard is invalid: ${String(updatedTechnicalStandard)}`)
  }
  const updatedEquipmentTags = input.updatedEquipmentTags === undefined ? undefined : Object.freeze([...input.updatedEquipmentTags])
  return Object.freeze({
    kind: 'RENOVATE_COMPONENT',
    componentId: facilityComponentIdFromString(input.componentId),
    updatedSpecification: input.updatedSpecification ?? null,
    updatedTechnicalStandard,
    ...(updatedEquipmentTags === undefined ? {} : { updatedEquipmentTags }),
    resultingCondition: input.resultingCondition,
  })
}

function createReconfigureFacilityScope(input: ReconfigureFacilityScopeInput): ReconfigureFacilityScope {
  return Object.freeze({
    kind: 'RECONFIGURE_FACILITY',
    additions: Object.freeze(input.additions.map((blueprint) => validateComponentBlueprint(blueprint))),
    renovations: Object.freeze(input.renovations.map((renovation) => {
      const validated = createRenovateComponentScope({ kind: 'RENOVATE_COMPONENT', ...renovation })
      const { kind: _kind, ...rest } = validated
      return Object.freeze(rest)
    })),
    replacements: Object.freeze(input.replacements.map((replacement) => {
      const validated = createReplaceComponentScope({ kind: 'REPLACE_COMPONENT', ...replacement })
      const { kind: _kind, ...rest } = validated
      return Object.freeze(rest)
    })),
    removals: Object.freeze(input.removals.map((componentId) => facilityComponentIdFromString(componentId))),
  })
}

function validateComponentBlueprints(blueprints: readonly ComponentBlueprint[]): readonly ComponentBlueprint[] {
  if (blueprints.length === 0) throw new RangeError('Facility development project scope requires at least one component blueprint')
  return Object.freeze(blueprints.map((blueprint) => validateComponentBlueprint(blueprint)))
}

function validateComponentBlueprint(blueprint: ComponentBlueprint): ComponentBlueprint {
  if (!isFacilityComponentType(blueprint.type)) throw new TypeError(`Component blueprint type is invalid: ${String(blueprint.type)}`)
  return Object.freeze({ ...blueprint })
}

/** Converts a validated blueprint plus the concrete identity fields only known at completion time into a full `CreateFacilityComponentInput`. */
export function componentBlueprintToCreateInput(blueprint: ComponentBlueprint, id: string, facilityId: string, openedAt: string): CreateFacilityComponentInput {
  return {
    id,
    facilityId,
    type: blueprint.type,
    name: blueprint.name ?? null,
    status: 'ACTIVE',
    capacity: blueprint.capacity ?? null,
    quantity: blueprint.quantity ?? null,
    openedAt,
    parentComponentId: blueprint.parentComponentId ?? null,
    specification: blueprint.specification ?? null,
    equipmentTags: blueprint.equipmentTags ?? [],
  }
}
