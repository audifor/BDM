import React, { useMemo, useState } from "react";
import { Filter, Search, Star } from "lucide-react";

export default function MarketPlayerSearch({
  allPlayers = [],
  myTeamId,
  shortlist = [],
  onAddToShortlist,
  onRemoveFromShortlist,
  onMakeOffer,
  onAssignScout,
  onPlayerClick,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState({
    position: "",
    minAge: 16,
    maxAge: 40,
    minPrice: 0,
    maxPrice: 10000000,
    nationality: "",
    minHeight: 150,
    maxHeight: 230,
  });
  const [sortBy, setSortBy] = useState("potential"); // name | price | age | potential
  const [sortDirection, setSortDirection] = useState("desc");
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);

  const toInt = (value, fallback) => {
    const n = Number.parseInt(String(value), 10);
    return Number.isFinite(n) ? n : fallback;
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

  const isInShortlist = (playerId) => shortlist.some((p) => String(p.player_id) === String(playerId));

  const toggleShortlist = (playerId) => {
    const inShortlist = isInShortlist(playerId);
    if (inShortlist) onRemoveFromShortlist && onRemoveFromShortlist(playerId);
    else onAddToShortlist && onAddToShortlist(playerId);
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortDirection((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(column);
      setSortDirection("desc");
    }
  };

  const filteredPlayers = useMemo(() => {
    const q = String(searchQuery || "").trim().toLowerCase();
    const natQ = String(filters.nationality || "").trim().toLowerCase();

    const result = allPlayers
      .filter((p) => {
        if (myTeamId && String(p.data?.team_id) === String(myTeamId)) return false;

        const age = Number(p.data?.bio?.age || 0);
        const price = Number(p.data?.market_value || 0);
        const position = String(p.data?.position || "");
        const nationality = String(p.data?.bio?.nationality || "");
        const height = Number(p.data?.bio?.height || 180);

        if (q && !String(p.name || "").toLowerCase().includes(q)) return false;
        if (filters.position && position !== filters.position) return false;
        if (age < filters.minAge || age > filters.maxAge) return false;
        if (price < filters.minPrice || price > filters.maxPrice) return false;
        if (natQ && !nationality.toLowerCase().includes(natQ)) return false;
        if (height < filters.minHeight || height > filters.maxHeight) return false;

        return true;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case "name": {
            const av = String(a.name || "");
            const bv = String(b.name || "");
            return sortDirection === "desc" ? bv.localeCompare(av) : av.localeCompare(bv);
          }
          case "price": {
            const av = Number(a.data?.market_value || 0);
            const bv = Number(b.data?.market_value || 0);
            return sortDirection === "desc" ? bv - av : av - bv;
          }
          case "age": {
            const av = Number(a.data?.bio?.age || 0);
            const bv = Number(b.data?.bio?.age || 0);
            return sortDirection === "desc" ? bv - av : av - bv;
          }
          case "potential": {
            const av = Number(a.data?.potential || 0);
            const bv = Number(b.data?.potential || 0);
            return sortDirection === "desc" ? bv - av : av - bv;
          }
          default:
            return 0;
        }
      });

    return result;
  }, [allPlayers, filters, myTeamId, searchQuery, sortBy, sortDirection]);

  const selectedPlayer = useMemo(() => {
    if (!selectedPlayerId) return null;
    return allPlayers.find((p) => String(p.id) === String(selectedPlayerId)) || null;
  }, [allPlayers, selectedPlayerId]);

  const sortLabel = useMemo(() => {
    const map = { name: "Nombre", price: "Precio", age: "Edad", potential: "Potencial" };
    return map[sortBy] || "Orden";
  }, [sortBy]);

  const sortArrow = sortDirection === "desc" ? "▼" : "▲";

  const resultLimit = 200;
  const visiblePlayers = filteredPlayers.slice(0, resultLimit);

  return (
    <section className="bento market-player-search">
      <div className="card hero modal-glass-tactical">
        <div className="card-header">
          <h2>Búsqueda de jugadores</h2>
          <span className="pill">{filteredPlayers.length} resultados</span>
        </div>
        <div className="desc">Búsqueda con filtros y ordenación por columnas.</div>

        <div className="search-bar">
          <Search size={18} />
          <input
            type="text"
            placeholder="Buscar por nombre…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="card filters-card modal-glass-tactical">
        <div className="card-header">
          <h3>Filtros</h3>
          <Filter size={18} />
        </div>
        <div className="filters-grid">
          <div className="filter-group">
            <label>Posición</label>
            <select value={filters.position} onChange={(e) => setFilters({ ...filters, position: e.target.value })}>
              <option value="">Todas</option>
              <option value="PG">PG</option>
              <option value="SG">SG</option>
              <option value="SF">SF</option>
              <option value="PF">PF</option>
              <option value="C">C</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Edad: {filters.minAge} - {filters.maxAge}</label>
            <div className="range-inputs">
              <input
                type="number"
                min="16"
                max="40"
                value={filters.minAge}
                onChange={(e) => setFilters({ ...filters, minAge: toInt(e.target.value, 16) })}
              />
              <span>-</span>
              <input
                type="number"
                min="16"
                max="40"
                value={filters.maxAge}
                onChange={(e) => setFilters({ ...filters, maxAge: toInt(e.target.value, 40) })}
              />
            </div>
          </div>

          <div className="filter-group">
            <label>Precio</label>
            <div className="range-inputs">
              <input
                type="number"
                min="0"
                step="100000"
                value={filters.minPrice}
                onChange={(e) => setFilters({ ...filters, minPrice: toInt(e.target.value, 0) })}
              />
              <span>-</span>
              <input
                type="number"
                min="0"
                step="100000"
                value={filters.maxPrice}
                onChange={(e) => setFilters({ ...filters, maxPrice: toInt(e.target.value, 10000000) })}
              />
            </div>
          </div>

          <div className="filter-group">
            <label>Nacionalidad</label>
            <input
              type="text"
              value={filters.nationality}
              onChange={(e) => setFilters({ ...filters, nationality: e.target.value })}
              placeholder="Ej. ES, AR, US…"
            />
          </div>

          <div className="filter-group">
            <label>Altura: {filters.minHeight} - {filters.maxHeight} cm</label>
            <div className="range-inputs">
              <input
                type="number"
                min="140"
                max="260"
                value={filters.minHeight}
                onChange={(e) => setFilters({ ...filters, minHeight: toInt(e.target.value, 150) })}
              />
              <span>-</span>
              <input
                type="number"
                min="140"
                max="260"
                value={filters.maxHeight}
                onChange={(e) => setFilters({ ...filters, maxHeight: toInt(e.target.value, 230) })}
              />
            </div>
          </div>
        </div>

        <button
          className="subnav-item secondary"
          onClick={() =>
            setFilters({
              position: "",
              minAge: 16,
              maxAge: 40,
              minPrice: 0,
              maxPrice: 10000000,
              nationality: "",
              minHeight: 150,
              maxHeight: 230,
            })
          }
        >
          Limpiar filtros
        </button>
      </div>

      <div className="card results-table modal-glass-tactical" style={{ gridColumn: "1 / -1" }}>
        <div className="market-actionbar">
          <div className="market-actionbar-left">
            <span className="results-count">{filteredPlayers.length} jugadores</span>
            <span className="market-sort">
              Orden:{" "}
              <button type="button" className="market-sort-btn" onClick={() => handleSort(sortBy)}>
                {sortLabel} {sortArrow}
              </button>
            </span>
          </div>
          <div className="market-actionbar-right">
            {selectedPlayer ? (
              <>
                <span className="selected-player">
                  Seleccionado: <strong>{selectedPlayer.name}</strong>
                </span>
                <button className="subnav-item secondary" onClick={() => onPlayerClick && onPlayerClick(selectedPlayer)}>
                  Ficha
                </button>
                <button className="subnav-item secondary" onClick={() => onAssignScout && onAssignScout(selectedPlayer.id)}>
                  Scout
                </button>
                <button className="subnav-item secondary" onClick={() => toggleShortlist(selectedPlayer.id)}>
                  {isInShortlist(selectedPlayer.id) ? "Quitar objetivo" : "Añadir objetivo"}
                </button>
                <button className="subnav-item primary" onClick={() => onMakeOffer && onMakeOffer(selectedPlayer.id)}>
                  Hacer oferta
                </button>
                <button className="subnav-item secondary" onClick={() => setSelectedPlayerId(null)}>
                  Limpiar
                </button>
              </>
            ) : (
              <span className="selected-player muted">Selecciona un jugador para ver acciones.</span>
            )}
          </div>
        </div>

        <div className="table market-table">
          <div className="row head market-table">
            <div title="Objetivo">★</div>
            <button type="button" className="market-head-btn" onClick={() => handleSort("name")}>
              Nombre {sortBy === "name" ? sortArrow : ""}
            </button>
            <div>Pos</div>
            <button type="button" className="market-head-btn" onClick={() => handleSort("age")}>
              Edad {sortBy === "age" ? sortArrow : ""}
            </button>
            <div>Nac</div>
            <button type="button" className="market-head-btn market-num" onClick={() => handleSort("potential")}>
              Pot {sortBy === "potential" ? sortArrow : ""}
            </button>
            <button type="button" className="market-head-btn market-num" onClick={() => handleSort("price")}>
              Valor {sortBy === "price" ? sortArrow : ""}
            </button>
          </div>

          {visiblePlayers.map((player) => {
            const inShortlist = isInShortlist(player.id);
            const selected = String(selectedPlayerId || "") === String(player.id);
            const nationality = player.data?.bio?.nationality || "—";
            const position = player.data?.position || "—";
            const age = player.data?.bio?.age || 0;

            return (
              <div
                key={player.id}
                className={`row market-table market-row ${selected ? "selected" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedPlayerId(player.id)}
                onDoubleClick={() => onPlayerClick && onPlayerClick(player)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onPlayerClick && onPlayerClick(player);
                  }
                }}
              >
                <button
                  type="button"
                  className={`shortlist-btn ${inShortlist ? "active" : ""}`}
                  title={inShortlist ? "Quitar de objetivos" : "Añadir a objetivos"}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleShortlist(player.id);
                  }}
                >
                  <Star size={16} fill={inShortlist ? "#fbbf24" : "none"} />
                </button>

                <div className="market-name">
                  <div className="player-name-main">{player.name}</div>
                  <div className="player-meta">
                    {position} · {age} años · {nationality}
                  </div>
                </div>

                <div className="market-center">{position}</div>
                <div className="market-center">{age}</div>
                <div className="market-center">{nationality}</div>
                <div className="market-num">
                  {formatRange(player.data?.potential || 0, player.data?.scout_view?.ranges?.potential, (v) => v)}
                </div>
                <div className="market-num">
                  {formatRange(player.data?.market_value || 0, player.data?.scout_view?.ranges?.market_value, fmt)}
                </div>
              </div>
            );
          })}

          {filteredPlayers.length === 0 && (
            <div className="row empty">
              <div style={{ gridColumn: "1 / -1" }}>No se encontraron jugadores con los filtros actuales.</div>
            </div>
          )}
        </div>

        {filteredPlayers.length > resultLimit && (
          <div className="results-footer">
            Mostrando {resultLimit} de {filteredPlayers.length}. Refina tus filtros para ver más.
          </div>
        )}
      </div>
    </section>
  );
}

