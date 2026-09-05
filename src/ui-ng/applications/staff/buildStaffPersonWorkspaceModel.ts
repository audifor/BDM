import { staffRoleDefinition, type StaffProfessionalAttributeKey } from '@/domain/staff'
import { STAFF_REPUTATION_DIMENSIONS, staffReputationScore } from '@/domain/staffReputation'
import type { StaffPersonId } from '@/domain/ids'
import { calculateStaffWorkload, getStaffAssignment, getStaffPerson, type GameWorld } from '@/domain/world'
import { explainStaffCultureFit } from '@/ui/staffCulturePresentation'
import { explainStaffHumanState } from '@/ui/staffHumanStatePresentation'
import {
  STAFF_CONTRACT_STATUS_LABELS,
  STAFF_DEPARTMENT_LABELS,
  STAFF_PROFESSIONAL_ATTRIBUTE_KEYS,
  STAFF_PROFESSIONAL_ATTRIBUTE_LABELS,
  STAFF_ROLE_LABELS,
  WORKLOAD_STATE_LABELS,
  classifyWorkloadState,
  compactStaffSalary,
  findActiveStaffContractForStaff,
  formatStaffCareerEntry,
  getRecentStaffCareerHistory,
  getResponsibilitiesHeldPresentation,
  getStaffAge,
  getStaffContractStatus,
  getStaffEmploymentStatusLabel,
  getStaffReputationProfile,
  getStaffRoleEvaluations,
  presentStaffCareerOutlook,
  RESPONSIBILITY_DOMAIN_LABELS,
  RESPONSIBILITY_KIND_LABELS,
  RESPONSIBILITY_MODE_LABELS,
} from '@/ui/staffPresentation'
import { deriveTeamColors, teamShortCode } from '@/ui-ng/applications/player/data/presentationHelpers'
import {
  toneForCareerOutlook,
  toneForCultureFit,
  toneForInterpretedState,
  toneForRelationshipState,
  toneForTrend,
} from '@/ui-ng/applications/staff/dynamicsTone'
import {
  DYNAMICS_STATE_LABELS,
  DYNAMICS_TREND_LABELS,
  WORKING_RELATIONSHIP_STATE_LABELS,
  formatStaffPercent,
} from '@/ui-ng/applications/staff/staffWorkspaceModel'
import {
  STAFF_ATTRIBUTE_GROUPS,
  type StaffAttributeGroupId,
  type StaffPersonAttributeGroup,
  type StaffPersonAttributeRow,
  type StaffPersonWorkspaceModel,
} from '@/ui-ng/applications/staff/staffPersonWorkspaceModel'

function nationalityCode(nationality: string | undefined): string | null {
  if (nationality === undefined) return null
  const compact = nationality.trim()
  return /^[A-Za-z]{2,3}$/.test(compact) ? compact.toUpperCase() : null
}

function attributeGroupId(key: StaffProfessionalAttributeKey): StaffAttributeGroupId {
  const group = STAFF_ATTRIBUTE_GROUPS.find((entry) => (entry.keys as readonly string[]).includes(key))
  return group?.id ?? 'leadership'
}

function buildAttributeRows(attributes: Readonly<Record<StaffProfessionalAttributeKey, number>>): readonly StaffPersonAttributeRow[] {
  return STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => ({
    id: key,
    label: STAFF_PROFESSIONAL_ATTRIBUTE_LABELS[key],
    value: attributes[key],
    groupId: attributeGroupId(key),
  }))
}

function buildAttributeGroups(rows: readonly StaffPersonAttributeRow[]): readonly StaffPersonAttributeGroup[] {
  return STAFF_ATTRIBUTE_GROUPS.map((group) => {
    const groupRows = rows.filter((row) => row.groupId === group.id)
    const profileValue =
      groupRows.length === 0
        ? 0
        : Math.round(groupRows.reduce((sum, row) => sum + row.value, 0) / groupRows.length)
    return { id: group.id, label: group.label, profileValue, rows: groupRows }
  })
}

export function buildStaffPersonWorkspaceModel(
  world: GameWorld,
  staffPersonId: StaffPersonId,
): StaffPersonWorkspaceModel | null {
  const person = getStaffPerson(world, staffPersonId)
  if (person === undefined) return null

  const assignment = getStaffAssignment(world, staffPersonId)
  const team = assignment === undefined ? undefined : world.teams[assignment.teamId]
  const roleDefinition = assignment === undefined ? undefined : staffRoleDefinition(assignment.role)
  const workload = calculateStaffWorkload(world, staffPersonId)
  const workloadState = classifyWorkloadState(workload)
  const contract = findActiveStaffContractForStaff(world, staffPersonId)
  const reputation = getStaffReputationProfile(world, staffPersonId)
  const evaluations = getStaffRoleEvaluations(world, staffPersonId)
  const held = getResponsibilitiesHeldPresentation(world, staffPersonId)
  const history = getRecentStaffCareerHistory(world, staffPersonId, 12)
  const explanation = explainStaffHumanState(world, staffPersonId)
  const career = presentStaffCareerOutlook(world, staffPersonId)
  const culture = explainStaffCultureFit(world, staffPersonId)
  const attributes = buildAttributeRows(person.professional.attributes)
  const teamColors = deriveTeamColors(team?.id ?? staffPersonId)

  return {
    identity: {
      staffPersonId,
      firstName: person.identity.firstName,
      lastName: person.identity.lastName,
      teamName: team?.name ?? null,
      teamId: team?.id ?? null,
      teamShort: team === undefined ? '—' : teamShortCode(team.name),
      teamColors,
      roleLabel: assignment === undefined ? 'Unassigned' : STAFF_ROLE_LABELS[assignment.role],
      departmentLabel: roleDefinition === undefined ? '—' : STAFF_DEPARTMENT_LABELS[roleDefinition.department],
      department: roleDefinition?.department ?? null,
      seniorityLabel: roleDefinition?.seniority ?? '—',
      age: getStaffAge(world, staffPersonId) ?? null,
      dateOfBirth: person.identity.dateOfBirth ?? null,
      nationality: person.identity.nationality ?? null,
      nationalityCode: nationalityCode(person.identity.nationality),
    },
    status: {
      employmentLabel: getStaffEmploymentStatusLabel(world, staffPersonId),
      workloadState,
      workloadLabel: WORKLOAD_STATE_LABELS[workloadState],
      utilizationLabel: formatStaffPercent(workload.utilization),
      utilization: Number.isFinite(workload.utilization) ? Math.round(workload.utilization * 100) : 100,
      proficiency: assignment === undefined ? null : evaluations.find((item) => item.role === assignment.role)?.proficiency ?? null,
      reputationScore: reputation === undefined ? null : Math.round(staffReputationScore(reputation)),
    },
    evaluations: evaluations.map((item) => ({
      role: item.role,
      label: STAFF_ROLE_LABELS[item.role],
      proficiency: item.proficiency,
      current: item.role === assignment?.role,
    })),
    attributes,
    attributeGroups: buildAttributeGroups(attributes),
    responsibilities: held.map((item) => ({
      id: item.id,
      kindLabel: RESPONSIBILITY_KIND_LABELS[item.kind],
      domainLabel: RESPONSIBILITY_DOMAIN_LABELS[item.domain],
      modeLabel: RESPONSIBILITY_MODE_LABELS[item.mode],
      capacityCost: item.capacityCost,
    })),
    contract: {
      employmentLabel: getStaffEmploymentStatusLabel(world, staffPersonId),
      contractStatusLabel: STAFF_CONTRACT_STATUS_LABELS[getStaffContractStatus(world, staffPersonId)],
      salaryLabel: contract === undefined ? null : compactStaffSalary(contract.compensation.annualSalary),
      termLabel: contract === undefined ? null : `${contract.term.startsOn} → ${contract.term.expiresOn}`,
      expiresOn: contract?.term.expiresOn ?? null,
      terminationLabel:
        contract?.termination === undefined ? null : `${contract.termination.effectiveOn} · ${contract.termination.reason}`,
    },
    reputation:
      reputation === undefined
        ? []
        : STAFF_REPUTATION_DIMENSIONS.map((dimension) => ({
            dimension,
            value: reputation.values[dimension],
          })),
    history: history.map((entry, index) => ({
      id: `${entry.date}-${entry.kind}-${index}`,
      label: formatStaffCareerEntry(entry),
    })),
    dynamics: {
      stateLabel: explanation === undefined ? null : DYNAMICS_STATE_LABELS[explanation.currentState],
      stateTone: explanation === undefined ? null : toneForInterpretedState(explanation.currentState),
      trendLabel: explanation === undefined ? null : DYNAMICS_TREND_LABELS[explanation.trend],
      trendTone: explanation === undefined ? null : toneForTrend(explanation.trend),
      outlook: career?.outlook ?? null,
      outlookTone: career === undefined ? null : toneForCareerOutlook(career.outlook),
      intent: career?.intent ?? null,
      reasons: career?.reasons ?? [],
      positives: explanation?.positives ?? [],
      concerns: explanation?.concerns ?? [],
      cultureFitLabel: culture.label,
      cultureFitTone: culture.established ? toneForCultureFit(culture.band) : null,
      cultureNote:
        !culture.established
          ? 'Organizational culture has not settled yet.'
          : culture.causes[0] ??
            (culture.alignedWith.length > 0 ? `Aligned on: ${culture.alignedWith.slice(0, 4).join(', ')}.` : null),
      relationships:
        explanation?.relationships.map((relationship) => ({
          personLabel:
            relationship.personRole === undefined
              ? relationship.personLabel
              : `${relationship.personLabel} · ${relationship.personRole}`,
          stateLabel: WORKING_RELATIONSHIP_STATE_LABELS[relationship.state] ?? relationship.state,
          stateTone: toneForRelationshipState(relationship.state),
          trend: DYNAMICS_TREND_LABELS[relationship.trend],
          trendTone: toneForTrend(relationship.trend),
        })) ?? [],
    },
  }
}
