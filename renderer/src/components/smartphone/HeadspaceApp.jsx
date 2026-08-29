import React from "react";
import { Wind, PlayCircle } from "lucide-react";
import { motion } from "framer-motion";

export default function HeadspaceApp({ stress = null, onStartSession, isMeditating = false }) {
  const hasStress = Number.isFinite(Number(stress));
  const safeStress = hasStress ? Math.max(0, Math.min(100, Number(stress))) : null;

  return (
    <div style={{ height: "100%", background: "linear-gradient(180deg, #4f46e5 0%, #0f172a 100%)", color: "white", display: "flex", flexDirection: "column", alignItems: "center", padding: 30 }}>
      <div style={{ marginTop: 20, fontSize: "1.5rem", fontWeight: 300, letterSpacing: 2 }}>HEADSPACE GM</div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", width: "100%" }}>
        <div style={{ position: "relative", width: 200, height: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <motion.div
            animate={{ scale: isMeditating ? [1, 1.2, 1] : 1, opacity: isMeditating ? 0.8 : 0.3 }}
            transition={{ duration: 3, repeat: isMeditating ? Infinity : 0 }}
            style={{ position: "absolute", width: "100%", height: "100%", borderRadius: "50%", background: "#818cf8", filter: "blur(20px)" }}
          />

          <div style={{ textAlign: "center", zIndex: 10 }}>
            <div style={{ fontSize: "3rem", fontWeight: "bold" }}>
              {hasStress ? `${safeStress}%` : "--"}
            </div>
            <div style={{ fontSize: "0.8rem", opacity: 0.8 }}>NIVEL DE ESTRÉS</div>
          </div>
        </div>

        <div style={{ marginTop: 30, textAlign: "center", minHeight: 60 }}>
          {!hasStress ? (
            <span style={{ color: "#c7d2fe" }}>Sin datos de estrés.</span>
          ) : isMeditating ? (
            <span style={{ fontSize: "1.2rem", fontWeight: 300 }}>Inhala... Exhala...</span>
          ) : (
            <span style={{ color: safeStress > 80 ? "#fca5a5" : "#c7d2fe" }}>
              {safeStress > 80 ? "Niveles críticos. Tu juicio está nublado." : "Mente clara. Listo para decidir."}
            </span>
          )}
        </div>
      </div>

      <button
        onClick={onStartSession}
        disabled={!onStartSession || isMeditating || !hasStress || safeStress === 0}
        style={{ width: "100%", padding: 20, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 15, cursor: onStartSession ? "pointer" : "not-allowed", backdropFilter: "blur(10px)", marginBottom: 20, opacity: onStartSession ? 1 : 0.6 }}
      >
        {isMeditating ? <Wind className="spin" /> : <PlayCircle size={24} />}
        <span style={{ fontWeight: "bold" }}>{isMeditating ? "RECALIBRANDO..." : "SESIÓN RÁPIDA"}</span>
      </button>
    </div>
  );
}
