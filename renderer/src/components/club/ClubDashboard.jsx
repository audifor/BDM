import React, { useMemo, useState } from "react";

export default function ClubDashboard({
  teamName = "",
  teamDivision = "",
  leaguePosition = 0,
  nextOpponent = "",
  balance = 0,
  objectives = {},
  topPlayers = [],
  upcomingMatches = [],
  reputation = 0,
  boardConfidence = 70,
  jobSecurity = 70,
  alerts = [],
  onPlayerClick,
}) {
  const [showAllAlerts, setShowAllAlerts] = useState(false);

  const balanceK = Math.round(Number(balance || 0) / 1000);
  const economicHealth = balance > 500000 ? "Excelente" : balance > 100000 ? "Estable" : "Precaria";

  const objectivesArray = useMemo(() => Object.values(objectives || {}), [objectives]);

  const alertItems = useMemo(() => {
    return (alerts || [])
      .filter((item) => item && (item.state === "open" || !item.state))
      .map((item) => ({
        id: item.id || `${item.title}-${item.event_date || ""}`,
        priority: item.severity || "info",
        title: item.title || "",
        description: item.body || "",
      }));
  }, [alerts]);

  const criticalAlerts = alertItems.filter((a) => ["high", "critical"].includes(a.priority));

  const progressForObjective = (obj) => {
    if (!obj) return 0;
    if (Number.isFinite(Number(obj.progress))) return Math.max(0, Math.min(100, Number(obj.progress)));
    if (Number.isFinite(Number(obj.current)) && Number.isFinite(Number(obj.target)) && Number(obj.target) !== 0) {
      return Math.max(0, Math.min(100, (Number(obj.current) / Number(obj.target)) * 100));
    }
    return 0;
  };

  const fmtMoney = (amount) => {
    const n = Number(amount || 0);
    const abs = Math.abs(n);
    if (abs >= 1000000) return `$${(n / 1000000).toFixed(2)}M`;
    if (abs >= 1000) return `$${(n / 1000).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
  };

  const visibleAlerts = showAllAlerts ? alertItems : alertItems.slice(0, 10);

  const topPlayersRows = useMemo(() => {
    return (topPlayers || []).slice(0, 12).map((player) => ({
      id: player.id,
      player,
      name: player.name,
      pos: player.data?.position || player.data?.bio?.pos || "—",
      age: player.data?.bio?.age ?? "—",
      potential: player.data?.potential ?? "—",
      value: player.data?.market_value ?? 0,
    }));
  }, [topPlayers]);

  return (
    <section className="bento club-dashboard">
      <div className="card hero modal-glass-tactical" style={{ gridColumn: "1 / -1" }}>
        <div className="card-header">
          <h2>{teamName}</h2>
          {teamDivision && <span className="pill">{teamDivision}</span>}
        </div>
        <div className="desc">Indicadores clave del club y tareas pendientes.</div>

        <div className="table club-kpis-table scroll-x" style={{ marginTop: 12 }}>
          <div className="row head club-kpis-table">
            <div>Indicador</div>
            <div>Valor</div>
            <div>Detalle</div>
          </div>
          <div className="row club-kpis-table">
            <div>Posición liga</div>
            <div className="mono">{leaguePosition ? String(leaguePosition) : "—"}</div>
            <div>{teamDivision || "—"}</div>
          </div>
          <div className="row club-kpis-table">
            <div>Próximo rival</div>
            <div className="mono">{nextOpponent || "—"}</div>
            <div>{""}</div>
          </div>
          <div className="row club-kpis-table">
            <div>Salud económica</div>
            <div className="mono">{economicHealth}</div>
            <div>{Number.isFinite(balanceK) ? `${balanceK}K disponible` : "—"}</div>
          </div>
          <div className="row club-kpis-table">
            <div>Balance</div>
            <div className="mono">{fmtMoney(balance)}</div>
            <div>{""}</div>
          </div>
          <div className="row club-kpis-table">
            <div>Reputación</div>
            <div className="mono">{Number(reputation) || 0}</div>
            <div>Club/medios</div>
          </div>
          <div className="row club-kpis-table">
            <div>Confianza directiva</div>
            <div className="mono">{Number(boardConfidence) || 0}</div>
            <div>Junta</div>
          </div>
          <div className="row club-kpis-table">
            <div>Seguridad del puesto</div>
            <div className="mono">{Number(jobSecurity) || 0}</div>
            <div>GM</div>
          </div>
        </div>
      </div>

      <div className="card modal-glass-tactical" style={{ gridColumn: "1 / -1" }}>
        <div className="card-header">
          <h2>Alertas</h2>
          <span className={`pill ${criticalAlerts.length > 0 ? "danger" : "success"}`}>
            {criticalAlerts.length} críticas
          </span>
        </div>

        {alertItems.length === 0 ? (
          <div className="desc">No hay alertas pendientes.</div>
        ) : (
          <>
            <div className="table club-alerts-table">
              <div className="row head club-alerts-table">
                <div>Pri</div>
                <div>Título</div>
                <div>Detalle</div>
              </div>
              {visibleAlerts.map((a) => (
                <div key={a.id} className={`row club-alerts-table priority-${a.priority}`}>
                  <div className="mono">{String(a.priority || "").toUpperCase().slice(0, 4)}</div>
                  <div>{a.title}</div>
                  <div className="desc" style={{ margin: 0 }}>
                    {a.description}
                  </div>
                </div>
              ))}
            </div>
            {alertItems.length > 10 && (
              <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
                <button className="subnav-item secondary" type="button" onClick={() => setShowAllAlerts((p) => !p)}>
                  {showAllAlerts ? "Ver menos" : "Ver todas"}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="card modal-glass-tactical" style={{ gridColumn: "1 / -1" }}>
        <div className="card-header">
          <h2>Objetivos</h2>
          <span className="tag muted">Directiva</span>
        </div>
        {objectivesArray.length === 0 ? (
          <div className="desc">Sin objetivos definidos para esta temporada.</div>
        ) : (
          <div className="table club-objectives-table">
            <div className="row head club-objectives-table">
              <div>Objetivo</div>
              <div className="market-num">Progreso</div>
              <div>Barra</div>
            </div>
            {objectivesArray.slice(0, 8).map((obj, idx) => {
              const progress = progressForObjective(obj);
              return (
                <div key={idx} className="row club-objectives-table">
                  <div>{obj.name || obj.id || "—"}</div>
                  <div className="market-num">{progress.toFixed(0)}%</div>
                  <div className="objective-progress-bar">
                    <div className="objective-progress-fill" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {topPlayersRows.length > 0 && (
        <div className="card modal-glass-tactical" style={{ gridColumn: "1 / -1" }}>
          <div className="card-header">
            <h2>Jugadores clave</h2>
            <span className="pill">{topPlayersRows.length}</span>
          </div>
          <div className="table club-top-players-table scroll-x">
            <div className="row head club-top-players-table">
              <div>Jugador</div>
              <div className="market-center">Pos</div>
              <div className="market-center">Edad</div>
              <div className="market-num">Pot</div>
              <div className="market-num">Valor</div>
            </div>
            {topPlayersRows.map((p) => (
              <div key={p.id} className="row club-top-players-table">
                <button className="shortlist-player-btn" type="button" onClick={() => onPlayerClick && onPlayerClick(p.player)}>
                  {p.name}
                </button>
                <div className="market-center">{p.pos}</div>
                <div className="market-center">{p.age}</div>
                <div className="market-num">{p.potential}</div>
                <div className="market-num">{fmtMoney(p.value)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card modal-glass-tactical" style={{ gridColumn: "1 / -1" }}>
        <div className="card-header">
          <h2>Próximos partidos</h2>
        </div>
        {upcomingMatches.length === 0 ? (
          <div className="desc">No hay partidos programados.</div>
        ) : (
          <div className="table club-fixtures-table scroll-x">
            <div className="row head club-fixtures-table">
              <div>Fecha</div>
              <div>Rival</div>
              <div className="market-center">Sede</div>
            </div>
            {upcomingMatches.slice(0, 12).map((match, idx) => (
              <div key={idx} className="row club-fixtures-table">
                <div className="mono">{match.date || "—"}</div>
                <div>{match.opponent || "—"}</div>
                <div className="market-center">{match.home ? "Local" : "Visitante"}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
