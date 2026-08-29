import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Trophy, MapPin, Zap, TrendingUp, Info } from "lucide-react";

export default function TalentSwipeApp({ prospects = [] }) {
  const list = prospects;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(null);

  const currentPlayer = list[currentIndex];
  const statsEntries = currentPlayer ? Object.entries(currentPlayer.stats || {}) : [];
  const badge = currentPlayer ? (currentPlayer.badge || currentPlayer.tag || currentPlayer.tierLabel) : "";
  const location = currentPlayer ? (currentPlayer.location || currentPlayer.city || currentPlayer.origin || currentPlayer.country) : "";

  const handleSwipe = (dir) => {
    setDirection(dir);
    setTimeout(() => {
      if (currentIndex < list.length) {
        setCurrentIndex((prev) => prev + 1);
        setDirection(null);
      }
    }, 200);
  };

  return (
    <div className="h-full w-full bg-gray-900 text-white flex flex-col relative overflow-hidden">
      <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.3),rgba(255,255,255,0))]" />

      <div className="absolute top-0 left-0 right-0 p-6 z-20 flex justify-between items-end bg-gradient-to-b from-black/80 to-transparent h-24">
        <div>
          <h2 className="text-2xl font-black tracking-tighter italic text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-violet-500">
            SCOUT<span className="text-white not-italic font-light">PRO</span>
          </h2>
          <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Talent Discovery AI</p>
        </div>
        <div className="bg-white/10 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 text-xs font-mono">
          {currentIndex < list.length ? `${currentIndex + 1} / ${list.length}` : "FIN"}
        </div>
      </div>

      <div className="flex-1 relative flex items-center justify-center p-4 mt-8">
        <AnimatePresence mode="wait">
          {currentPlayer ? (
            <motion.div
              key={currentPlayer.id}
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{
                scale: 1,
                opacity: 1,
                y: 0,
                x: direction === "left" ? -300 : direction === "right" ? 300 : 0,
                rotate: direction === "left" ? -15 : direction === "right" ? 15 : 0,
              }}
              exit={{ scale: 0.95, opacity: 0, transition: { duration: 0.2 } }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="w-full h-full max-h-[460px] relative rounded-[30px] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10"
            >
              <img src={currentPlayer.image} alt={currentPlayer.name} className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />

              <div className="absolute inset-0 p-6 flex flex-col justify-end">
                <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md border border-green-500/50 rounded-full w-12 h-12 flex items-center justify-center">
                  <span className="text-green-400 font-bold text-sm">{Number.isFinite(Number(currentPlayer.match)) ? `${currentPlayer.match}%` : ""}</span>
                  <div className="absolute inset-0 border-2 border-green-500 rounded-full animate-pulse opacity-50" />
                </div>

                <div className="flex gap-2 mb-3">
                  <span className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-lg text-[10px] font-bold uppercase tracking-wider border border-white/10">
                    {currentPlayer.role}
                  </span>
                  {badge ? (
                    <span className="px-3 py-1 bg-blue-500/20 backdrop-blur-md rounded-lg text-[10px] font-bold text-blue-300 uppercase border border-blue-500/30 flex items-center gap-1">
                      <TrendingUp size={10} /> {badge}
                    </span>
                  ) : null}
                </div>

                <h1 className="text-4xl font-black leading-none uppercase italic">
                  {currentPlayer.name}
                  <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-500">
                    {currentPlayer.surname}
                  </span>
                </h1>

                <div className="flex items-center gap-4 mt-2 text-gray-300 text-sm font-medium">
                  {location ? (
                    <span className="flex items-center gap-1"><MapPin size={14} className="text-pink-500" /> {location}</span>
                  ) : null}
                  {Number.isFinite(Number(currentPlayer.age)) && (
                    <>
                      <span>|</span>
                      <span>{currentPlayer.age} Anios</span>
                    </>
                  )}
                  {currentPlayer.height && (
                    <>
                      <span>|</span>
                      <span>{currentPlayer.height}</span>
                    </>
                  )}
                </div>

                {statsEntries.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mt-6">
                    {statsEntries.map(([key, value]) => (
                      <div key={key} className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-2 flex flex-col items-center">
                        <span className="text-[10px] text-gray-400 font-bold uppercase">{key}</span>
                        <span className="text-lg font-black text-white">{value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center p-8">
              <div className="w-24 h-24 bg-gray-800 rounded-full mx-auto flex items-center justify-center mb-6 shadow-inner ring-4 ring-gray-800 border-4 border-gray-700">
                <Trophy size={40} className="text-yellow-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">¡Scouting Finalizado!</h3>
              <p className="text-gray-400 text-sm mb-8">Has revisado todos los perfiles de la base de datos de hoy.</p>

              <button
                onClick={() => setCurrentIndex(0)}
                className="w-full bg-white text-black font-bold py-4 rounded-xl hover:scale-105 transition-transform active:scale-95"
              >
                Reiniciar Búsqueda
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {currentPlayer && (
        <div className="h-24 px-8 pb-8 flex items-center justify-center gap-8 z-20">
          <button
            onClick={() => handleSwipe("left")}
            className="w-16 h-16 rounded-full bg-gray-800/80 backdrop-blur-sm border border-red-500/30 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all duration-300 shadow-lg active:scale-90"
          >
            <X size={32} />
          </button>

          <button className="w-12 h-12 rounded-full bg-gray-800/50 backdrop-blur-sm text-blue-400 flex items-center justify-center hover:bg-blue-500 hover:text-white transition-all active:scale-90 border border-white/5">
            <Info size={20} />
          </button>

          <button
            onClick={() => handleSwipe("right")}
            className="w-16 h-16 rounded-full bg-gradient-to-r from-emerald-500 to-green-500 text-white flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:shadow-[0_0_30px_rgba(16,185,129,0.6)] hover:scale-110 transition-all duration-300 active:scale-90"
          >
            <Zap size={32} fill="currentColor" />
          </button>
        </div>
      )}
    </div>
  );
}
