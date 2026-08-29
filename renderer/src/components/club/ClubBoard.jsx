import React, { useEffect, useState } from "react";
import { Target, TrendingUp, TrendingDown, AlertTriangle, CheckCircle } from "lucide-react";

export default function ClubBoard({
  currentObjectives = {},
  currentMetrics = {},
  confidence = 70,
  season = 1,
  onNegotiateObjectives,
}) {
  const [showNegotiation, setShowNegotiation] = useState(false);
  const [catalog, setCatalog] = useState({ objectives: [] });
  const [catalogLoaded, setCatalogLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    const loadCatalog = async () => {
      if (!window.pcbasket?.invoke) {
        if (active) setCatalogLoaded(true);
        return;
      }
      try {
        const res = await window.pcbasket.invoke("rules.board_objectives", {});
        if (!active) return;
        const next = res?.result || res || {};
        setCatalog({ objectives: Array.isArray(next.objectives) ? next.objectives : [] });
        setCatalogLoaded(true);
      } catch (err) {
        setCatalogLoaded(true);
      }
    };
    loadCatalog();
    return () => { active = false; };
  }, []);

  // Calcular estado de confianza
  const getConfidenceLevel = (conf) => {
    if (conf >= 85) return { level: "very_high", label: "Muy Alta", color: "#4ade80" };
    if (conf >= 70) return { level: "high", label: "Alta", color: "#22c55e" };
    if (conf >= 55) return { level: "medium", label: "Media", color: "#fbbf24" };
    if (conf >= 40) return { level: "low", label: "Baja", color: "#f97316" };
    return { level: "critical", label: "Crítica", color: "#ef4444" };
  };

  const confidenceData = getConfidenceLevel(confidence);

  // Obtener definición de objetivo del catálogo
  const getObjectiveDefinition = (objectiveId) => {
    return (catalog.objectives || []).find((obj) => obj.id === objectiveId);
  };

  // Calcular progreso de un objetivo
  const calculateProgress = (objective) => {
    const def = getObjectiveDefinition(objective.id);
    if (!def) return { progress: 0, status: "unknown" };

    const currentValue = currentMetrics[def.metric] || 0;
    const threshold = objective.threshold || def.threshold;

    // Progreso normalizado (0-100)
    let progress = 0;
    let status = "pending";

    if (def.comparison === ">=") {
      progress = Math.min(100, (currentValue / threshold) * 100);
      status = currentValue >= threshold ? "completed" : "in_progress";
    } else if (def.comparison === "<=") {
      progress = Math.min(100, ((threshold - currentValue) / threshold) * 100);
      status = currentValue <= threshold ? "completed" : "in_progress";
    } else if (def.comparison === ">") {
      progress = Math.min(100, (currentValue / (threshold + 1)) * 100);
      status = currentValue > threshold ? "completed" : "in_progress";
    }

    // Verificar si está en peligro (season > mitad y progreso < 30%)
    if (season > 21 && progress < 30 && status !== "completed") {
      status = "at_risk";
    }

    return { progress, status, currentValue, threshold };
  };

  // Calcular impacto en confianza del objetivo
  const getObjectiveImpact = (objective, progressData) => {
    const def = getObjectiveDefinition(objective.id);
    if (!def) return { text: "", delta: 0 };

    if (progressData.status === "completed") {
      const reward = def.rewards.find((r) => r.threshold === confidenceData.level);
      const delta = reward?.confidence || 0;
      return {
        text: `+${delta} confianza (completado)`,
        delta,
        color: "#4ade80",
      };
    }

    if (progressData.status === "at_risk") {
      const penalty = def.penalties.find((p) => p.threshold === confidenceData.level);
      const delta = penalty?.confidence || 0;
      return {
        text: `${delta} confianza (en riesgo)`,
        delta,
        color: "#f97316",
      };
    }

    return { text: "En progreso", delta: 0, color: "#94a3b8" };
  };

  // Renderizar tarjeta de objetivo
  const ObjectiveCard = ({ objective }) => {
    const def = getObjectiveDefinition(objective.id);
    if (!def) return null;

    const progress = calculateProgress(objective);
    const impact = getObjectiveImpact(objective, progress);

    const typeConfig = {
      primary: { label: "Objetivo Principal", color: "#3b82f6", icon: "🎯" },
      secondary: { label: "Objetivo Secundario", color: "#8b5cf6", icon: "📌" },
      financial: { label: "Objetivo Financiero", color: "#10b981", icon: "💰" },
    };

    const config = typeConfig[def.type] || typeConfig.primary;

    return (
      <div className={`card modal-glass-tactical objective-card status-${progress.status}`}>
        <div className="objective-header">
          <div className="objective-type" style={{ background: config.color }}>
            {config.icon}
          </div>
          <div className="objective-info">
            <div className="objective-label">{config.label}</div>
            <h3>{def.name}</h3>
            <p className="objective-desc">{def.description}</p>
          </div>
          <div className="objective-status">
            {progress.status === "completed" && (
              <CheckCircle size={24} style={{ color: "#4ade80" }} />
            )}
            {progress.status === "at_risk" && (
              <AlertTriangle size={24} style={{ color: "#f97316" }} />
            )}
          </div>
        </div>

        <div className="objective-progress">
          <div className="progress-header">
            <span className="progress-label">Progreso</span>
            <span className="progress-value">
              {progress.currentValue} / {progress.threshold}{" "}
              {def.metric.replace("_", " ")}
            </span>
          </div>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{
                width: `${progress.progress}%`,
                background:
                  progress.status === "completed"
                    ? "#4ade80"
                    : progress.status === "at_risk"
                      ? "#f97316"
                      : "#3b82f6",
              }}
            />
          </div>
          <div className="progress-percentage">{Math.round(progress.progress)}%</div>
        </div>

        <div className="objective-impact">
          <div className="impact-label">Impacto en Confianza:</div>
          <div className="impact-value" style={{ color: impact.color }}>
            {impact.text}
          </div>
        </div>

        {/* Rewards & Penalties */}
        <div className="objective-consequences">
          <div className="consequences-section">
            <div className="consequences-label">
              <TrendingUp size={14} /> Recompensas al completar:
            </div>
            <ul className="consequences-list">
              {def.rewards.map((reward, idx) => (
                <li key={idx}>
                  <span className="conf-level">{reward.threshold}:</span>
                  <span className="conf-delta" style={{ color: "#4ade80" }}>
                    +{reward.confidence} confianza
                  </span>
                  {reward.budget && (
                    <span className="budget-bonus">
                      +${(reward.budget / 1000).toFixed(0)}K presupuesto
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div className="consequences-section">
            <div className="consequences-label">
              <TrendingDown size={14} /> Penalizaciones al fallar:
            </div>
            <ul className="consequences-list">
              {def.penalties.map((penalty, idx) => (
                <li key={idx}>
                  <span className="conf-level">{penalty.threshold}:</span>
                  <span className="conf-delta" style={{ color: "#ef4444" }}>
                    {penalty.confidence} confianza
                  </span>
                  {penalty.budget && (
                    <span className="budget-penalty">
                      {penalty.budget / 1000}K presupuesto
                    </span>
                  )}
                  {penalty.dismissal && (
                    <span className="dismissal-warning">⚠️ Posible despido</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  };

  // Panel de confianza de la directiva
  const ConfidencePanel = () => {
    return (
      <div className="card hero modal-glass-tactical confidence-panel">
        <div className="card-header">
          <h2>Confianza de la Directiva</h2>
          <span className="pill">Temporada {season}</span>
        </div>
        <div className="confidence-display">
          <div className="confidence-gauge">
            <div className="gauge-track">
              <div
                className="gauge-fill"
                style={{
                  width: `${confidence}%`,
                  background: confidenceData.color,
                }}
              />
            </div>
            <div className="gauge-labels">
              <span className="gauge-label-left">0</span>
              <span className="gauge-label-center" style={{ color: confidenceData.color }}>
                {confidence}
              </span>
              <span className="gauge-label-right">100</span>
            </div>
          </div>
          <div className="confidence-level" style={{ color: confidenceData.color }}>
            {confidenceData.label}
          </div>
        </div>

        <div className="confidence-effects">
          <div className="effect-item">
            <span className="effect-label">Presupuesto de Fichajes:</span>
            <span className="effect-value">
              {confidence >= 70 ? "Normal" : confidence >= 50 ? "Reducido" : "Muy Limitado"}
            </span>
          </div>
          <div className="effect-item">
            <span className="effect-label">Libertad Táctica:</span>
            <span className="effect-value">
              {confidence >= 70 ? "Total" : confidence >= 50 ? "Moderada" : "Restringida"}
            </span>
          </div>
          <div className="effect-item">
            <span className="effect-label">Riesgo de Despido:</span>
            <span
              className="effect-value"
              style={{
                color: confidence < 40 ? "#ef4444" : confidence < 55 ? "#f97316" : "#4ade80",
              }}
            >
              {confidence < 40 ? "Alto" : confidence < 55 ? "Medio" : "Bajo"}
            </span>
          </div>
        </div>

        {confidence < 55 && (
          <div className="confidence-warning">
            <AlertTriangle size={16} />
            <span>
              {confidence < 40
                ? "¡Atención! Tu posición está en peligro. La directiva podría despedirte."
                : "La directiva está preocupada. Debes mejorar los resultados pronto."}
            </span>
          </div>
        )}
      </div>
    );
  };

  // Modal de negociación de objetivos
  const NegotiationModal = () => {
    if (!showNegotiation) return null;

    return (
      <div className="modal-overlay" onClick={() => setShowNegotiation(false)}>
        <div
          className="modal-content modal-glass-tactical"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <h2>Negociar Objetivos de Temporada</h2>
            <button className="modal-close" onClick={() => setShowNegotiation(false)}>
              ✕
            </button>
          </div>
          <div className="modal-body">
            <p className="modal-desc">
              Disponible al inicio de cada temporada. Puedes intentar negociar objetivos menos
              exigentes si tu confianza es alta.
            </p>
            <div className="negotiation-info">
              <div className="info-item">
                <span className="info-label">Tu Confianza Actual:</span>
                <span className="info-value" style={{ color: confidenceData.color }}>
                  {confidence} ({confidenceData.label})
                </span>
              </div>
              <div className="info-item">
                <span className="info-label">Probabilidad de Éxito:</span>
                <span className="info-value">
                  {confidence >= 85
                    ? "Muy Alta (80%)"
                    : confidence >= 70
                      ? "Alta (60%)"
                      : confidence >= 55
                        ? "Media (40%)"
                        : "Baja (20%)"}
                </span>
              </div>
            </div>
            <div className="negotiation-actions">
              <button
                className="subnav-item primary"
                onClick={() => {
                  onNegotiateObjectives && onNegotiateObjectives();
                  setShowNegotiation(false);
                }}
                disabled={confidence < 55}
              >
                <Target size={16} />
                <span>Intentar Negociar</span>
              </button>
              {confidence < 55 && (
                <p className="warning-text">
                  Necesitas al menos 55 de confianza para negociar objetivos.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Separar objetivos por tipo
  const primaryObjectives = Object.values(currentObjectives).filter((obj) => {
    const def = getObjectiveDefinition(obj.id);
    return def?.type === "primary";
  });

  const secondaryObjectives = Object.values(currentObjectives).filter((obj) => {
    const def = getObjectiveDefinition(obj.id);
    return def?.type === "secondary";
  });

  const financialObjectives = Object.values(currentObjectives).filter((obj) => {
    const def = getObjectiveDefinition(obj.id);
    return def?.type === "financial";
  });

  const hasObjectives = Object.keys(currentObjectives).length > 0;
  const hasCatalog = (catalog.objectives || []).length > 0;

  return (
    <section className="bento club-board">
      <div className="card hero modal-glass-tactical">
        <div className="card-header">
          <h2>Junta Directiva</h2>
          <span className="pill">Objetivos & Presión</span>
        </div>
        <div className="desc">
          La directiva establece objetivos cada temporada. Tu confianza determina el presupuesto
          disponible, libertad táctica y seguridad laboral.
        </div>
        <button
          className="subnav-item secondary negotiate-btn"
          onClick={() => setShowNegotiation(true)}
        >
          <Target size={16} />
          <span>Negociar Objetivos</span>
        </button>
      </div>

      <ConfidencePanel />

      <div className="objectives-sections">
        {primaryObjectives.length > 0 && (
          <div className="objectives-group">
            <h3 className="group-title">🎯 Objetivos Principales</h3>
            <div className="objectives-grid">
              {primaryObjectives.map((obj) => (
                <ObjectiveCard key={obj.id} objective={obj} />
              ))}
            </div>
          </div>
        )}

        {secondaryObjectives.length > 0 && (
          <div className="objectives-group">
            <h3 className="group-title">📌 Objetivos Secundarios</h3>
            <div className="objectives-grid">
              {secondaryObjectives.map((obj) => (
                <ObjectiveCard key={obj.id} objective={obj} />
              ))}
            </div>
          </div>
        )}

        {financialObjectives.length > 0 && (
          <div className="objectives-group">
            <h3 className="group-title">💰 Objetivos Financieros</h3>
            <div className="objectives-grid">
              {financialObjectives.map((obj) => (
                <ObjectiveCard key={obj.id} objective={obj} />
              ))}
            </div>
          </div>
        )}

        {hasObjectives && !hasCatalog && !catalogLoaded && (
          <div className="empty-state">
            <p>Cargando catálogo de objetivos...</p>
          </div>
        )}

        {hasObjectives && !hasCatalog && catalogLoaded && (
          <div className="empty-state">
            <p>Sin catálogo de objetivos disponible.</p>
          </div>
        )}

        {!hasObjectives && (
          <div className="empty-state">
            <p>No hay objetivos establecidos para esta temporada.</p>
            <p className="hint">
              Los objetivos se generan automáticamente al inicio de cada temporada según tu
              división y recursos del club.
            </p>
          </div>
        )}
      </div>

      {showNegotiation && <NegotiationModal />}
    </section>
  );
}
