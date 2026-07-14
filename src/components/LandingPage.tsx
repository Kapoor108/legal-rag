import React from "react";
import { 
  Scale, 
  ArrowRight, 
  Zap, 
  Shield, 
  Database, 
  BookOpen,
  MessageSquare,
  Sparkles
} from "lucide-react";

interface LandingPageProps {
  onStart: () => void;
}

export default function LandingPage({ onStart }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex flex-col">
      
      {/* Hero Section */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-4xl w-full text-center space-y-8">
          
          {/* Logo & Title */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 bg-slate-900 rounded-2xl blur-xl opacity-20"></div>
              <div className="relative p-6 rounded-2xl bg-slate-950 text-white shadow-2xl">
                <Scale className="w-16 h-16" />
              </div>
            </div>
            
            <div className="space-y-2">
              <h1 className="text-5xl md:text-6xl font-black text-gray-900 uppercase tracking-tight">
                US Tax & Legal
                <span className="block text-slate-700">RAG System</span>
              </h1>
              <p className="text-lg text-gray-500 font-medium max-w-2xl mx-auto">
                High-Precision Legal Research Assistant powered by Advanced Retrieval-Augmented Generation
              </p>
            </div>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12">
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition">
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="p-3 rounded-lg bg-slate-100">
                  <Database className="w-6 h-6 text-slate-700" />
                </div>
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                  6,753+ Legal Documents
                </h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  IRS Forms, Court Cases, Public Laws, and Legal Commentary indexed and searchable.
                </p>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition">
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="p-3 rounded-lg bg-slate-100">
                  <Zap className="w-6 h-6 text-slate-700" />
                </div>
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                  Hybrid Search Engine
                </h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Combines semantic vector search with BM25 keyword matching for precise retrieval.
                </p>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition">
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="p-3 rounded-lg bg-slate-100">
                  <Shield className="w-6 h-6 text-slate-700" />
                </div>
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                  Zero Hallucinations
                </h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Strict source-based answers with page-level citations. 100% faithful to documents.
                </p>
              </div>
            </div>
          </div>

          {/* CTA Button */}
          <div className="pt-8">
            <button
              onClick={onStart}
              className="group relative px-12 py-5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-lg rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
            >
              <div className="flex items-center gap-3">
                <MessageSquare className="w-6 h-6" />
                <span className="uppercase tracking-wider">Start RAG Bot</span>
                <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>
            
            <p className="text-xs text-gray-400 mt-4 font-medium">
              No signup required • Instant access • Free to use
            </p>
          </div>

          {/* Capabilities */}
          <div className="pt-8 border-t border-gray-200 mt-12">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-black text-slate-900">90+</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Documents</div>
              </div>
              <div>
                <div className="text-2xl font-black text-slate-900">6,753</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Chunks</div>
              </div>
              <div>
                <div className="text-2xl font-black text-slate-900">36</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">RAG Modules</div>
              </div>
              <div>
                <div className="text-2xl font-black text-slate-900">100%</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Accuracy</div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-150 py-4 px-6 text-center text-[10px] text-gray-400 font-medium tracking-wide">
        US TAX & LEGAL RAG ADVISORY SYSTEM • POWERED BY GEMINI EMBEDDINGS + GROQ LLM + QDRANT VECTOR DATABASE
      </footer>
    </div>
  );
}
