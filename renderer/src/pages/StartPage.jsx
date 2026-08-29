import React from "react";

export default function StartPage({
  newGameError,
  startNewGame,
  LEAGUE_ORDER,
  getLeagueConfig,
  teamsByLeague,
  newGameLeagueIds,
  setNewGameLeagueIds,
  teams,
  getTeamLeagueId,
  newGameTeamId,
  setNewGameTeamId,
  openContextMenu,
  openTeam,
  loadingTeams,
}) {
  return (
    <section className="bento setup-view">
      <div className="card hero modal-glass-tactical">
        <div className="card-header setup-header">
          <div>
            <h2>Nueva partida</h2>
            <div className="desc">
              Selecciona ligas activas y un equipo para iniciar. Cada arranque crea una partida nueva.
            </div>
          </div>
          <div className="setup-actions">
            <button className="subnav-item primary" type="button" onClick={startNewGame}>
              Comenzar partida (01/09/2025)
            </button>
          </div>
        </div>

        {newGameError && <div className="desc setup-error">{newGameError}</div>}

        <div className="setup-grid">
          <div className="setup-section">
            <div className="section-title">Ligas activas</div>
            <div className="table select-table league-table">
              <div className="row head select-row">
                <div>Activa</div>
                <div>Liga</div>
                <div>Equipos</div>
              </div>
              {LEAGUE_ORDER.map((leagueId) => {
                const leagueConfig = getLeagueConfig(leagueId);
                const count = (teamsByLeague[leagueId] || []).length;
                const disabled = count === 0;
                const checked = newGameLeagueIds.includes(leagueId);
                const toggle = () => {
                  if (disabled) return;
                  setNewGameLeagueIds((prev) =>
                    prev.includes(leagueId)
                      ? prev.filter((id) => id !== leagueId)
                      : [...prev, leagueId],
                  );
                };
                return (
                  <div
                    key={leagueId}
                    className={`row select-row ${checked ? "active" : ""} ${disabled ? "disabled" : ""}`}
                    onClick={toggle}
                  >
                    <div>
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={checked}
                        onChange={toggle}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div>
                      <span className="chip muted">{leagueConfig.shortName}</span> {leagueConfig.name}
                    </div>
                    <div>{count}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="setup-section">
            <div className="section-title">Equipo</div>
            {teams.length === 0 ? (
              <div className="row empty">Sin datos. {loadingTeams ? "Cargando..." : ""}</div>
            ) : (
              <div className="league-select-list">
                {newGameLeagueIds.length === 0 && (
                  <div className="row empty">Selecciona al menos una liga activa.</div>
                )}
                {newGameLeagueIds.map((leagueId) => {
                  const leagueConfig = getLeagueConfig(leagueId);
                  const leagueTeams = teamsByLeague[leagueId] || [];
                  if (!leagueTeams.length) {
                    return (
                      <div key={leagueId} className="league-select-card">
                        <div className="league-select-header">
                          <span className="chip muted">{leagueConfig.shortName}</span>
                          <span>{leagueConfig.name}</span>
                        </div>
                        <div className="row empty">Sin equipos en esta liga.</div>
                      </div>
                    );
                  }
                  const selectedTeam = leagueTeams.find((t) => String(t.id) === String(newGameTeamId)) || null;
                  return (
                    <div key={leagueId} className="league-select-card">
                      <div className="league-select-header">
                        <span className="chip muted">{leagueConfig.shortName}</span>
                        <span className="league-select-name">{leagueConfig.name}</span>
                        <span className="league-select-count">{leagueTeams.length} equipos</span>
                      </div>
                      <select
                        className="league-select"
                        value={selectedTeam ? String(selectedTeam.id) : ""}
                        onChange={(e) => setNewGameTeamId(e.target.value)}
                      >
                        <option value="">Elegir equipo</option>
                        {leagueTeams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} - {t.data?.city || "--"}
                          </option>
                        ))}
                      </select>
                      {selectedTeam && (
                        <div className="league-select-meta">
                          <span className="mono">{selectedTeam.name}</span>
                          <span>{selectedTeam.data?.city || "--"}</span>
                          <span>Budget {selectedTeam.data?.budget || "--"}</span>
                          <span>Rep {selectedTeam.data?.reputation || "--"}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
