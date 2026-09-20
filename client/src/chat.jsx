import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import {
  ArrowLeft,
  Sparkles,
  FileText,
  Headphones,
  Network,
  PlusCircle,
  Eye,
  EyeOff,
  Send,
  Loader2,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  BookOpen
} from "lucide-react";

import { API_BASE } from "./config.js";
import MermaidBlock from "./components/MermaidBlock.jsx";
import DossierModal from "./components/DossierModal.jsx";
import CitationGraph from "./components/CitationGraph.jsx";
import AudioBriefModal from "./components/AudioBriefModal.jsx";
import AddPaperModal from "./components/AddPaperModal.jsx";

const PERSONAS = [
  { id: "default", name: "Standard", icon: "—", hint: "Objective & Rigorous" },
  { id: "reviewer_2", name: "Reviewer #2", icon: "×", hint: "Methodology & Biases Critic" },
  { id: "layman", name: "ELI5", icon: "○", hint: "Metaphors & Plain Language" },
  { id: "engineer", name: "Engineer", icon: "△", hint: "Algorithms, PyTorch & Math" },
  { id: "socratic", name: "Socratic", icon: "◇", hint: "Deep Understanding Questions" },
];

function Chat() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session_id } = useParams();

  const [title, setTitle] = useState(location.state?.title || "Research Document");
  const [journal, setJournal] = useState(location.state?.journal || "Academic Repository");
  const [doi, setDoi] = useState(location.state?.doi || "");
  const [secondaryPaper, setSecondaryPaper] = useState("");

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState("default");

  // View Controls
  const [activeTab, setActiveTab] = useState("chat"); // 'chat' | 'graph'
  const [showPdf, setShowPdf] = useState(true);
  const [activePdfPage, setActivePdfPage] = useState(1);

  // Modals
  const [isDossierOpen, setIsDossierOpen] = useState(false);
  const [isAudioOpen, setIsAudioOpen] = useState(false);
  const [isAddPaperOpen, setIsAddPaperOpen] = useState(false);
  const [dossierData, setDossierData] = useState(null);

  const chatContainerRef = useRef(null);

  // Load chat history & session metadata
  useEffect(() => {
    if (!session_id) return;

    fetch(`${API_BASE}/api/chat-history?session_id=${session_id}`)
      .then((res) => res.json())
      .then((data) => {
        const mappedMessages = (data.messages || []).map((msg) => ({
          question: msg.question || "",
          response: msg.response || "",
        }));

        if (data.title) setTitle(data.title);
        if (data.journal) setJournal(data.journal);
        setMessages(mappedMessages);
      })
      .catch((err) => console.error("Failed to fetch chat history:", err));

    // Fetch Executive Dossier
    fetch(`${API_BASE}/api/dossier?session_id=${session_id}`)
      .then((res) => res.json())
      .then((data) => {
        setDossierData(data);
      })
      .catch((err) => console.error("Failed to fetch dossier:", err));
  }, [session_id]);

  // Auto-scroll chat
  useEffect(() => {
    if (!chatContainerRef.current) return;
    const container = chatContainerRef.current;
    container.scrollTop = container.scrollHeight;
  }, [messages, loading]);

  const sendMessage = async (overrideText) => {
    const textToSend = (overrideText || input).trim();
    if (!textToSend || loading) return;

    const newMessages = [
      ...messages,
      { question: textToSend, response: "", persona: selectedPersona },
    ];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: session_id || "",
          question: textToSend,
          persona: selectedPersona,
        }),
      });

      let data = await res.json().catch(() => null);

      setMessages([
        ...newMessages.slice(0, -1),
        {
          question: textToSend,
          response: data?.answer || "No response received from model.",
          citations: data?.citations || [],
          persona: data?.persona || selectedPersona,
        },
      ]);
    } catch (err) {
      console.error(err);
      setMessages([
        ...newMessages.slice(0, -1),
        {
          question: textToSend,
          response: "Failed to reach backend service.",
          persona: selectedPersona,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Click-to-jump citation replacement logic
  const renderTextWithCitations = (content) => {
    if (typeof content !== "string") return content;

    const parts = [];
    const regex = /\[(?:Page|p\.)\s*(\d+)\]/gi;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(content.substring(lastIndex, match.index));
      }
      const pageNum = parseInt(match[1], 10);
      parts.push(
        <button
          key={`cite-${match.index}`}
          onClick={() => {
            setActivePdfPage(pageNum);
            setShowPdf(true);
          }}
          className="inline-flex items-center gap-1 mx-0.5 px-1.5 py-0 bg-gray-100 hover:bg-black hover:text-white text-black border border-gray-300 hover:border-black rounded-none font-mono text-[10px] font-bold cursor-pointer transition-colors"
          title={`Jump to Page ${pageNum}`}
        >
          <span>p.{pageNum}</span>
        </button>
      );
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < content.length) {
      parts.push(content.substring(lastIndex));
    }

    return parts;
  };

  const pdfViewerUrl = `${API_BASE}/api/session-pdf?session_id=${session_id}#page=${activePdfPage}`;

  return (
    <div className="flex flex-col h-screen bg-white text-black font-mono overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="flex items-center justify-between px-4 py-2 bg-white border-b border-black z-20 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-1 px-2 py-1 text-xs font-mono text-black border border-black hover:bg-black hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            <span>EXIT</span>
          </button>

          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h1 className="text-xs font-bold text-black max-w-xs md:max-w-md truncate uppercase tracking-wide">
                {title}
              </h1>
              <span className="text-[10px] px-2 py-0.5 bg-white text-gray-500 border border-gray-300 font-mono hidden sm:inline">
                {journal}
              </span>
            </div>
            {secondaryPaper && (
              <span className="text-[9px] font-mono text-gray-400 mt-0.5 truncate max-w-xs md:max-w-md">
                + comparing: {secondaryPaper}
              </span>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          {/* Tab switch */}
          <div className="flex items-center gap-0 text-xs border border-black">
            <button
              onClick={() => setActiveTab("chat")}
              className={`px-3 py-1 font-mono uppercase tracking-wider text-[10px] transition-colors ${
                activeTab === "chat" ? "bg-black text-white" : "text-black hover:bg-gray-100"
              }`}
            >
              Chat
            </button>
            <button
              onClick={() => setActiveTab("graph")}
              className={`px-3 py-1 font-mono uppercase tracking-wider text-[10px] transition-colors border-l border-black ${
                activeTab === "graph" ? "bg-black text-white" : "text-black hover:bg-gray-100"
              }`}
            >
              Graph
            </button>
          </div>

          {/* Feature Modals Trigger Buttons */}
          <button
            onClick={() => setIsDossierOpen(true)}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-black border border-black hover:bg-black hover:text-white transition-colors"
            title="Open Executive Dossier"
          >
            <Sparkles className="w-3 h-3" />
            <span className="hidden md:inline">Dossier</span>
          </button>

          <button
            onClick={() => setIsAudioOpen(true)}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-black border border-black hover:bg-black hover:text-white transition-colors"
            title="Listen to 2-host audio brief"
          >
            <Headphones className="w-3 h-3" />
            <span className="hidden md:inline">Audio</span>
          </button>

          <button
            onClick={() => setIsAddPaperOpen(true)}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-black border border-black hover:bg-black hover:text-white transition-colors"
            title="Add secondary paper for comparative synthesis"
          >
            <PlusCircle className="w-3 h-3" />
            <span className="hidden lg:inline">Compare</span>
          </button>

          {/* Toggle PDF Split-Screen */}
          <button
            onClick={() => setShowPdf(!showPdf)}
            className={`p-1.5 border border-black transition-colors ${
              showPdf
                ? "bg-black text-white"
                : "bg-white text-black hover:bg-gray-100"
            }`}
            title={showPdf ? "Hide PDF Viewer" : "Show Split PDF Viewer"}
          >
            {showPdf ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>
        </div>
      </header>

      {/* Main Content Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {activeTab === "graph" ? (
          <div className="flex-1 p-4 overflow-hidden">
            <CitationGraph sessionId={session_id} doi={doi} paperTitle={title} />
          </div>
        ) : (
          <>
            {/* Split Screen PDF Viewer (Left Panel) */}
            {showPdf && (
              <div className="w-full lg:w-1/2 flex flex-col border-r border-black bg-gray-50 shrink-0">
                {/* PDF Viewer Bar */}
                <div className="flex items-center justify-between px-4 py-1.5 bg-black text-white text-[10px] font-mono uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">pg</span>
                    <button
                      onClick={() => setActivePdfPage(Math.max(1, activePdfPage - 1))}
                      className="p-0.5 hover:bg-white/10 text-gray-300"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="px-2 py-0.5 border border-gray-600 text-white font-bold">
                      {activePdfPage}
                    </span>
                    <button
                      onClick={() => setActivePdfPage(activePdfPage + 1)}
                      className="p-0.5 hover:bg-white/10 text-gray-300"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <a
                    href={pdfViewerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-gray-400 hover:text-white"
                  >
                    <span>open</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                {/* PDF Frame */}
                <div className="flex-1 w-full bg-white relative">
                  <iframe
                    key={activePdfPage}
                    src={pdfViewerUrl}
                    className="w-full h-full border-0"
                    title="Research Paper PDF"
                  />
                </div>
              </div>
            )}

            {/* Chat Conversation Area (Right Panel) */}
            <div className="flex-1 flex flex-col h-full bg-white min-w-0">
              {/* Persona Selection Bar */}
              <div className="flex items-center gap-1 p-2 bg-white border-b border-gray-200 overflow-x-auto shrink-0">
                <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-gray-400 px-2 shrink-0">
                  mode
                </span>
                {PERSONAS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPersona(p.id)}
                    className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider transition-colors shrink-0 ${
                      selectedPersona === p.id
                        ? "bg-black text-white"
                        : "text-gray-500 hover:text-black border border-transparent hover:border-gray-300"
                    }`}
                    title={p.hint}
                  >
                    <span>{p.icon}</span>
                    <span>{p.name}</span>
                  </button>
                ))}
              </div>

              {/* Chat Message List */}
              <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full max-w-lg mx-auto text-center space-y-4">
                    <div className="w-12 h-12 border border-black flex items-center justify-center">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-sm font-mono font-bold uppercase tracking-wider">
                        Ask Anything
                      </h2>
                      <p className="text-[10px] text-gray-400 mt-1 font-mono">
                        Grounded answers · page citations · flowcharts · formulas · persona modes
                      </p>
                    </div>

                    {/* Suggested Smart Inquiries */}
                    {dossierData?.suggested_questions && (
                      <div className="w-full space-y-2 text-left pt-2">
                        <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-gray-400">
                          suggested
                        </span>
                        <div className="grid gap-1.5">
                          {dossierData.suggested_questions.map((q, idx) => (
                            <button
                              key={idx}
                              onClick={() => sendMessage(q)}
                              className="w-full text-left p-2.5 bg-white hover:bg-black hover:text-white border border-gray-200 hover:border-black text-[11px] font-mono transition-colors flex items-center justify-between group"
                            >
                              <span>{q}</span>
                              <Send className="w-3 h-3 text-gray-300 group-hover:text-white transition-colors" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  messages.map((msg, i) => (
                    <div key={i} className="flex flex-col space-y-2">
                      {/* User Query */}
                      <div className="self-end max-w-[85%] md:max-w-[70%] bg-black text-white px-4 py-2.5 text-sm font-sans leading-relaxed">
                        {msg.question}
                      </div>

                      {/* Bot Response */}
                      <div className="self-start max-w-[95%] md:max-w-[85%] bg-white border border-gray-200 p-4 text-sm text-gray-800">
                        {/* Persona tag */}
                        <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-gray-100 text-[10px] font-mono uppercase tracking-wider text-gray-400">
                          <span>
                            {PERSONAS.find((p) => p.id === msg.persona)?.icon || "—"}
                          </span>
                          <span>
                            {PERSONAS.find((p) => p.id === msg.persona)?.name || "ressist"}
                          </span>
                        </div>

                        {/* Markdown with LaTeX & Mermaid support */}
                        <div className="prose prose-sm max-w-none text-gray-800 break-words font-sans">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath]}
                            rehypePlugins={[rehypeKatex]}
                            components={{
                              code({ node, inline, className, children, ...props }) {
                                const match = /language-(\w+)/.exec(className || "");
                                if (!inline && match && match[1] === "mermaid") {
                                  return <MermaidBlock chart={String(children).replace(/\n$/, "")} />;
                                }
                                return !inline ? (
                                  <pre className="bg-black text-white p-3 overflow-x-auto text-xs my-2 font-mono">
                                    <code className={className} {...props}>
                                      {children}
                                    </code>
                                  </pre>
                                ) : (
                                  <code className="bg-gray-100 text-black px-1 py-0.5 font-mono text-xs border border-gray-200" {...props}>
                                    {children}
                                  </code>
                                );
                              },
                              p({ children }) {
                                return (
                                  <p className="mb-2 leading-relaxed">
                                    {React.Children.map(children, (child) => {
                                      if (typeof child === "string") {
                                        return renderTextWithCitations(child);
                                      }
                                      return child;
                                    })}
                                  </p>
                                );
                              },
                            }}
                          >
                            {msg.response || "Analyzing text chunks..."}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  ))
                )}

                {loading && (
                  <div className="self-start flex items-center gap-2 p-3 border border-gray-200 text-[10px] font-mono uppercase tracking-wider text-gray-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                    <span>
                      synthesizing · {PERSONAS.find(p => p.id === selectedPersona)?.name}
                    </span>
                  </div>
                )}
              </div>

              {/* Chat Input Bar */}
              <div className="p-3 bg-white border-t border-black shrink-0">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendMessage();
                  }}
                  className="flex items-center gap-2 max-w-4xl mx-auto"
                >
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={`ask in ${PERSONAS.find((p) => p.id === selectedPersona)?.name} mode...`}
                    disabled={loading}
                    className="flex-1 text-sm font-mono bg-white border border-black py-2 px-4 outline-none focus:ring-0 placeholder:text-gray-300"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || loading}
                    className="bg-black hover:bg-gray-800 disabled:opacity-20 text-white p-2.5 transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </div>
            </>
          )}
      </div>

      {/* Modals */}
      <DossierModal
        isOpen={isDossierOpen}
        onClose={() => setIsDossierOpen(false)}
        dossier={dossierData}
        onSelectQuestion={(q) => sendMessage(q)}
      />

      <AudioBriefModal
        isOpen={isAudioOpen}
        onClose={() => setIsAudioOpen(false)}
        sessionId={session_id}
      />

      <AddPaperModal
        isOpen={isAddPaperOpen}
        onClose={() => setIsAddPaperOpen(false)}
        sessionId={session_id}
        onPaperAdded={(res) => {
          setSecondaryPaper(res.title || "Supplemental Paper");
        }}
      />
    </div>
  );
}

export default Chat;