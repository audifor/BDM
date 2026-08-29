import React, { useState, useMemo } from "react";
import { TrendingUp, TrendingDown, DollarSign, Target, AlertCircle, BarChart3 } from "lucide-react";

export default function MarketIntelligence({
  allPlayers = [],
  marketTrends = {},
  myTeam,
  onPlayerClick,
}) {
  const [activeView, setActiveView] = useState("overview"); // overview | value | trends

  // Calculate market statistics
  const marketStats = useMemo(() => {
    const positionGroups = { PG: [], SG: [], SF: [], PF: [], C: [] };
    let totalValue = 0;
    let avgAge = 0;

    allPlayers.forEach((p) => {
      const pos = p.data?.position || "C";
      const value = p.data?.market_value || 0;
      const age = p.data?.bio?.age || 25;

      if (positionGroups[pos]) {
        positionGroups[pos].push(p);
      }
      totalValue += value;
      avgAge += age;
    });

    const avgMarketValue = allPlayers.length > 0 ? totalValue / allPlayers.length : 0;
    avgAge = allPlayers.length > 0 ? avgAge / allPlayers.length : 0;

    // Calculate average value by position
    const avgByPosition = {};
    Object.keys(positionGroups).forEach((pos) => {
      const players = positionGroups[pos];
      if (players.length > 0) {
        const sum = players.reduce((acc, p) => acc + (p.data?.market_value || 0), 0);
        avgByPosition[pos] = sum / players.length;
      } else {
        avgByPosition[pos] = 0;
      }
    });

    return {
      totalPlayers: allPlayers.length,
      totalValue,
      avgMarketValue,
      avgAge,
      avgByPosition,
      positionGroups,
    };
  }, [allPlayers]);

  // Find value players (high potential, low market value)
  const valuePlayers = useMemo(() => {
    return allPlayers
      .filter((p) => {
        const potential = p.data?.potential || 0;
        const value = p.data?.market_value || 0;
        const age = p.data?.bio?.age || 30;

        return (
          potential >= 680 &&
          value < 1000000 &&
          age <= 28
        );
      })
      .sort((a, b) => (b.data?.potential || 0) - (a.data?.potential || 0))
      .slice(0, 10);
  }, [allPlayers]);

  // Find overpriced players (high value, low potential)
  const overpricedPlayers = useMemo(() => {
    return allPlayers
      .filter((p) => {
        const potential = p.data?.potential || 0;
        const value = p.data?.market_value || 0;
        const age = p.data?.bio?.age || 30;

        return (
          value > 2000000 &&
          potential <= 650 &&
          age >= 30
        );
      })
      .sort((a, b) => (b.data?.market_value || 0) - (a.data?.market_value || 0))
      .slice(0, 10);
  }, [allPlayers]);

  // Emerging talents (young, high potential)
  const emergingTalents = useMemo(() => {
    return allPlayers
      .filter((p) => {
        const age = p.data?.bio?.age || 30;
        const potential = p.data?.potential || 0;

        return age <= 22 && potential >= 720;
      })
      .sort((a, b) => (b.data?.potential || 0) - (a.data?.potential || 0))
      .slice(0, 10);
  }, [allPlayers]);

  const fmt = (amount) => {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount}`;
  };

  const renderPlayerRow = (player, showPotential = false) => {
    return (
      <div
        key={player.id}
        className="intelligence-player-row"
        onClick={() => onPlayerClick && onPlayerClick(player)}
      >
        <div className="player-info-intel">
          <div className="player-name-intel">{player.name}</div>
          <div className="player-meta-intel">
            {player.data?.position || "N/A"} • {player.data?.bio?.age || 0} años
          </div>
        </div>
        <div className="player-stats-intel">
          {showPotential && (
            <div className="stat-col">
              <span className="stat-label">Potencial</span>
              <span className="stat-value potential">{player.data?.potential || 0}</span>
            </div>
          )}
          <div className="stat-col">
            <span className="stat-label">Valor</span>
            <span className="stat-value">{fmt(player.data?.market_value || 0)}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section className="bento market-intelligence">
      <div className="card hero modal-glass-tactical">
        <div className="card-header">
          <h2>Análisis de Mercado</h2>
          <BarChart3 size={24} />
        </div>
        <div className="desc">
          Estadísticas del mercado, jugadores infravalorados y tendencias de precios.
        </div>

        <div className="tabs-nav">
          <button
            className={`tab-btn ${activeView === "overview" ? "active" : ""}`}
            onClick={() => setActiveView("overview")}
          >
            <Target size={18} />
            Resumen
          </button>
          <button
            className={`tab-btn ${activeView === "value" ? "active" : ""}`}
            onClick={() => setActiveView("value")}
          >
            <TrendingUp size={18} />
            Oportunidades
          </button>
          <button
            className={`tab-btn ${activeView === "trends" ? "active" : ""}`}
            onClick={() => setActiveView("trends")}
          >
            <BarChart3 size={18} />
            Tendencias
          </button>
        </div>
      </div>

      {activeView === "overview" && (
        <>
          <div className="card stats-overview modal-glass-tactical" style={{ gridColumn: "1 / -1" }}>
            <div className="card-header">
              <h3>Estadísticas del Mercado</h3>
            </div>
            <div className="market-stats-grid">
              <div className="market-stat-card">
                <div className="stat-icon">
                  <Target size={24} color="#3b82f6" />
                </div>
                <div className="stat-content">
                  <div className="stat-label">Jugadores Totales</div>
                  <div className="stat-value">{marketStats.totalPlayers}</div>
                </div>
              </div>
              <div className="market-stat-card">
                <div className="stat-icon">
                  <DollarSign size={24} color="#22c55e" />
                </div>
                <div className="stat-content">
                  <div className="stat-label">Valor Promedio</div>
                  <div className="stat-value">{fmt(marketStats.avgMarketValue)}</div>
                </div>
              </div>
              <div className="market-stat-card">
                <div className="stat-icon">
                  <AlertCircle size={24} color="#f59e0b" />
                </div>
                <div className="stat-content">
                  <div className="stat-label">Edad Promedio</div>
                  <div className="stat-value">{marketStats.avgAge.toFixed(1)} años</div>
                </div>
              </div>
            </div>

            <div className="position-breakdown">
              <h4>Valor Promedio por Posición</h4>
              <div className="position-bars">
                {Object.entries(marketStats.avgByPosition).map(([pos, value]) => {
                  const maxValue = Math.max(...Object.values(marketStats.avgByPosition));
                  const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;

                  return (
                    <div key={pos} className="position-bar-item">
                      <div className="position-label">{pos}</div>
                      <div className="position-bar-container">
                        <div
                          className="position-bar-fill"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <div className="position-value">{fmt(value)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {activeView === "value" && (
        <>
          <div className="card value-players modal-glass-tactical" style={{ gridColumn: "1 / -1" }}>
            <div className="card-header">
              <h3>Jugadores Infravalorados</h3>
              <TrendingUp size={20} color="#22c55e" />
            </div>
            <div className="desc">
              Jugadores jóvenes con alto potencial y bajo precio. Gran inversión a largo plazo.
            </div>
            <div className="players-list-intel">
              {valuePlayers.length === 0 ? (
                <div className="empty-state">
                  <p>No se encontraron jugadores infravalorados actualmente.</p>
                </div>
              ) : (
                valuePlayers.map((p) => renderPlayerRow(p, true))
              )}
            </div>
          </div>

          <div className="card emerging-talents modal-glass-tactical" style={{ gridColumn: "1 / -1" }}>
            <div className="card-header">
              <h3>Talentos Emergentes</h3>
              <Target size={20} color="#3b82f6" />
            </div>
            <div className="desc">
              Jugadores menores de 22 años con potencial de estrella (700+).
            </div>
            <div className="players-list-intel">
              {emergingTalents.length === 0 ? (
                <div className="empty-state">
                  <p>No hay talentos emergentes disponibles.</p>
                </div>
              ) : (
                emergingTalents.map((p) => renderPlayerRow(p, true))
              )}
            </div>
          </div>

          <div className="card overpriced-players modal-glass-tactical" style={{ gridColumn: "1 / -1" }}>
            <div className="card-header">
              <h3>Jugadores Sobrevalorados</h3>
              <TrendingDown size={20} color="#ef4444" />
            </div>
            <div className="desc">
              Jugadores caros con bajo potencial de crecimiento. Evitar si buscas inversión.
            </div>
            <div className="players-list-intel">
              {overpricedPlayers.length === 0 ? (
                <div className="empty-state">
                  <p>No hay jugadores sobrevalorados identificados.</p>
                </div>
              ) : (
                overpricedPlayers.map((p) => renderPlayerRow(p, false))
              )}
            </div>
          </div>
        </>
      )}

      {activeView === "trends" && (
        <div className="card trends-card modal-glass-tactical" style={{ gridColumn: "1 / -1" }}>
          <div className="card-header">
            <h3>Tendencias del Mercado</h3>
          </div>
          <div className="trends-list">
            <div className="trend-item">
              <TrendingUp size={20} color="#22c55e" />
              <div className="trend-content">
                <div className="trend-title">Bases (PG) en alza</div>
                <div className="trend-desc">
                  Los bases de alto nivel están aumentando de valor debido a la demanda.
                </div>
              </div>
            </div>
            <div className="trend-item">
              <TrendingDown size={20} color="#ef4444" />
              <div className="trend-content">
                <div className="trend-title">Veteranos en caída</div>
                <div className="trend-desc">
                  Jugadores mayores de 33 años están perdiendo valor rápidamente.
                </div>
              </div>
            </div>
            <div className="trend-item">
              <Target size={20} color="#3b82f6" />
              <div className="trend-content">
                <div className="trend-title">Talentos internacionales</div>
                <div className="trend-desc">
                  Jugadores extranjeros jóvenes son una gran oportunidad de inversión.
                </div>
              </div>
            </div>
            <div className="trend-item">
              <DollarSign size={20} color="#f59e0b" />
              <div className="trend-content">
                <div className="trend-title">Inflación general</div>
                <div className="trend-desc">
                  El valor promedio del mercado ha aumentado un 8% esta temporada.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
