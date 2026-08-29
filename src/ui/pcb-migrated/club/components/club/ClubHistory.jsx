import React, { useMemo, useState } from "react";

export default function ClubHistory({
  trophies = [],
  records = {},
  hallOfFame = [],
  milestones = [],
  seasonHistory = [],
  clubFounded = 1990,
}) {
  const [activeTab, setActiveTab] = useState("trophies"); // trophies | records | hof | milestones | seasons
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedLegendId, setSelectedLegendId] = useState(null);

  const currentYear = new Date().getFullYear();
  const clubAge = currentYear - Number(clubFounded || currentYear);

  const TROPHY_CATEGORIES = useMemo(
    () => ({
      league: { label: "Ligas" },
      cup: { label: "Copas" },
      international: { label: "Internacional" },
      friendly: { label: "Amistosos" },
    }),
    [],
  );

  const groupedTrophies = useMemo(() => {
    return (trophies || []).reduce((acc, trophy) => {
      const cat = trophy.category || "league";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(trophy);
      return acc;
    }, {});
  }, [trophies]);

  const filteredTrophies = useMemo(() => {
    if (selectedCategory === "all") return trophies || [];
    return groupedTrophies[selectedCategory] || [];
  }, [groupedTrophies, selectedCategory, trophies]);

  const recordsRows = useMemo(() => {
    const entries = Object.entries(records || {});
    return entries
      .map(([key, data]) => {
        const label = data?.label || key.replace(/_/g, " ");
        const value = data?.value ?? "â€”";
        const holder = data?.holder || "â€”";
        const date = data?.date ? new Date(Number(data.date) * 1000).toLocaleDateString() : "â€”";
        const category = key.split("_")[0] || "other";
        return { key, category, label, value, holder, date };
      })
      .sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label));
  }, [records]);

  const selectedLegend = useMemo(() => {
    if (!selectedLegendId) return null;
    return (hallOfFame || []).find((p) => String(p.id) === String(selectedLegendId)) || null;
  }, [hallOfFame, selectedLegendId]);

  const sortedMilestones = useMemo(() => {
    return (milestones || [])
      .slice()
      .sort((a, b) => Number(b.date || b.when || 0) - Number(a.date || a.when || 0));
  }, [milestones]);

  const sortedSeasons = useMemo(() => {
    return (seasonHistory || [])
      .slice()
      .sort((a, b) => Number(b.season_year || b.season_id || 0) - Number(a.season_year || a.season_id || 0));
  }, [seasonHistory]);

  const TrophiesPanel = () => {
    const counts = {
      all: (trophies || []).length,
      league: groupedTrophies.league?.length || 0,
      cup: groupedTrophies.cup?.length || 0,
      international: groupedTrophies.international?.length || 0,
      friendly: groupedTrophies.friendly?.length || 0,
    };

    return (
      <div className="card modal-glass-tactical" style={{ gridColumn: "1 / -1" }}>
        <div className="card-header">
          <h3>Trofeos</h3>
          <span className="pill">{filteredTrophies.length}</span>
        </div>

        <div className="shortlist-controls-bar">
          <div className="shortlist-filters">
            <div className="filter-group">
              <label>CategorÃ­a</label>
              <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                <option value="all">Todas ({counts.all})</option>
                <option value="league">Ligas ({counts.league})</option>
                <option value="cup">Copas ({counts.cup})</option>
                <option value="international">Internacional ({counts.international})</option>
                <option value="friendly">Amistosos ({counts.friendly})</option>
              </select>
            </div>
          </div>
          <div className="shortlist-summary">Fundado: {clubFounded} Â· Edad: {clubAge} aÃ±os</div>
        </div>

        <div className="table club-trophies-table scroll-x" style={{ marginTop: 10 }}>
          <div className="row head club-trophies-table">
            <div>Temporada</div>
            <div>Trofeo</div>
            <div>CategorÃ­a</div>
            <div>Marcador</div>
            <div>MVP</div>
          </div>
          {filteredTrophies
            .slice()
            .sort((a, b) => Number(b.season || 0) - Number(a.season || 0))
            .map((trophy, idx) => (
              <div key={idx} className="row club-trophies-table">
                <div className="mono">{trophy.season ?? "â€”"}</div>
                <div>{trophy.name || "â€”"}</div>
                <div>{TROPHY_CATEGORIES[trophy.category]?.label || TROPHY_CATEGORIES.league.label}</div>
                <div className="mono">{trophy.final_score || "â€”"}</div>
                <div>{trophy.mvp || "â€”"}</div>
              </div>
            ))}
          {filteredTrophies.length === 0 && (
            <div className="row empty">
              <div style={{ gridColumn: "1 / -1" }}>No hay trofeos en esta vista.</div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const RecordsPanel = () => {
    return (
      <div className="card modal-glass-tactical" style={{ gridColumn: "1 / -1" }}>
        <div className="card-header">
          <h3>RÃ©cords</h3>
          <span className="pill">{recordsRows.length}</span>
        </div>
        <div className="desc">Listado denso (estilo FM) de rÃ©cords del club.</div>

        <div className="table club-records-table scroll-x" style={{ marginTop: 10 }}>
          <div className="row head club-records-table">
            <div>CategorÃ­a</div>
            <div>RÃ©cord</div>
            <div className="market-num">Valor</div>
            <div>Titular</div>
            <div>Fecha</div>
          </div>
          {recordsRows.map((r) => (
            <div key={r.key} className="row club-records-table">
              <div className="mono">{String(r.category || "").toUpperCase()}</div>
              <div>{r.label}</div>
              <div className="market-num mono">{r.value}</div>
              <div>{r.holder}</div>
              <div className="mono">{r.date}</div>
            </div>
          ))}
          {recordsRows.length === 0 && (
            <div className="row empty">
              <div style={{ gridColumn: "1 / -1" }}>No hay rÃ©cords establecidos.</div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const HallOfFamePanel = () => {
    const sorted = (hallOfFame || [])
      .slice()
      .sort((a, b) => Number(b.total_points || 0) - Number(a.total_points || 0));

    return (
      <>
        <div className="card modal-glass-tactical" style={{ gridColumn: "1 / -1" }}>
          <div className="card-header">
            <h3>SalÃ³n de la fama</h3>
            <span className="pill">{sorted.length}</span>
          </div>
          <div className="desc">Leyendas del club.</div>

          <div className="table club-hof-table scroll-x" style={{ marginTop: 10 }}>
            <div className="row head club-hof-table">
              <div>Jugador</div>
              <div className="market-center">Pos</div>
              <div className="market-center">AÃ±os</div>
              <div className="market-num">PJ</div>
              <div className="market-num">PTS</div>
              <div className="market-num">PPG</div>
            </div>
            {sorted.map((p) => (
              <div
                key={p.id}
                className={`row club-hof-table ${String(selectedLegendId || "") === String(p.id) ? "selected" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedLegendId(p.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedLegendId(p.id);
                  }
                }}
              >
                <div className="mono">{p.name || "â€”"}</div>
                <div className="market-center">{p.position || "â€”"}</div>
                <div className="market-center mono">
                  {p.years_start ?? "â€”"}-{p.years_end ?? "â€”"}
                </div>
                <div className="market-num mono">{p.games_played ?? 0}</div>
                <div className="market-num mono">{p.total_points ?? 0}</div>
                <div className="market-num mono">{Number.isFinite(Number(p.avg_ppg)) ? Number(p.avg_ppg).toFixed(1) : "0.0"}</div>
              </div>
            ))}
            {sorted.length === 0 && (
              <div className="row empty">
                <div style={{ gridColumn: "1 / -1" }}>AÃºn no hay jugadores en el salÃ³n de la fama.</div>
              </div>
            )}
          </div>
        </div>

        {selectedLegend && (
          <div className="card modal-glass-tactical" style={{ gridColumn: "1 / -1" }}>
            <div className="card-header">
              <h3>{selectedLegend.name}</h3>
              <button className="subnav-item secondary" type="button" onClick={() => setSelectedLegendId(null)}>
                Cerrar
              </button>
            </div>
            <div className="desc">
              {selectedLegend.position || "â€”"} Â· {selectedLegend.years_start ?? "â€”"}-{selectedLegend.years_end ?? "â€”"}
            </div>
            <div className="table club-hof-detail-table scroll-x" style={{ marginTop: 10 }}>
              <div className="row head club-hof-detail-table">
                <div>Logros</div>
              </div>
              <div className="row club-hof-detail-table">
                <div>{Array.isArray(selectedLegend.achievements) && selectedLegend.achievements.length ? selectedLegend.achievements.join(", ") : "â€”"}</div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  };

  const MilestonesPanel = () => {
    const fmtDate = (value) => {
      if (!value) return "â€”";
      const n = Number(value);
      const d = Number.isFinite(n) ? new Date(n < 1e12 ? n * 1000 : n) : new Date(String(value));
      if (Number.isNaN(d.getTime())) return "â€”";
      return d.toLocaleDateString();
    };

    return (
      <div className="card modal-glass-tactical" style={{ gridColumn: "1 / -1" }}>
        <div className="card-header">
          <h3>Hitos</h3>
          <span className="pill">{sortedMilestones.length}</span>
        </div>

        <div className="table club-milestones-table scroll-x" style={{ marginTop: 10 }}>
          <div className="row head club-milestones-table">
            <div>Fecha</div>
            <div>Hito</div>
            <div>Detalle</div>
          </div>
          {sortedMilestones.map((m, idx) => (
            <div key={m.id || idx} className="row club-milestones-table">
              <div className="mono">{fmtDate(m.date || m.when)}</div>
              <div>{m.title || m.label || "â€”"}</div>
              <div className="desc" style={{ margin: 0 }}>{m.description || m.text || m.detail || "â€”"}</div>
            </div>
          ))}
          {sortedMilestones.length === 0 && (
            <div className="row empty">
              <div style={{ gridColumn: "1 / -1" }}>No hay hitos registrados.</div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const SeasonsPanel = () => {
    return (
      <div className="card modal-glass-tactical" style={{ gridColumn: "1 / -1" }}>
        <div className="card-header">
          <h3>Temporadas</h3>
          <span className="pill">{sortedSeasons.length}</span>
        </div>

        <div className="table club-seasons-table scroll-x" style={{ marginTop: 10 }}>
          <div className="row head club-seasons-table">
            <div>Temporada</div>
            <div className="market-center">Pos</div>
            <div className="market-center">W-L</div>
            <div className="market-center">Net</div>
            <div>Notas</div>
          </div>
          {sortedSeasons.map((s, idx) => (
            <div key={`season-${idx}`} className="row club-seasons-table">
              <div className="mono">{s.season_label || s.season_year || s.season_id || "â€”"}</div>
              <div className="market-center mono">{s.position ?? "â€”"}</div>
              <div className="market-center mono">
                {s.wins ?? "â€”"}-{s.losses ?? "â€”"}
              </div>
              <div className="market-center mono">{s.net_rating ?? "â€”"}</div>
              <div>{s.note || s.notes || "â€”"}</div>
            </div>
          ))}
          {sortedSeasons.length === 0 && (
            <div className="row empty">
              <div style={{ gridColumn: "1 / -1" }}>No hay historial de temporadas.</div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <section className="bento club-history">
      <div className="card hero modal-glass-tactical" style={{ gridColumn: "1 / -1" }}>
        <div className="card-header">
          <h2>Historia</h2>
          <span className="pill">Fundado en {clubFounded}</span>
        </div>
        <div className="desc">PalmarÃ©s, rÃ©cords, salÃ³n de la fama, hitos y temporadas.</div>

        <div className="history-tabs">
          <button className={`tab ${activeTab === "trophies" ? "active" : ""}`} onClick={() => setActiveTab("trophies")}>
            Trofeos
          </button>
          <button className={`tab ${activeTab === "records" ? "active" : ""}`} onClick={() => setActiveTab("records")}>
            RÃ©cords
          </button>
          <button className={`tab ${activeTab === "hof" ? "active" : ""}`} onClick={() => setActiveTab("hof")}>
            SalÃ³n de la fama
          </button>
          <button className={`tab ${activeTab === "milestones" ? "active" : ""}`} onClick={() => setActiveTab("milestones")}>
            Hitos
          </button>
          <button className={`tab ${activeTab === "seasons" ? "active" : ""}`} onClick={() => setActiveTab("seasons")}>
            Temporadas
          </button>
        </div>
      </div>

      {activeTab === "trophies" && <TrophiesPanel />}
      {activeTab === "records" && <RecordsPanel />}
      {activeTab === "hof" && <HallOfFamePanel />}
      {activeTab === "milestones" && <MilestonesPanel />}
      {activeTab === "seasons" && <SeasonsPanel />}
    </section>
  );
}



