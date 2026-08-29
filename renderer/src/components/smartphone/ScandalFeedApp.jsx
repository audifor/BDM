import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  AlertTriangle,
  TrendingDown,
  MessageSquare,
  Share2,
  Eye,
  MapPin,
  DollarSign,
  Heart,
  X,
  Shield,
  Ban,
  Users,
  Megaphone,
  Lock,
  ThumbsDown,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

const MANAGEMENT_OPTIONS = {
  party: [
    {
      id: "suspend",
      label: "Suspender",
      description: "Suspensión inmediata por conducta.",
      impact: {
        morale: -5,
        reputation: 15,
        sponsorRisk: -10,
        fanSupport: 10,
        playerRelationship: -15,
      },
      risk: "medium",
    },
    {
      id: "team_meeting",
      label: "Reunión Interna",
      description: "Gestionar en privado con el jugador.",
      impact: {
        morale: 5,
        reputation: 5,
        playerRelationship: 10,
      },
      risk: "low",
    },
    {
      id: "public_statement",
      label: "Declaración",
      description: "Comunicado público de disciplina.",
      impact: {
        reputation: 8,
        fanSupport: 5,
      },
      risk: "low",
    },
  ],
  romance: [
    {
      id: "private_warn",
      label: "Advertencia Privada",
      description: "Hablar con el jugador, sin hacerlo público.",
      impact: {
        morale: 3,
        playerRelationship: 5,
      },
      risk: "low",
    },
    {
      id: "trade_hint",
      label: "Señalar Trade",
      description: "Advertir consecuencias si se repite.",
      impact: {
        morale: -4,
        reputation: 6,
        playerRelationship: -10,
      },
      risk: "medium",
    },
  ],
  casino: [
    {
      id: "fine",
      label: "Multa",
      description: "Aplicar multa económica.",
      impact: {
        reputation: 5,
        playerRelationship: -8,
      },
      risk: "low",
    },
    {
      id: "statement",
      label: "Comunicado",
      description: "Declaración condenando comportamiento imprudente.",
      impact: {
        reputation: 10,
        fanSupport: 5,
        playerRelationship: -5,
      },
      risk: "low",
    },
  ],
};

export default function ScandalFeedApp({ onBack, onTriggerEvent, seedItems = [], seedOnly = false }) {
  const initialScandals = seedItems.length ? seedItems : [];
  const [scandals, setScandals] = useState(initialScandals);
  const [selectedScandal, setSelectedScandal] = useState(null);
  const [showCrisisModal, setShowCrisisModal] = useState(false);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (seedOnly) {
      setScandals(seedItems);
      return;
    }
    if (seedItems.length) {
      setScandals(seedItems);
    }
  }, [seedItems, seedOnly]);

  const activeScandals = scandals.filter((s) => !s.managed);
  const managedScandals = scandals.filter((s) => s.managed);

  const handleManageScandal = (scandal) => {
    setSelectedScandal(scandal);
    setShowCrisisModal(true);
  };

  const handleCrisisAction = (action) => {
    if (!selectedScandal) return;

    if (onTriggerEvent) {
      onTriggerEvent({
        type: "scandal_managed",
        scandalId: selectedScandal.id,
        action: action.id,
        impact: action.impact,
      });
    }

    setScandals((prev) => prev.map((s) =>
      s.id === selectedScandal.id ? { ...s, managed: true, managementAction: action.label } : s
    ));

    setShowCrisisModal(false);
    setSelectedScandal(null);
  };

  const filteredScandals = scandals.filter((s) => {
    if (filter === "active") return !s.managed;
    if (filter === "managed") return s.managed;
    return true;
  });

  return (
    <div className="h-full bg-[#0b1014] text-white flex flex-col font-sans">
      <div className="bg-gradient-to-r from-pink-600 to-red-600 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Camera size={24} className="text-white" />
            <h1 className="text-2xl font-black">SCANDAL FEED</h1>
          </div>
          <div className="flex items-center gap-2 bg-white/20 px-3 py-1 rounded-full text-xs font-bold">
            <AlertTriangle size={12} className="animate-pulse" />
            {activeScandals.length} ACTIVAS
          </div>
        </div>

        <div className="flex gap-2">
          <FilterButton active={filter === "all"} onClick={() => setFilter("all")} count={scandals.length}>
            Todas
          </FilterButton>
          <FilterButton active={filter === "active"} onClick={() => setFilter("active")} count={activeScandals.length} alert>
            Activas
          </FilterButton>
          <FilterButton active={filter === "managed"} onClick={() => setFilter("managed")} count={managedScandals.length}>
            Gestionadas
          </FilterButton>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-20">
        {filteredScandals.map((scandal) => (
          <ScandalCard key={scandal.id} scandal={scandal} onManage={() => handleManageScandal(scandal)} />
        ))}

        {filteredScandals.length === 0 && (
          <div className="text-center py-20">
            <CheckCircle size={48} className="mx-auto mb-4 text-green-500" />
            <p className="text-gray-400">Sin escándalos activos</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showCrisisModal && selectedScandal && (
          <CrisisManagementModal
            scandal={selectedScandal}
            options={MANAGEMENT_OPTIONS[selectedScandal.type] || MANAGEMENT_OPTIONS.party}
            onClose={() => setShowCrisisModal(false)}
            onAction={handleCrisisAction}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ScandalCard({ scandal, onManage }) {
  const getSeverityColor = (severity) => {
    switch (severity) {
      case "critical":
        return "border-red-500 bg-red-500/10";
      case "high":
        return "border-orange-500 bg-orange-500/10";
      case "medium":
        return "border-yellow-500 bg-yellow-500/10";
      default:
        return "border-gray-700 bg-[#1f2937]";
    }
  };

  return (
    <motion.div layout className={`border-l-4 ${getSeverityColor(scandal.severity)} m-3 rounded-lg overflow-hidden`}>
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-gray-400">{scandal.timestamp}</span>
          {!scandal.managed && (
            <div className="bg-red-500/20 border border-red-500/50 px-2 py-0.5 rounded-full flex items-center gap-1">
              <AlertTriangle size={10} className="text-red-400" />
              <span className="text-[9px] text-red-400 font-bold">URGENTE</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-bold">{scandal.source}</span>
          <CheckCircle size={12} className="text-blue-400" />
          <span className="text-xs text-gray-500">{scandal.sourceHandle}</span>
        </div>

        <h3 className="font-bold text-base mb-2 leading-tight">{scandal.caption}</h3>

        <div className="relative w-full h-32 bg-gray-800 rounded-lg overflow-hidden mb-2">
          <img src={scandal.image} alt="" className="w-full h-full object-cover" />
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-500 mb-2">
          <span className="flex items-center gap-1"><MapPin size={12} /> {scandal.location}</span>
          <span className="flex items-center gap-1"><TrendingDown size={12} /> {scandal.urgency}</span>
        </div>

        <p className="text-sm text-gray-300 mb-3 leading-relaxed">{scandal.context}</p>

        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1"><Eye size={12} /> {formatNumber(scandal.stats.views)}</span>
          <span className="flex items-center gap-1"><MessageSquare size={12} /> {formatNumber(scandal.stats.comments)}</span>
          <span className="flex items-center gap-1"><Share2 size={12} /> {formatNumber(scandal.stats.shares)}</span>
        </div>

        {!scandal.managed ? (
          <button onClick={onManage} className="mt-3 w-full bg-red-600 hover:bg-red-700 py-2 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2">
            <AlertCircle size={16} />
            Gestionar Crisis
          </button>
        ) : (
          <div className="mt-3 bg-green-600/20 border border-green-500/30 px-3 py-2 rounded-lg text-xs text-green-300 flex items-center gap-2">
            <CheckCircle size={14} />
            Gestionado: {scandal.managementAction}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function CommentBox({ comment }) {
  return (
    <div className="bg-black/30 p-2 rounded-lg mb-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold">{comment.author}</span>
        <span className="text-[10px] text-gray-500">{comment.likes} likes</span>
      </div>
      <p className="text-xs text-gray-300">{comment.text}</p>
    </div>
  );
}

function CrisisManagementModal({ scandal, options, onClose, onAction }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 bg-black/90 backdrop-blur-sm flex items-end z-50"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 300 }}
        animate={{ y: 0 }}
        exit={{ y: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-[#1f2937] rounded-t-3xl p-6 max-h-[80%] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold">Gestión de Crisis</h3>
          <button onClick={onClose} className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center">
            <X size={16} />
          </button>
        </div>

        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4">
          <p className="text-xs text-red-400 font-bold mb-1">ESCÁNDALO:</p>
          <p className="text-sm">{scandal.caption}</p>
        </div>

        <div className="space-y-3">
          {options.map((option) => (
            <button
              key={option.id}
              onClick={() => onAction(option)}
              className="w-full bg-gray-700 hover:bg-gray-600 p-4 rounded-xl text-left transition-all active:scale-95"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className="shrink-0 mt-0.5 text-red-400" />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="font-bold">{option.label}</h4>
                    <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">
                      Riesgo: {option.risk}
                    </span>
                  </div>
                  <p className="text-sm opacity-80">{option.description}</p>
                  <div className="text-xs text-gray-400 mt-2">
                    {option.impact?.reputation ? `Reputación ${option.impact.reputation > 0 ? "+" : ""}${option.impact.reputation}` : ""}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-5">
          <p className="text-xs text-gray-500 uppercase font-bold mb-2">Comentarios destacados</p>
          {scandal.topComments?.map((comment) => (
            <CommentBox key={comment.id} comment={comment} />
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

function FilterButton({ active, onClick, count, alert, children }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${active ? "bg-white text-pink-600" : "bg-white/20 text-white hover:bg-white/30"}`}
    >
      {children}
      {count > 0 && (
        <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${active ? "bg-pink-600 text-white" : "bg-white/20"}`}>
          {alert ? "!" : count}
        </span>
      )}
    </button>
  );
}

function formatNumber(num) {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}
