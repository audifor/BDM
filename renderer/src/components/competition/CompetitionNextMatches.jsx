import React, { useMemo, useState } from "react";

export default function CompetitionNextMatches({
  upcomingFixtures = [],
  myTeamId,
  allTeams = [],
  allPlayers = [],
  onTeamClick,
  onSimulateMatch,
}) {
  const [selectedFixtureId, setSelectedFixtureId] = useState(null);

  const teamById = useMemo(() => {
    const map = new Map();
    (allTeams || []).forEach((t) => map.set(String(t.id), t));
    return map;
  }, [allTeams]);

  const playersByTeamId = useMemo(() => {
    const map = new Map();
    (allPlayers || []).forEach((p) => {
      const teamId = p?.data?.team_id;
      if (!teamId) return;
      const key = String(teamId);
      const list = map.get(key);
      if (list) list.push(p);
      else map.set(key, [p]);
    });
    return map;
  }, [allPlayers]);

  const getTeamPlayers = (teamId) => playersByTeamId.get(String(teamId)) || [];

  const formString = (team) => {
    const recent = team?.data?.recent_results || [];
    const s = recent.slice(0, 5).map((r) => r.result).join("");
    return s || "-----";
  };

  const injuredCount = (teamId) => {
    const players = getTeamPlayers(teamId);
    return players.filter((p) => {
      const status = String(p?.data?.injury_status || p?.data?.health?.injury_status || "").toLowerCase();
      return status === "injured" || status === "out";
    }).length;
  };

  const suspendedCount = (teamId) => {
    const players = getTeamPlayers(teamId);
    return players.filter((p) => p?.data?.suspended === true).length;
  };

  const competitionLabel = (fixture) => {
    const key = String(fixture?.competition || "").toLowerCase();
    if (key === "copa") return "Copa";
    if (key === "supercopa") return "Supercopa";
    return "Liga";
  };

  const toDaysUntil = (dateStr) => {
    const d = new Date(String(dateStr || ""));
    if (Number.isNaN(d.getTime())) return null;
    const now = new Date();
    const diff = d.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const rows = useMemo(() => {
    return (upcomingFixtures || []).slice(0, 30).map((fixture) => {
      const isHome = String(fixture.homeId) === String(myTeamId);
      const myTeam = teamById.get(String(myTeamId)) || null;
      const rivalId = isHome ? fixture.awayId : fixture.homeId;
      const rival = rivalId ? teamById.get(String(rivalId)) : null;
      return {
        fixture,
        isHome,
        myTeam,
        rival,
        rivalId: rivalId ? String(rivalId) : "",
        myForm: myTeam ? formString(myTeam) : "-----",
        rivalForm: rival ? formString(rival) : "-----",
        myInj: injuredCount(myTeamId),
        rivalInj: rivalId ? injuredCount(rivalId) : 0,
        mySus: suspendedCount(myTeamId),
        rivalSus: rivalId ? suspendedCount(rivalId) : 0,
        daysUntil: toDaysUntil(fixture.date),
        comp: competitionLabel(fixture),
      };
    });
  }, [myTeamId, teamById, upcomingFixtures, playersByTeamId]);

  const selectedRow = useMemo(() => {
    if (!selectedFixtureId) return null;
    return rows.find((r) => String(r.fixture?.id) === String(selectedFixtureId)) || null;
  }, [rows, selectedFixtureId]);

  const FormBoxes = ({ value }) => {
    const s = String(value || "-----");
    return (
      <div className="form-boxes">
        {s.split("").slice(0, 5).map((ch, idx) => (
          <span
            key={idx}
            className={`form-box ${ch === "W" ? "win" : ch === "L" ? "loss" : ch === "D" ? "draw" : "empty"}`}
            title={ch === "W" ? "Victoria" : ch === "L" ? "Derrota" : ch === "D" ? "Empate" : ""}
          >
            {ch === "-" ? "" : ch}
          </span>
        ))}
      </div>
    );
  };

  return (
    <section className="bento competition-next-matches">
      <div className="card hero modal-glass-tactical" style={{ gridColumn: "1 / -1" }}>
        <div className="card-header">
          <h2>Próximos partidos</h2>
          <span className="pill">{upcomingFixtures.length}</span>
        </div>
        <div className="desc">Vista tipo FM con forma y bajas.</div>
      </div>

      <div className="card results-table modal-glass-tactical" style={{ gridColumn: "1 / -1" }}>
        <div className="market-actionbar">
          <div className="market-actionbar-left">
            <span className="results-count">{rows.length} mostrados</span>
          </div>
          <div className="market-actionbar-right">
            {selectedRow ? (
              <>
                <span className="selected-player">
                  Seleccionado: <strong>{selectedRow.myTeam?.name || "—"} vs {selectedRow.rival?.name || "—"}</strong>
                </span>
                {onSimulateMatch && (
                  <button className="subnav-item primary" type="button" onClick={() => onSimulateMatch(selectedRow.fixture.id)}>
                    Simular
                  </button>
                )}
                <button className="subnav-item secondary" type="button" onClick={() => setSelectedFixtureId(null)}>
                  Limpiar
                </button>
              </>
            ) : (
              <span className="selected-player muted">Selecciona un partido para ver acciones.</span>
            )}
          </div>
        </div>

        <div className="table competition-next-table scroll-x">
          <div className="row head competition-next-table">
            <div>Fecha</div>
            <div>Comp</div>
            <div>Rival</div>
            <div className="market-center">Sede</div>
            <div className="market-center">Días</div>
            <div>Forma (Tú)</div>
            <div>Forma (Rival)</div>
            <div className="market-center">Bajas</div>
          </div>

          {rows.map((r) => {
            const id = r.fixture?.id;
            const selected = String(selectedFixtureId || "") === String(id);
            return (
              <div
                key={id}
                className={`row competition-next-table competition-next-row ${selected ? "selected" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedFixtureId(id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedFixtureId(id);
                  }
                }}
              >
                <div className="mono">{r.fixture?.date || "—"}</div>
                <div>{r.comp}</div>
                <div>
                  <button
                    type="button"
                    className="shortlist-player-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (r.rivalId && onTeamClick) onTeamClick(r.rivalId);
                    }}
                  >
                    {r.rival?.name || "—"}
                  </button>
                </div>
                <div className="market-center">{r.isHome ? "Local" : "Visitante"}</div>
                <div className="market-center">{r.daysUntil === null ? "—" : r.daysUntil <= 0 ? "Hoy" : r.daysUntil}</div>
                <div>
                  <FormBoxes value={r.myForm} />
                </div>
                <div>
                  <FormBoxes value={r.rivalForm} />
                </div>
                <div className="market-center">
                  <span className="mono">L {r.myInj}/{r.mySus}</span> · <span className="mono">R {r.rivalInj}/{r.rivalSus}</span>
                </div>
              </div>
            );
          })}

          {rows.length === 0 && (
            <div className="row empty">
              <div style={{ gridColumn: "1 / -1" }}>No hay próximos partidos programados.</div>
            </div>
          )}
        </div>

        {selectedRow && (
          <div className="card modal-glass-tactical" style={{ marginTop: 12 }}>
            <div className="card-header">
              <h3>Detalle</h3>
              <div style={{ display: "flex", gap: 8 }}>
                {onTeamClick && selectedRow.myTeam && (
                  <button className="subnav-item secondary" type="button" onClick={() => onTeamClick(String(myTeamId))}>
                    Ver mi equipo
                  </button>
                )}
                {onTeamClick && selectedRow.rivalId && (
                  <button className="subnav-item secondary" type="button" onClick={() => onTeamClick(String(selectedRow.rivalId))}>
                    Ver rival
                  </button>
                )}
              </div>
            </div>
            <div className="desc">
              {selectedRow.fixture?.date || "—"} · {selectedRow.comp} · {selectedRow.isHome ? "Local" : "Visitante"}
            </div>
            <div className="table competition-next-detail-table scroll-x" style={{ marginTop: 10 }}>
              <div className="row head competition-next-detail-table">
                <div>Equipo</div>
                <div>Forma</div>
                <div className="market-center">Lesionados</div>
                <div className="market-center">Sancionados</div>
              </div>
              <div className="row competition-next-detail-table">
                <div>{selectedRow.myTeam?.name || "—"}</div>
                <div><FormBoxes value={selectedRow.myForm} /></div>
                <div className="market-center">{selectedRow.myInj}</div>
                <div className="market-center">{selectedRow.mySus}</div>
              </div>
              <div className="row competition-next-detail-table">
                <div>{selectedRow.rival?.name || "—"}</div>
                <div><FormBoxes value={selectedRow.rivalForm} /></div>
                <div className="market-center">{selectedRow.rivalInj}</div>
                <div className="market-center">{selectedRow.rivalSus}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

