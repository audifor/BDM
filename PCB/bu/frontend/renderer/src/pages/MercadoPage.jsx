import React from "react";

export default function MercadoPage({
  marketView,
  setMarketView,
  renderScouting,
  renderAgencias,
  renderAgentes,
}) {
  return (
    <>
      <div className="subnav">
        <button
          className={`subnav-item ${marketView === "scouting" ? "active" : ""}`}
          onClick={() => setMarketView("scouting")}
        >
          Scouting
        </button>
        <button
          className={`subnav-item ${marketView === "agencias" ? "active" : ""}`}
          onClick={() => setMarketView("agencias")}
        >
          Agencias
        </button>
        <button
          className={`subnav-item ${marketView === "agentes" ? "active" : ""}`}
          onClick={() => setMarketView("agentes")}
        >
          Agentes
        </button>
      </div>
      {marketView === "scouting" && renderScouting()}
      {marketView === "agencias" && renderAgencias()}
      {marketView === "agentes" && renderAgentes()}
    </>
  );
}

