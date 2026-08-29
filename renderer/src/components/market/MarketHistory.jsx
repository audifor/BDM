import React, { useState, useMemo } from "react";
import { ArrowDownRight, ArrowUpRight, Calendar, DollarSign, TrendingUp, TrendingDown, Filter } from "lucide-react";

export default function MarketHistory({
  transferHistory = [],
  allPlayers = [],
  currentSeason = 2024,
  onPlayerClick,
}) {
  const [filterType, setFilterType] = useState("all"); // all | in | out | loan_in | loan_out
  const [selectedSeason, setSelectedSeason] = useState("all");

  // Get unique seasons from history
  const seasons = useMemo(() => {
    const seasonSet = new Set();
    transferHistory.forEach((t) => {
      const date = new Date(t.date);
      seasonSet.add(date.getFullYear());
    });
    return Array.from(seasonSet).sort((a, b) => b - a);
  }, [transferHistory]);

  // Filter transfers
  const filteredTransfers = useMemo(() => {
    let filtered = transferHistory;

    if (filterType !== "all") {
      filtered = filtered.filter((t) => t.type === filterType);
    }

    if (selectedSeason !== "all") {
      filtered = filtered.filter((t) => {
        const date = new Date(t.date);
        return date.getFullYear() === parseInt(selectedSeason);
      });
    }

    return filtered.sort((a, b) => b.date - a.date);
  }, [transferHistory, filterType, selectedSeason]);

  // Calculate statistics
  const stats = useMemo(() => {
    const totalSpent = transferHistory
      .filter((t) => t.type === "in" || t.type === "loan_in")
      .reduce((sum, t) => sum + (t.fee || 0), 0);

    const totalReceived = transferHistory
      .filter((t) => t.type === "out" || t.type === "loan_out")
      .reduce((sum, t) => sum + (t.fee || 0), 0);

    const netSpend = totalSpent - totalReceived;

    const transfers_in = transferHistory.filter((t) => t.type === "in").length;
    const transfers_out = transferHistory.filter((t) => t.type === "out").length;
    const loans_in = transferHistory.filter((t) => t.type === "loan_in").length;
    const loans_out = transferHistory.filter((t) => t.type === "loan_out").length;

    return {
      totalSpent,
      totalReceived,
      netSpend,
      transfers_in,
      transfers_out,
      loans_in,
      loans_out,
      totalTransfers: transferHistory.length,
    };
  }, [transferHistory]);

  const getPlayerById = (playerId) => {
    return allPlayers.find((p) => p.id === playerId);
  };

  const getTypeInfo = (type) => {
    const typeMap = {
      in: { label: "Fichaje", icon: <ArrowDownRight size={20} color="#22c55e" />, color: "#22c55e" },
      out: { label: "Salida", icon: <ArrowUpRight size={20} color="#ef4444" />, color: "#ef4444" },
      loan_in: { label: "Préstamo In", icon: <ArrowDownRight size={20} color="#3b82f6" />, color: "#3b82f6" },
      loan_out: { label: "Préstamo Out", icon: <ArrowUpRight size={20} color="#f59e0b" />, color: "#f59e0b" },
    };
    return typeMap[type] || { label: type, icon: null, color: "#6b7280" };
  };

  const fmt = (amount) => {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount}`;
  };

  const renderTransferRow = (transfer) => {
    const player = getPlayerById(transfer.player_id);
    const typeInfo = getTypeInfo(transfer.type);
    const date = new Date(transfer.date).toLocaleDateString();

    return (
      <div key={transfer.id || `${transfer.player_id}-${transfer.date}`} className="transfer-row">
        <div className="transfer-type-icon">{typeInfo.icon}</div>
        <div className="transfer-info">
          <div
            className="transfer-player-name"
            onClick={() => player && onPlayerClick && onPlayerClick(player)}
          >
            {player?.name || "Jugador Desconocido"}
          </div>
          <div className="transfer-meta">
            {typeInfo.label} • {date}
          </div>
          <div className="transfer-teams">
            <span className="team-name">{transfer.from_team || "N/A"}</span>
            <span className="arrow">→</span>
            <span className="team-name">{transfer.to_team || "N/A"}</span>
          </div>
        </div>
        <div className="transfer-fee" style={{ color: typeInfo.color }}>
          {transfer.fee ? fmt(transfer.fee) : "Gratis"}
        </div>
      </div>
    );
  };

  return (
    <section className="bento market-history">
      <div className="card hero modal-glass-tactical">
        <div className="card-header">
          <h2>Historial de Fichajes</h2>
          <span className="pill">{stats.totalTransfers} operaciones</span>
        </div>
        <div className="desc">
          Registro completo de todas las operaciones de mercado del club.
        </div>

        <div className="history-stats-grid">
          <div className="history-stat-card">
            <div className="stat-icon">
              <ArrowDownRight size={24} color="#22c55e" />
            </div>
            <div className="stat-content">
              <div className="stat-label">Gastado</div>
              <div className="stat-value" style={{ color: "#ef4444" }}>
                {fmt(stats.totalSpent)}
              </div>
              <div className="stat-subtitle">{stats.transfers_in} fichajes</div>
            </div>
          </div>

          <div className="history-stat-card">
            <div className="stat-icon">
              <ArrowUpRight size={24} color="#ef4444" />
            </div>
            <div className="stat-content">
              <div className="stat-label">Ingresado</div>
              <div className="stat-value" style={{ color: "#22c55e" }}>
                {fmt(stats.totalReceived)}
              </div>
              <div className="stat-subtitle">{stats.transfers_out} ventas</div>
            </div>
          </div>

          <div className="history-stat-card">
            <div className="stat-icon">
              {stats.netSpend < 0 ? (
                <TrendingUp size={24} color="#22c55e" />
              ) : (
                <TrendingDown size={24} color="#ef4444" />
              )}
            </div>
            <div className="stat-content">
              <div className="stat-label">Balance Neto</div>
              <div
                className="stat-value"
                style={{ color: stats.netSpend < 0 ? "#22c55e" : "#ef4444" }}
              >
                {fmt(Math.abs(stats.netSpend))}
              </div>
              <div className="stat-subtitle">{stats.netSpend < 0 ? "Ganancia" : "Gasto"}</div>
            </div>
          </div>

          <div className="history-stat-card">
            <div className="stat-icon">
              <Calendar size={24} color="#3b82f6" />
            </div>
            <div className="stat-content">
              <div className="stat-label">Préstamos</div>
              <div className="stat-value">{stats.loans_in + stats.loans_out}</div>
              <div className="stat-subtitle">
                {stats.loans_in} in • {stats.loans_out} out
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card filters-card modal-glass-tactical" style={{ gridColumn: "1 / -1" }}>
        <div className="card-header">
          <h3>Filtros</h3>
          <Filter size={18} />
        </div>
        <div className="filters-row">
          <div className="filter-group">
            <label>Tipo de Operación</label>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="all">Todas</option>
              <option value="in">Fichajes</option>
              <option value="out">Ventas</option>
              <option value="loan_in">Préstamos In</option>
              <option value="loan_out">Préstamos Out</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Temporada</label>
            <select value={selectedSeason} onChange={(e) => setSelectedSeason(e.target.value)}>
              <option value="all">Todas</option>
              {seasons.map((season) => (
                <option key={season} value={season}>
                  {season}
                </option>
              ))}
            </select>
          </div>
          <button
            className="subnav-item secondary"
            onClick={() => {
              setFilterType("all");
              setSelectedSeason("all");
            }}
          >
            Limpiar Filtros
          </button>
        </div>
      </div>

      {/* Transfer List */}
      <div className="card transfers-list-card modal-glass-tactical" style={{ gridColumn: "1 / -1" }}>
        <div className="card-header">
          <h3>Operaciones ({filteredTransfers.length})</h3>
        </div>

        <div className="transfers-list">
          {filteredTransfers.length === 0 ? (
            <div className="empty-state">
              <p>No hay operaciones con los filtros seleccionados.</p>
            </div>
          ) : (
            filteredTransfers.map(renderTransferRow)
          )}
        </div>
      </div>

      {/* Most Expensive Transfers */}
      {transferHistory.length > 0 && (
        <div className="card expensive-transfers modal-glass-tactical" style={{ gridColumn: "1 / -1" }}>
          <div className="card-header">
            <h3>Fichajes Más Caros</h3>
            <DollarSign size={20} />
          </div>
          <div className="top-transfers-list">
            {transferHistory
              .filter((t) => t.type === "in" && t.fee > 0)
              .sort((a, b) => b.fee - a.fee)
              .slice(0, 5)
              .map((transfer) => {
                const player = getPlayerById(transfer.player_id);
                return (
                  <div key={transfer.player_id} className="top-transfer-item">
                    <div className="rank">#{transferHistory.filter((t) => t.type === "in" && t.fee > transfer.fee).length + 1}</div>
                    <div
                      className="player-name-top"
                      onClick={() => player && onPlayerClick && onPlayerClick(player)}
                    >
                      {player?.name || "Jugador Desconocido"}
                    </div>
                    <div className="transfer-fee-top">{fmt(transfer.fee)}</div>
                    <div className="transfer-date-top">
                      {new Date(transfer.date).getFullYear()}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </section>
  );
}
