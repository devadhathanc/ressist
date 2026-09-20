import React, { useState } from "react";
import { PlusCircle, Upload, Link as LinkIcon, Loader2, X, Check } from "lucide-react";
import { API_BASE } from "../config.js";

export default function AddPaperModal({ isOpen, onClose, sessionId, onPaperAdded }) {
  const [activeTab, setActiveTab] = useState("doi");
  const [doi, setDoi] = useState("");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleAdd = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData();
    formData.append("session_id", sessionId);

    if (activeTab === "doi") {
      if (!doi.trim()) {
        setError("Please provide a DOI");
        setLoading(false);
        return;
      }
      formData.append("doi", doi.trim());
    } else {
      if (!file) {
        setError("Please select a PDF file");
        setLoading(false);
        return;
      }
      formData.append("pdf", file);
    }

    try {
      const res = await fetch(`${API_BASE}/api/add-paper`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to index additional paper");
      }

      const data = await res.json();
      onPaperAdded(data);
      onClose();
    } catch (err) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white max-w-md w-full overflow-hidden border border-black flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-black">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-black text-white flex items-center justify-center">
              <PlusCircle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-mono font-bold text-xs uppercase tracking-wider">Add Paper</h3>
              <p className="text-[10px] font-mono text-gray-400">comparative cross-paper synthesis</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-black p-1 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab selector */}
        <div className="flex border-b border-black text-xs font-mono uppercase tracking-wider">
          <button
            onClick={() => setActiveTab("doi")}
            className={`flex-1 py-2 flex items-center justify-center gap-1.5 transition-colors ${
              activeTab === "doi" ? "bg-black text-white" : "text-gray-500 hover:text-black"
            }`}
          >
            <LinkIcon className="w-3 h-3" />
            DOI
          </button>
          <button
            onClick={() => setActiveTab("pdf")}
            className={`flex-1 py-2 flex items-center justify-center gap-1.5 transition-colors border-l border-black ${
              activeTab === "pdf" ? "bg-black text-white" : "text-gray-500 hover:text-black"
            }`}
          >
            <Upload className="w-3 h-3" />
            PDF
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleAdd} className="p-5 space-y-4">
          {error && (
            <div className="p-2.5 border border-black text-black text-xs font-mono">
              {error}
            </div>
          )}

          {activeTab === "doi" ? (
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-1">
                Paper DOI (Open Access)
              </label>
              <input
                type="text"
                placeholder="e.g. 10.1038/s41586-020-2649-2"
                value={doi}
                onChange={(e) => setDoi(e.target.value)}
                className="w-full text-sm font-mono p-2.5 border border-black focus:outline-none focus:ring-0 placeholder:text-gray-300"
              />
            </div>
          ) : (
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-1">
                Upload Paper PDF
              </label>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files[0])}
                className="w-full text-sm font-mono p-2 border border-black file:border-0 file:bg-black file:text-white file:px-3 file:py-1 file:mr-3 file:text-xs file:font-mono file:cursor-pointer"
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-gray-500 hover:text-black border border-gray-300 hover:border-black transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 bg-black text-white text-[10px] font-mono uppercase tracking-wider hover:bg-gray-800 flex items-center gap-1.5 disabled:opacity-40 transition-colors"
            >
              {loading && <Loader2 className="w-3 h-3 animate-spin" />}
              <span>{loading ? "Embedding..." : "Add"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
