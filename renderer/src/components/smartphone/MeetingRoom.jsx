import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  MessageSquare,
  Brain,
  Flame,
  Briefcase,
  HeartHandshake,
  Smile,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Target,
  Star,
} from "lucide-react";

export default function MeetingRoom({ meetingType, onComplete, onExit, dialogueTree = null, managerSkills = {} }) {
  const [currentNodeId, setCurrentNodeId] = useState("start");
  const [conversationHistory, setConversationHistory] = useState([]);
  const [timeElapsed, setTimeElapsed] = useState(0);

  const currentNode = dialogueTree ? dialogueTree[currentNodeId] : null;

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (currentNode && currentNode.speaker === "other") {
      setConversationHistory((prev) => [...prev, { speaker: "other", text: currentNode.text, speakerName: currentNode.speakerName }]);
    }

    if (currentNode && !currentNode.options && currentNode.nextNode) {
      setTimeout(() => {
        setCurrentNodeId(currentNode.nextNode);
      }, 1500);
    }

    if (currentNode?.isEnd) {
      setTimeout(() => {
        onComplete?.(currentNode?.outcome || currentNode?.result || null);
      }, 1000);
    }
  }, [currentNodeId]);

  const handleOptionSelect = (option) => {
    setConversationHistory((prev) => [...prev, { speaker: "manager", text: option.text, tone: option.tone }]);

    const nextId = option.nextNode || option.id;
    if (nextId) {
      setCurrentNodeId(nextId);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getToneIcon = (tone) => {
    switch (tone) {
      case "aggressive":
        return <Flame size={14} className="text-red-400" />;
      case "professional":
        return <Briefcase size={14} className="text-blue-400" />;
      case "empathetic":
        return <HeartHandshake size={14} className="text-green-400" />;
      case "tactical":
        return <Brain size={14} className="text-purple-400" />;
      case "sarcastic":
        return <Smile size={14} className="text-yellow-400" />;
      default:
        return null;
    }
  };

  if (!dialogueTree || !currentNode) {
    return (
      <div className="h-full bg-[#0b1014] text-white flex items-center justify-center">
        <div className="text-center text-sm text-gray-400">
          Sin datos de reunión disponibles.
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-[#0b1014] text-white flex flex-col">
      <div className="bg-[#1f2937] p-4 flex items-center justify-between border-b border-gray-700">
        <div className="flex items-center gap-3">
          <button onClick={onExit} className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h2 className="font-bold text-sm">Reunión en curso</h2>
            <p className="text-xs text-gray-400">con {currentNode.speakerName || "Desconocido"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Clock size={12} />
          {formatTime(timeElapsed)}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {conversationHistory.map((msg, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex ${msg.speaker === "manager" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] ${msg.speaker === "manager" ? "bg-blue-600 rounded-2xl rounded-br-none" : "bg-[#1f2937] rounded-2xl rounded-bl-none"} p-3`}>
              {msg.speaker === "other" && (
                <p className="text-xs text-blue-400 font-bold mb-1">{msg.speakerName}</p>
              )}
              <p className="text-sm">{msg.text}</p>
              {msg.tone && (
                <div className="flex items-center gap-1 mt-2 text-xs opacity-70">
                  {getToneIcon(msg.tone)}
                  <span className="capitalize">{msg.tone}</span>
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {currentNode.options && currentNode.options.length > 0 && (
        <div className="bg-[#1f2937] border-t border-gray-700 p-4 space-y-2">
          <p className="text-xs text-gray-400 uppercase font-bold mb-3 flex items-center gap-2">
            <MessageSquare size={12} />
            Tus Opciones
          </p>

          {currentNode.options.map((option, i) => {
            const hasSkillRequirement = option.requiredSkill;
            const canUse = !hasSkillRequirement || (managerSkills[option.requiredSkill.skill] || 0) >= option.requiredSkill.level;

            return (
              <motion.button
                key={option.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                onClick={() => handleOptionSelect(option)}
                disabled={!canUse}
                className={`w-full text-left p-3 rounded-xl border transition-all ${canUse ? "bg-gray-700 border-gray-600 hover:bg-gray-600 hover:border-blue-500" : "bg-gray-800/50 border-gray-700/50 opacity-50 cursor-not-allowed"}`}
              >
                <div className="flex items-start gap-2 mb-1">
                  {getToneIcon(option.tone)}
                  <p className="text-sm flex-1">{option.text}</p>
                </div>

                <div className="flex items-center justify-between text-xs text-gray-400 mt-2">
                  <div className="flex items-center gap-2">
                    {Number.isFinite(option.successChance) && (
                      <span className="flex items-center gap-1">
                        <Target size={10} />
                        {option.successChance}% éxito
                      </span>
                    )}
                    {option.effects?.relationshipChange !== undefined && option.effects.relationshipChange !== 0 && (
                      <span className={`flex items-center gap-1 ${option.effects.relationshipChange > 0 ? "text-green-400" : "text-red-400"}`}>
                        <TrendingUp size={10} />
                        {option.effects.relationshipChange > 0 ? "+" : ""}{option.effects.relationshipChange} rel
                      </span>
                    )}
                  </div>

                  {hasSkillRequirement && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${canUse ? "bg-blue-500/20 text-blue-400" : "bg-red-500/20 text-red-400"}`}>
                      {option.requiredSkill.skill} {option.requiredSkill.level}+
                    </span>
                  )}
                </div>
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}
