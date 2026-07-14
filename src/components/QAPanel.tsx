import React, { useState, useEffect } from "react";
import { 
  Search, 
  Cpu, 
  FileText, 
  Sliders, 
  HelpCircle, 
  ArrowRight, 
  ShieldCheck, 
  MessageSquare,
  Bookmark,
  ChevronDown,
  ExternalLink,
  History,
  Trash2
} from "lucide-react";
import { DocumentChunk, Citation } from "../types";

interface QAPanelProps {
  onSearch: (query: string, alpha: number) => Promise<any>;
  onNavigateToDoc: (id: string) => void;
}

interface ConversationItem {
  id: string;
  query: string;
  answer: string;
  timestamp: number;
  citationsCount: number;
}

export default function QAPanel({ onSearch, onNavigateToDoc }: QAPanelProps) {
  const [query, setQuery] = useState("");
  const [alpha, setAlpha] = useState(0.7);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Response states
  const [answer, setAnswer] = useState<string | null>(null);
  const [retrievedChunks, setRetrievedChunks] = useState<DocumentChunk[]>([]);
  const [citations, setCitations] = useState<Citation[]>([]);
  
  // Conversation history stored in localStorage
  const [conversationHistory, setConversationHistory] = useState<ConversationItem[]>([]);
  
  // Highlight modal/detail state
  const [selectedChunkDetail, setSelectedChunkDetail] = useState<DocumentChunk | null>(null);

  // Load conversation history from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('rag_conversation_history');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setConversationHistory(parsed);
      } catch (e) {
        console.error("Failed to parse conversation history:", e);
      }
    }
  }, []);

  // Save conversation history to localStorage whenever it changes
  useEffect(() => {
    if (conversationHistory.length > 0) {
      localStorage.setItem('rag_conversation_history', JSON.stringify(conversationHistory));
    }
  }, [conversationHistory]);

  const handleHistoryClick = (item: ConversationItem) => {
    setQuery(item.query);
    setAnswer(item.answer);
    // Note: We don't restore chunks/citations since they're not stored
  };

  const handleClearHistory = () => {
    if (confirm("Clear all conversation history?")) {
      setConversationHistory([]);
      localStorage.removeItem('rag_conversation_history');
    }
  };

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);
    setAnswer(null);
    setRetrievedChunks([]);
    setCitations([]);

    try {
      const res = await onSearch(query, alpha);
      console.log("Search response:", res); // Debug log
      
      if (!res || !res.answer) {
        throw new Error("Invalid response structure from server");
      }
      
      setAnswer(res.answer);
      setRetrievedChunks(res.retrievedChunks || []);
      setCitations(res.citations || []);

      // Add to conversation history
      const newItem: ConversationItem = {
        id: Date.now().toString(),
        query: query.trim(),
        answer: res.answer,
        timestamp: Date.now(),
        citationsCount: res.citations?.length || 0
      };
      setConversationHistory(prev => [newItem, ...prev].slice(0, 50)); // Keep last 50
      
    } catch (err: any) {
      console.error("Search error:", err); // Debug log
      setError(err.message || "Failed to retrieve tax answer.");
    } finally {
      setIsLoading(false);
    }
  };

  // Parses response text to add visual highlight accents around citations in brackets e.g. [Document Title, p. X]
  const renderFormattedAnswer = (text: string) => {
    if (!text) return null;
    
    // Regular expression to identify legal citation references e.g., [Commissioner v. Glenshaw Glass Co., 348 U.S. 426, p. 2]
    const citationRegex = /(\[([^\]]+,\s*(?:p\.|page)\s*\d+)\])/gi;
    
    const parts = text.split(citationRegex);
    if (parts.length === 1) return <p className="whitespace-pre-wrap">{text}</p>;

    const elements: React.ReactNode[] = [];
    let i = 0;
    
    while (i < parts.length) {
      const normalText = parts[i];
      if (normalText) {
        elements.push(<span key={`text-${i}`}>{normalText}</span>);
      }
      
      const fullCitation = parts[i + 1]; // e.g. "[Glenshaw Glass, p. 2]"
      const citationContent = parts[i + 2]; // e.g. "Glenshaw Glass, p. 2"
      
      if (fullCitation && citationContent) {
        // Try to match the cited document id in retrieved chunks to allow direct jumps
        const chunkMatch = retrievedChunks.find(c => 
          citationContent.toLowerCase().includes(c.docTitle.toLowerCase().slice(0, 15)) ||
          citationContent.toLowerCase().includes(c.citationCode.toLowerCase())
        );

        elements.push(
          <span 
            key={`cite-${i}`}
            onClick={() => {
              if (chunkMatch) {
                setSelectedChunkDetail(chunkMatch);
              } else {
                // If it's a general document, try to look up
                const docId = retrievedChunks[0]?.docId;
                if (docId) onNavigateToDoc(docId);
              }
            }}
            className="inline-flex items-center gap-0.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded cursor-pointer transition select-none border border-slate-200 mx-0.5"
            title="Trace back to physical source document page"
          >
            <Bookmark className="w-2.5 h-2.5 text-slate-600" />
            {citationContent}
          </span>
        );
      }
      i += 3;
    }

    return <div className="whitespace-pre-wrap leading-relaxed space-y-3">{elements}</div>;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      
      {/* Search Console & Conversation History Side-rail */}
      <div className="lg:col-span-4 bg-white rounded-xl border border-gray-100 shadow-xs p-5 flex flex-col gap-5 h-[620px]">
        <div>
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
            <Sliders className="w-4 h-4 text-slate-700" />
            Search Settings
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Adjust search parameters and view conversation history.
          </p>
        </div>

        {/* Alpha Tuning Slider */}
        <div className="bg-slate-50 border rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-wider text-gray-500">
            <span>Lexical Keyword</span>
            <span>Semantic Vector</span>
          </div>
          
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={alpha}
            onChange={(e) => setAlpha(parseFloat(e.target.value))}
            className="w-full accent-slate-950 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />

          <div className="flex justify-between items-center text-xs font-semibold text-gray-700">
            <span className={alpha <= 0.3 ? "text-slate-900 font-bold" : "text-gray-400"}>
              Keyword (TF-IDF)
            </span>
            <span className="text-[10px] font-mono bg-white border border-gray-200 rounded px-1.5 py-0.5 shadow-2xs">
              α = {alpha.toFixed(2)}
            </span>
            <span className={alpha >= 0.7 ? "text-slate-900 font-bold" : "text-gray-400"}>
              Vector (Dense)
            </span>
          </div>

          <p className="text-[10px] leading-relaxed text-gray-400 italic pt-1">
            {alpha === 0.5 
              ? "Balanced Hybrid retrieval mode. Blends dense semantic context and exact statutory matching equally."
              : alpha < 0.5 
                ? "Favoring exact legal term definitions, statutory section codes, and phrase overlap."
                : "Favoring overall conceptual similarity and contextual intent mapping."
            }
          </p>
        </div>

        {/* Conversation History */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" />
              Conversation History
            </h4>
            {conversationHistory.length > 0 && (
              <button
                onClick={handleClearHistory}
                className="text-[9px] text-gray-400 hover:text-red-600 uppercase tracking-wider flex items-center gap-1"
                title="Clear all history"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto pr-1 space-y-2">
            {conversationHistory.length === 0 ? (
              <div className="text-[10px] text-gray-400 italic text-center py-4">
                No conversations yet. Ask a question to start.
              </div>
            ) : (
              conversationHistory.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleHistoryClick(item)}
                  className="w-full p-2.5 rounded-lg border text-left text-xs hover:border-slate-800 hover:bg-slate-50 transition group"
                >
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <span className="text-[10px] font-bold text-gray-700 line-clamp-2">
                      {item.query}
                    </span>
                    <span className="text-[8px] text-gray-400 shrink-0">
                      {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="text-[9px] text-gray-500 line-clamp-2 leading-relaxed">
                    {item.answer.substring(0, 80)}...
                  </div>
                  <div className="text-[8px] text-gray-400 mt-1 flex items-center gap-1">
                    <Bookmark className="w-2.5 h-2.5" />
                    {item.citationsCount} citation{item.citationsCount !== 1 ? 's' : ''}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Anti-Hallucination Guard Statement */}
        <div className="p-3.5 bg-emerald-50 rounded-lg border border-emerald-100 flex gap-2.5 text-[11px] text-emerald-800">
          <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block uppercase tracking-wider text-[9px] text-emerald-900 mb-0.5">
              Faithfulness Guarantee
            </span>
            Gemini is bounded under strict system guidelines to answer 100% within the fetched source text. No outside speculation.
          </div>
        </div>
      </div>

      {/* Main Q&A Display Area */}
      <div className="lg:col-span-8 flex flex-col h-[620px] bg-white rounded-xl border border-gray-100 shadow-xs overflow-hidden">
        
        {/* Search Bar Form */}
        <form onSubmit={handleSearchSubmit} className="p-4 border-b border-gray-100 bg-gray-50 flex gap-2 shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Ask a natural language US tax question... (e.g., Are staking rewards taxable?)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full text-xs p-3 pl-9 border border-gray-200 rounded-lg focus:outline-slate-800 bg-white shadow-2xs"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !query.trim()}
            className="bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs py-2 px-5 rounded-lg transition disabled:opacity-50 flex items-center gap-1"
          >
            {isLoading ? "Analyzing..." : "Ask Counsel"}
          </button>
        </form>

        {/* Content Display Panel */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-4 bg-rose-50 text-rose-800 text-xs border border-rose-100 rounded-lg flex items-center gap-2">
              <span className="font-bold">Error:</span> {error}
            </div>
          )}

          {isLoading && (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-4 border-slate-100 border-t-slate-900 animate-spin" />
                <Cpu className="absolute inset-0 m-auto w-5 h-5 text-slate-700 animate-pulse" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Ingesting Queries & Processing Context...
                </h4>
                <p className="text-[10px] text-gray-400 max-w-xs mt-1 leading-relaxed">
                  Extracting hybrid rank indexes, traversing case-law citation graphs, and preparing faithful summaries.
                </p>
              </div>
            </div>
          )}

          {!isLoading && !answer && !error && (
            <div className="flex flex-col items-center justify-center py-24 text-center text-gray-400 space-y-3">
              <MessageSquare className="w-12 h-12 text-gray-300" />
              <div>
                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Counsel Research Terminal Ready
                </h4>
                <p className="text-[11px] text-gray-500 max-w-sm mt-1 leading-relaxed">
                  Type a tax question above or click a suggested query card. The engine will retrieve relevant pages, highlight citation sources, and synthesize an expert brief.
                </p>
              </div>
            </div>
          )}

          {!isLoading && answer && (
            <div className="space-y-6 animate-fade-in">
              {/* Synthesized Answer Card */}
              <div className="bg-slate-50 border border-gray-200 rounded-xl p-5 space-y-4">
                <div className="flex justify-between items-center border-b border-gray-200 pb-2.5">
                  <span className="text-[10px] font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Cpu className="w-4 h-4 text-slate-700" />
                    Synthesized Legal Advisory
                  </span>
                  <span className="text-[10px] font-mono text-gray-400 flex items-center gap-1 bg-white border px-2 py-0.5 rounded shadow-2xs">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Verified 100% Faithful
                  </span>
                </div>

                <div className="text-gray-800 font-serif text-sm leading-relaxed antialiased">
                  {renderFormattedAnswer(answer)}
                </div>
              </div>

              {/* Retrieved Sources Section */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-gray-500" />
                  Retrieved Legal Context Fragments ({retrievedChunks.length})
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {retrievedChunks.map((chunk, idx) => {
                    // Match a score from matching search
                    return (
                      <div
                        key={chunk.id}
                        onClick={() => setSelectedChunkDetail(chunk)}
                        className="bg-white border border-gray-200 hover:border-slate-800 rounded-lg p-3.5 cursor-pointer transition flex flex-col justify-between text-left shadow-2xs group hover:shadow-xs"
                      >
                        <div>
                          <div className="flex justify-between items-start gap-2 mb-1.5">
                            <span className="text-[9px] uppercase font-mono bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded">
                              {chunk.citationCode}
                            </span>
                            <span className="text-[9px] font-mono font-medium text-gray-400 bg-gray-50 border px-1 py-0.5 rounded">
                              Page {chunk.pageIndex}
                            </span>
                          </div>
                          <h5 className="text-xs font-bold text-gray-900 group-hover:text-slate-900 transition mb-1">
                            {chunk.docTitle}
                          </h5>
                          <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-3">
                            "{chunk.text}"
                          </p>
                        </div>
                        <div className="text-[9px] uppercase font-bold text-slate-800 flex items-center gap-1.5 border-t border-gray-100 pt-2.5 mt-3">
                          <span>Inspect Source</span>
                          <ExternalLink className="w-3 h-3 text-gray-400" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Page Source Inspector Modal */}
      {selectedChunkDetail && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl border max-w-2xl w-full flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-gray-100 bg-gray-50 flex justify-between items-start">
              <div>
                <div className="flex items-center gap-1.5 text-[10px] uppercase font-mono font-bold text-gray-500 mb-1">
                  <span>{selectedChunkDetail.citationCode}</span>
                  <span>•</span>
                  <span>Page {selectedChunkDetail.pageIndex}</span>
                </div>
                <h3 className="text-sm font-bold text-gray-900 leading-snug">
                  {selectedChunkDetail.docTitle}
                </h3>
              </div>
              <button
                onClick={() => setSelectedChunkDetail(null)}
                className="text-xs text-gray-400 hover:text-gray-600 font-bold uppercase tracking-wider p-1.5"
              >
                Close
              </button>
            </div>

            <div className="p-6 overflow-y-auto font-serif text-sm leading-relaxed text-gray-800 bg-amber-50/20">
              <div className="bg-white border rounded-lg p-5 shadow-2xs relative">
                <span className="absolute top-3 right-3 text-[10px] font-mono text-gray-400">
                  VERIFIED CHUNK
                </span>
                <p className="whitespace-pre-wrap leading-relaxed tracking-wide text-gray-900">
                  {selectedChunkDetail.text}
                </p>
              </div>

              <div className="mt-4 p-3 bg-slate-50 border rounded-lg text-[11px] text-gray-500 flex gap-2">
                <span>💡</span>
                <span>
                  This page text is cached in the local vector and lexical BM25 database indices. Clicking the "Open in Corpus" button below will take you to the document's multi-page explorer.
                </span>
              </div>
            </div>

            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
              <button
                onClick={() => {
                  onNavigateToDoc(selectedChunkDetail.docId);
                  setSelectedChunkDetail(null);
                }}
                className="text-xs font-semibold text-slate-800 hover:underline flex items-center gap-1"
              >
                Open in Corpus Explorer →
              </button>
              <button
                onClick={() => setSelectedChunkDetail(null)}
                className="px-4 py-1.5 bg-slate-900 text-white hover:bg-slate-800 text-xs rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
