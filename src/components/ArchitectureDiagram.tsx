import React, { useState } from "react";
import { 
  Database, 
  Search, 
  Cpu, 
  Share2, 
  FileText, 
  Layers, 
  Compass, 
  GitBranch 
} from "lucide-react";

export default function ArchitectureDiagram() {
  const [activeStep, setActiveStep] = useState<number | null>(null);

  const steps = [
    {
      id: 1,
      title: "Data Ingestion & Chunking",
      icon: FileText,
      description: "Documents are split into discrete pages to preserve strict legal pagination. We map metadata (Category, Title, Citation Standard) to each chunk.",
      details: [
        "Maintains physical Page Index (crucial for exact pinpoint citations)",
        "Formats document attributes using Open Knowledge Format (OKF)",
        "Ensures source text is pristine with zero character loss"
      ]
    },
    {
      id: 2,
      title: "Dual Indexing System",
      icon: Layers,
      description: "Each chunk is indexed in parallel through two distinct pipelines to satisfy legal domain accuracy requirements.",
      details: [
        "Semantic Vector space: Gemini 'gemini-embedding-2-preview' generates 768-dim dense embeddings",
        "Keyword Lexical space: BM25/TF-IDF calculates term frequency and inverse document frequency"
      ]
    },
    {
      id: 3,
      title: "Hybrid Search Retriever",
      icon: Search,
      description: "Retrieves context using a configurable alpha slider that balances semantic relevance and exact keyword overlaps.",
      details: [
        "Vector Cosine Similarity finds general contextual matches",
        "Keyword overlapping captures strict legal phrases (e.g., 'accession to wealth')",
        "Min-Max normalization merges both scores into a single hybrid rank"
      ]
    },
    {
      id: 4,
      title: "Graph RAG Enhancement",
      icon: GitBranch,
      description: "Traverses a network of citations. If a case is retrieved, the graph retrieves the statute it interprets.",
      details: [
        "Injects related cross-document citations into context",
        "Provides the LLM with hierarchical legal hierarchy (Statute -> Case Law -> Commentary)",
        "Captures legal inheritance and interpretive relationships"
      ]
    },
    {
      id: 5,
      title: "Faithful LLM Synthesis",
      icon: Cpu,
      description: "The compiled OKF context is submitted to Gemini 3.5 Flash under a strict 100% faithfulness system instruction.",
      details: [
        "Enforces strict anti-hallucination protocols (answers only if proven by text)",
        "Requires inline citations matching exact page indices",
        "Operates at low temperature (0.1) to suppress creative inference"
      ]
    }
  ];

  return (
    <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 tracking-tight flex items-center gap-2">
          <Share2 className="w-5 h-5 text-slate-600" />
          RAG Pipeline Architecture
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          Interactive pipeline overview of our high-precision US Tax & Legal retrieval and reasoning flow. Hover over a step to see its engineering specifications.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 relative">
        {/* Connection arrow lines for desktop */}
        <div className="hidden lg:block absolute top-1/2 left-4 right-4 h-0.5 bg-gray-100 -translate-y-1/2 -z-10" />
        
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const isActive = activeStep === step.id;
          
          return (
            <div
              key={step.id}
              className={`relative bg-gray-50 rounded-lg p-4 border transition-all duration-300 cursor-pointer ${
                isActive 
                  ? "border-slate-800 bg-slate-900 text-white shadow-md scale-102" 
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-100 text-gray-800"
              }`}
              onMouseEnter={() => setActiveStep(step.id)}
              onMouseLeave={() => setActiveStep(null)}
            >
              <div className="flex items-center gap-3 lg:flex-col lg:items-center lg:text-center mb-3">
                <div className={`p-2 rounded-lg ${
                  isActive ? "bg-slate-800 text-white" : "bg-white text-slate-700 shadow-xs border border-gray-100"
                }`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="text-left lg:text-center">
                  <span className={`text-[10px] uppercase font-bold tracking-wider ${isActive ? "text-slate-400" : "text-gray-400"}`}>
                    Step {step.id}
                  </span>
                  <h4 className="text-xs font-semibold tracking-tight block mt-0.5">
                    {step.title}
                  </h4>
                </div>
              </div>
              
              <p className={`text-[11px] leading-relaxed ${isActive ? "text-slate-300" : "text-gray-500"}`}>
                {step.description}
              </p>
            </div>
          );
        })}
      </div>

      {/* Detail Specifications Drawer */}
      <div className="mt-6 p-4 rounded-lg bg-slate-50 border border-gray-200 transition-all">
        {activeStep !== null ? (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Compass className="w-4 h-4 text-slate-700" />
              <h5 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                Specifications: {steps[activeStep - 1].title}
              </h5>
            </div>
            <ul className="space-y-1.5">
              {steps[activeStep - 1].details.map((detail, idx) => (
                <li key={idx} className="text-xs text-gray-700 flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-800 mt-1.5 shrink-0" />
                  <span>{detail}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="text-center py-2 text-xs text-gray-500 italic">
            💡 Hover over any step in the pipeline above to expand the detailed technical specifications and data contracts.
          </div>
        )}
      </div>
    </div>
  );
}
