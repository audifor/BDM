import React, { useState } from "react";
import { DollarSign, TrendingUp, TrendingDown, AlertCircle, Calendar } from "lucide-react";

export default function ClubFinances({
  currentBalance = 0,
  transactions = [],
  projectedIncome = {},
  projectedExpenses = {},
  seasonBudget = 0,
  fiscalYear = 1,
}) {
  const [viewMode, setViewMode] = useState("overview"); // overview | transactions | projections
  const [timeRange, setTimeRange] = useState("season"); // week | month | season

  // Calcular totales proyectados
  const calculateProjectedTotals = () => {
    const income = Object.values(projectedIncome).reduce((sum, val) => sum + val, 0);
    const expenses = Object.values(projectedExpenses).reduce((sum, val) => sum + val, 0);
    const balance = income - expenses;
    return { income, expenses, balance };
  };

  const projected = calculateProjectedTotals();

  // Calcular balance real (transacciones hasta ahora)
  const calculateActualBalance = () => {
    const income = transactions
      .filter((t) => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);
    const expenses = transactions
      .filter((t) => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    return { income, expenses, balance: income - expenses };
  };

  const actual = calculateActualBalance();

  // Calcular estado financiero
  const getFinancialHealth = () => {
    const balanceRatio = currentBalance / seasonBudget;
    if (balanceRatio > 0.5) return { level: "excellent", label: "Excelente", color: "#4ade80" };
    if (balanceRatio > 0.2) return { level: "good", label: "Bueno", color: "#22c55e" };
    if (balanceRatio > 0) return { level: "fair", label: "Justo", color: "#fbbf24" };
    if (balanceRatio > -0.2) return { level: "poor", label: "Pobre", color: "#f97316" };
    return { level: "critical", label: "Crítico", color: "#ef4444" };
  };

  const health = getFinancialHealth();

  // Formatear moneda
  const fmt = (amount) => {
    const abs = Math.abs(amount);
    if (abs >= 1000000) return `$${(amount / 1000000).toFixed(2)}M`;
    if (abs >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount.toFixed(0)}`;
  };

  // Overview Panel
  const OverviewPanel = () => {
    return (
      <div className="finances-overview">
        <div className="card modal-glass-tactical balance-card">
          <div className="card-header">
            <h3>Balance Actual</h3>
            <DollarSign size={20} />
          </div>
          <div className="balance-display">
            <div className="balance-amount" style={{ color: currentBalance >= 0 ? "#4ade80" : "#ef4444" }}>
              {fmt(currentBalance)}
            </div>
            <div className="balance-health" style={{ color: health.color }}>
              Estado: {health.label}
            </div>
          </div>
          <div className="balance-details">
            <div className="detail-row">
              <span className="detail-label">Presupuesto Temporada:</span>
              <span className="detail-value">{fmt(seasonBudget)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">% Restante:</span>
              <span className="detail-value">
                {((currentBalance / seasonBudget) * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        <div className="card modal-glass-tactical actual-card">
          <div className="card-header">
            <h3>Balance Real (Hasta Ahora)</h3>
            <TrendingUp size={20} />
          </div>
          <div className="balance-breakdown">
            <div className="breakdown-item income">
              <div className="breakdown-label">Ingresos</div>
              <div className="breakdown-amount" style={{ color: "#4ade80" }}>
                +{fmt(actual.income)}
              </div>
            </div>
            <div className="breakdown-item expenses">
              <div className="breakdown-label">Gastos</div>
              <div className="breakdown-amount" style={{ color: "#ef4444" }}>
                -{fmt(actual.expenses)}
              </div>
            </div>
            <div className="breakdown-item balance">
              <div className="breakdown-label">Neto</div>
              <div
                className="breakdown-amount"
                style={{ color: actual.balance >= 0 ? "#4ade80" : "#ef4444" }}
              >
                {actual.balance >= 0 ? "+" : ""}
                {fmt(actual.balance)}
              </div>
            </div>
          </div>
        </div>

        <div className="card modal-glass-tactical projected-card">
          <div className="card-header">
            <h3>Proyección de Temporada</h3>
            <Calendar size={20} />
          </div>
          <div className="balance-breakdown">
            <div className="breakdown-item income">
              <div className="breakdown-label">Ingresos Estimados</div>
              <div className="breakdown-amount" style={{ color: "#4ade80" }}>
                +{fmt(projected.income)}
              </div>
            </div>
            <div className="breakdown-item expenses">
              <div className="breakdown-label">Gastos Estimados</div>
              <div className="breakdown-amount" style={{ color: "#ef4444" }}>
                -{fmt(projected.expenses)}
              </div>
            </div>
            <div className="breakdown-item balance">
              <div className="breakdown-label">Balance Proyectado</div>
              <div
                className="breakdown-amount"
                style={{ color: projected.balance >= 0 ? "#4ade80" : "#ef4444" }}
              >
                {projected.balance >= 0 ? "+" : ""}
                {fmt(projected.balance)}
              </div>
            </div>
          </div>
          {projected.balance < 0 && (
            <div className="projection-warning">
              <AlertCircle size={16} />
              <span>¡Advertencia! Se proyecta déficit. Reduce gastos o aumenta ingresos.</span>
            </div>
          )}
        </div>

        <div className="card modal-glass-tactical income-breakdown">
          <div className="card-header">
            <h3>Desglose de Ingresos Proyectados</h3>
          </div>
          <div className="category-list">
            {Object.entries(projectedIncome).map(([category, amount]) => (
              <div key={category} className="category-item">
                <div className="category-label">{category.replace("_", " ")}</div>
                <div className="category-bar">
                  <div
                    className="category-fill"
                    style={{
                      width: `${(amount / projected.income) * 100}%`,
                      background: "#4ade80",
                    }}
                  />
                </div>
                <div className="category-amount">{fmt(amount)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card modal-glass-tactical expenses-breakdown">
          <div className="card-header">
            <h3>Desglose de Gastos Proyectados</h3>
          </div>
          <div className="category-list">
            {Object.entries(projectedExpenses).map(([category, amount]) => (
              <div key={category} className="category-item">
                <div className="category-label">{category.replace("_", " ")}</div>
                <div className="category-bar">
                  <div
                    className="category-fill"
                    style={{
                      width: `${(amount / projected.expenses) * 100}%`,
                      background: "#ef4444",
                    }}
                  />
                </div>
                <div className="category-amount">{fmt(amount)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Transactions Panel
  const TransactionsPanel = () => {
    // Agrupar transacciones por categoría
    const categorizedTransactions = transactions.reduce((acc, t) => {
      const cat = t.category || "other";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(t);
      return acc;
    }, {});

    return (
      <div className="finances-transactions">
        {Object.entries(categorizedTransactions).map(([category, txs]) => (
          <div key={category} className="card modal-glass-tactical transactions-group">
            <div className="card-header">
              <h3>{category.replace("_", " ").toUpperCase()}</h3>
              <span className="pill">{txs.length} transacciones</span>
            </div>
            <div className="transactions-list">
              {txs
                .sort((a, b) => b.date - a.date)
                .slice(0, 20)
                .map((tx, idx) => (
                  <div key={idx} className="transaction-item">
                    <div className="transaction-date">
                      {new Date(tx.date * 1000).toLocaleDateString()}
                    </div>
                    <div className="transaction-desc">{tx.description}</div>
                    <div
                      className="transaction-amount"
                      style={{ color: tx.amount >= 0 ? "#4ade80" : "#ef4444" }}
                    >
                      {tx.amount >= 0 ? "+" : ""}
                      {fmt(tx.amount)}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
        {transactions.length === 0 && (
          <div className="empty-state">
            <p>No hay transacciones registradas aún.</p>
          </div>
        )}
      </div>
    );
  };

  // Projections Panel (Chart Visual)
  const ProjectionsPanel = () => {
    // Generar datos mensuales simulados para el gráfico
    const months = [
      "Ene",
      "Feb",
      "Mar",
      "Abr",
      "May",
      "Jun",
      "Jul",
      "Ago",
      "Sep",
      "Oct",
      "Nov",
      "Dic",
    ];

    // Balance mensual proyectado (distribución uniforme simplificada)
    const monthlyIncome = projected.income / 12;
    const monthlyExpenses = projected.expenses / 12;

    return (
      <div className="finances-projections">
        <div className="card modal-glass-tactical projections-chart">
          <div className="card-header">
            <h3>Proyección Mensual de Balance</h3>
          </div>
          <div className="chart-container">
            <div className="chart-bars">
              {months.map((month, idx) => {
                const netMonthly = monthlyIncome - monthlyExpenses;
                const cumulativeBalance = currentBalance + netMonthly * (idx + 1);
                const barHeight = Math.abs((cumulativeBalance / seasonBudget) * 100);
                const isPositive = cumulativeBalance >= 0;

                return (
                  <div key={month} className="chart-bar-container">
                    <div className="chart-bar">
                      <div
                        className="bar-fill"
                        style={{
                          height: `${Math.min(barHeight, 100)}%`,
                          background: isPositive ? "#4ade80" : "#ef4444",
                        }}
                      />
                    </div>
                    <div className="chart-label">{month}</div>
                    <div className="chart-value">{fmt(cumulativeBalance)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="card modal-glass-tactical projections-summary">
          <div className="card-header">
            <h3>Resumen de Proyecciones</h3>
          </div>
          <div className="summary-items">
            <div className="summary-item">
              <div className="summary-label">Balance Final Proyectado:</div>
              <div
                className="summary-value"
                style={{
                  color: currentBalance + projected.balance >= 0 ? "#4ade80" : "#ef4444",
                }}
              >
                {fmt(currentBalance + projected.balance)}
              </div>
            </div>
            <div className="summary-item">
              <div className="summary-label">Capacidad de Fichajes:</div>
              <div className="summary-value">
                {fmt((currentBalance + projected.balance) * 0.3)} (30% del balance)
              </div>
            </div>
            <div className="summary-item">
              <div className="summary-label">Mes Crítico:</div>
              <div className="summary-value">
                {monthlyExpenses > monthlyIncome ? "Todos" : "Ninguno"}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section className="bento club-finances">
      <div className="card hero modal-glass-tactical">
        <div className="card-header">
          <h2>Finanzas del Club</h2>
          <span className="pill">Año Fiscal {fiscalYear}</span>
        </div>
        <div className="desc">
          Gestiona el presupuesto del club con proyecciones de ingresos y gastos. Mantén un
          balance positivo para cumplir objetivos financieros.
        </div>
        <div className="finance-tabs">
          <button
            className={`tab ${viewMode === "overview" ? "active" : ""}`}
            onClick={() => setViewMode("overview")}
          >
            Vista General
          </button>
          <button
            className={`tab ${viewMode === "transactions" ? "active" : ""}`}
            onClick={() => setViewMode("transactions")}
          >
            Transacciones
          </button>
          <button
            className={`tab ${viewMode === "projections" ? "active" : ""}`}
            onClick={() => setViewMode("projections")}
          >
            Proyecciones
          </button>
        </div>
      </div>

      {viewMode === "overview" && <OverviewPanel />}
      {viewMode === "transactions" && <TransactionsPanel />}
      {viewMode === "projections" && <ProjectionsPanel />}
    </section>
  );
}
