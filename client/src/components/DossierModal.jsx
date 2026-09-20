import React from "react";
import { Sparkles, FileText, CheckCircle2, AlertTriangle, Cpu, HelpCircle, X } from "lucide-react";

export default function DossierModal({ isOpen, onClose, dossier, onSelectQuestion }) {
  if (!isOpen) return null;

  const {
    core_thesis = "Paper briefing not yet generated.",
    key_findings = [],
    methodology = "Neural semantic vector extraction and context synthesis.",
    limitations = [],
    suggested_questions = []
  } = dossier || {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-black">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-black bg-white">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-black text-white flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-mono font-bold uppercase tracking-wider">Executive Dossier</h2>
              <p className="text-[10px] font-mono text-gray-400">automated synthesis</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-black p-1 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="overflow-y-auto p-6 space-y-5 text-sm font-sans">
          {/* Core Thesis */}
          <div className="border border-black p-4">
            <div className="flex items-center gap-2 font-mono font-bold text-[10px] uppercase tracking-wider text-black mb-2">
              <FileText className="w-3.5 h-3.5" />
              Core Thesis
            </div>
            <p className="text-gray-800 leading-relaxed">{core_thesis}</p>
          </div>

          {/* Key Findings */}
          {key_findings.length > 0 && (
            <div>
              <div className="flex items-center gap-2 font-mono font-bold text-[10px] uppercase tracking-wider text-black mb-2">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Key Findings
              </div>
              <div className="grid gap-1.5">
                {key_findings.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 border border-gray-200 p-2.5 text-gray-800"
                  >
                    <span className="text-[10px] font-mono font-bold text-black bg-gray-100 px-1.5 py-0.5 mt-0.5">
                      {idx + 1}
                    </span>
                    <span className="leading-snug text-sm">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Methodology & Architecture */}
          <div>
            <div className="flex items-center gap-2 font-mono font-bold text-[10px] uppercase tracking-wider text-black mb-2">
              <Cpu className="w-3.5 h-3.5" />
              Methodology
            </div>
            <div className="border border-gray-200 p-3 text-gray-700 leading-relaxed">
              {methodology}
            </div>
          </div>

          {/* Limitations */}
          {limitations.length > 0 && (
            <div>
              <div className="flex items-center gap-2 font-mono font-bold text-[10px] uppercase tracking-wider text-black mb-2">
                <AlertTriangle className="w-3.5 h-3.5" />
                Limitations
              </div>
              <ul className="space-y-1 border border-gray-200 p-3 text-gray-700">
                {limitations.map((lim, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm leading-relaxed">
                    <span className="text-black font-bold">·</span>
                    <span>{lim}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Suggested Questions */}
          {suggested_questions.length > 0 && (
            <div>
              <div className="flex items-center gap-2 font-mono font-bold text-[10px] uppercase tracking-wider text-black mb-2">
                <HelpCircle className="w-3.5 h-3.5" />
                Suggested Questions
              </div>
              <div className="flex flex-wrap gap-1.5">
                {suggested_questions.map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      onSelectQuestion(q);
                      onClose();
                    }}
                    className="text-left border border-gray-300 hover:border-black hover:bg-black hover:text-white px-3 py-2 text-xs font-mono transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-black bg-white flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-black text-white text-[10px] font-mono uppercase tracking-wider hover:bg-gray-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
