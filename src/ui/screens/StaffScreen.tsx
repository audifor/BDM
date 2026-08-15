import { useState } from 'react'

import { getUserTeam } from '@/engine/calendar'
import { getStaffAssignment, getStaffPerson, type GameWorld } from '@/domain/world'
import type { StaffPersonId } from '@/domain/ids'
import { createEntityRef } from '@/app/entityActions/EntityRef'
import { useEntityActions } from '@/ui/entityActions/useEntityActions'

import {
  getStaffRoleEvaluations,
  getTeamStaffPresentation,
  STAFF_PROFESSIONAL_ATTRIBUTE_KEYS,
  STAFF_PROFESSIONAL_ATTRIBUTE_LABELS,
  STAFF_ROLE_LABELS,
} from '@/ui/staffPresentation'

export function StaffScreen({ world, initialSelectedStaffId }: { readonly world: GameWorld; readonly initialSelectedStaffId?: StaffPersonId }) {
  const team = getUserTeam(world)
  const staff = team === undefined ? [] : getTeamStaffPresentation(world, team.id)
  const [selectedStaffId, setSelectedStaffId] = useState<StaffPersonId | null>(null)
  const selected = staff.find((item) => item.staffPersonId === (selectedStaffId ?? initialSelectedStaffId)) ?? staff[0]

  if (team === undefined) return null

  return <section className="screen staff-screen">
    <div className="page-heading"><div><p className="eyebrow">STAFF</p><h1>{team.name}</h1></div><span>{staff.length} STAFF</span></div>
    {staff.length === 0 ? <p className="content-panel">NO STAFF ASSIGNED</p> : <div className="staff-layout">
      <section className="content-panel table-wrap"><table><thead><tr><th>NAME</th><th>ROLE</th><th>ROLE PROFICIENCY</th></tr></thead><tbody>{staff.map((item) => <StaffRow key={item.staffPersonId} item={item} selected={item.staffPersonId === selected?.staffPersonId} onSelect={() => setSelectedStaffId(item.staffPersonId)} world={world} />)}</tbody></table></section>
      {selected !== undefined && <StaffDetail world={world} staffPersonId={selected.staffPersonId} />}
    </div>}
  </section>
}

function StaffRow({ item, selected, onSelect, world }: { readonly item: ReturnType<typeof getTeamStaffPresentation>[number]; readonly selected: boolean; readonly onSelect: () => void; readonly world: GameWorld }) {
  const target = useEntityActions(createEntityRef('staff', item.staffPersonId), { world, controlledTeamId: getUserTeam(world)?.id })
  return <tr {...target} className={selected ? 'staff-selected-row' : undefined}><td><button className="staff-select-button" type="button" onClick={onSelect} aria-pressed={selected}>{item.name}</button></td><td>{STAFF_ROLE_LABELS[item.role]}</td><td>{item.roleProficiency}</td></tr>
}

function StaffDetail({ world, staffPersonId }: { readonly world: GameWorld; readonly staffPersonId: StaffPersonId }) {
  const person = getStaffPerson(world, staffPersonId)
  const assignment = getStaffAssignment(world, staffPersonId)
  if (person === undefined || assignment === undefined) return null
  const proficiency = getStaffRoleEvaluations(world, staffPersonId)

  return <section className="content-panel staff-detail">
    <div className="staff-detail-header"><p className="eyebrow">STAFF PERSON</p><h2>{person.identity.firstName} {person.identity.lastName}</h2><p>CURRENT ROLE <strong>{STAFF_ROLE_LABELS[assignment.role]}</strong></p><p>ROLE PROFICIENCY <strong>{proficiency.find((item) => item.role === assignment.role)!.proficiency}</strong></p></div>
    <section><p className="eyebrow">ROLE EVALUATION</p><p className="staff-explanation">Professional proficiency based on current attributes.</p><dl className="staff-evaluations">{proficiency.map((item) => <div key={item.role} className={item.role === assignment.role ? 'current-role' : undefined}><dt>{STAFF_ROLE_LABELS[item.role]}</dt><dd>{item.proficiency}</dd></div>)}</dl></section>
    <section><p className="eyebrow">PROFESSIONAL ATTRIBUTES</p><dl className="staff-attributes">{STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => <div key={key}><dt>{STAFF_PROFESSIONAL_ATTRIBUTE_LABELS[key]}</dt><dd>{person.professional.attributes[key]}</dd></div>)}</dl></section>
  </section>
}
