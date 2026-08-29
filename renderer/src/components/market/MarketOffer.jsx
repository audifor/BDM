import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, DollarSign, FileText, ShieldCheck } from "lucide-react";

export default function MarketOffer({
  player,
  myTeam,
  leagueId,
  contractCatalog,
  initialOffer,
  scholarshipMode,
  onBack,
  onSubmit,
  onReloadCatalog,
}) {
  const [fee, setFee] = useState(initialOffer?.fee ?? 0);
  const [wage, setWage] = useState(initialOffer?.wage ?? 0);
  const [years, setYears] = useState(initialOffer?.contract_years ?? 2);
  const [playingTime, setPlayingTime] = useState(initialOffer?.playing_time ?? "Rotación");
  const [promises, setPromises] = useState(() => initialOffer?.promises ?? []);
  const [clauses, setClauses] = useState(() => initialOffer?.clauses ?? []);
  const [bonuses, setBonuses] = useState(() => initialOffer?.bonuses ?? []);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setFee(initialOffer?.fee ?? 0);
    setWage(initialOffer?.wage ?? 0);
    setYears(initialOffer?.contract_years ?? 2);
    setPlayingTime(initialOffer?.playing_time ?? "Rotación");
    setPromises(initialOffer?.promises ?? []);
    setClauses(initialOffer?.clauses ?? []);
    setBonuses(initialOffer?.bonuses ?? []);
  }, [initialOffer]);

  useEffect(() => {
    if (!onReloadCatalog) return;
    if (contractCatalog?.ok) return;
    onReloadCatalog(leagueId);
  }, [contractCatalog, leagueId, onReloadCatalog]);

  const normalizeItems = (items) => {
    const list = Array.isArray(items) ? items : [];
    return list
      .map((item) => {
        if (typeof item === "string") return { id: item, label: item, desc: "" };
        if (item && typeof item === "object") return item;
        return null;
      })
      .filter(Boolean);
  };

  const clauseOptions = useMemo(() => normalizeItems(contractCatalog?.clauses), [contractCatalog]);
  const bonusOptions = useMemo(() => normalizeItems(contractCatalog?.bonuses), [contractCatalog]);

  const toggle = (value, set) => {
    set((prev) => {
      const next = new Set(prev || []);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return Array.from(next);
    });
  };

  const fmt = (amount) => {
    const n = Number(amount || 0);
    if (n >= 1000000) return `$${(n / 1000000).toFixed(2)}M`;
    if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
    return `$${n}`;
  };

  const canSubmit = player && myTeam && !submitting;
  const effectiveFee = scholarshipMode ? 0 : Math.max(0, Math.round(Number(fee) || 0));
  const effectiveWage = scholarshipMode ? 0 : Math.max(0, Math.round(Number(wage) || 0));
  const effectiveYears = Math.max(1, Math.min(5, Math.round(Number(years) || 1)));
  const PLAYING_TIME_OPTIONS = ["Jugador Estrella", "Titular", "Rotación", "Suplente", "Prospecto"];
  const PROMISE_OPTIONS = [
    { id: "minutes", label: "Minutos garantizados" },
    { id: "role", label: "Rol acorde" },
    { id: "titles", label: "Competir por títulos" },
    { id: "development", label: "Plan de desarrollo" },
    { id: "transfer", label: "No poner transferible" },
  ];

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit?.({
        fee: effectiveFee,
        wage: effectiveWage,
        contract_years: effectiveYears,
        playing_time: scholarshipMode ? "" : playingTime,
        promises: scholarshipMode ? [] : (promises || []),
        clauses: scholarshipMode ? [] : (clauses || []),
        bonuses: scholarshipMode ? [] : (bonuses || []),
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!player) {
    return (
      <section className="bento market-offer">
        <div className="card hero modal-glass-tactical">
          <div className="card-header">
            <h2>Oferta</h2>
          </div>
          <div className="desc">Selecciona un jugador para presentar una oferta.</div>
          <button className="subnav-item" onClick={onBack}>
            <ArrowLeft size={16} /> Volver
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="bento market-offer">
      <div className="card hero modal-glass-tactical" style={{ gridColumn: "1 / -1" }}>
        <div className="card-header">
          <h2>Presentar oferta</h2>
          <span className="pill">{leagueId || myTeam?.data?.league_id || "Liga"}</span>
        </div>
        <div className="desc">
          {player.name} · {player.data?.position || player.data?.bio?.pos || "N/A"} ·{" "}
          {player.data?.bio?.age || "--"} años
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="subnav-item secondary" onClick={onBack} disabled={submitting}>
            <ArrowLeft size={16} /> Volver
          </button>
          <button className="subnav-item primary" onClick={submit} disabled={!canSubmit}>
            <DollarSign size={16} /> {submitting ? "Enviando..." : "Enviar oferta"}
          </button>
        </div>
      </div>

      {scholarshipMode && (
        <div className="card modal-glass-tactical" style={{ gridColumn: "1 / -1" }}>
          <div className="card-header">
            <h3>Modo beca</h3>
            <ShieldCheck size={18} />
          </div>
          <div className="desc">
            Esta liga/jugador usa beca: la oferta no incluye fee, salario ni cláusulas/bonus negociables.
          </div>
        </div>
      )}

      <div className="card modal-glass-tactical">
        <div className="card-header">
          <h3>Oferta económica</h3>
          <DollarSign size={18} />
        </div>
        <div className="filters-grid">
          <div className="filter-group">
            <label>Fee traspaso</label>
            <input
              type="number"
              min="0"
              step="50000"
              value={effectiveFee}
              onChange={(e) => setFee(e.target.value)}
              disabled={scholarshipMode || submitting}
            />
            <div className="desc">{fmt(effectiveFee)}</div>
          </div>
          <div className="filter-group">
            <label>Salario anual</label>
            <input
              type="number"
              min="0"
              step="5000"
              value={effectiveWage}
              onChange={(e) => setWage(e.target.value)}
              disabled={scholarshipMode || submitting}
            />
            <div className="desc">{fmt(effectiveWage)}</div>
          </div>
          <div className="filter-group">
            <label>Años</label>
            <select value={effectiveYears} onChange={(e) => setYears(e.target.value)} disabled={submitting}>
              {[1, 2, 3, 4, 5].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <div className="desc">Duración del contrato</div>
          </div>
        </div>
      </div>

      {!scholarshipMode && (
        <div className="card modal-glass-tactical" style={{ gridColumn: "1 / -1" }}>
          <div className="card-header">
            <h3>Rol y promesas</h3>
            <ShieldCheck size={18} />
          </div>
          <div className="filters-grid">
            <div className="filter-group">
              <label>Tiempo de juego</label>
              <select value={playingTime} onChange={(e) => setPlayingTime(e.target.value)} disabled={submitting}>
                {PLAYING_TIME_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              <div className="desc">Lo que ofreces en la negociación (estilo FM).</div>
            </div>
            <div className="filter-group" style={{ gridColumn: "1 / -1" }}>
              <label>Promesas</label>
              <div className="tag-picker" style={{ justifyContent: "flex-start" }}>
                {PROMISE_OPTIONS.map((p) => (
                  <button
                    key={p.id}
                    className={`tag-chip ${promises.includes(p.id) ? "active" : ""}`}
                    onClick={() => toggle(p.id, setPromises)}
                    disabled={submitting}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card modal-glass-tactical" style={{ gridColumn: "1 / -1" }}>
        <div className="card-header">
          <h3>Cláusulas</h3>
          <FileText size={18} />
        </div>
        <div className="desc">
          Se validan contra `Docs/Concepto/Contratos`. Solo se enviarán IDs permitidos por universo.
        </div>
        {!contractCatalog?.ok ? (
          <div className="desc">
            Cargando catálogo...{" "}
            <button className="link" type="button" onClick={() => onReloadCatalog?.(leagueId)} disabled={submitting}>
              Reintentar
            </button>
          </div>
        ) : clauseOptions.length === 0 ? (
          <div className="desc">No hay cláusulas disponibles para este universo.</div>
        ) : (
          <div className="tag-picker" style={{ justifyContent: "flex-start" }}>
            {clauseOptions.map((c) => (
              <button
                key={c.id}
                className={`tag-chip ${clauses.includes(c.id) ? "active" : ""}`}
                onClick={() => toggle(c.id, setClauses)}
                title={c.desc || c.label}
                disabled={scholarshipMode || submitting}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="card modal-glass-tactical" style={{ gridColumn: "1 / -1" }}>
        <div className="card-header">
          <h3>Bonus</h3>
          <FileText size={18} />
        </div>
        {!contractCatalog?.ok ? (
          <div className="desc">
            Cargando catálogo...{" "}
            <button className="link" type="button" onClick={() => onReloadCatalog?.(leagueId)} disabled={submitting}>
              Reintentar
            </button>
          </div>
        ) : bonusOptions.length === 0 ? (
          <div className="desc">No hay bonus disponibles para este universo.</div>
        ) : (
          <div className="tag-picker" style={{ justifyContent: "flex-start" }}>
            {bonusOptions.map((b) => (
              <button
                key={b.id}
                className={`tag-chip ${bonuses.includes(b.id) ? "active" : ""}`}
                onClick={() => toggle(b.id, setBonuses)}
                title={b.desc || b.label}
                disabled={scholarshipMode || submitting}
              >
                {b.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
