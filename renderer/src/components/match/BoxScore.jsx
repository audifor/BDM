import React, { useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

const COLUMNS = [
  { key: "player", label: "PLAYER", sortable: false },
  { key: "min", label: "MIN", sortable: true },
  { key: "pts", label: "PTS", sortable: true },
  { key: "reb", label: "REB", sortable: true },
  { key: "ast", label: "AST", sortable: true },
  { key: "stl", label: "STL", sortable: true },
  { key: "blk", label: "BLK", sortable: true },
  { key: "fg", label: "FG", sortable: false },
  { key: "tp", label: "3P", sortable: false },
  { key: "ft", label: "FT", sortable: false },
  { key: "ts", label: "TS%", sortable: true },
  { key: "efg", label: "eFG%", sortable: true },
  { key: "pm", label: "+/-", sortable: true },
];

export function BoxScore({ homeTeamName, awayTeamName, homeStats, awayStats }) {
  const [activeTeam, setActiveTeam] = useState("home");
  const [sortKey, setSortKey] = useState("pts");
  const [sortAsc, setSortAsc] = useState(false);

  const raw = activeTeam === "home" ? homeStats : awayStats;

  const sorted = [...raw].sort((a, b) => {
    const aVal = Number(a[sortKey] || 0);
    const bVal = Number(b[sortKey] || 0);
    return sortAsc ? aVal - bVal : bVal - aVal;
  });

  const handleSort = (key) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  return (
    <div className="box-score-cyber h-full flex flex-col">
      <div className="box-tabs">
        <button
          className={`tab ${activeTeam === "home" ? "active" : ""}`}
          onClick={() => setActiveTeam("home")}
        >
          {homeTeamName}
        </button>
        <button
          className={`tab ${activeTeam === "away" ? "active" : ""}`}
          onClick={() => setActiveTeam("away")}
        >
          {awayTeamName}
        </button>
      </div>

      <div className="box-table-wrapper">
        <table className="box-table">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={col.sortable ? "sortable" : ""}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <span>{col.label}</span>
                  {col.sortable && sortKey === col.key && (
                    sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.player_id}>
                <td className="player-cell">{p.name}</td>
                <td className="mono">{p.min ?? 0}</td>
                <td className="mono">{p.pts ?? 0}</td>
                <td className="mono">{p.reb ?? 0}</td>
                <td className="mono">{p.ast ?? 0}</td>
                <td className="mono">{p.stl ?? 0}</td>
                <td className="mono">{p.blk ?? 0}</td>
                <td className="mono">{p.fg ?? `${p.fgm ?? 0}/${p.fga ?? 0}`}</td>
                <td className="mono">{p.tp ?? `${p["3pm"] ?? 0}/${p["3pa"] ?? 0}`}</td>
                <td className="mono">{p.ft ?? `${p.ftm ?? 0}/${p.fta ?? 0}`}</td>
                <td className="mono">{p.ts ?? 0}</td>
                <td className="mono">{p.efg ?? 0}</td>
                <td className="mono">{p.pm ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default BoxScore;
