import React, { useState, useEffect } from "react";
import { 
  Scale, 
  BookOpen, 
  MessageSquare, 
  Layers, 
  Activity,
  FileText,
  ArrowLeft
} from "lucide-react";
import LandingPage from "./components/LandingPage";
import CorpusManager from "./components/CorpusManager";
import QAPanel from "./components/QAPanel";
import EvaluationPanel from "./components/EvaluationPanel";
import ArchitectureDiagram from "./components/ArchitectureDiagram";
import { LegalDocument, LegalRelationship, EvaluationReport } from "./types";

export default function App() {
  const [showLanding, setShowLanding] = useState(true);
  const [activeTab, setActiveTab] = useState<"Terminal" | "Corpus" | "Architecture" | "Evaluation">("Terminal");
  
  // Data State
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [relationships, setRelationships] = useState<LegalRelationship[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  // Fetch initial documents and relationships
  const fetchCorpus = async () => {
    try {
      const docRes = await fetch("/api/documents");
      if (docRes.ok) {
        const docs = await docRes.json();
        setDocuments(docs);
      }
      
      const relRes = await fetch("/api/relationships");
      if (relRes.ok) {
        const rels = await relRes.json();
        setRelationships(rels);
      }
    } catch (err) {
      console.error("Failed to load legal corpus data from API server:", err);
    }
  };

  useEffect(() => {
    fetchCorpus();
  }, []);

  // Search execution API proxy
  const handleSearch = async (query: string, alpha: number) => {
    const res = await fetch("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, alpha, topK: 5 })
    });
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || "Failed to fetch tax advisory brief");
    }
    return res.json();
  };

  // Ingestion API proxy
  const handleUploadDocument = async (docData: any) => {
    const res = await fetch("/api/documents/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(docData)
    });
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || "Ingestion failed");
    }
    // Refresh corpus
    await fetchCorpus();
  };

  // Relationship adding API proxy
  const handleAddRelationship = async (relData: any) => {
    const res = await fetch("/api/relationships", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(relData)
    });
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || "Linking failed");
    }
    await fetchCorpus();
  };

  // Benchmark evaluation API proxy
  const handleRunEvaluation = async (alpha: number): Promise<EvaluationReport> => {
    const res = await fetch("/api/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alpha })
    });
    if (!res.ok) {
      throw new Error("Failed to execute Golden Set audit");
    }
    return res.json();
  };

  // Cross-panel link routing
  const navigateToDoc = (docId: string) => {
    setSelectedDocId(docId);
    setActiveTab("Corpus");
  };

  const handleStartRAG = () => {
    setShowLanding(false);
  };

  const handleBackToLanding = () => {
    setShowLanding(true);
  };

  // Show landing page if user hasn't started yet
  if (showLanding) {
    return <LandingPage onStart={handleStartRAG} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-gray-800 flex flex-col font-sans selection:bg-slate-900 selection:text-white">
      
      {/* Top Professional Header Bar with Back Button */}
      <header className="bg-white border-b border-gray-150 py-4 px-6 shrink-0 shadow-2xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4 w-full sm:w-auto">
            {/* Back Button */}
            <button
              onClick={handleBackToLanding}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-700 transition shrink-0"
              title="Back to home"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-slate-950 text-white shadow-sm">
                <Scale className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                  US Tax & Legal RAG
                  <span className="text-[10px] bg-slate-100 border text-slate-800 font-mono px-1.5 py-0.5 rounded font-normal normal-case tracking-normal">
                    v1.2.0
                  </span>
                </h1>
                <p className="text-[11px] text-gray-400 font-medium">
                  High-Precision, Multi-Page Citation, Anti-Hallucination Legal Research Suite
                </p>
              </div>
            </div>
          </div>

          {/* Tab Navigation Menu */}
          <nav className="flex gap-1 bg-gray-100 p-1 rounded-lg border border-gray-200 w-full sm:w-auto">
            <button
              onClick={() => setActiveTab("Terminal")}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] uppercase font-bold tracking-wider transition ${
                activeTab === "Terminal" 
                  ? "bg-white text-slate-950 shadow-xs" 
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Advisory Terminal
            </button>
            
            <button
              onClick={() => setActiveTab("Corpus")}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] uppercase font-bold tracking-wider transition ${
                activeTab === "Corpus" 
                  ? "bg-white text-slate-950 shadow-xs" 
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              Corpus Explorer
            </button>

            <button
              onClick={() => setActiveTab("Architecture")}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] uppercase font-bold tracking-wider transition ${
                activeTab === "Architecture" 
                  ? "bg-white text-slate-950 shadow-xs" 
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Architecture
            </button>

            <button
              onClick={() => setActiveTab("Evaluation")}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] uppercase font-bold tracking-wider transition ${
                activeTab === "Evaluation" 
                  ? "bg-white text-slate-950 shadow-xs" 
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              Evaluation Report
            </button>
          </nav>
        </div>
      </header>

      {/* Main Container Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 overflow-hidden">
        
        {activeTab === "Terminal" && (
          <div className="animate-fade-in">
            <QAPanel onSearch={handleSearch} onNavigateToDoc={navigateToDoc} />
          </div>
        )}

        {activeTab === "Corpus" && (
          <div className="animate-fade-in">
            <CorpusManager
              documents={documents}
              relationships={relationships}
              onUploadDocument={handleUploadDocument}
              onAddRelationship={handleAddRelationship}
              selectedDocId={selectedDocId}
              setSelectedDocId={setSelectedDocId}
            />
          </div>
        )}

        {activeTab === "Architecture" && (
          <div className="animate-fade-in max-w-4xl mx-auto">
            <ArchitectureDiagram />
          </div>
        )}

        {activeTab === "Evaluation" && (
          <div className="animate-fade-in">
            <EvaluationPanel onRunEvaluation={handleRunEvaluation} />
          </div>
        )}

      </main>

      {/* Outer Footnote */}
      <footer className="bg-white border-t border-gray-150 py-3 px-6 text-center text-[10px] text-gray-400 shrink-0 font-medium tracking-wide">
        US TAX & LEGAL RAG ADVISORY TERMINAL • SECURE SERVER COGNITIVE LAYER BOUNDED BY STRICT DOCUMENTATION ALIGNMENT
      </footer>

    </div>
  );
}
