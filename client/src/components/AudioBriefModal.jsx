import React, { useState, useEffect, useRef } from "react";
import { Headphones, Play, Pause, SkipForward, SkipBack, X, Volume2, Loader2, Sparkles } from "lucide-react";
import { API_BASE } from "../config.js";

export default function AudioBriefModal({ isOpen, onClose, sessionId }) {
  const [loading, setLoading] = useState(false);
  const [scriptData, setScriptData] = useState(null);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const synthRef = useRef(null);
  const utteranceRef = useRef(null);

  useEffect(() => {
    if (isOpen && !scriptData) {
      fetchAudioScript();
    }
  }, [isOpen, sessionId]);

  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      synthRef.current = window.speechSynthesis;
    }
    return () => {
      if (synthRef.current) {
        synthRef.current.cancel();
      }
    };
  }, []);

  const fetchAudioScript = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/audio-summary?session_id=${sessionId}`);
      const data = await res.json();
      setScriptData(data);
    } catch (err) {
      console.error("Failed to fetch audio brief script:", err);
    } finally {
      setLoading(false);
    }
  };

  const playTurn = (index) => {
    if (!scriptData || !scriptData.dialogue || !scriptData.dialogue[index]) {
      setIsPlaying(false);
      return;
    }
    if (!synthRef.current) return;

    synthRef.current.cancel();
    const turn = scriptData.dialogue[index];
    setCurrentTurn(index);
    setIsPlaying(true);

    const utterance = new SpeechSynthesisUtterance(turn.text);
    utteranceRef.current = utterance;

    // Pick distinct pitches/rates based on speaker
    const voices = synthRef.current.getVoices();
    const englishVoices = voices.filter((v) => v.lang.startsWith("en"));

    if (turn.speaker === "Alex" || turn.voice === "host1") {
      utterance.pitch = 1.1;
      utterance.rate = 1.05;
      if (englishVoices.length > 0) utterance.voice = englishVoices[0];
    } else {
      utterance.pitch = 0.92;
      utterance.rate = 1.0;
      if (englishVoices.length > 1) utterance.voice = englishVoices[1];
    }

    utterance.onend = () => {
      if (index + 1 < scriptData.dialogue.length) {
        playTurn(index + 1);
      } else {
        setIsPlaying(false);
      }
    };

    utterance.onerror = () => {
      setIsPlaying(false);
    };

    synthRef.current.speak(utterance);
  };

  const togglePlay = () => {
    if (isPlaying) {
      if (synthRef.current) synthRef.current.pause();
      setIsPlaying(false);
    } else {
      if (synthRef.current && synthRef.current.paused) {
        synthRef.current.resume();
        setIsPlaying(true);
      } else {
        playTurn(currentTurn);
      }
    }
  };

  const handleNext = () => {
    if (scriptData && currentTurn + 1 < scriptData.dialogue.length) {
      playTurn(currentTurn + 1);
    }
  };

  const handlePrev = () => {
    if (currentTurn > 0) {
      playTurn(currentTurn - 1);
    }
  };

  const handleClose = () => {
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    setIsPlaying(false);
    onClose();
  };

  if (!isOpen) return null;

  const dialogue = scriptData?.dialogue || [];
  const activeTurn = dialogue[currentTurn] || dialogue[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-black text-white max-w-xl w-full overflow-hidden border border-white/20 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 border border-white/30 flex items-center justify-center">
              <Headphones className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-mono font-bold text-xs uppercase tracking-wider">Audio Overview</h3>
              <p className="text-[10px] font-mono text-gray-500">2-host deep dive</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-white p-1 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 text-gray-500 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-white" />
            <p className="text-[10px] font-mono uppercase tracking-wider">generating script...</p>
          </div>
        ) : (
          <div className="p-6 flex flex-col items-center">
            {/* Audio waveform visualizer animation */}
            <div className="flex items-center justify-center gap-1 h-12 my-4">
              {[40, 65, 30, 85, 95, 50, 75, 35, 90, 60, 45, 70].map((h, i) => (
                <div
                  key={i}
                  className={`w-1 rounded-full transition-all duration-300 ${
                    isPlaying
                      ? "bg-white animate-pulse"
                      : "bg-gray-700"
                  }`}
                  style={{
                    height: isPlaying ? `${Math.max(8, (h * (i % 3 + 1)) % 48)}px` : "6px",
                    animationDelay: `${i * 80}ms`,
                  }}
                />
              ))}
            </div>

            {/* Active Dialogue Card */}
            {activeTurn && (
              <div className="w-full border border-white/10 p-4 my-2 text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <span
                    className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 border ${
                      activeTurn.speaker === "Alex" || activeTurn.voice === "host1"
                        ? "border-white/30 text-white"
                        : "border-gray-600 text-gray-400"
                    }`}
                  >
                    {activeTurn.speaker}
                  </span>
                  <span className="text-[10px] font-mono text-gray-600">
                    {currentTurn + 1}/{dialogue.length}
                  </span>
                </div>
                <p className="text-sm text-gray-300 leading-relaxed font-sans">
                  "{activeTurn.text}"
                </p>
              </div>
            )}

            {/* Audio Controls */}
            <div className="flex items-center gap-4 mt-6">
              <button
                onClick={handlePrev}
                disabled={currentTurn === 0}
                className="p-2 border border-white/20 hover:bg-white/10 disabled:opacity-20 text-gray-300 transition-colors"
              >
                <SkipBack className="w-4 h-4" />
              </button>

              <button
                onClick={togglePlay}
                className="p-4 bg-white text-black hover:bg-gray-200 transition-colors active:scale-95"
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
              </button>

              <button
                onClick={handleNext}
                disabled={currentTurn >= dialogue.length - 1}
                className="p-2 border border-white/20 hover:bg-white/10 disabled:opacity-20 text-gray-300 transition-colors"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
