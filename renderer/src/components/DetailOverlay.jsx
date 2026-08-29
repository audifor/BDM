import React from "react";

export default function DetailOverlay({
  selectedPlayer,
  selectedTeam,
  selectedAgency,
  selectedAgent,
  selectedStaff,
  selectedBoard,
  closeDetails,
  labelFor,
  descFor,
  contractMap,
  normalizeContractItems,
  teamMap,
  playerContext,
  openRelativePlayer,
  canPrevPlayer,
  canNextPlayer,
  playerTab,
  setPlayerTab,
  openAgent,
  openAgency,
  renderRadarPanel,
  ATTRIBUTE_SECTIONS,
  selectedAttrSection,
  setSelectedAttrSection,
  playerTacticalPos,
  setPlayerTacticalPos,
  tacticalRolesByPlayer,
  setTacticalRolesByPlayer,
  TACTICAL_POSITIONS,
  TACTICAL_DUTIES,
  TACTICAL_ROLES_BY_POS,
  calcRoleSuitability,
  getDefaultRoleForPosition,
  normalizePosition,
  selectedTeamRoster,
  selectedTeamRosterIds,
  openContextMenu,
  openPlayer,
  openStaffMember,
  openBoardMember,
  selectedStaffContract,
  selectedStaffClauses,
  selectedStaffBonuses,
  staffTab,
  setStaffTab,
  selectedStaffAttrSection,
  setSelectedStaffAttrSection,
  STAFF_ATTR_SECTIONS,
  selectedBoardAttrSection,
  setSelectedBoardAttrSection,
  selectedAgentPlayers,
  selectedAgentPlayerIds,
  agents,
  agencyMap,
  humanizeId,
  embedded = false,
}) {
  const isOpen =
    selectedPlayer || selectedTeam || selectedAgency || selectedAgent || selectedStaff || selectedBoard;
  if (!isOpen) return null;

  const isScholarshipType = (type) => {
    const normalized = String(type || "").toLowerCase();
    return ["scholarship", "beca", "amateur", "non_pro", "non-pro"].includes(normalized);
  };

  const formatContractType = (type) => {
    const normalized = String(type || "").toLowerCase();
    if (isScholarshipType(normalized)) return "Beca";
    if (["pro", "professional"].includes(normalized)) return "Pro";
    if (normalized === "staff") return "Staff";
    return type || "--";
  };

  const renderSalaryValue = (contractData) => {
    if (isScholarshipType(contractData?.type)) return "Beca";
    const salary = contractData?.salary;
    const currency = contractData?.currency || "";
    if (salary === null || salary === undefined) return "--";
    return `${salary} ${currency}`.trim();
  };

  const panel = (
    <div
      className="detail-panel modal-glass-tactical"
      onClick={(e) => {
        if (!embedded) e.stopPropagation();
      }}
    >
      <div className="detail-header">
        <div>
          <div className="eyebrow">{embedded ? "Ficha" : "View"}</div>
          <h2>
            {selectedPlayer
              ? embedded
                ? "Jugador"
                : "Player View"
              : selectedTeam
                ? embedded
                  ? "Equipo"
                  : "Team View"
                : selectedAgency
                  ? embedded
                    ? "Agencia"
                    : "Agency View"
                  : selectedAgent
                    ? embedded
                      ? "Agente"
                      : "Agent View"
                    : selectedStaff
                      ? embedded
                        ? "Staff"
                        : "Staff View"
                      : embedded
                        ? "Directiva"
                        : "Board View"}
          </h2>
        </div>
        <button className="close" onClick={closeDetails}>
          {embedded ? "Volver" : "Cerrar"}
        </button>
      </div>

        {selectedPlayer && (() => {
          const identity = selectedPlayer.data?.identity || {};
          const archeId = identity.arquetipo;
          const archeLabel = identity.arquetipo_label || labelFor("arche", archeId);
          const archeDesc = identity.arquetipo_desc || descFor("arche", archeId, archeLabel);
          const mentalId = identity.mentalidad;
          const mentalLabel = identity.mentalidad_label || labelFor("mental", mentalId);
          const mentalDesc = identity.mentalidad_desc || descFor("mental", mentalId, mentalLabel);
          const originId = identity.origin;
          const originLabel = identity.origin_label || labelFor("origin", originId);
          const originDesc = identity.origin_desc || descFor("origin", originId, originLabel);
          const personalityId = identity.personality;
          const personalityLabel = identity.personality_label || identity.personality || "--";
          const personalityDesc = identity.personality_desc || descFor("personality", personalityId, personalityLabel);
          const contract = contractMap[selectedPlayer.id];
          const contractData = contract?.data || {};
          const clauseItems = normalizeContractItems(contractData.clauses, contractData.clauses_detail);
          const bonusItems = normalizeContractItems(contractData.bonuses, contractData.bonuses_detail);

          return (
            <div className="detail-body">
              <div className="card detail-card">
                <div className="card-header detail-card-header">
                  <div>
                    <div className="eyebrow">Ficha de jugador</div>
                    <h2>{selectedPlayer.name}</h2>
                    <div className="detail-sub">
                      {teamMap[selectedPlayer.data?.team_id]?.name || "Agente Libre"} ·
                      {" "}{selectedPlayer.data?.bio?.pos || "--"} ·
                      {" "}{selectedPlayer.data?.bio?.age || "--"} años
                    </div>
                  </div>
                  <div className="detail-header-actions">
                    <span className="tag">Jugador</span>
                    {playerContext.ids.length > 0 && (
                      <div className="detail-nav">
                        <button className="nav-arrow" onClick={() => openRelativePlayer(-1)} disabled={!canPrevPlayer}>
                          ‹
                        </button>
                        <button className="nav-arrow" onClick={() => openRelativePlayer(1)} disabled={!canNextPlayer}>
                          ›
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="detail-tags">
                  <span className="chip" title={archeDesc}>{archeLabel}</span>
                  <span className="chip" title={mentalDesc}>Mentalidad {mentalLabel}</span>
                  <span className="chip" title={originDesc}>Origen {originLabel}</span>
                  <span className="chip" title={personalityDesc}>Personalidad {personalityLabel}</span>
                </div>
                <div className="detail-tabs">
                  <button
                    className={`tab ${playerTab === "perfil" ? "active" : ""}`}
                    onClick={() => setPlayerTab("perfil")}
                  >
                    Perfil
                  </button>
                  <button
                    className={`tab ${playerTab === "contrato" ? "active" : ""}`}
                    onClick={() => setPlayerTab("contrato")}
                  >
                    Contrato
                  </button>
                  <button
                    className={`tab ${playerTab === "tactico" ? "active" : ""}`}
                    onClick={() => setPlayerTab("tactico")}
                  >
                    Rol tactico
                  </button>
                </div>
              </div>

              {playerTab === "perfil" ? (
                <>
                  <div className="detail-grid">
                    <div className="detail-section">
                      <div className="section-title">Bio</div>
                      <div className="detail-list">
                        <div>Altura: {selectedPlayer.data?.bio?.height_cm || "--"} cm</div>
                        <div>Envergadura: {selectedPlayer.data?.bio?.wingspan_cm || "--"} cm</div>
                        <div>Peso: {selectedPlayer.data?.bio?.weight_kg || "--"} kg</div>
                        <div>Mano: {selectedPlayer.data?.bio?.hand || "--"}</div>
                        <div>Nacionalidad: {selectedPlayer.data?.bio?.nationality || "--"}</div>
                        <div>Origen: {selectedPlayer.data?.bio?.birthplace || "--"}</div>
                      </div>
                    </div>
                    <div className="detail-section">
                      <div className="section-title">Agente</div>
                      <div className="detail-list">
                        <div>
                          Agente:{" "}
                          {selectedPlayer.data?.agent_id ? (
                            <button className="link mono" onClick={() => openAgent(selectedPlayer.data?.agent_id)}>
                              {selectedPlayer.data?.agent_name || "--"}
                            </button>
                          ) : (
                            selectedPlayer.data?.agent_name || "--"
                          )}
                        </div>
                        <div>
                          Agencia:{" "}
                          {selectedPlayer.data?.agency_id ? (
                            <button className="link" onClick={() => openAgency(selectedPlayer.data?.agency_id)}>
                              {selectedPlayer.data?.agency_name || "--"}
                            </button>
                          ) : (
                            selectedPlayer.data?.agency_name || "--"
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="detail-section">
                      <div className="section-title">Traits & Perks</div>
                      <div className="detail-tags">
                        {(selectedPlayer.data?.traits || []).length === 0 && (
                          <span className="desc">Sin traits asignados.</span>
                        )}
                        {(selectedPlayer.data?.traits || []).map((t, idx) => {
                          const label = selectedPlayer.data?.traits_label?.[idx] || labelFor("trait", t);
                          const desc = selectedPlayer.data?.traits_desc?.[idx] || descFor("trait", t, label);
                          return (
                            <span key={t} className="chip muted" title={desc}>
                              {label}
                            </span>
                          );
                        })}
                        {(selectedPlayer.data?.perks || []).map((p, idx) => {
                          const label = selectedPlayer.data?.perks_label?.[idx] || labelFor("perk", p);
                          const desc = selectedPlayer.data?.perks_desc?.[idx] || descFor("perk", p, label);
                          return (
                            <span key={p} className="chip muted" title={desc}>
                              {label}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="detail-section">
                    <div className="section-title">Atributos por Sección</div>
                    {renderRadarPanel(
                      ATTRIBUTE_SECTIONS,
                      selectedPlayer.data?.attributes || {},
                      selectedAttrSection,
                      setSelectedAttrSection,
                      selectedPlayer.data?.attributes_label,
                      selectedPlayer.data?.attributes_desc,
                    )}
                  </div>
                </>
              ) : playerTab === "contrato" ? (
                <div className="detail-grid">
                  <div className="detail-section">
                    <div className="section-title">Contrato</div>
                    {contract ? (
                      <div className="detail-list">
                        <div>Estado: {contractData.status || "--"}</div>
                        <div>Inicio: {contractData.start_date || "--"}</div>
                        <div>Fin: {contractData.end_date || "--"}</div>
                        <div>Anios: {contractData.years || "--"}</div>
                        <div>Tipo: {formatContractType(contractData.type)}</div>
                        <div>Salario base: {renderSalaryValue(contractData)}</div>
                        <div>Subida anual: {contractData.raise_pct ?? "--"}</div>
                        <div>Garantia: {contractData.guaranteed_pct ?? "--"}%</div>
                        {contractData.option ? (
                          <div>Opcion: {contractData.option.type} (anio {contractData.option.year})</div>
                        ) : (
                          <div>Opcion: --</div>
                        )}
                      </div>
                    ) : (
                      <div className="desc">Sin contrato registrado.</div>
                    )}
                  </div>
                  <div className="detail-section">
                    <div className="section-title">Salario por Anio</div>
                    {isScholarshipType(contractData.type) ? (
                      <div className="desc">Contrato beca (sin salario).</div>
                    ) : contractData.yearly_salary ? (
                      <div className="detail-list">
                        {(contractData.yearly_salary || []).map((value, idx) => (
                          <div key={`salary-${idx}`}>Ano {idx + 1}: {value} {contractData.currency || ""}</div>
                        ))}
                      </div>
                    ) : (
                      <div className="desc">Sin desglose.</div>
                    )}
                  </div>
                  <div className="detail-section">
                    <div className="section-title">Clausulas</div>
                    <div className="detail-tags">
                      {clauseItems.length === 0 ? (
                        <span className="desc">Sin clausulas.</span>
                      ) : (
                        clauseItems.map((c) => (
                          <span key={c.id || c.label} className="chip muted" title={c.desc || c.label}>
                            {c.label || c.id}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="detail-section">
                    <div className="section-title">Bonus</div>
                    <div className="detail-tags">
                      {bonusItems.length === 0 ? (
                        <span className="desc">Sin bonus.</span>
                      ) : (
                        bonusItems.map((b) => (
                          <span key={b.id || b.label} className="chip muted" title={b.desc || b.label}>
                            {b.label || b.id}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ) : (() => {
                const rolesEntry = tacticalRolesByPlayer[selectedPlayer.id] || {};
                const byPos = rolesEntry.byPos || {};
                const resolvedPos = playerTacticalPos || normalizePosition(selectedPlayer.data?.bio?.pos || selectedPlayer.position || "PG");
                const activePos = TACTICAL_POSITIONS.includes(resolvedPos) ? resolvedPos : "PG";
                const rolesForPos = TACTICAL_ROLES_BY_POS[activePos] || [];
                const selectedRole =
                  byPos[activePos]?.role ||
                  rolesEntry.role ||
                  getDefaultRoleForPosition(activePos);
                const selectedDuty = byPos[activePos]?.duty || rolesEntry.duty || "Apoyo";
                const selectedSuitability = calcRoleSuitability(selectedPlayer, selectedRole, activePos, selectedDuty);

                const updateRole = (role) => {
                  setTacticalRolesByPlayer((prev) => {
                    const existing = prev[selectedPlayer.id] || {};
                    const nextByPos = { ...(existing.byPos || {}) };
                    const duty = nextByPos[activePos]?.duty || existing.duty || "Apoyo";
                    nextByPos[activePos] = { role, duty };
                    return {
                      ...prev,
                      [selectedPlayer.id]: { ...existing, role, duty, byPos: nextByPos },
                    };
                  });
                };

                const updateDuty = (duty) => {
                  setTacticalRolesByPlayer((prev) => {
                    const existing = prev[selectedPlayer.id] || {};
                    const nextByPos = { ...(existing.byPos || {}) };
                    const role = nextByPos[activePos]?.role || existing.role || getDefaultRoleForPosition(activePos);
                    nextByPos[activePos] = { role, duty };
                    return {
                      ...prev,
                      [selectedPlayer.id]: { ...existing, role, duty, byPos: nextByPos },
                    };
                  });
                };

                return (
                  <div className="detail-section tactical-section">
                    <div className="section-title">Roles tacticos</div>
                    <div className="tactical-role-header">
                      <div className="tactical-pos-tabs">
                        {TACTICAL_POSITIONS.map((pos) => (
                          <button
                            key={pos}
                            className={`tactical-pos-btn ${activePos === pos ? "active" : ""}`}
                            onClick={() => setPlayerTacticalPos(pos)}
                          >
                            {pos}
                          </button>
                        ))}
                      </div>
                      <div className="tactical-duty-tabs">
                        {TACTICAL_DUTIES.map((duty) => (
                          <button
                            key={duty}
                            className={`tactical-duty-btn ${selectedDuty === duty ? "active" : ""}`}
                            onClick={() => updateDuty(duty)}
                          >
                            {duty}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="tactical-role-summary">
                      <span className="chip muted">Posicion: {activePos}</span>
                      <span className="chip">Rol: {selectedRole}</span>
                      <span className="chip muted">Idoneidad: {selectedSuitability}%</span>
                    </div>
                    <div className="tactical-roles">
                      {rolesForPos.map((role) => {
                        const suitability = calcRoleSuitability(selectedPlayer, role, activePos, selectedDuty);
                        const suitColor =
                          suitability >= 90 ? "#4ade80" : suitability >= 75 ? "#facc15" : "#fb923c";
                        return (
                          <button
                            key={role}
                            className={`tactical-role-item ${role === selectedRole ? "active" : ""}`}
                            onClick={() => updateRole(role)}
                          >
                            <div className="tactical-role-title">{role}</div>
                            <div className="tactical-role-score">
                              <div className="tactical-role-bar">
                                <span style={{ width: `${suitability}%`, background: suitColor }} />
                              </div>
                              <span style={{ color: suitColor }}>{suitability}%</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })()}

        {selectedTeam && (
          <div className="detail-body">
            <div className="detail-hero">
              <div>
                <div className="detail-title">{selectedTeam.name}</div>
                <div className="detail-sub">{selectedTeam.data?.city || "--"}</div>
              </div>
              <div className="detail-tags">
                <span className="chip">Budget {selectedTeam.data?.budget || "--"}</span>
                <span className="chip">Reputación {selectedTeam.data?.reputation || "--"}</span>
                <span className="chip">Roster {selectedTeam.data?.roster_size || "--"}</span>
              </div>
            </div>

            <div className="detail-section">
              <div className="section-title">Plantilla</div>
              <div className="detail-list roster-list">
                {selectedTeamRoster.length === 0 ? (
                  <div className="desc">Sin jugadores asignados.</div>
                ) : (
                  selectedTeamRoster.map((p) => {
                    const archeId = p.data?.identity?.arquetipo;
                    const archeLabel = p.data?.identity?.arquetipo_label || labelFor("arche", archeId);
                    const archeDesc = p.data?.identity?.arquetipo_desc || descFor("arche", archeId, archeLabel);
                    return (
                      <div
                        key={p.id}
                        className="roster-row"
                        onContextMenu={(e) =>
                          openContextMenu(e, [
                            { label: "Ver ficha", onClick: () => openPlayer(p.id, selectedTeamRosterIds) },
                          ])
                        }
                      >
                        <button className="link mono" onClick={() => openPlayer(p.id, selectedTeamRosterIds)}>
                          {p.name}
                        </button>
                        <span>{p.data?.bio?.pos || "--"}</span>
                        <span className="mono" title={archeDesc}>{archeLabel}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="detail-section">
              <div className="section-title">Staff</div>
              <div className="detail-list roster-list">
                {(selectedTeam.data?.staff || []).length === 0 ? (
                  <div className="desc">Sin staff asignado.</div>
                ) : (
                  selectedTeam.data?.staff?.map((s, idx) => (
                    <div
                      key={`${s.role_id}-${idx}`}
                      className="roster-row"
                      onContextMenu={(e) =>
                        openContextMenu(e, [{ label: "Ver ficha", onClick: () => openStaffMember(s, selectedTeam.id) }])
                      }
                    >
                      <button className="link mono" onClick={() => openStaffMember(s, selectedTeam.id)}>
                        {s.name}
                      </button>
                      <span title={s.role_desc || ""}>{s.role || "--"}</span>
                      <span className="mono">{s.department || "--"}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="detail-section">
              <div className="section-title">Directiva</div>
              <div className="detail-list roster-list">
                {(selectedTeam.data?.board || []).length === 0 ? (
                  <div className="desc">Sin directiva asignada.</div>
                ) : (
                  selectedTeam.data?.board?.map((m, idx) => (
                    <div
                      key={`${m.role_id}-${idx}`}
                      className="roster-row"
                      onContextMenu={(e) =>
                        openContextMenu(e, [{ label: "Ver ficha", onClick: () => openBoardMember(m, selectedTeam.id) }])
                      }
                    >
                      <button className="link mono" onClick={() => openBoardMember(m, selectedTeam.id)}>
                        {m.name}
                      </button>
                      <span title={m.role_desc || ""}>{m.role || "--"}</span>
                      <span className="mono" title={m.profile_desc || m.profile_label || ""}>{m.profile_label || "--"}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {selectedStaff && (
          <div className="detail-body">
            <div className="detail-hero">
              <div>
                <div className="detail-title">{selectedStaff.name}</div>
                <div className="detail-sub">
                  {teamMap[selectedStaff.team_id]?.name || "--"} · {selectedStaff.role || "--"} · {selectedStaff.department || "--"}
                </div>
              </div>
              <div className="detail-tags">
                <span className="chip" title={selectedStaff.personality_desc || selectedStaff.personality_label || selectedStaff.personality || ""}>
                  {selectedStaff.personality_label || selectedStaff.personality || "--"}
                </span>
                <span className="chip">Exp {selectedStaff.experience_years ?? "--"}y</span>
                <span className="chip">{selectedStaff.nationality || "--"}</span>
              </div>
            </div>

            <div className="detail-tabs">
              <button
                className={`tab ${staffTab === "perfil" ? "active" : ""}`}
                onClick={() => setStaffTab("perfil")}
              >
                Perfil
              </button>
              <button
                className={`tab ${staffTab === "contrato" ? "active" : ""}`}
                onClick={() => setStaffTab("contrato")}
              >
                Contrato
              </button>
            </div>

            {staffTab === "perfil" ? (
              <>
                <div className="detail-grid">
                  <div className="detail-section">
                    <div className="section-title">Traits & Perks</div>
                    <div className="detail-tags">
                      {(selectedStaff.traits || []).length === 0 && (selectedStaff.perks || []).length === 0 ? (
                        <span className="desc">Sin traits/perks asignados.</span>
                      ) : (
                        <>
                          {(selectedStaff.traits || []).map((t, idx) => (
                            <span
                              key={t}
                              className="chip muted"
                              title={selectedStaff.traits_desc?.[idx] || selectedStaff.traits_label?.[idx] || t}
                            >
                              {selectedStaff.traits_label?.[idx] || t}
                            </span>
                          ))}
                          {(selectedStaff.perks || []).map((p, idx) => (
                            <span
                              key={p}
                              className="chip muted"
                              title={selectedStaff.perks_desc?.[idx] || selectedStaff.perks_label?.[idx] || p}
                            >
                              {selectedStaff.perks_label?.[idx] || p}
                            </span>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="detail-section">
                  <div className="section-title">Atributos por Sección</div>
                  {renderRadarPanel(
                    STAFF_ATTR_SECTIONS,
                    selectedStaff.attributes || {},
                    selectedStaffAttrSection,
                    setSelectedStaffAttrSection,
                    selectedStaff.attributes_label,
                    selectedStaff.attributes_desc,
                  )}
                </div>
              </>
            ) : (
              <div className="detail-grid">
                <div className="detail-section">
                  <div className="section-title">Contrato</div>
                  {selectedStaffContract && Object.keys(selectedStaffContract).length ? (
                    <div className="detail-list">
                      <div>Estado: {selectedStaffContract.status || "--"}</div>
                      <div>Inicio: {selectedStaffContract.start_date || "--"}</div>
                      <div>Fin: {selectedStaffContract.end_date || "--"}</div>
                      <div>Anios: {selectedStaffContract.years || "--"}</div>
                      <div>Tipo: {formatContractType(selectedStaffContract.type)}</div>
                      <div>Salario base: {renderSalaryValue(selectedStaffContract)}</div>
                      <div>Subida anual: {selectedStaffContract.raise_pct ?? "--"}</div>
                      <div>Garantia: {selectedStaffContract.guaranteed_pct ?? "--"}%</div>
                      {selectedStaffContract.option ? (
                        <div>Opcion: {selectedStaffContract.option.type} (anio {selectedStaffContract.option.year})</div>
                      ) : (
                        <div>Opcion: --</div>
                      )}
                    </div>
                  ) : (
                    <div className="desc">Sin contrato registrado.</div>
                  )}
                </div>
                <div className="detail-section">
                  <div className="section-title">Salario por Anio</div>
                  {isScholarshipType(selectedStaffContract.type) ? (
                    <div className="desc">Contrato beca (sin salario).</div>
                  ) : selectedStaffContract.yearly_salary ? (
                    <div className="detail-list">
                      {(selectedStaffContract.yearly_salary || []).map((value, idx) => (
                        <div key={`staff-salary-${idx}`}>Ano {idx + 1}: {value} {selectedStaffContract.currency || ""}</div>
                      ))}
                    </div>
                  ) : (
                    <div className="desc">Sin desglose.</div>
                  )}
                </div>
                <div className="detail-section">
                  <div className="section-title">Clausulas</div>
                  <div className="detail-tags">
                    {selectedStaffClauses.length === 0 ? (
                      <span className="desc">Sin clausulas.</span>
                    ) : (
                      selectedStaffClauses.map((c) => (
                        <span key={c.id || c.label} className="chip muted" title={c.desc || c.label}>
                          {c.label || c.id}
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <div className="detail-section">
                  <div className="section-title">Bonus</div>
                  <div className="detail-tags">
                    {selectedStaffBonuses.length === 0 ? (
                      <span className="desc">Sin bonus.</span>
                    ) : (
                      selectedStaffBonuses.map((b) => (
                        <span key={b.id || b.label} className="chip muted" title={b.desc || b.label}>
                          {b.label || b.id}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {selectedBoard && (
          <div className="detail-body">
            <div className="detail-hero">
              <div>
                <div className="detail-title">{selectedBoard.name}</div>
                <div className="detail-sub">
                  {teamMap[selectedBoard.team_id]?.name || "--"} · {selectedBoard.role || "--"} · {selectedBoard.category || "--"}
                </div>
              </div>
              <div className="detail-tags">
                <span className="chip" title={selectedBoard.profile_desc || selectedBoard.profile_label || ""}>
                  {selectedBoard.profile_label || "--"}
                </span>
                <span className="chip">{selectedBoard.profile_philosophy || "--"}</span>
              </div>
            </div>

            <div className="detail-section">
              <div className="section-title">Atributos por Sección</div>
              {renderRadarPanel(
                STAFF_ATTR_SECTIONS,
                selectedBoard.attributes || {},
                selectedBoardAttrSection,
                setSelectedBoardAttrSection,
                selectedBoard.attributes_label,
                selectedBoard.attributes_desc,
              )}
            </div>
          </div>
        )}

        {selectedAgency && (
          <div className="detail-body">
            <div className="detail-hero">
              <div>
                <div className="detail-title">{selectedAgency.name}</div>
                <div className="detail-sub">{selectedAgency.data?.tier || "--"} · {selectedAgency.data?.market_segment || "--"}</div>
              </div>
              <div className="detail-tags">
                <span className="chip">Focus {selectedAgency.data?.focus_niche || "--"}</span>
                <span className="chip">Rep {selectedAgency.data?.reputation_score ?? "--"}</span>
                <span className="chip">Scouting {selectedAgency.data?.scouting_power ?? "--"}</span>
                <span className="chip">Dominance {selectedAgency.data?.market_dominance ?? "--"}</span>
              </div>
            </div>

            <div className="detail-grid">
              <div className="detail-section">
                <div className="section-title">Perfil</div>
                <div className="detail-list">
                  <div>Alumni Prestige: {selectedAgency.data?.alumni_prestige ?? "--"}</div>
                  <div>NIL Infra: {selectedAgency.data?.nil_infrastructure ?? "--"}</div>
                  <div>Legal Defense: {selectedAgency.data?.legal_defense ?? "--"}</div>
                </div>
              </div>
              <div className="detail-section">
                <div className="section-title">Perks Corporativos</div>
                <div className="detail-tags">
                  {(selectedAgency.data?.corporate_perks || []).length === 0 ? (
                    <span className="desc">Sin perks corporativos.</span>
                  ) : (
                    selectedAgency.data?.corporate_perks?.map((p) => (
                      <span key={p} className="chip muted" title={humanizeId(p)}>{humanizeId(p)}</span>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="detail-section">
              <div className="section-title">Agentes</div>
              <div className="detail-list roster-list">
                {agents.filter((a) => a.agency_id === selectedAgency.agency_id).length === 0 ? (
                  <div className="desc">Sin agentes asignados.</div>
                ) : (
                  agents
                    .filter((a) => a.agency_id === selectedAgency.agency_id)
                    .map((a) => (
                      <div
                        key={a.agent_id}
                        className="roster-row"
                        onContextMenu={(e) =>
                          openContextMenu(e, [{ label: "Ver ficha", onClick: () => openAgent(a.agent_id) }])
                        }
                      >
                        <button className="link mono" onClick={() => openAgent(a.agent_id)}>
                          {a.name}
                        </button>
                        <span>{a.data?.style || "--"}</span>
                        <span className="mono">{a.data?.influence ?? "--"}</span>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        )}

        {selectedAgent && (
          <div className="detail-body">
            <div className="detail-hero">
              <div>
                <div className="detail-title">{selectedAgent.name}</div>
                <div className="detail-sub">
                  {agencyMap[selectedAgent.agency_id]?.name || "--"} · {selectedAgent.data?.style || "--"}
                </div>
              </div>
              <div className="detail-tags">
                <span className="chip">Greed {selectedAgent.data?.greed ?? "--"}</span>
                <span className="chip">Influence {selectedAgent.data?.influence ?? "--"}</span>
                <span className="chip">Media {selectedAgent.data?.media_reach ?? "--"}</span>
              </div>
            </div>

            <div className="detail-grid">
              <div className="detail-section">
                <div className="section-title">Personalidad</div>
                <div className="detail-list">
                  <div>Profesionalidad: {selectedAgent.data?.professionalism ?? "--"}</div>
                  <div>Agresividad: {selectedAgent.data?.aggressiveness ?? "--"}</div>
                  <div>Venganza: {selectedAgent.data?.vindictiveness ?? "--"}</div>
                  <div>Ética: {selectedAgent.data?.ethics_alignment ?? "--"}</div>
                  <div>Coerción: {selectedAgent.data?.coercion_level ?? "--"}</div>
                </div>
              </div>
              <div className="detail-section">
                <div className="section-title">Negocio</div>
                <div className="detail-list">
                  <div>Ventas: {selectedAgent.data?.salesmanship ?? "--"}</div>
                  <div>Hustle: {selectedAgent.data?.hustle_factor ?? "--"}</div>
                  <div>Flexibilidad: {selectedAgent.data?.flexibility ?? "--"}</div>
                  <div>Portal NCAA: {selectedAgent.data?.transfer_portal ?? "--"}</div>
                  <div>Cantera: {selectedAgent.data?.youth_recruitment ?? "--"}</div>
                </div>
              </div>
            </div>

            <div className="detail-grid">
              <div className="detail-section">
                <div className="section-title">Traits & Perks</div>
                <div className="detail-tags">
                  {(selectedAgent.data?.traits || []).length === 0 && (selectedAgent.data?.active_perks || []).length === 0 ? (
                    <span className="desc">Sin traits/perks asignados.</span>
                  ) : (
                    <>
                      {(selectedAgent.data?.traits || []).map((t, idx) => (
                        <span
                          key={t}
                          className="chip muted"
                          title={selectedAgent.data?.traits_desc?.[idx] || selectedAgent.data?.traits_label?.[idx] || t}
                        >
                          {selectedAgent.data?.traits_label?.[idx] || t}
                        </span>
                      ))}
                      {(selectedAgent.data?.active_perks || []).map((p, idx) => (
                        <span
                          key={p}
                          className="chip muted"
                          title={selectedAgent.data?.active_perks_desc?.[idx] || selectedAgent.data?.active_perks_label?.[idx] || p}
                        >
                          {selectedAgent.data?.active_perks_label?.[idx] || p}
                        </span>
                      ))}
                    </>
                  )}
                </div>
              </div>
              <div className="detail-section">
                <div className="section-title">Network</div>
                <div className="detail-tags">
                  {selectedAgent.data?.network ? (
                    Object.entries(selectedAgent.data.network).map(([region, value]) => (
                      <span key={region} className="chip muted">{region}: {value}</span>
                    ))
                  ) : (
                    <span className="desc">Sin red asignada.</span>
                  )}
                </div>
              </div>
            </div>

            <div className="detail-section">
              <div className="section-title">Jugadores</div>
              <div className="detail-list roster-list">
                {selectedAgentPlayers.length === 0 ? (
                  <div className="desc">Sin jugadores asignados.</div>
                ) : (
                  selectedAgentPlayers.map((p) => (
                    <div
                      key={p.id}
                      className="roster-row"
                      onContextMenu={(e) =>
                        openContextMenu(e, [
                          { label: "Ver ficha", onClick: () => openPlayer(p.id, selectedAgentPlayerIds) },
                        ])
                      }
                    >
                      <button className="link mono" onClick={() => openPlayer(p.id, selectedAgentPlayerIds)}>
                        {p.name}
                      </button>
                      <span>{p.data?.bio?.pos || "--"}</span>
                      <span className="mono">{teamMap[p.data?.team_id]?.name || "Agente Libre"}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
    </div>
  );

  if (embedded) {
    return <div className="detail-embedded">{panel}</div>;
  }

  return (
    <div className="detail-overlay" onClick={closeDetails}>
      {panel}
    </div>
  );
}
