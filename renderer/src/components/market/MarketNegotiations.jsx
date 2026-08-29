import React, { useEffect, useMemo, useState } from "react";

export default function MarketNegotiations({
  activeNegotiations = [],
  allPlayers = [],
  myTeamId,
  currentDate,
  selectedNegotiationId,
  onImproveOffer,
  onWithdrawOffer,
  onAcceptOffer,
  onRejectOffer,
  onEditOffer,
  onPlayerClick,
}) {
  const [activeTab, setActiveTab] = useState("outgoing"); // outgoing | incoming
  const [selectedNegotiation, setSelectedNegotiation] = useState(null);

  useEffect(() => {
    if (!selectedNegotiationId) return;
    const found = activeNegotiations.find((n) => String(n.id) === String(selectedNegotiationId));
    if (!found) return;
    setSelectedNegotiation(found);
    setActiveTab(found.type === "incoming" ? "incoming" : "outgoing");
  }, [activeNegotiations, selectedNegotiationId]);

  const { outgoing, incoming } = useMemo(() => {
    const out = activeNegotiations.filter((n) => n.type === "outgoing");
    const inc = activeNegotiations.filter((n) => n.type === "incoming");
    return { outgoing: out, incoming: inc };
  }, [activeNegotiations]);

  const getPlayerById = (playerId) => allPlayers.find((p) => String(p.id) === String(playerId)) || null;

  const getStatusInfo = (status) => {
    const statusMap = {
      pending: { label: "Pendiente", color: "#f59e0b" },
      club_accepted: { label: "Club aceptó", color: "#22c55e" },
      player_rejected: { label: "Jugador rechazó", color: "#ef4444" },
      negotiating_wage: { label: "Negociando salario", color: "#3b82f6" },
      agreed: { label: "Acuerdo", color: "#10b981" },
      rejected: { label: "Rechazado", color: "#dc2626" },
    };
    return statusMap[status] || { label: String(status || "—"), color: "#94a3b8" };
  };

  const parseIso = (value) => {
    if (!value) return null;
    const parts = String(value).split("-");
    if (parts.length !== 3) return null;
    const y = Number(parts[0]);
    const m = Number(parts[1]) - 1;
    const d = Number(parts[2]);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
    return new Date(y, m, d);
  };

  const parseUnix = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    return new Date(n < 1000000000000 ? n * 1000 : n);
  };

  const getDaysRemaining = (deadlineDate, legacyDeadline) => {
    const base = parseIso(currentDate) || new Date();
    const dl = parseIso(deadlineDate) || parseUnix(legacyDeadline);
    if (!dl) return null;
    const diff = dl.getTime() - base.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const fmt = (amount) => {
    const n = Number(amount || 0);
    if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
    return `$${n}`;
  };

  const activeList = activeTab === "incoming" ? incoming : outgoing;

  const openNegotiation = (neg) => {
    setSelectedNegotiation(neg);
  };

  const offerSummary = (offer) => {
    if (!offer) return "—";
    const years = Math.max(1, Number(offer.contract_years || offer.years || 0));
    const pt = offer.playing_time || offer.playingTime || "";
    return `${fmt(offer.fee)} · ${fmt(offer.wage)} · ${years} año(s)${pt ? ` · ${pt}` : ""}`;
  };

  const renderDetails = () => {
    if (!selectedNegotiation) return null;
    const player = getPlayerById(selectedNegotiation.player_id);
    const statusInfo = getStatusInfo(selectedNegotiation.status);
    const daysLeft = getDaysRemaining(selectedNegotiation.deadline_date, selectedNegotiation.deadline);
    const counter = selectedNegotiation.counter_offer || null;
    const baseOffer = counter && typeof counter === "object" ? counter : selectedNegotiation.current_offer;
    const history = Array.isArray(selectedNegotiation.history) ? selectedNegotiation.history : [];
    const messages = Array.isArray(selectedNegotiation.messages) ? selectedNegotiation.messages : [];

    return (
      <div className="card negotiation-detail modal-glass-tactical" style={{ gridColumn: "1 / -1" }}>
        <div className="card-header">
          <h3>Negociación</h3>
          <span className="pill" style={{ borderColor: statusInfo.color }}>
            {statusInfo.label}
          </span>
        </div>

        <div className="desc">
          Jugador:{" "}
          <button className="shortlist-player-btn" onClick={() => player && onPlayerClick && onPlayerClick(player)}>
            {player ? player.name : "—"}
          </button>
          {" · "}
          Deadline:{" "}
          {daysLeft === null ? "—" : daysLeft > 0 ? `${daysLeft} días` : "Expirada"}
          {selectedNegotiation.deadline_date ? ` · ${selectedNegotiation.deadline_date}` : ""}
        </div>

        <div className="negotiation-detail-grid">
          <div className="negotiation-detail-box">
            <div className="section-title">Oferta actual</div>
            <div className="negotiation-detail-line">{offerSummary(baseOffer)}</div>
            {Array.isArray(baseOffer?.clauses) && baseOffer.clauses.length > 0 && (
              <div className="negotiation-detail-line">Cláusulas: {baseOffer.clauses.join(", ")}</div>
            )}
            {Array.isArray(baseOffer?.bonuses) && baseOffer.bonuses.length > 0 && (
              <div className="negotiation-detail-line">Bonus: {baseOffer.bonuses.join(", ")}</div>
            )}
            {baseOffer?.playing_time && (
              <div className="negotiation-detail-line">Tiempo de juego: {baseOffer.playing_time}</div>
            )}
            {Array.isArray(baseOffer?.promises) && baseOffer.promises.length > 0 && (
              <div className="negotiation-detail-line">Promesas: {baseOffer.promises.join(", ")}</div>
            )}
          </div>

          {counter ? (
            <div className="negotiation-detail-box">
              <div className="section-title">Contraoferta</div>
              <div className="negotiation-detail-line">{offerSummary(counter)}</div>
              {Array.isArray(counter?.clauses) && counter.clauses.length > 0 && (
                <div className="negotiation-detail-line">Cláusulas: {counter.clauses.join(", ")}</div>
              )}
              {Array.isArray(counter?.bonuses) && counter.bonuses.length > 0 && (
                <div className="negotiation-detail-line">Bonus: {counter.bonuses.join(", ")}</div>
              )}
            </div>
          ) : (
            <div className="negotiation-detail-box">
              <div className="section-title">Historial</div>
              {history.length === 0 ? (
                <div className="negotiation-detail-line">—</div>
              ) : (
                history
                  .slice()
                  .reverse()
                  .slice(0, 6)
                  .map((h, idx) => (
                    <div key={h.timestamp || idx} className="negotiation-detail-line">
                      {h.description || "Evento"} {h.offer ? `· ${offerSummary(h.offer)}` : ""}
                    </div>
                  ))
              )}
            </div>
          )}
        </div>

        <div className="negotiation-detail-grid" style={{ marginTop: 10 }}>
          <div className="negotiation-detail-box" style={{ gridColumn: "1 / -1" }}>
            <div className="section-title">Mensajes</div>
            {messages.length === 0 ? (
              <div className="negotiation-detail-line">—</div>
            ) : (
              messages
                .slice()
                .reverse()
                .slice(0, 10)
                .map((m, idx) => (
                  <div key={`${m.date || "d"}-${idx}`} className="negotiation-detail-line">
                    <span className="pill subtle" style={{ marginRight: 8 }}>
                      {m.from || "system"}
                    </span>
                    {m.text || "—"}
                    {m.date ? <span className="desc" style={{ marginLeft: 8 }}>{m.date}</span> : null}
                  </div>
                ))
            )}
          </div>
        </div>

        <div className="negotiation-detail-actions">
          {selectedNegotiation.type === "outgoing" ? (
            <>
              <button className="subnav-item secondary" onClick={() => onEditOffer && onEditOffer(selectedNegotiation)}>
                Editar oferta
              </button>
              {(selectedNegotiation.status === "pending" || selectedNegotiation.status === "negotiating_wage") && (
                <>
                  <button className="subnav-item primary" onClick={() => onImproveOffer && onImproveOffer(selectedNegotiation.id)}>
                    Mejorar oferta
                  </button>
                  <button className="subnav-item secondary" onClick={() => onWithdrawOffer && onWithdrawOffer(selectedNegotiation.id)}>
                    Retirar
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              {selectedNegotiation.status === "pending" ? (
                <>
                  <button className="subnav-item primary" onClick={() => onAcceptOffer && onAcceptOffer(selectedNegotiation.id)}>
                    Aceptar
                  </button>
                  <button className="subnav-item secondary" onClick={() => onRejectOffer && onRejectOffer(selectedNegotiation.id)}>
                    Rechazar
                  </button>
                </>
              ) : (
                <span className="pill">Sin acciones disponibles</span>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <section className="bento market-negotiations">
      <div className="card hero modal-glass-tactical">
        <div className="card-header">
          <h2>Negociaciones</h2>
          <span className="pill">{activeNegotiations.length} en curso</span>
        </div>
        <div className="desc">Gestiona ofertas salientes y entrantes (estilo FM).</div>

        <div className="tabs-nav fm-tabs">
          <button
            className={`tab-btn ${activeTab === "outgoing" ? "active" : ""}`}
            onClick={() => setActiveTab("outgoing")}
          >
            Mis ofertas ({outgoing.length})
          </button>
          <button
            className={`tab-btn ${activeTab === "incoming" ? "active" : ""}`}
            onClick={() => setActiveTab("incoming")}
          >
            Recibidas ({incoming.length})
          </button>
        </div>
      </div>

      <div className="card results-table modal-glass-tactical" style={{ gridColumn: "1 / -1" }}>
        <div className="table negotiations-table scroll-x">
          <div className="row head negotiations-table">
            <div>Jugador</div>
            <div className="market-center">Estado</div>
            <div className="market-center">Tipo</div>
            <div>Oferta</div>
            <div className="market-center">Deadline</div>
            <div>Acciones</div>
          </div>

          {activeList.map((neg) => {
            const player = getPlayerById(neg.player_id);
            const statusInfo = getStatusInfo(neg.status);
            const daysLeft = getDaysRemaining(neg.deadline_date, neg.deadline);
            const selected = String(selectedNegotiation?.id || "") === String(neg.id);

            return (
              <div
                key={neg.id}
                className={`row negotiations-table negotiation-row ${selected ? "selected" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => openNegotiation(neg)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openNegotiation(neg);
                  }
                }}
              >
                <div className="shortlist-player-cell">
                  <button
                    type="button"
                    className="shortlist-player-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      player && onPlayerClick && onPlayerClick(player);
                    }}
                  >
                    {player ? player.name : "—"}
                  </button>
                  <div className="player-meta">{player?.data?.position || "—"}</div>
                </div>
                <div className="market-center" style={{ color: statusInfo.color }}>
                  {statusInfo.label}
                </div>
                <div className="market-center">{neg.type === "incoming" ? "Entrante" : "Saliente"}</div>
                <div>{offerSummary(neg.counter_offer || neg.current_offer)}</div>
                <div className={`market-center ${daysLeft !== null && daysLeft <= 2 ? "urgent" : ""}`}>
                  {daysLeft === null ? "—" : daysLeft > 0 ? `${daysLeft} días` : "Expirada"}
                </div>
                <div className="shortlist-actions-cell">
                  <button className="subnav-item secondary" onClick={() => openNegotiation(neg)}>
                    Ver
                  </button>
                  {neg.type === "outgoing" && (
                    <button className="subnav-item secondary" onClick={() => onEditOffer && onEditOffer(neg)}>
                      Editar
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {activeList.length === 0 && (
            <div className="row empty">
              <div style={{ gridColumn: "1 / -1" }}>
                {activeTab === "incoming" ? "No tienes ofertas entrantes." : "No tienes ofertas salientes."}
              </div>
            </div>
          )}
        </div>
      </div>

      {renderDetails()}
    </section>
  );
}
