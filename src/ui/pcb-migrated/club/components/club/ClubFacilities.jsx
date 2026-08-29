import React, { useEffect, useState } from "react";
import { Lock, TrendingUp, Clock, DollarSign } from "../../ClubIcons";

const MIGRATION_CATALOG = { categories: { training: { label: 'Entrenamiento', icon: '⌁', color: '#f59e0b' }, medical: { label: 'Medical', icon: '✚', color: '#22c55e' }, arena: { label: 'Pabellón', icon: '⌂', color: '#60a5fa' } }, facilities: [
  { id: 'training-center', name: 'Centro de entrenamiento', category: 'training', description: 'Mejora el desarrollo diario.', base_cost: 50000, cost_multiplier: 1.5, max_level: 5, effects: { shooting_dev: .02, playmaking_dev: .02 } },
  { id: 'recovery-lab', name: 'Laboratorio de recuperación', category: 'medical', description: 'Acelera la recuperación física.', base_cost: 65000, cost_multiplier: 1.5, max_level: 5, effects: { recovery: .03 } },
  { id: 'arena', name: 'Pabellón principal', category: 'arena', description: 'Incrementa aforo e ingresos.', base_cost: 80000, cost_multiplier: 1.6, max_level: 5, effects: { capacity: 500, ticket_income: 12000 } },
] };

export default function ClubFacilities({
  teamFacilities = {},
  teamBudget = 0,
  teamLevel = 1,
  onUpgradeFacility,
}) {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [catalog, setCatalog] = useState(MIGRATION_CATALOG);
  const [catalogLoaded, setCatalogLoaded] = useState(true);

  useEffect(() => {
    let active = true;
    const loadCatalog = async () => {
      if (!window.pcbasket?.invoke) {
        if (active) setCatalogLoaded(true);
        return;
      }
      try {
        const res = await window.pcbasket.invoke("rules.facilities", {});
        if (!active) return;
        const next = res?.result || res || {};
        setCatalog({
          facilities: Array.isArray(next.facilities) ? next.facilities : [],
          categories: next.categories && typeof next.categories === "object" ? next.categories : {},
        });
        setCatalogLoaded(true);
      } catch (err) {
        setCatalogLoaded(true);
      }
    };
    loadCatalog();
    return () => { active = false; };
  }, []);

  const facilities = catalog.facilities || [];
  const categories = catalog.categories || {};

  // Calcular costo y si se puede mejorar
  const canUpgrade = (facility) => {
    const currentLevel = teamFacilities[facility.id]?.level || 0;
    if (currentLevel >= facility.max_level) return { can: false, reason: "MAX_LEVEL" };

    const upgradeCost = Math.round(
      facility.base_cost * Math.pow(facility.cost_multiplier, currentLevel)
    );
    if (upgradeCost > teamBudget) return { can: false, reason: "NO_BUDGET" };

    // Algunos requisitos de nivel de club
    const requiredClubLevel = Math.floor(currentLevel / 2) + 1;
    if (requiredClubLevel > teamLevel) return { can: false, reason: "LOW_LEVEL" };

    return { can: true, cost: upgradeCost };
  };

  const getEffectLabel = (key, value) => {
    if (key.includes("_dev")) return `+${Math.round(value * 100)}% desarrollo`;
    if (key.includes("recovery")) return `${value > 0 ? "+" : ""}${Math.round(value * 100)}% ${key.replace("_", " ")}`;
    if (key.includes("accuracy")) return `+${Math.round(value * 100)}% precisiÃ³n`;
    if (key === "revealed_attributes") return `+${value} atributos revelados`;
    if (key === "tier_access") return `Acceso Tier ${value}`;
    if (key === "capacity") return `+${value} asientos`;
    if (key === "ticket_income") return `+${Math.round(value / 1000)}K por partido`;
    return `${key}: ${value}`;
  };

  const filteredFacilities =
    selectedCategory === "all"
      ? facilities
      : facilities.filter((f) => f.category === selectedCategory);

  return (
    <section className="bento club-facilities">
      <div className="card hero modal-glass-tactical">
        <div className="card-header">
          <h2>Instalaciones del Club</h2>
          <span className="pill">Infraestructura</span>
        </div>
        <div className="desc">
          Mejora las instalaciones para obtener bonificaciones permanentes en desarrollo de
          jugadores, operaciones y finanzas.
        </div>
        <div className="facility-category-tabs">
          <button
            className={`tab ${selectedCategory === "all" ? "active" : ""}`}
            onClick={() => setSelectedCategory("all")}
          >
            Todas
          </button>
          {Object.entries(categories).map(([key, cat]) => (
            <button
              key={key}
              className={`tab ${selectedCategory === key ? "active" : ""}`}
              onClick={() => setSelectedCategory(key)}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="facilities-grid">
        {!catalogLoaded && facilities.length === 0 ? (
          <div className="card modal-glass-tactical">
            <div className="empty-state">
              <p>Cargando instalaciones...</p>
            </div>
          </div>
        ) : filteredFacilities.length === 0 ? (
          <div className="card modal-glass-tactical">
            <div className="empty-state">
              <p>No hay instalaciones disponibles.</p>
            </div>
          </div>
        ) : (
          filteredFacilities.map((facility) => {
          const currentLevel = teamFacilities[facility.id]?.level || 0;
          const upgradeInfo = canUpgrade(facility);
          const categoryInfo = categories[facility.category] || {
            color: "#64748b",
            icon: "ðŸŸï¸",
            label: facility.category || "General",
          };
          const isMaxLevel = currentLevel >= facility.max_level;
          const inProgress = teamFacilities[facility.id]?.upgrading;

          // Efectos actuales vs prÃ³ximo nivel
          const currentEffects = {};
          const nextEffects = {};
          Object.entries(facility.effects).forEach(([key, baseValue]) => {
            currentEffects[key] = baseValue * currentLevel;
            nextEffects[key] = baseValue * (currentLevel + 1);
          });

          return (
            <div key={facility.id} className="card facility-card modal-glass-tactical">
              <div className="facility-header">
                <div className="facility-icon" style={{ background: categoryInfo.color }}>
                  {categoryInfo.icon}
                </div>
                <div className="facility-title">
                  <h3>{facility.name}</h3>
                  <p className="facility-category">{categoryInfo.label}</p>
                </div>
                <div className="facility-level">
                  <div className="level-display">
                    Nv. {currentLevel}
                    {!isMaxLevel && <span className="level-next">â†’ {currentLevel + 1}</span>}
                  </div>
                  <div className="level-progress">
                    <div className="track">
                      <div
                        className="fill"
                        style={{ width: `${(currentLevel / facility.max_level) * 100}%` }}
                      />
                    </div>
                    <span className="level-label">
                      {currentLevel} / {facility.max_level}
                    </span>
                  </div>
                </div>
              </div>

              <div className="facility-description">{facility.description}</div>

              {/* Estado actual */}
              {currentLevel > 0 && (
                <div className="facility-current-effects">
                  <div className="effects-label">Bonificaciones actuales:</div>
                  <div className="effects-list">
                    {Object.entries(currentEffects).map(([key, value]) => (
                      <div key={key} className="effect-item">
                        â†³ {getEffectLabel(key, value)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* PrÃ³ximo nivel */}
              {!isMaxLevel && (
                <div className="facility-next-effects">
                  <div className="effects-label">Al mejorar a Nv. {currentLevel + 1}:</div>
                  <div className="effects-list highlight">
                    {Object.entries(facility.effects).map(([key, baseValue]) => (
                      <div key={key} className="effect-item">
                        <TrendingUp size={12} style={{ marginRight: 4 }} />
                        {getEffectLabel(key, nextEffects[key])}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AcciÃ³n */}
              <div className="facility-action">
                {inProgress ? (
                  <div className="upgrade-in-progress">
                    <Clock size={16} />
                    <span>Mejorando... {inProgress.daysLeft} dÃ­as restantes</span>
                  </div>
                ) : isMaxLevel ? (
                  <div className="max-level-badge">
                    âœ¨ NIVEL MÃXIMO ALCANZADO
                  </div>
                ) : upgradeInfo.can ? (
                  <button
                    className="subnav-item primary facility-upgrade-btn"
                    onClick={() => onUpgradeFacility && onUpgradeFacility(facility.id)}
                  >
                    <DollarSign size={16} />
                    <span>Mejorar ({Math.round(upgradeInfo.cost / 1000)}K)</span>
                    <Clock size={14} style={{ marginLeft: 8 }} />
                    <span>{facility.upgrade_days} dÃ­as</span>
                  </button>
                ) : (
                  <div className="upgrade-blocked">
                    {upgradeInfo.reason === "NO_BUDGET" && (
                      <>
                        <Lock size={14} />
                        <span>Fondos insuficientes</span>
                      </>
                    )}
                    {upgradeInfo.reason === "LOW_LEVEL" && (
                      <>
                        <Lock size={14} />
                        <span>Requiere Club Nv. {Math.floor(currentLevel / 2) + 1}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
          })
        )}
      </div>
    </section>
  );
}

