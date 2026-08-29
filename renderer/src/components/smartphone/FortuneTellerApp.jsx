import React, { useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Flame,
  Target,
  Award,
  AlertTriangle,
  BarChart3,
  Trophy,
  Zap,
  Calendar,
  Users,
  Eye,
  ChevronUp,
  ChevronDown,
  Clock,
  CheckCircle,
  XCircle,
  Minus,
  ArrowUp,
  ArrowDown,
  Shield,
} from "lucide-react";

export default function FortuneTellerApp({
  onBack,
  teamName = "",
  hotSeatRank = null,
  predictions = [],
  rankings = [],
  hotSeat = [],
  expectations = [],
  narratives = [],
}) {
  const [activeTab, setActiveTab] = useState("predictions");

  return (
    <div className="h-full bg-[#0b1014] text-white flex flex-col font-sans">
      <div className="bg-gradient-to-r from-indigo-600 to-purple-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Target size={24} className="text-white" />
            <h1 className="text-2xl font-black">FORTUNE TELLER</h1>
          </div>
          {Number.isFinite(Number(hotSeatRank)) ? (
            <div className="bg-white/20 px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1">
              <Flame size={12} />
              Hot Seat #{hotSeatRank}
            </div>
          ) : null}
        </div>

        <div className="flex gap-2">
          <TabButton active={activeTab === "predictions"} onClick={() => setActiveTab("predictions")}>Predicciones</TabButton>
          <TabButton active={activeTab === "rankings"} onClick={() => setActiveTab("rankings")}>Rankings</TabButton>
          <TabButton active={activeTab === "hotseat"} onClick={() => setActiveTab("hotseat")}>Hot Seat</TabButton>
          <TabButton active={activeTab === "expectations"} onClick={() => setActiveTab("expectations")}>Expectativas</TabButton>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === "predictions" && (
          <PredictionsView predictions={predictions} />
        )}
        {activeTab === "rankings" && (
          <RankingsView rankings={rankings} teamName={teamName} />
        )}
        {activeTab === "hotseat" && (
          <HotSeatView entries={hotSeat} />
        )}
        {activeTab === "expectations" && (
          <ExpectationsView expectations={expectations} narratives={narratives} />
        )}
      </div>
    </div>
  );
}

function PredictionsView({ predictions }) {
  if (!predictions.length) {
    return <EmptyState label="Sin predicciones disponibles." />;
  }
  return (
    <div className="space-y-3">
      {predictions.map((pred) => (
        <div key={pred.id} className="bg-[#1f2937] p-4 rounded-xl border border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400">{pred.timestamp}</span>
            <span className="text-xs bg-white/10 px-2 py-0.5 rounded-full">{pred.category}</span>
          </div>
          <h3 className="font-bold mb-2">{pred.prediction}</h3>
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>{pred.source}</span>
            <span>Confianza {pred.confidence}%</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function RankingsView({ rankings }) {
  if (!rankings.length) {
    return <EmptyState label="Sin rankings disponibles." />;
  }
  return (
    <div className="space-y-3">
      {rankings.map((team) => (
        <div key={team.rank} className="bg-[#1f2937] p-4 rounded-xl border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold">#{team.rank} {team.team}</h3>
              <p className="text-xs text-gray-400">{team.record} • {team.comment}</p>
            </div>
            {Number.isFinite(team.change) && (
              <span className={`text-xs ${team.change >= 0 ? "text-green-400" : "text-red-400"}`}>
                {team.change >= 0 ? "+" : ""}{team.change}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function HotSeatView({ entries }) {
  if (!entries.length) {
    return <EmptyState label="Sin datos de hot seat." />;
  }
  const tempColor = (temp) => {
    switch (temp) {
      case "scorching":
        return "text-red-400";
      case "hot":
        return "text-orange-400";
      case "warm":
        return "text-yellow-400";
      default:
        return "text-green-400";
    }
  };

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <div key={entry.rank} className="bg-[#1f2937] p-4 rounded-xl border border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold">#{entry.rank} {entry.gm}</h3>
            <span className={`text-xs font-bold ${tempColor(entry.temperature)}`}>{entry.temperature}</span>
          </div>
          <p className="text-xs text-gray-400">{entry.team} • {entry.reason}</p>
          {entry.savingGrace && <p className="text-[10px] text-green-400 mt-2">{entry.savingGrace}</p>}
        </div>
      ))}
    </div>
  );
}

function ExpectationsView({ expectations, narratives }) {
  if (!expectations.length && !narratives.length) {
    return <EmptyState label="Sin expectativas ni narrativas." />;
  }
  return (
    <div className="space-y-4">
      <div className="bg-[#1f2937] p-4 rounded-xl border border-gray-700">
        <h3 className="font-bold mb-3">Expectativas</h3>
        <div className="space-y-2">
          {expectations.map((exp) => (
            <div key={exp.category} className="flex items-center justify-between text-xs">
              <span>{exp.category}</span>
              <span className="text-gray-400">{exp.current}</span>
            </div>
          ))}
          {!expectations.length && <div className="text-xs text-gray-500">Sin expectativas registradas.</div>}
        </div>
      </div>

      <div className="bg-[#1f2937] p-4 rounded-xl border border-gray-700">
        <h3 className="font-bold mb-3">Narrativas</h3>
        <div className="space-y-2">
          {narratives.map((narr) => (
            <div key={narr.id} className="text-xs text-gray-400">
              <div className="flex justify-between">
                <span>{narr.narrative}</span>
                <span>{narr.strength}%</span>
              </div>
            </div>
          ))}
          {!narratives.length && <div className="text-xs text-gray-500">Sin narrativas activas.</div>}
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button onClick={onClick} className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${active ? "bg-white text-indigo-600" : "bg-white/20 text-white hover:bg-white/30"}`}>
      {children}
    </button>
  );
}

function EmptyState({ label }) {
  return (
    <div className="text-center text-sm text-gray-400 mt-6">{label}</div>
  );
}
