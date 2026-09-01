import React, { useState } from "react";
import { Award, AlertCircle, Plus, Users } from "../../ClubIcons";

export default function ClubStaffAssignments({ staffMembers = [], marketCandidates = [], roles = [], onFireStaff, onNegotiateStaff }) {
  const [selectedRole, setSelectedRole] = useState(roles[0]?.id ?? "");
  const selectedCandidates = marketCandidates.filter((staff) => selectedRole === "" || staff.marketRole === selectedRole);
  const roleById = Object.fromEntries(roles.map((role) => [role.id, role]));
  const staffForRole = (roleId) => staffMembers.filter((staff) => staff.roleId === roleId);
  const departments = roles.map((role) => role.department).filter((department, index, values) => values.indexOf(department) === index);

  return (
    <section className="bento club-staff-assignments">
      <div className="card hero modal-glass-tactical">
        <div className="card-header"><h2>Staff y Roles Funcionales</h2><span className="pill">Asignaciones</span></div>
        <div className="desc">Staff y contratos activos del mundo de juego. Las contrataciones siguen el proceso canÃ³nico de candidatura, entrevista y oferta.</div>
      </div>

      <div className="card modal-glass-tactical team-bonuses">
        <div className="card-header"><h3>Bonificaciones del Staff</h3><Award size={20} /></div>
        <div className="bonus-grid">{departments.map((department) => <div className="bonus-item" key={department}><div className="bonus-label">{department}</div><div className="bonus-value">{staffMembers.filter((staff) => staff.department === department).length} activos</div></div>)}</div>
      </div>

      <div className="card modal-glass-tactical">
        <div className="card-header"><h3>Mercado de staff</h3><Users size={20} /></div>
        <label className="modal-desc" htmlFor="staff-market-role">Filtrar por rol</label>
        <select id="staff-market-role" onChange={(event) => setSelectedRole(event.target.value)} value={selectedRole}>{roles.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}</select>
        <div className="staff-list">{selectedCandidates.map((staff) => <div className="staff-option" key={staff.id}><div className="staff-avatar">{staff.name.charAt(0)}</div><div className="staff-details"><div className="staff-name">{staff.name}</div><div className="staff-role-current">{roleById[staff.marketRole]?.label ?? staff.marketRole}</div><div className="staff-skills">Calidad: {staff.proficiency}</div></div><button className="subnav-item primary" onClick={() => onNegotiateStaff?.(selectedRole, staff.id)} type="button"><Plus size={16} /><span>Negociar y contratar</span></button></div>)}</div>
      </div>

      <div className="roles-grid">{roles.map((role) => {
        const assigned = staffForRole(role.id);
        return <div className="card modal-glass-tactical role-card" key={role.id}>
          <div className="role-header"><div className="role-icon">{role.department.charAt(0).toUpperCase()}</div><div className="role-info"><h3>{role.label}</h3><p className="role-desc">{role.department}</p></div><div className="role-count">{assigned.length}</div></div>
          {assigned.length === 0 ? <div className="role-vacancies"><div className="vacancy-header"><AlertCircle size={16} /><span>Puesto vacante</span></div><button className="subnav-item secondary" onClick={() => setSelectedRole(role.id)} type="button"><Plus size={16} /><span>Buscar en mercado</span></button></div> : <div className="assigned-staff">{assigned.map((staff) => <div className="staff-item" key={staff.id}><div className="staff-avatar">{staff.name.charAt(0)}</div><div className="staff-details"><div className="staff-name">{staff.name}</div><div className="staff-skills"><span className="skill-badge">Calidad {staff.proficiency}</span>{staff.annualSalary === undefined ? null : <span className="skill-badge">${(staff.annualSalary / 1000).toFixed(0)}K/aÃ±o</span>}</div></div><button aria-label={`Despedir ${staff.name}`} className="btn-remove" onClick={() => onFireStaff?.(staff.id)} type="button">Ã—</button></div>)}</div>}
        </div>;
      })}</div>
    </section>
  );
}
