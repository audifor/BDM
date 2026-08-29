import React, { useMemo, useState } from "react";

export function SubstitutionModal({ open, teamName, lineup = [], bench = [], onConfirm, onClose }) {
  const [outId, setOutId] = useState("");
  const [inId, setInId] = useState("");

  const ready = outId && inId && outId !== inId;

  const reset = () => {
    setOutId("");
    setInId("");
  };

  const handleClose = () => {
    reset();
    onClose?.();
  };

  const handleConfirm = () => {
    if (!ready) return;
    onConfirm?.(outId, inId);
    reset();
  };

  const lineupList = useMemo(() => lineup, [lineup]);
  const benchList = useMemo(() => bench, [bench]);

  if (!open) return null;

  return (
    <div className="sub-modal-backdrop" onClick={handleClose}>
      <div className="sub-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sub-modal-header">
          <div className="sub-modal-title">Sustitucion - {teamName || "Equipo"}</div>
          <button className="sub-modal-close" onClick={handleClose}>×</button>
        </div>
        <div className="sub-modal-body">
          <div className="sub-list">
            <div className="sub-list-title">En pista</div>
            {lineupList.map((p) => (
              <label key={p.id} className={`sub-item ${outId === p.id ? "active" : ""}`}>
                <input
                  type="radio"
                  name="sub-out"
                  checked={outId === p.id}
                  onChange={() => setOutId(p.id)}
                />
                <span>{p.name}</span>
              </label>
            ))}
          </div>
          <div className="sub-list">
            <div className="sub-list-title">Banco</div>
            {benchList.map((p) => (
              <label key={p.id} className={`sub-item ${inId === p.id ? "active" : ""}`}>
                <input
                  type="radio"
                  name="sub-in"
                  checked={inId === p.id}
                  onChange={() => setInId(p.id)}
                />
                <span>{p.name}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="sub-modal-footer">
          <button className="btn-control-ghost" onClick={handleClose}>Cancelar</button>
          <button className="btn-control-primary" disabled={!ready} onClick={handleConfirm}>Confirmar</button>
        </div>
      </div>
    </div>
  );
}

export default SubstitutionModal;
