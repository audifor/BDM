import React, { useEffect, useMemo, useRef } from "react";

const normalize = (value) => String(value || "").trim().toLowerCase();

const buildHits = ({ query, players, teams, agencies, agents }) => {
  const q = normalize(query);
  if (!q) return [];

  const limitPerKind = 8;
  const hits = [];

  const push = (kind, id, title, sub) => {
    hits.push({ kind, id, title, sub });
  };

  const playerMatches = (players || [])
    .filter((p) => normalize(p?.name).includes(q))
    .slice(0, limitPerKind);
  playerMatches.forEach((p) => {
    const bio = p?.data?.bio || {};
    const pos = p?.data?.position || bio.pos || "";
    const age = bio.age != null ? `${bio.age}a` : "";
    const teamId = p?.data?.team_id;
    push("player", p.id, p.name || "Jugador", [pos, age, teamId ? `Team ${teamId}` : "Libre"].filter(Boolean).join(" · "));
  });

  const teamMatches = (teams || [])
    .filter((t) => normalize(t?.name).includes(q))
    .slice(0, limitPerKind);
  teamMatches.forEach((t) => {
    const league = t?.data?.league_id || t?.data?.league || "";
    push("team", t.id, t.name || "Equipo", league ? `Liga ${league}` : "");
  });

  const agencyMatches = (agencies || [])
    .filter((a) => normalize(a?.name).includes(q))
    .slice(0, limitPerKind);
  agencyMatches.forEach((a) => {
    push("agency", a.id, a.name || "Agencia", a?.data?.country || "");
  });

  const agentMatches = (agents || [])
    .filter((a) => normalize(a?.name).includes(q))
    .slice(0, limitPerKind);
  agentMatches.forEach((a) => {
    push("agent", a.agent_id || a.id, a.name || "Agente", a?.data?.style || "");
  });

  return hits.slice(0, 30);
};

export default function QuickSearchModal({
  open,
  query,
  onQueryChange,
  players = [],
  teams = [],
  agencies = [],
  agents = [],
  onSelect,
  onClose,
}) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus?.(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  const hits = useMemo(
    () => buildHits({ query, players, teams, agencies, agents }),
    [query, players, teams, agencies, agents],
  );

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose?.();
      return;
    }
    if (e.key === "Enter" && hits.length) {
      e.preventDefault();
      onSelect?.(hits[0]);
    }
  };

  if (!open) return null;

  return (
    <div className="simulate-modal quick-search" onClick={onClose}>
      <div className="simulate-modal-card quick-search-card" onClick={(e) => e.stopPropagation()}>
        <div className="simulate-modal-header">
          <div>
            <div className="eyebrow">Búsqueda global</div>
            <h3>Ir a…</h3>
          </div>
          <button className="close" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <div className="simulate-modal-body">
          <label>
            Buscar
            <input
              ref={inputRef}
              type="search"
              value={query}
              placeholder="Jugador, equipo, agencia, agente…"
              onChange={(e) => onQueryChange?.(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </label>

          <div className="quick-search-results">
            {hits.length === 0 ? (
              <div className="desc">Sin resultados.</div>
            ) : (
              hits.map((hit) => (
                <button
                  key={`${hit.kind}-${hit.id}-${hit.title}`}
                  type="button"
                  className="quick-search-hit"
                  onClick={() => onSelect?.(hit)}
                >
                  <span className="pill subtle">{hit.kind}</span>
                  <span className="quick-search-main">
                    <span className="quick-search-title">{hit.title}</span>
                    {hit.sub ? <span className="desc">{hit.sub}</span> : null}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
        <div className="simulate-modal-actions">
          <div className="desc">Tip: `Ctrl+K` o `/` · `Enter` abre el primero</div>
        </div>
      </div>
    </div>
  );
}

