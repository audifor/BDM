import React, { useMemo, useState } from "react";

export default function MarketShortlist({
  shortlist = [],
  allPlayers = [],
  onRemoveFromShortlist,
  onChangePriority,
  onChangeStatus,
  onAddNote,
  onMakeOffer,
  onPlayerClick,
}) {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingNote, setEditingNote] = useState(null);
  const [noteText, setNoteText] = useState("");

  const PRIORITIES = {
    high: { label: "Alta", color: "#ef4444" },
    medium: { label: "Media", color: "#f59e0b" },
    low: { label: "Baja", color: "#3b82f6" },
  };

  const STATUSES = {
    watching: { label: "Observando", color: "#94a3b8" },
    negotiating: { label: "Negociando", color: "#f59e0b" },
    agreed: { label: "Acordado", color: "#22c55e" },
    rejected: { label: "Rechazado", color: "#ef4444" },
  };

  const fmt = (amount) => {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount}`;
  };

  const formatRange = (value, range, formatter) => {
    if (range && typeof range.min === "number" && typeof range.max === "number") {
      if (range.min !== range.max) return `${formatter(range.min)}-${formatter(range.max)}`;
      return formatter(range.min);
    }
    return formatter(value);
  };

  const getPlayerData = (playerId) => allPlayers.find((p) => String(p.id) === String(playerId)) || null;

  const counts = useMemo(() => {
    return {
      all: shortlist.length,
      high: shortlist.filter((s) => s.priority === "high").length,
      medium: shortlist.filter((s) => s.priority === "medium").length,
      low: shortlist.filter((s) => s.priority === "low").length,
    };
  }, [shortlist]);

  const filteredShortlist = useMemo(() => {
    const q = String(searchQuery || "").trim().toLowerCase();
    return shortlist.filter((item) => {
      if (selectedCategory !== "all" && item.priority !== selectedCategory) return false;
      if (!q) return true;
      const player = getPlayerData(item.player_id);
      if (!player) return false;
      return String(player.name || "").toLowerCase().includes(q);
    });
  }, [getPlayerData, searchQuery, selectedCategory, shortlist]);

  const positionCounts = useMemo(() => {
    const countsByPos = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
    for (const item of shortlist) {
      const player = getPlayerData(item.player_id);
      const pos = player?.data?.position;
      if (pos && countsByPos[pos] !== undefined) countsByPos[pos] += 1;
    }
    return countsByPos;
  }, [getPlayerData, shortlist]);

  const handleSaveNote = (itemId) => {
    onAddNote && onAddNote(itemId, noteText);
    setEditingNote(null);
    setNoteText("");
  };

  const formatAddedAt = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return "—";
    const d = new Date(n < 1000000000000 ? n * 1000 : n);
    return d.toLocaleDateString();
  };

  return (
    <section className="bento market-shortlist">
      <div className="card hero modal-glass-tactical">
        <div className="card-header">
          <h2>Objetivos</h2>
          <span className="pill">{shortlist.length} jugadores</span>
        </div>
        <div className="desc">Prioriza, añade notas y lanza ofertas desde una lista estilo FM.</div>

        <div className="shortlist-controls-bar">
          <div className="shortlist-filters">
            <div className="filter-group">
              <label>Prioridad</label>
              <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                <option value="all">Todas ({counts.all})</option>
                <option value="high">Alta ({counts.high})</option>
                <option value="medium">Media ({counts.medium})</option>
                <option value="low">Baja ({counts.low})</option>
              </select>
            </div>
            <div className="filter-group">
              <label>Buscar</label>
              <input
                type="text"
                value={searchQuery}
                placeholder="Nombre…"
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="shortlist-summary">
            Necesidades: PG {positionCounts.PG} · SG {positionCounts.SG} · SF {positionCounts.SF} · PF{" "}
            {positionCounts.PF} · C {positionCounts.C}
          </div>
        </div>
      </div>

      <div className="card results-table modal-glass-tactical" style={{ gridColumn: "1 / -1" }}>
        <div className="table shortlist-table scroll-x">
          <div className="row head shortlist-table">
            <div>Jugador</div>
            <div>Pos</div>
            <div>Edad</div>
            <div>Nac</div>
            <div>Prioridad</div>
            <div>Estado</div>
            <div className="market-num">Pot</div>
            <div className="market-num">Valor</div>
            <div>Notas</div>
            <div>Añadido</div>
            <div>Acciones</div>
          </div>

          {filteredShortlist.map((item) => {
            const player = getPlayerData(item.player_id);
            if (!player) return null;

            const pr = PRIORITIES[item.priority] || PRIORITIES.medium;
            const st = STATUSES[item.status] || STATUSES.watching;
            const nationality = player.data?.bio?.nationality || "—";
            const position = player.data?.position || "—";
            const age = player.data?.bio?.age || 0;

            return (
              <div
                key={item.id}
                className="row shortlist-table shortlist-row"
                role="button"
                tabIndex={0}
                onDoubleClick={() => onPlayerClick && onPlayerClick(player)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onPlayerClick && onPlayerClick(player);
                  }
                }}
              >
                <div className="shortlist-player-cell">
                  <button
                    type="button"
                    className="shortlist-player-btn"
                    onClick={() => onPlayerClick && onPlayerClick(player)}
                    title="Abrir ficha"
                  >
                    {player.name}
                  </button>
                  <div className="player-meta">{position} · {age} años · {nationality}</div>
                </div>
                <div className="market-center">{position}</div>
                <div className="market-center">{age}</div>
                <div className="market-center">{nationality}</div>
                <div>
                  <select
                    value={item.priority}
                    onChange={(e) => onChangePriority && onChangePriority(item.id, e.target.value)}
                    style={{ color: pr.color }}
                  >
                    <option value="high">Alta</option>
                    <option value="medium">Media</option>
                    <option value="low">Baja</option>
                  </select>
                </div>
                <div>
                  <select
                    value={item.status}
                    onChange={(e) => onChangeStatus && onChangeStatus(item.id, e.target.value)}
                    style={{ color: st.color }}
                  >
                    <option value="watching">Observando</option>
                    <option value="negotiating">Negociando</option>
                    <option value="agreed">Acordado</option>
                    <option value="rejected">Rechazado</option>
                  </select>
                </div>
                <div className="market-num">
                  {formatRange(player.data?.potential || 0, player.data?.scout_view?.ranges?.potential, (v) => v)}
                </div>
                <div className="market-num">
                  {formatRange(player.data?.market_value || 0, player.data?.scout_view?.ranges?.market_value, fmt)}
                </div>
                <div className="shortlist-notes-cell">
                  {editingNote === item.id ? (
                    <div className="shortlist-note-editor">
                      <input
                        type="text"
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder="Escribe una nota…"
                      />
                      <div className="shortlist-note-actions">
                        <button className="subnav-item primary" onClick={() => handleSaveNote(item.id)}>
                          Guardar
                        </button>
                        <button
                          className="subnav-item secondary"
                          onClick={() => {
                            setEditingNote(null);
                            setNoteText("");
                          }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="shortlist-note-read">
                      <div className="shortlist-note-text">{item.notes || "—"}</div>
                      <button
                        type="button"
                        className="shortlist-note-edit"
                        onClick={() => {
                          setEditingNote(item.id);
                          setNoteText(item.notes || "");
                        }}
                      >
                        Editar
                      </button>
                    </div>
                  )}
                </div>
                <div className="market-center">{formatAddedAt(item.added_at)}</div>
                <div className="shortlist-actions-cell">
                  <button className="subnav-item secondary" onClick={() => onPlayerClick && onPlayerClick(player)}>
                    Ficha
                  </button>
                  <button className="subnav-item primary" onClick={() => onMakeOffer && onMakeOffer(item.player_id)}>
                    Oferta
                  </button>
                  <button
                    className="subnav-item secondary"
                    onClick={() => onRemoveFromShortlist && onRemoveFromShortlist(item.player_id)}
                  >
                    Quitar
                  </button>
                </div>
              </div>
            );
          })}

          {filteredShortlist.length === 0 && (
            <div className="row empty">
              <div style={{ gridColumn: "1 / -1" }}>No hay jugadores en esta vista.</div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

