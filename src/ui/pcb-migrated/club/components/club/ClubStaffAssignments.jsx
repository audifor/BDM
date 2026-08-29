import React, { useState } from "react";
import { Users, TrendingUp, Award, AlertCircle, Plus } from "../../ClubIcons";

export default function ClubStaffAssignments({
  staffMembers = [],
  teamPlayers = [],
  assignments = {},
  onAssignStaff,
  onAssignPlayerToCoach,
  onHireStaff,
}) {
  const [selectedRole, setSelectedRole] = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  // Roles disponibles en el club
  const ROLES = {
    head_coach: {
      label: "Entrenador Principal",
      icon: "ðŸ‘”",
      skills: ["leadership", "tactics", "motivation"],
      effects: "Afecta tÃ¡ctica general, rotaciones y moral del equipo",
      limit: 1,
    },
    assistant_off: {
      label: "Asistente Ofensivo",
      icon: "âš¡",
      skills: ["offensive_tactics", "shooting", "playmaking"],
      effects: "+% desarrollo atributos ofensivos (tiro, manejo, visiÃ³n)",
      limit: 1,
    },
    assistant_def: {
      label: "Asistente Defensivo",
      icon: "ðŸ›¡ï¸",
      skills: ["defensive_tactics", "positioning"],
      effects: "+% desarrollo atributos defensivos (defensa, robo, bloqueo)",
      limit: 1,
    },
    physio: {
      label: "Fisioterapeuta",
      icon: "â¤ï¸",
      skills: ["medical", "recovery"],
      effects: "+% recuperaciÃ³n de lesiones y fatiga",
      limit: 2,
    },
    dev_coach: {
      label: "Entrenador de Desarrollo",
      icon: "ðŸ“ˆ",
      skills: ["youth_development", "potential"],
      effects: "+% desarrollo para jugadores jÃ³venes (<23 aÃ±os)",
      limit: 2,
    },
    strength: {
      label: "Preparador FÃ­sico",
      icon: "ðŸ’ª",
      skills: ["strength", "conditioning"],
      effects: "+% desarrollo fÃ­sico (fuerza, velocidad, resistencia)",
      limit: 1,
    },
    scout: {
      label: "Ojeador",
      icon: "ðŸ”",
      skills: ["scouting", "evaluation"],
      effects: "MÃ¡s atributos revelados, mejor evaluaciÃ³n de mercado",
      limit: 3,
    },
  };

  // Calcular asignaciones actuales por rol
  const getRoleAssignments = (roleId) => {
    return Object.entries(assignments)
      .filter(([_, data]) => data.role === roleId)
      .map(([staffId, data]) => {
        const staff = staffMembers.find((s) => s.id === parseInt(staffId));
        return { ...staff, ...data };
      });
  };

  // Obtener staff disponible para un rol
  const getAvailableStaff = (roleId) => {
    const roleConfig = ROLES[roleId];
    return staffMembers.filter((staff) => {
      // Ya asignado a este rol
      if (assignments[staff.id]?.role === roleId) return false;
      // Staff debe tener al menos una skill relevante
      const hasRelevantSkill = roleConfig.skills.some(
        (skill) => (staff.skills?.[skill] || 0) > 400
      );
      return hasRelevantSkill;
    });
  };

  // Calcular bonus total del staff en un Ã¡rea
  const calculateBonus = (area) => {
    let total = 0;
    Object.values(assignments).forEach((assignment) => {
      const staff = staffMembers.find((s) => s.id === assignment.staff_id);
      if (!staff) return;
      const role = ROLES[assignment.role];
      if (role.skills.includes(area)) {
        const skillValue = staff.skills?.[area] || 500;
        total += (skillValue - 500) / 5000; // +10% mÃ¡x por staff top
      }
    });
    return total;
  };

  // Jugadores asignados a un coach
  const getPlayersForCoach = (staffId) => {
    return teamPlayers.filter((p) => p.assigned_coach === staffId);
  };

  // Renderizar tarjeta de rol
  const RoleCard = ({ roleId, roleData }) => {
    const assigned = getRoleAssignments(roleId);
    const available = getAvailableStaff(roleId);
    const vacancies = roleData.limit - assigned.length;

    return (
      <div className="card modal-glass-tactical role-card">
        <div className="role-header">
          <div className="role-icon">{roleData.icon}</div>
          <div className="role-info">
            <h3>{roleData.label}</h3>
            <p className="role-desc">{roleData.effects}</p>
          </div>
          <div className="role-count">
            {assigned.length} / {roleData.limit}
          </div>
        </div>

        {/* Staff asignados */}
        {assigned.length > 0 && (
          <div className="assigned-staff">
            {assigned.map((staff) => (
              <div key={staff.id} className="staff-item">
                <div className="staff-avatar">
                  {staff.name?.charAt(0) || "?"}
                </div>
                <div className="staff-details">
                  <div className="staff-name">{staff.name}</div>
                  <div className="staff-skills">
                    {roleData.skills.map((skill) => {
                      const value = staff.skills?.[skill] || 500;
                      const color =
                        value >= 700
                          ? "#4ade80"
                          : value >= 600
                            ? "#fbbf24"
                            : "#94a3b8";
                      return (
                        <div key={skill} className="skill-badge">
                          <span style={{ color }}>â—</span>
                          <span className="skill-label">
                            {skill.replace("_", " ")}
                          </span>
                          <span className="skill-value">{value}</span>
                        </div>
                      );
                    })}
                  </div>
                  {/* Jugadores asignados (solo para dev coaches) */}
                  {roleId === "dev_coach" && (
                    <div className="assigned-players">
                      <span className="label-small">
                        Desarrollando: {getPlayersForCoach(staff.id).length}{" "}
                        jugadores
                      </span>
                      <button
                        className="btn-link"
                        onClick={() => setSelectedPlayer(staff.id)}
                      >
                        Gestionar
                      </button>
                    </div>
                  )}
                </div>
                <button
                  className="btn-remove"
                  onClick={() =>
                    onAssignStaff && onAssignStaff(roleId, null, staff.id)
                  }
                >
                  âœ•
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Vacantes */}
        {vacancies > 0 && (
          <div className="role-vacancies">
            <div className="vacancy-header">
              <AlertCircle size={16} />
              <span>
                {vacancies} puesto{vacancies > 1 ? "s" : ""} vacante
                {vacancies > 1 ? "s" : ""}
              </span>
            </div>
            {available.length > 0 ? (
              <button
                className="subnav-item secondary"
                onClick={() => setSelectedRole(roleId)}
              >
                <Plus size={16} />
                <span>Asignar Staff</span>
              </button>
            ) : (
              <button
                className="subnav-item secondary"
                onClick={() => onHireStaff && onHireStaff(roleId)}
              >
                <Users size={16} />
                <span>Contratar Nuevo</span>
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  // Modal para asignar staff
  const AssignmentModal = () => {
    if (!selectedRole) return null;
    const available = getAvailableStaff(selectedRole);
    const roleData = ROLES[selectedRole];

    return (
      <div className="modal-overlay" onClick={() => setSelectedRole(null)}>
        <div
          className="modal-content modal-glass-tactical"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <h2>
              Asignar {roleData.icon} {roleData.label}
            </h2>
            <button
              className="modal-close"
              onClick={() => setSelectedRole(null)}
            >
              âœ•
            </button>
          </div>
          <div className="modal-body">
            <p className="modal-desc">
              Selecciona un miembro del staff para asignar a este rol.
            </p>
            <div className="staff-list">
              {available.length === 0 ? (
                <div className="empty-state">
                  <p>No hay staff disponible con las habilidades necesarias.</p>
                  <button
                    className="subnav-item primary"
                    onClick={() => {
                      setSelectedRole(null);
                      onHireStaff && onHireStaff(selectedRole);
                    }}
                  >
                    <Plus size={16} />
                    <span>Contratar Nuevo Staff</span>
                  </button>
                </div>
              ) : (
                available.map((staff) => (
                  <div
                    key={staff.id}
                    className="staff-option"
                    onClick={() => {
                      onAssignStaff &&
                        onAssignStaff(selectedRole, staff.id, null);
                      setSelectedRole(null);
                    }}
                  >
                    <div className="staff-avatar">
                      {staff.name?.charAt(0) || "?"}
                    </div>
                    <div className="staff-details">
                      <div className="staff-name">{staff.name}</div>
                      <div className="staff-role-current">
                        {assignments[staff.id]
                          ? `Actual: ${ROLES[assignments[staff.id].role]?.label || "Sin asignar"}`
                          : "Sin asignar"}
                      </div>
                      <div className="staff-skills">
                        {roleData.skills.map((skill) => {
                          const value = staff.skills?.[skill] || 500;
                          return (
                            <span key={skill} className="skill-mini">
                              {skill}: {value}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <div className="staff-wage">
                      {staff.wage ? `$${(staff.wage / 1000).toFixed(0)}K/aÃ±o` : ""}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Modal para gestionar jugadores asignados a un dev coach
  const PlayerAssignmentModal = () => {
    if (!selectedPlayer) return null;
    const coach = staffMembers.find((s) => s.id === selectedPlayer);
    const assignedPlayers = getPlayersForCoach(selectedPlayer);
    const unassignedPlayers = teamPlayers.filter(
      (p) => p.assigned_coach !== selectedPlayer
    );

    return (
      <div className="modal-overlay" onClick={() => setSelectedPlayer(null)}>
        <div
          className="modal-content modal-glass-tactical"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <h2>Jugadores de {coach?.name || "Entrenador"}</h2>
            <button
              className="modal-close"
              onClick={() => setSelectedPlayer(null)}
            >
              ✕
            </button>
          </div>
          <div className="modal-body">
            <p className="modal-desc">
              Asigna o retira jugadores del desarrollo de este entrenador.
            </p>
            <div className="staff-list">
              <div className="assigned-players-section">
                <h3>Asignados ({assignedPlayers.length})</h3>
                {assignedPlayers.length === 0 ? (
                  <div className="empty-state">
                    <p>Sin jugadores asignados.</p>
                  </div>
                ) : (
                  assignedPlayers.map((player) => (
                    <div key={player.id} className="staff-option">
                      <div className="staff-details">
                        <div className="staff-name">{player.name}</div>
                      </div>
                      <button
                        className="btn-remove"
                        onClick={() =>
                          onAssignPlayerToCoach &&
                          onAssignPlayerToCoach(null, player.id)
                        }
                      >
                        Retirar
                      </button>
                    </div>
                  ))
                )}
              </div>
              <div className="unassigned-players-section">
                <h3>Disponibles ({unassignedPlayers.length})</h3>
                {unassignedPlayers.length === 0 ? (
                  <div className="empty-state">
                    <p>No hay más jugadores disponibles.</p>
                  </div>
                ) : (
                  unassignedPlayers.map((player) => (
                    <div key={player.id} className="staff-option">
                      <div className="staff-details">
                        <div className="staff-name">{player.name}</div>
                      </div>
                      <button
                        className="btn-link"
                        onClick={() =>
                          onAssignPlayerToCoach &&
                          onAssignPlayerToCoach(selectedPlayer, player.id)
                        }
                      >
                        Asignar
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="negotiation-actions">
              <button
                className="subnav-item secondary"
                onClick={() => setSelectedPlayer(null)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Panel de bonificaciones del equipo
  const TeamBonuses = () => {
    const offBonus = calculateBonus("offensive_tactics");
    const defBonus = calculateBonus("defensive_tactics");
    const devBonus = calculateBonus("youth_development");
    const recoveryBonus = calculateBonus("recovery");

    return (
      <div className="card modal-glass-tactical team-bonuses">
        <div className="card-header">
          <h3>Bonificaciones del Staff</h3>
          <Award size={20} />
        </div>
        <div className="bonus-grid">
          <div className="bonus-item">
            <div className="bonus-label">Desarrollo Ofensivo</div>
            <div className="bonus-value">
              {offBonus > 0 ? "+" : ""}
              {(offBonus * 100).toFixed(1)}%
            </div>
          </div>
          <div className="bonus-item">
            <div className="bonus-label">Desarrollo Defensivo</div>
            <div className="bonus-value">
              {defBonus > 0 ? "+" : ""}
              {(defBonus * 100).toFixed(1)}%
            </div>
          </div>
          <div className="bonus-item">
            <div className="bonus-label">Desarrollo Juvenil</div>
            <div className="bonus-value">
              {devBonus > 0 ? "+" : ""}
              {(devBonus * 100).toFixed(1)}%
            </div>
          </div>
          <div className="bonus-item">
            <div className="bonus-label">RecuperaciÃ³n</div>
            <div className="bonus-value">
              {recoveryBonus > 0 ? "+" : ""}
              {(recoveryBonus * 100).toFixed(1)}%
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section className="bento club-staff-assignments">
      <div className="card hero modal-glass-tactical">
        <div className="card-header">
          <h2>Staff y Roles Funcionales</h2>
          <span className="pill">Asignaciones</span>
        </div>
        <div className="desc">
          Asigna a tu staff a roles especÃ­ficos para maximizar las
          bonificaciones de desarrollo, tÃ¡ctica y recuperaciÃ³n.
        </div>
      </div>

      <TeamBonuses />

      <div className="roles-grid">
        {Object.entries(ROLES).map(([roleId, roleData]) => (
          <RoleCard key={roleId} roleId={roleId} roleData={roleData} />
        ))}
      </div>

      {selectedRole && <AssignmentModal />}
      {selectedPlayer && <PlayerAssignmentModal />}
    </section>
  );
}


