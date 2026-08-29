import React, { useMemo } from "react";
import { BarChart3, TrendingUp, Shield, Crown } from "lucide-react";

const formatValue = (value, kind = "number") => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "--";
  if (kind === "pct") return `${num.toFixed(1)}%`;
  if (kind === "rate") return `${num.toFixed(3)}`;
  if (kind === "int") return `${Math.round(num)}`;
  return num.toFixed(2);
};

const METRICS_DEF = [
  { key: "pace", label: "Ritmo", kind: "number" },
  { key: "off_rating", label: "Off Rating", kind: "number" },
  { key: "def_rating", label: "Def Rating", kind: "number" },
  { key: "net_rating", label: "Net Rating", kind: "number" },
  { key: "efg_pct", label: "eFG%", kind: "pct" },
  { key: "ts_pct", label: "TS%", kind: "pct" },
  { key: "ast_pg", label: "Ast/G", kind: "number" },
  { key: "reb_pg", label: "Reb/G", kind: "number" },
  { key: "tov_pg", label: "TOV/G", kind: "number" },
  { key: "ft_rate", label: "FT Rate", kind: "rate" },
  { key: "tp_rate", label: "3P Rate", kind: "rate" },
];

const LEADER_SECTIONS = [
  { key: "points", label: "Anotadores", statLabel: "PPG" },
  { key: "rebounds", label: "Rebote", statLabel: "RPG" },
  { key: "assists", label: "Asistencias", statLabel: "APG" },
  { key: "impact", label: "Impacto", statLabel: "IMP" },
];

export default function ClubAnalytics({ teamName, analytics }) {
  const teamMetrics = analytics?.team_metrics || {};
  const leagueAvg = analytics?.league_averages || {};
  const teamRanks = analytics?.team_ranks || {};
  const leaders = analytics?.leaders || {};
  const awards = Array.isArray(analytics?.awards) ? analytics.awards : [];

  const summary = useMemo(() => {
    const games = teamMetrics?.games || 0;
    const wins = teamMetrics?.wins || 0;
    const losses = teamMetrics?.losses || 0;
    return { games, wins, losses };
  }, [teamMetrics]);

  const updatedAt = analytics?.updated_at ? new Date(analytics.updated_at * 1000).toLocaleString() : "--";

  return (
    <section className="bento club-analytics">
      <div className="card hero modal-glass-tactical">
        <div className="card-header">
          <h2>Analitica del Club</h2>
          <BarChart3 size={20} />
        </div>
        <div className="desc">
          {teamName || "Equipo"} · {analytics?.league_name || analytics?.league_id || "--"} ·{" "}
          {analytics?.season_label || "--"}
        </div>
        <div className="analytics-hero-meta">
          <div className="chip">Partidos: {summary.games}</div>
          <div className="chip">Record: {summary.wins}-{summary.losses}</div>
          <div className="chip">Actualizado: {updatedAt}</div>
        </div>
      </div>

      <div className="card modal-glass-tactical analytics-metrics-card">
        <div className="card-header">
          <h3>Comparador vs Liga</h3>
          <TrendingUp size={18} />
        </div>
        <div className="analytics-metrics-grid">
          {METRICS_DEF.map((metric) => {
            const teamValue = teamMetrics?.[metric.key];
            const leagueValue = leagueAvg?.[metric.key];
            const rank = teamRanks?.[metric.key];
            return (
              <div key={metric.key} className="analytics-metric">
                <div className="metric-label">{metric.label}</div>
                <div className="metric-value">{formatValue(teamValue, metric.kind)}</div>
                <div className="metric-sub">
                  Liga {formatValue(leagueValue, metric.kind)} · Rank {rank || "--"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card modal-glass-tactical analytics-leaders-card">
        <div className="card-header">
          <h3>Lideres de Liga</h3>
          <Shield size={18} />
        </div>
        <div className="analytics-leaders-grid">
          {LEADER_SECTIONS.map((section) => {
            const items = leaders?.[section.key] || [];
            return (
              <div key={section.key} className="leaders-panel">
                <div className="leaders-title">{section.label}</div>
                {items.length === 0 ? (
                  <div className="desc">Sin datos.</div>
                ) : (
                  <div className="leaders-list">
                    {items.map((item, idx) => (
                      <div key={`${section.key}-${item.player_id}-${idx}`} className="leaders-row">
                        <div className="leaders-rank">#{idx + 1}</div>
                        <div className="leaders-info">
                          <div className="leaders-name">{item.name}</div>
                          <div className="leaders-team">{item.team_name}</div>
                        </div>
                        <div className="leaders-value">
                          {formatValue(item.value, "number")} {section.statLabel}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card modal-glass-tactical analytics-awards-card">
        <div className="card-header">
          <h3>Premios</h3>
          <Crown size={18} />
        </div>
        {awards.length === 0 ? (
          <div className="desc">Sin premios definidos aun.</div>
        ) : (
          <div className="awards-grid">
            {awards.map((award, idx) => (
              <div key={`${award.id}-${idx}`} className="award-card">
                <div className="award-name">{award.name || award.id}</div>
                <div className="award-winner">{award.winner_name || "--"}</div>
                <div className="award-team">{award.team_name || "--"}</div>
                {award.value !== null && award.value !== undefined && (
                  <div className="award-stat">
                    {formatValue(award.value, "number")} {award.stat ? award.stat.toUpperCase() : ""}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
