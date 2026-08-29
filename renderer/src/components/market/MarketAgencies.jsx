import React, { useMemo, useState } from "react";

export default function MarketAgencies({
  agencies = [],
  agencyRelationships = {},
  allPlayers = [],
  myTeamId,
  onContactAgency,
  onPlayerClick,
}) {
  const [selectedAgencyId, setSelectedAgencyId] = useState(null);
  const [sortBy, setSortBy] = useState("relationship"); // relationship | deals | name

  const playersByAgencyId = useMemo(() => {
    const map = new Map();
    for (const p of allPlayers) {
      const agencyId = p?.data?.agency_id;
      if (!agencyId) continue;
      const key = String(agencyId);
      const existing = map.get(key);
      if (existing) existing.push(p);
      else map.set(key, [p]);
    }
    return map;
  }, [allPlayers]);

  const enrichedAgencies = useMemo(() => {
    return agencies.map((agency) => {
      const rel = agencyRelationships[agency.agency_id] || {
        relationship: 0,
        last_deal: null,
        deals_count: 0,
      };
      const players = playersByAgencyId.get(String(agency.agency_id)) || [];
      const top = players
        .slice()
        .sort((a, b) => Number(b.data?.potential || 0) - Number(a.data?.potential || 0))[0] || null;
      return { ...agency, ...rel, players_count: players.length, top_player: top };
    });
  }, [agencies, agencyRelationships, playersByAgencyId]);

  const sortedAgencies = useMemo(() => {
    const sorted = [...enrichedAgencies];
    switch (sortBy) {
      case "relationship":
        sorted.sort((a, b) => Number(b.relationship || 0) - Number(a.relationship || 0));
        break;
      case "deals":
        sorted.sort((a, b) => Number(b.deals_count || 0) - Number(a.deals_count || 0));
        break;
      case "name":
        sorted.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
        break;
      default:
        break;
    }
    return sorted;
  }, [enrichedAgencies, sortBy]);

  const getRelationshipInfo = (relationship) => {
    const r = Number(relationship || 0);
    if (r >= 75) return { label: "Excelente", color: "#22c55e" };
    if (r >= 50) return { label: "Buena", color: "#84cc16" };
    if (r >= 25) return { label: "Neutral", color: "#f59e0b" };
    if (r >= 0) return { label: "Tensa", color: "#ef4444" };
    return { label: "Hostil", color: "#dc2626" };
  };

  const getDiscountPercentage = (relationship) => {
    const r = Number(relationship || 0);
    if (r >= 80) return 20;
    if (r >= 60) return 15;
    if (r >= 40) return 10;
    if (r >= 20) return 5;
    return 0;
  };

  const selectedAgency = useMemo(() => {
    if (!selectedAgencyId) return null;
    return sortedAgencies.find((a) => String(a.agency_id) === String(selectedAgencyId)) || null;
  }, [selectedAgencyId, sortedAgencies]);

  const selectedAgencyPlayers = useMemo(() => {
    if (!selectedAgency) return [];
    const players = playersByAgencyId.get(String(selectedAgency.agency_id)) || [];
    return players.slice().sort((a, b) => Number(b.data?.potential || 0) - Number(a.data?.potential || 0)).slice(0, 25);
  }, [playersByAgencyId, selectedAgency]);

  const fmt = (amount) => {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount}`;
  };

  const formatLastDeal = (value) => {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString();
  };

  return (
    <section className="bento market-agencies">
      <div className="card hero modal-glass-tactical">
        <div className="card-header">
          <h2>Agencias</h2>
          <span className="pill">{agencies.length} agencias</span>
        </div>
        <div className="desc">Relaciones y acceso a jugadores representados (estilo FM).</div>

        <div className="shortlist-controls-bar">
          <div className="shortlist-filters">
            <div className="filter-group">
              <label>Ordenar</label>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="relationship">Relación</option>
                <option value="deals">Tratos</option>
                <option value="name">Nombre</option>
              </select>
            </div>
          </div>
          <div className="shortlist-summary">
            {myTeamId ? "Selecciona una agencia para ver jugadores y contactar." : "Selecciona un equipo para gestionar relaciones."}
          </div>
        </div>
      </div>

      <div className="card results-table modal-glass-tactical" style={{ gridColumn: "1 / -1" }}>
        <div className="table agencies-table scroll-x">
          <div className="row head agencies-table">
            <div>Agencia</div>
            <div className="market-center">Rel</div>
            <div className="market-center">Tratos</div>
            <div className="market-center">Desc</div>
            <div className="market-center">Último</div>
            <div className="market-center">Jugadores</div>
            <div>Top</div>
          </div>

          {sortedAgencies.map((agency) => {
            const relInfo = getRelationshipInfo(agency.relationship);
            const discount = getDiscountPercentage(agency.relationship);
            const selected = String(selectedAgencyId || "") === String(agency.agency_id);
            const top = agency.top_player;

            return (
              <div
                key={agency.agency_id}
                className={`row agencies-table agencies-row ${selected ? "selected" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedAgencyId(agency.agency_id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedAgencyId(agency.agency_id);
                  }
                }}
              >
                <div className="agency-name-cell">
                  <div className="agency-name">{agency.name}</div>
                  <div className="player-meta">{relInfo.label}</div>
                </div>
                <div className="market-center" style={{ color: relInfo.color }}>
                  {Number(agency.relationship || 0)}
                </div>
                <div className="market-center">{Number(agency.deals_count || 0)}</div>
                <div className="market-center">{discount}%</div>
                <div className="market-center">{formatLastDeal(agency.last_deal)}</div>
                <div className="market-center">{Number(agency.players_count || 0)}</div>
                <div className="agency-top-cell">
                  {top ? (
                    <button
                      type="button"
                      className="shortlist-player-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPlayerClick && onPlayerClick(top);
                      }}
                    >
                      {top.name} ({Number(top.data?.potential || 0)})
                    </button>
                  ) : (
                    "—"
                  )}
                </div>
              </div>
            );
          })}

          {sortedAgencies.length === 0 && (
            <div className="row empty">
              <div style={{ gridColumn: "1 / -1" }}>No hay agencias disponibles.</div>
            </div>
          )}
        </div>
      </div>

      {selectedAgency && (
        <div className="card agency-detail modal-glass-tactical" style={{ gridColumn: "1 / -1" }}>
          <div className="card-header">
            <h3>{selectedAgency.name}</h3>
            <button
              className="subnav-item primary"
              onClick={() => onContactAgency && onContactAgency(selectedAgency.agency_id)}
              disabled={!myTeamId}
              title={!myTeamId ? "Selecciona un equipo" : "Contactar"}
            >
              Contactar
            </button>
          </div>
          <div className="desc">
            Relación: {getRelationshipInfo(selectedAgency.relationship).label} · Tratos: {Number(selectedAgency.deals_count || 0)} ·
            Descuento: {getDiscountPercentage(selectedAgency.relationship)}%
          </div>

          <div className="table agency-players-table scroll-x" style={{ marginTop: 10 }}>
            <div className="row head agency-players-table">
              <div>Jugador</div>
              <div className="market-center">Pos</div>
              <div className="market-center">Edad</div>
              <div className="market-num">Pot</div>
              <div className="market-num">Valor</div>
            </div>
            {selectedAgencyPlayers.map((p) => (
              <div key={p.id} className="row agency-players-table agency-player-row">
                <button type="button" className="shortlist-player-btn" onClick={() => onPlayerClick && onPlayerClick(p)}>
                  {p.name}
                </button>
                <div className="market-center">{p.data?.position || "—"}</div>
                <div className="market-center">{p.data?.bio?.age || 0}</div>
                <div className="market-num">{Number(p.data?.potential || 0)}</div>
                <div className="market-num">{fmt(Number(p.data?.market_value || 0))}</div>
              </div>
            ))}
            {selectedAgencyPlayers.length === 0 && (
              <div className="row empty">
                <div style={{ gridColumn: "1 / -1" }}>No hay jugadores asociados.</div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

