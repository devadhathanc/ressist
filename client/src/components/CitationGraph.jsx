import React, { useState, useEffect } from "react";
import { Network, ExternalLink, Loader2, ArrowRight, BookOpen, Layers } from "lucide-react";
import { API_BASE } from "../config.js";

export default function CitationGraph({ sessionId, doi, paperTitle }) {
  const [loading, setLoading] = useState(true);
  const [graphData, setGraphData] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);

  useEffect(() => {
    fetchGraph();
  }, [sessionId, doi]);

  const fetchGraph = async () => {
    setLoading(true);
    try {
      const url = `${API_BASE}/api/citation-graph?session_id=${sessionId || ""}&doi=${encodeURIComponent(doi || "")}`;
      const res = await fetch(url);
      const data = await res.json();
      setGraphData(data);
      if (data.nodes && data.nodes.length > 0) {
        setSelectedNode(data.nodes[0]);
      }
    } catch (err) {
      console.error("Failed to fetch citation graph:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-gray-400 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <p className="text-sm font-medium">Resolving citation network and bibliographic connections...</p>
      </div>
    );
  }

  const nodes = graphData?.nodes || [];
  const rootNode = nodes.find((n) => n.id === "root") || nodes[0];
  const references = nodes.filter((n) => n.type === "reference");
  const citations = nodes.filter((n) => n.type === "citation");

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[78vh] p-4 bg-gray-50 rounded-2xl border border-gray-200">
      {/* Visual Canvas */}
      <div className="flex-1 bg-white rounded-xl border border-gray-200 p-4 relative overflow-hidden flex flex-col items-center justify-center shadow-xs">
        <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-white/90 backdrop-blur-xs px-3 py-1.5 rounded-lg border border-gray-100 shadow-xs text-xs">
          <Network className="w-4 h-4 text-blue-600" />
          <span className="font-semibold text-gray-700">Citation Network Map</span>
        </div>

        <div className="absolute top-4 right-4 z-10 flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
            <span className="text-gray-600">This Paper</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span className="text-gray-600">References ({references.length})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
            <span className="text-gray-600">Citing Works ({citations.length})</span>
          </div>
        </div>

        {/* SVG Graph Layout */}
        <svg className="w-full h-full min-h-[350px]" viewBox="0 0 700 450">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#cbd5e1" />
            </marker>
          </defs>

          {/* Links for References (Root -> Ref) */}
          {references.map((ref, idx) => {
            const angle = Math.PI * 0.6 + (idx / Math.max(references.length - 1, 1)) * Math.PI * 0.8;
            const x = 350 + Math.cos(angle) * 190;
            const y = 225 + Math.sin(angle) * 150;
            const isSelected = selectedNode?.id === ref.id;
            return (
              <line
                key={`line-${ref.id}`}
                x1="350"
                y1="225"
                x2={x}
                y2={y}
                stroke={isSelected ? "#10b981" : "#e2e8f0"}
                strokeWidth={isSelected ? 2.5 : 1.5}
                strokeDasharray="4 2"
              />
            );
          })}

          {/* Links for Citing (Citing -> Root) */}
          {citations.map((cite, idx) => {
            const angle = -Math.PI * 0.3 + (idx / Math.max(citations.length - 1, 1)) * Math.PI * 0.6;
            const x = 350 + Math.cos(angle) * 200;
            const y = 225 + Math.sin(angle) * 150;
            const isSelected = selectedNode?.id === cite.id;
            return (
              <line
                key={`line-${cite.id}`}
                x1={x}
                y1={y}
                x2="350"
                y2="225"
                stroke={isSelected ? "#8b5cf6" : "#e2e8f0"}
                strokeWidth={isSelected ? 2.5 : 1.5}
                markerEnd="url(#arrow)"
              />
            );
          })}

          {/* Root Node in Center */}
          <g
            className="cursor-pointer transition-transform hover:scale-105"
            onClick={() => setSelectedNode(rootNode)}
          >
            <circle
              cx="350"
              cy="225"
              r="40"
              fill="#2563eb"
              className="drop-shadow-md"
              stroke="#93c5fd"
              strokeWidth="4"
            />
            <text x="350" y="222" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">
              Target
            </text>
            <text x="350" y="236" textAnchor="middle" fill="#dbeafe" fontSize="9">
              {rootNode?.year || "Paper"}
            </text>
          </g>

          {/* Reference Nodes */}
          {references.map((ref, idx) => {
            const angle = Math.PI * 0.6 + (idx / Math.max(references.length - 1, 1)) * Math.PI * 0.8;
            const x = 350 + Math.cos(angle) * 190;
            const y = 225 + Math.sin(angle) * 150;
            const isSelected = selectedNode?.id === ref.id;
            return (
              <g
                key={ref.id}
                className="cursor-pointer group"
                onClick={() => setSelectedNode(ref)}
              >
                <circle
                  cx={x}
                  cy={y}
                  r={isSelected ? 22 : 18}
                  fill={isSelected ? "#059669" : "#10b981"}
                  stroke={isSelected ? "#6ee7b7" : "#d1fae5"}
                  strokeWidth="3"
                  className="transition-all duration-200 drop-shadow-xs"
                />
                <text x={x} y={y + 4} textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">
                  R{idx + 1}
                </text>
                <text x={x} y={y + 30} textAnchor="middle" fill="#475569" fontSize="9" fontWeight="500">
                  {ref.title?.slice(0, 18)}...
                </text>
              </g>
            );
          })}

          {/* Citing Nodes */}
          {citations.map((cite, idx) => {
            const angle = -Math.PI * 0.3 + (idx / Math.max(citations.length - 1, 1)) * Math.PI * 0.6;
            const x = 350 + Math.cos(angle) * 200;
            const y = 225 + Math.sin(angle) * 150;
            const isSelected = selectedNode?.id === cite.id;
            return (
              <g
                key={cite.id}
                className="cursor-pointer group"
                onClick={() => setSelectedNode(cite)}
              >
                <circle
                  cx={x}
                  cy={y}
                  r={isSelected ? 22 : 18}
                  fill={isSelected ? "#7c3aed" : "#8b5cf6"}
                  stroke={isSelected ? "#c4b5fd" : "#ede9fe"}
                  strokeWidth="3"
                  className="transition-all duration-200 drop-shadow-xs"
                />
                <text x={x} y={y + 4} textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">
                  C{idx + 1}
                </text>
                <text x={x} y={y + 30} textAnchor="middle" fill="#475569" fontSize="9" fontWeight="500">
                  {cite.title?.slice(0, 18)}...
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Node Details Card */}
      <div className="w-full lg:w-80 bg-white rounded-xl border border-gray-200 p-5 flex flex-col justify-between shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span
              className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                selectedNode?.type === "target"
                  ? "bg-blue-100 text-blue-700"
                  : selectedNode?.type === "reference"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-purple-100 text-purple-700"
              }`}
            >
              {selectedNode?.type === "target" ? "Active Paper" : selectedNode?.type === "reference" ? "Baseline Reference" : "Citing Publication"}
            </span>
            {selectedNode?.year && (
              <span className="text-xs text-gray-400 font-mono">({selectedNode.year})</span>
            )}
          </div>

          <h3 className="text-base font-bold text-gray-900 leading-snug mb-3">
            {selectedNode?.title || paperTitle || "Selected Paper"}
          </h3>

          <div className="space-y-2 text-xs text-gray-600 bg-gray-50 p-3 rounded-lg border border-gray-100 mb-4">
            <div className="flex justify-between">
              <span className="text-gray-400">Total Citations:</span>
              <span className="font-semibold text-gray-800">{selectedNode?.citations ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Network Role:</span>
              <span className="font-semibold text-gray-800">
                {selectedNode?.type === "target" ? "Core Focal Work" : selectedNode?.type === "reference" ? "Foundational Precedent" : "Downstream Research"}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <a
            href={`https://scholar.google.com/scholar?q=${encodeURIComponent(selectedNode?.title || "")}`}
            target="_blank"
            rel="noreferrer"
            className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            <span>Search on Google Scholar</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
