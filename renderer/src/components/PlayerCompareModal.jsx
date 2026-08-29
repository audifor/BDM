import React, { useMemo } from "react";

const clamp = (min, value, max) => Math.max(min, Math.min(max, value));

const to1000 = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return clamp(1, Math.round(n), 1000);
};

const DEFAULT_KEYS = [
  "finishing_close",
  "mid_range",
  "three_static",
  "free_throw",
  "ball_control",
  "pass_short",
  "pass_long",
  "court_vision",
  "spacing_iq",
  "defense_perimeter",
  "defense_post",
  "steal",
  "block",
  "rebounding",
  "speed",
  "stamina",
  "strength",
  "vertical",
  "consistency",
  "leadership",
];

const tone = (value1000) => {
  const v = Number(value1000);
  if (!Number.isFinite(v)) return "attr-unknown";
  if (v <= 250) return "attr-verylow";
  if (v <= 500) return "attr-low";
  if (v <= 750) return "attr-mid";
  return "attr-high";
};

export default function PlayerCompareModal({
  open,
  compareIds = [],
  players = [],
  labelFor,
  onClose,
  onRemove,
  onClear,
  onOpenPlayer,
}) {
  const comparePlayers = useMemo(() => {
    const idSet = new Set((Array.isArray(compareIds) ? compareIds : []).map(String));
    const list = (players || []).filter((p) => idSet.has(String(p.id)));
    // Keep the order as in compareIds
    const byId = new Map(list.map((p) => [String(p.id), p]));
    return (Array.isArray(compareIds) ? compareIds : [])
      .map((id) => byId.get(String(id)))
      .filter(Boolean);
  }, [compareIds, players]);

  const rows = useMemo(() => {
    return DEFAULT_KEYS.map((key) => {
      const values = comparePlayers.map((p) => to1000(p?.data?.attributes?.[key]));
      const max = Math.max(...values.map((v) => (v == null ? -1 : v)));
      return { key, values, max };
    });
  }, [comparePlayers]);

  if (!open) return null;

  return (
    <div className="simulate-modal compare-modal" onClick={onClose}>
      <div className="simulate-modal-card compare-card" onClick={(e) => e.stopPropagation()}>
        <div className="simulate-modal-header">
          <div>
            <div className="eyebrow">Comparador</div>
            <h3>Comparar jugadores</h3>
          </div>
          <button className="close" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <div className="simulate-modal-body">
          {comparePlayers.length === 0 ? (
            <div className="desc">No hay jugadores en el comparador.</div>
          ) : (
            <>
              <div className="compare-actions">
                <button className="subnav-item secondary" type="button" onClick={onClear}>
                  Limpiar
                </button>
              </div>

              <div className="compare-header">
                <div className="compare-spacer" />
                {comparePlayers.map((p) => {
                  const bio = p?.data?.bio || {};
                  const pos = p?.data?.position || bio.pos || "—";
                  const age = bio.age != null ? `${bio.age}a` : "—";
                  return (
                    <div key={p.id} className="compare-col-head">
                      <button type="button" className="link mono" onClick={() => onOpenPlayer?.(p.id)}>
                        {p.name || "Jugador"}
                      </button>
                      <div className="desc">{pos} · {age}</div>
                      <button className="subnav-item" type="button" onClick={() => onRemove?.(p.id)}>
                        Quitar
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="compare-table">
                {rows.map((row) => (
                  <div key={row.key} className="compare-row">
                    <div className="compare-key">
                      <div className="title">{labelFor ? labelFor(row.key) : row.key}</div>
                      <div className="desc mono">{row.key}</div>
                    </div>
                    {row.values.map((v, idx) => {
                      const best = v != null && v === row.max && row.max >= 0;
                      return (
                        <div key={`${row.key}-${idx}`} className={`compare-val ${best ? "best" : ""}`}>
                          <span className={`attr-pill ${tone(v)}`}>{v == null ? "—" : v}</span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="simulate-modal-actions">
          <div className="desc">Escala 1–1000 · Mejores valores resaltados</div>
        </div>
      </div>
    </div>
  );
}

