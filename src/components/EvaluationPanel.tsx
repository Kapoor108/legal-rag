import React, { useState } from "react";
import { 
  CheckCircle, 
  XCircle, 
  Play, 
  Cpu, 
  Layers, 
  ChevronDown, 
  ChevronUp, 
  Info, 
  Calendar,
  Sparkles,
  ShieldAlert
} from "lucide-react";
import { EvaluationReport, EvaluationResult } from "../types";

interface EvaluationPanelProps {
  onRunEvaluation: (alpha: number) => Promise<EvaluationReport>;
}

export default function EvaluationPanel({ onRunEvaluation }: EvaluationPanelProps) {
  const [alpha, setAlpha] = useState(0.5);
  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  const handleRunEvaluation = async () => {
    setIsLoading(true);
    setReport(null);
    try {
      const res = await onRunEvaluation(alpha);
      setReport(res);
    } catch (err) {
      console.error(err);
      alert("Evaluation failed. Make sure server is running and accessible.");
    } finally {
      setIsLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 4.5) return "text-emerald-600 bg-emerald-50 border-emerald-100";
    if (score >= 3.5) return "text-blue-600 bg-blue-50 border-blue-100";
    if (score >= 2.0) return "text-amber-600 bg-amber-50 border-amber-100";
    return "text-rose-600 bg-rose-50 border-rose-100";
  };

  return (
    <div className="space-y-6">
      
      {/* Control Console */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-xs p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-slate-700" />
            Golden Set Evaluation Console
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Measure retrieval accuracy and verify hallucination suppression rates against verified ground truths.
          </p>
        </div>

        <div className="flex items-center gap-4 w-full md:w-auto">
          {/* Alpha selector */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-gray-500 font-medium">Alpha (α):</span>
            <select
              value={alpha}
              onChange={(e) => setAlpha(parseFloat(e.target.value))}
              className="text-xs p-2 border border-gray-200 rounded-lg bg-white font-mono focus:outline-slate-800"
            >
              <option value="0.0">0.00 (Lexical Only)</option>
              <option value="0.25">0.25 (Mostly Lexical)</option>
              <option value="0.5">0.50 (Balanced Hybrid)</option>
              <option value="0.75">0.75 (Mostly Vector)</option>
              <option value="1.0">1.00 (Vector Only)</option>
            </select>
          </div>

          <button
            onClick={handleRunEvaluation}
            disabled={isLoading}
            className="w-full md:w-auto px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-white rounded-full animate-spin" />
                Auditing...
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                Run Benchmark
              </>
            )}
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-xs p-12 text-center flex flex-col items-center justify-center space-y-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-4 border-slate-100 border-t-slate-900 animate-spin" />
            <Sparkles className="absolute inset-0 m-auto w-5 h-5 text-amber-500 animate-pulse" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
              Evaluating Retrieval Accuracy & LLM Faithfulness...
            </h4>
            <p className="text-[11px] text-gray-500 max-w-xs mt-1 leading-relaxed mx-auto">
              Querying the hybrid engine, matching targets, and deploying Gemini as a judge to audit accuracy grades.
            </p>
          </div>
        </div>
      )}

      {!isLoading && !report && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-xs p-10 text-center text-gray-400">
          <Info className="w-10 h-10 mb-3 mx-auto text-gray-300" />
          <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">No Report Generated Yet</h4>
          <p className="text-[11px] text-gray-500 max-w-md mx-auto mt-1 leading-relaxed">
            Click "Run Benchmark" above to run our Golden Set query suite. The engine will perform live hybrid searches, verify correct page retrievals, generate answers, and compute analytical accuracy feedback.
          </p>
        </div>
      )}

      {/* Evaluation Report Results */}
      {!isLoading && report && (
        <div className="space-y-6 animate-fade-in">
          
          {/* Aggregate metrics bento style */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            <div className="bg-white rounded-xl border border-gray-100 shadow-xs p-5 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                  Retrieval Accuracy
                </span>
                <p className="text-2xl font-extrabold text-slate-900">
                  {report.retrievalAccuracy}%
                </p>
              </div>
              <p className="text-[10px] text-gray-500 mt-2 leading-relaxed">
                Percentage of Golden Set queries where the target physical page was retrieved in the top 3 matches.
              </p>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 shadow-xs p-5 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                  LLM Faithfulness Grade
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-extrabold text-slate-900">{report.averageFaithfulness}</span>
                  <span className="text-xs text-gray-400 font-medium">/ 5.0</span>
                </div>
              </div>
              <p className="text-[10px] text-gray-500 mt-2 leading-relaxed">
                Hallucination resistance score graded by LLM-as-a-Judge. 5.0 indicates absolutely zero unverified assertions.
              </p>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 shadow-xs p-5 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                  Contextual Relevance
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-extrabold text-slate-900">{report.averageRelevance}</span>
                  <span className="text-xs text-gray-400 font-medium">/ 5.0</span>
                </div>
              </div>
              <p className="text-[10px] text-gray-500 mt-2 leading-relaxed">
                Relevance density indicating how closely the generated brief addresses the specific query intent.
              </p>
            </div>

          </div>

          {/* Golden Set Items Table */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
              <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                Audited Golden Query List ({report.results.length} tests)
              </h4>
              <span className="text-[10px] text-gray-400 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> Benchmarked: {new Date(report.evaluatedAt).toLocaleTimeString()}
              </span>
            </div>

            <div className="divide-y divide-gray-100">
              {report.results.map((res) => {
                const isExpanded = expandedItemId === res.itemId;
                return (
                  <div key={res.itemId} className="p-4 hover:bg-slate-50/50 transition">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                      
                      {/* Query Title */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${
                            res.retrievalSuccess 
                              ? "bg-emerald-100 text-emerald-800" 
                              : "bg-rose-100 text-rose-800"
                          }`}>
                            {res.retrievalSuccess ? (
                              <><CheckCircle className="w-3 h-3" /> Retrieval Hit</>
                            ) : (
                              <><XCircle className="w-3 h-3" /> Retrieval Miss</>
                            )}
                          </span>
                          <span className="text-[10px] font-mono text-gray-400">
                            Pages retrieved: {res.retrievedPages.join(", ")}
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-gray-900 leading-snug">
                          {res.query}
                        </h4>
                      </div>

                      {/* Scores & Expand */}
                      <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
                        <div className="flex gap-2">
                          <div className={`text-[10px] font-bold font-mono px-2 py-1 rounded border ${getScoreColor(res.faithfulnessScore)}`}>
                            Faith: {res.faithfulnessScore.toFixed(1)}/5
                          </div>
                          <div className={`text-[10px] font-bold font-mono px-2 py-1 rounded border ${getScoreColor(res.relevanceScore)}`}>
                            Rel: {res.relevanceScore.toFixed(1)}/5
                          </div>
                        </div>

                        <button
                          onClick={() => setExpandedItemId(isExpanded ? null : res.itemId)}
                          className="p-1 border rounded-md bg-white text-gray-500 hover:text-gray-700 transition"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>

                    </div>

                    {/* Collapsible Details */}
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-dashed border-gray-200 grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in text-xs leading-relaxed">
                        
                        {/* Generated Answer vs Ground Truth */}
                        <div className="space-y-2 bg-gray-50 p-4 rounded-lg border">
                          <span className="text-[10px] uppercase font-bold text-slate-700 block">
                            Counsel Generated Answer
                          </span>
                          <p className="text-gray-800 italic bg-white p-3 rounded border font-serif">
                            "{res.generatedAnswer}"
                          </p>
                        </div>

                        <div className="space-y-2 bg-slate-50 p-4 rounded-lg border">
                          <span className="text-[10px] uppercase font-bold text-slate-700 block">
                            Expert Ground Truth
                          </span>
                          <p className="text-gray-800 bg-white p-3 rounded border font-serif">
                            "{res.groundTruth}"
                          </p>
                        </div>

                        {/* Audit Feedback */}
                        <div className="md:col-span-2 p-3 bg-slate-900 text-slate-200 rounded-lg flex gap-2.5 items-start">
                          <Cpu className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block mb-0.5">
                              LLM Auditor Critique
                            </span>
                            <p className="text-[11px] leading-relaxed">
                              {res.feedback}
                            </p>
                          </div>
                        </div>

                      </div>
                    )}

                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
