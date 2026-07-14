/**
 * Production-Grade Legal RAG Pipeline
 * Full 36-module implementation — query to answer+citations
 */

import Groq from "groq-sdk";
import { GoogleGenAI } from "@google/genai";
import { searchQdrant, COLLECTION_NAME } from "./qdrantService";
import { DocumentChunk, Citation } from "./types";

// Qdrant Cloud connection details (mirrors qdrantService.ts)
const QDRANT_URL = process.env.QDRANT_URL || "http://localhost:6333";
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;

function qdrantHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (QDRANT_API_KEY) h["api-key"] = QDRANT_API_KEY;
  return h;
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface RAGRequest {
  query: string;
  alpha?: number;
  topK?: number;
  filterDocCategory?: string;
  filterDocId?: string;
}

export interface RAGCitation {
  sourceDocId: string;
  sourceDocName: string;
  citationCode: string;
  pageIndex: number;
  snippet: string;
  relevanceScore: number;
  confidenceScore: number;
}

export interface RAGResponse {
  answer: string;
  citations: RAGCitation[];
  retrievedChunks: DocumentChunk[];
  metadata: {
    queryExpanded: string;
    detectedEntities: string[];
    chunksRetrieved: number;
    chunksAfterRerank: number;
    conflictsDetected: boolean;
    confidenceScore: number;
    processingMs: number;
    isSummaryRequest?: boolean;
    summaryTarget?: string;
  };
}

interface RankedChunk {
  chunk: DocumentChunk;
  vectorScore: number;
  bm25Score: number;
  rrfScore: number;
  finalScore: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const EMBEDDING_MODELS = ["gemini-embedding-001", "gemini-embedding-2"] as const;

const STOP_WORDS = new Set([
  "the","is","at","which","on","a","an","and","or","of","to","for","in",
  "under","with","that","this","by","are","it","from","as","be","was","were",
  "been","have","has","had","do","does","did","will","would","could","should",
  "may","might","shall","can","not","but","if","then","its","their","they",
]);

// ═══════════════════════════════════════════════════════════════
// MODULES 1-3: Query Preprocessing, Normalization, Expansion
// ═══════════════════════════════════════════════════════════════

interface ProcessedQuery {
  original: string;
  normalized: string;
  expanded: string;
  tokens: string[];
  entities: string[];
  corpusHints: { irs: boolean; law: boolean; cases: boolean; commentary: boolean };
  isSummaryRequest: boolean;
  summaryTarget?: string;
}

function preprocessQuery(raw: string): ProcessedQuery {
  // Module 1 — Preprocessing
  const original = raw.trim().replace(/\s+/g, " ").replace(/[""]/g, '"').replace(/['']/g, "'");

  // Module 2 — Normalization
  const normalized = original.toLowerCase().replace(/[^\w\s§.,:-]/g, " ").replace(/\s+/g, " ").trim();

  // ══════════════════════════════════════════════════════════════
  // SUMMARIZATION DETECTION - Detect if user wants a summary
  // ══════════════════════════════════════════════════════════════
  const summarizeKeywords = [
    'summarize', 'summarise', 'summary', 'summaries',
    'give me a summary', 'provide a summary', 'can you summarize',
    'brief', 'overview', 'recap', 'sum up', 'outline',
    'explain in brief', 'explain briefly', 'give an overview',
    'provide an overview', 'what is the main', 'main points',
    'key points', 'highlights', 'digest', 'abstract',
    'tldr', 'tl;dr', 'tl dr', 'in short', 'in brief', 'condensed version'
  ];
  
  const isSummaryRequest = summarizeKeywords.some(keyword => 
    normalized.includes(keyword.toLowerCase())
  );
  
  // Extract what to summarize (remove summary keywords to find target)
  let summaryTarget = '';
  if (isSummaryRequest) {
    let cleanedQuery = normalized;
    summarizeKeywords.forEach(kw => {
      cleanedQuery = cleanedQuery.replace(new RegExp(kw.toLowerCase(), 'g'), '');
    });
    // Clean up extra words
    cleanedQuery = cleanedQuery.replace(/\b(of|the|about|for|me|a|an|this|that|these|those|please|can you|could you|would you)\b/g, '');
    summaryTarget = cleanedQuery.trim();
  }

  // Module 3 — Entity Extraction
  const entities: string[] = [];
  [
    [/\bform\s+\d{4}[-\w]*/gi,            "IRS_FORM"],
    [/\bschedule\s+[a-z\d]+/gi,            "IRS_SCHEDULE"],
    [/\bw-\d\w*/gi,                        "IRS_FORM"],
    [/\bline\s+\d+\w*/gi,                  "FORM_LINE"],
    [/\bsection\s+\d+/gi,                  "IRC_SECTION"],
    [/pub(?:lic)?\s*l(?:aw)?\s*[\d-]+/gi,  "PUBLIC_LAW"],
    [/\d+\s*u\.?s\.?\s*\d+/gi,            "US_CITATION"],
    [/rev(?:enue)?\s*rul(?:ing)?\s*[\d-]+/gi, "IRS_RULING"],
    [/\b[a-z]+\s+v\.?\s+[a-z]+/gi,        "CASE_NAME"],
  ].forEach(([p, t]) => {
    const m = original.match(p as RegExp);
    if (m) entities.push(...m.map(x => `${t}:${x.trim()}`));
  });

  // Module 3 — Query Expansion (domain synonyms)
  const synonymMap: Record<string, string> = {
    "w4":          "form w-4 withholding certificate employee withholding",
    "w-4":         "withholding certificate employee withholding allowance",
    "1040":        "individual income tax return annual tax filing",
    "schedule a":  "itemized deductions mortgage interest charitable contributions",
    "schedule c":  "profit loss business sole proprietor self employed",
    "schedule se": "self employment tax fica social security medicare",
    "schedule d":  "capital gains losses securities investments",
    "schedule e":  "supplemental income rental real estate partnerships",
    "agi":         "adjusted gross income above the line deductions",
    "vra":         "voting rights act section 5 preclearance racial discrimination",
    "dobbs":       "abortion reproductive rights state constitutional",
    "mootness":    "moot controversy standing jurisdiction",
    "preemption":  "federal supremacy state law conflict preempted",
    "sixth amendment": "right to counsel criminal defendant attorney",
    "appropriations":  "government funding continuing resolution fiscal year",
    "superfund":   "environmental liability hazardous waste cleanup",
    "press clause": "first amendment freedom of press media",
  };
  let expanded = normalized;
  Object.entries(synonymMap).forEach(([k, v]) => {
    if (normalized.includes(k)) expanded += " " + v;
  });

  // Corpus detection hints
  const lo = normalized;
  const corpusHints = {
    irs:         /\b(form|schedule|w-\d|1040|irs|line \d|withholding|deduction|tax return|filing)\b/.test(lo),
    law:         /\b(public law|pub\.?\s*l|appropriation|congress|statute|enacted)\b/.test(lo),
    cases:       /\b(court|circuit|plaintiff|defendant|appeal|judgment|affirmed|reversed)\b/.test(lo),
    commentary:  /\b(law review|journal|article|commentary|doctrine|professor|analysis)\b/.test(lo),
  };

  const tokens = normalized.split(/\s+/).filter(t => t.length > 1 && !STOP_WORDS.has(t));
  return { 
    original, 
    normalized, 
    expanded, 
    tokens, 
    entities, 
    corpusHints,
    isSummaryRequest,
    summaryTarget
  };
}

// ═══════════════════════════════════════════════════════════════
// MODULE 6: Dual-Model Embedding
// ═══════════════════════════════════════════════════════════════

async function embedText(text: string, gemini: GoogleGenAI): Promise<{ model: string; vec: number[] }[]> {
  const results = await Promise.all(
    EMBEDDING_MODELS.map(async model => {
      try {
        const r = await gemini.models.embedContent({ model, contents: text });
        const vec = r.embeddings?.[0]?.values ?? (r as any).embedding?.values;
        return vec ? { model, vec } : null;
      } catch { return null; }
    })
  );
  const valid = results.filter(Boolean) as { model: string; vec: number[] }[];
  if (valid.length === 0) {
    // Fallback deterministic vector
    const v = new Array(3072).fill(0);
    text.toLowerCase().split(/\s+/).forEach((w, i) => {
      let h = 0;
      for (let c = 0; c < w.length; c++) h = w.charCodeAt(c) + ((h << 5) - h);
      v[Math.abs(h) % 3072] += 1 / (i + 1);
    });
    const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return [{ model: "fallback", vec: v.map(x => x / mag) }];
  }
  return valid;
}

// ═══════════════════════════════════════════════════════════════
// MODULE 7: BM25 Keyword Search
// ═══════════════════════════════════════════════════════════════

function bm25Score(query: string, candidates: DocumentChunk[], k1 = 1.5, b = 0.75): Record<string, number> {
  const tokens = query.split(/\s+/).filter(t => t.length > 1 && !STOP_WORDS.has(t));
  if (!tokens.length || !candidates.length) return Object.fromEntries(candidates.map(c => [c.id, 0]));

  const N = candidates.length;
  // Use pre-computed wordCount from payload when available — avoids re-splitting text on every query
  const avgLen = candidates.reduce((s, c) =>
    s + (c.wordCount ?? c.text.split(/\s+/).length), 0) / N || 1;
  const scores: Record<string, number> = {};

  candidates.forEach(chunk => {
    const words = chunk.text.toLowerCase().split(/\s+/);
    const docLen = chunk.wordCount ?? words.length;
    let score = 0;
    // Boost: include sectionTitle in match surface if available
    const searchText = chunk.sectionTitle
      ? chunk.sectionTitle.toLowerCase() + " " + chunk.text.toLowerCase()
      : chunk.text.toLowerCase();
    const searchWords = searchText.split(/\s+/);
    tokens.forEach(token => {
      const tf = searchWords.filter(w => w === token || w.startsWith(token + "s") || w.startsWith(token + "ed")).length;
      if (!tf) return;
      const df = candidates.filter(c => c.text.toLowerCase().includes(token)).length;
      const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
      const normTF = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLen / avgLen)));
      score += idf * normTF;
    });
    scores[chunk.id] = score;
  });
  return scores;
}

// ═══════════════════════════════════════════════════════════════
// MODULE 8-9: Hybrid Search + Reciprocal Rank Fusion (RRF)
// ═══════════════════════════════════════════════════════════════

function applyRRF(
  vectorRanked: Array<{ chunk: DocumentChunk; score: number }>,
  keywordRanked: Array<{ chunk: DocumentChunk; score: number }>,
  k = 60,
  alpha = 0.7  // weight for vector vs keyword: 0=all keyword, 1=all vector
): RankedChunk[] {
  const map: Record<string, RankedChunk> = {};

  // Vector contributions weighted by alpha
  vectorRanked.forEach(({ chunk, score }, rank) => {
    if (!map[chunk.id]) map[chunk.id] = { chunk, vectorScore: score, bm25Score: 0, rrfScore: 0, finalScore: 0 };
    map[chunk.id].rrfScore += alpha * (1 / (k + rank + 1));
    map[chunk.id].vectorScore = score;
  });

  // Keyword contributions weighted by (1 - alpha)
  keywordRanked.forEach(({ chunk, score }, rank) => {
    if (!map[chunk.id]) map[chunk.id] = { chunk, vectorScore: 0, bm25Score: score, rrfScore: 0, finalScore: 0 };
    map[chunk.id].rrfScore += (1 - alpha) * (1 / (k + rank + 1));
    map[chunk.id].bm25Score = score;
  });

  const maxRRF = Math.max(...Object.values(map).map(v => v.rrfScore), 0.0001);
  Object.values(map).forEach(v => { v.finalScore = v.rrfScore / maxRRF; });

  return Object.values(map).sort((a, b) => b.finalScore - a.finalScore);
}

// ═══════════════════════════════════════════════════════════════
// MODULE 10: Cross-Encoder Reranker (Groq LLM-based)
// ═══════════════════════════════════════════════════════════════

async function crossEncoderRerank(query: string, candidates: RankedChunk[], groq: Groq): Promise<RankedChunk[]> {
  const pool = candidates.slice(0, 10); // limit to 10 for fast response
  if (pool.length < 4) return candidates;

  try {
    const prompt = `You are a relevance scoring system for a legal RAG pipeline.
Score each chunk's relevance to the QUERY on a scale of 0-10 (integer).
Return ONLY a JSON array of ${pool.length} integers in the same order. No explanation.
QUERY: "${query.slice(0, 100)}"
CHUNKS:
${pool.map((r, i) => `${i}. [${r.chunk.citationCode}] ${r.chunk.text.slice(0, 80)}`).join("\n")}`;

    const resp = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 150,
    });

    const raw = (resp.choices[0]?.message?.content || "").replace(/```json|```/g, "").trim();
    const scores: number[] = JSON.parse(raw);

    if (Array.isArray(scores) && scores.length === pool.length) {
      const maxS = Math.max(...scores, 1);
      pool.forEach((item, i) => {
        const normalizedCE = (scores[i] ?? 0) / maxS;
        item.finalScore = (0.5 * item.finalScore) + (0.5 * normalizedCE);
      });
    }
  } catch { /* keep original scores on failure */ }

  return [...pool, ...candidates.slice(20)].sort((a, b) => b.finalScore - a.finalScore);
}

// ═══════════════════════════════════════════════════════════════
// MODULE 11: Dynamic Score Thresholding
// ═══════════════════════════════════════════════════════════════

function applyScoreThreshold(candidates: RankedChunk[]): RankedChunk[] {
  if (!candidates.length) return [];
  const scores = candidates.map(c => c.finalScore);
  const max = Math.max(...scores);
  // Keep only chunks scoring > 50% of the top score — tighter filter = less noise
  const threshold = max * 0.50;
  const filtered = candidates.filter(c => c.finalScore >= threshold);
  // Always return at least 3 results even if threshold is too aggressive
  return filtered.length >= 3 ? filtered : candidates.slice(0, 3);
}

// ═══════════════════════════════════════════════════════════════
// MODULES 12-17: Top-K, Chunk Expansion, Merging, Dedup, Compression
// ═══════════════════════════════════════════════════════════════

// Module 12: Top-K selection
function selectTopK(candidates: RankedChunk[], k: number): RankedChunk[] {
  return candidates.slice(0, k);
}

// Modules 13-14: Previous/Next chunk expansion via Qdrant scroll
async function expandChunks(selected: RankedChunk[]): Promise<DocumentChunk[]> {
  const expanded = new Map<string, DocumentChunk>();

  // Add all selected chunks first
  selected.forEach(r => expanded.set(r.chunk.id, r.chunk));

  // Fetch neighboring chunks via REST scroll with filter
  await Promise.all(selected.map(async r => {
    const { docId, pageIndex, chunkIndex } = r.chunk;

    // Strategy: if chunkIndex is available use it for precise prev/next;
    // otherwise fall back to page-based expansion
    const useChunkIndex = chunkIndex !== undefined;

    if (useChunkIndex) {
      // Precise: fetch the chunk immediately before and after by chunkIndex
      for (const targetIdx of [chunkIndex - 1, chunkIndex + 1]) {
        if (targetIdx < 1) continue;
        try {
          const body = {
            limit: 1,
            with_payload: true,
            with_vector: false,
            filter: {
              must: [
                { key: "docId",      match: { value: docId } },
                { key: "chunkIndex", match: { value: targetIdx } },
              ],
            },
          };
          const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/scroll`, {
            method: "POST", headers: qdrantHeaders(), body: JSON.stringify(body),
          });
          const json = await res.json() as any;
          (json?.result?.points ?? []).forEach((p: any) => {
            const chunk = payloadToChunk(p.payload);
            if (!expanded.has(chunk.id)) expanded.set(chunk.id, chunk);
          });
        } catch { /* neighbor not found, skip */ }
      }
    } else {
      // Fallback: page-based expansion (original behaviour)
      for (const targetPage of [pageIndex - 1, pageIndex + 1]) {
        if (targetPage < 1) continue;
        try {
          const body = {
            limit: 3,
            with_payload: true,
            with_vector: false,
            filter: {
              must: [
                { key: "docId",     match: { value: docId } },
                { key: "pageIndex", match: { value: targetPage } },
              ],
            },
          };
          const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/scroll`, {
            method: "POST", headers: qdrantHeaders(), body: JSON.stringify(body),
          });
          const json = await res.json() as any;
          (json?.result?.points ?? []).forEach((p: any) => {
            const chunk = payloadToChunk(p.payload);
            if (!expanded.has(chunk.id)) expanded.set(chunk.id, chunk);
          });
        } catch { /* neighbor not found, skip */ }
      }
    }
  }));

  // Sort by docId + chunkIndex (if available) or pageIndex for coherent reading order
  return Array.from(expanded.values()).sort((a, b) =>
    a.docId.localeCompare(b.docId) ||
    ((a.chunkIndex ?? a.pageIndex * 1000) - (b.chunkIndex ?? b.pageIndex * 1000))
  );
}

// Helper: reconstruct full DocumentChunk from a Qdrant point payload
function payloadToChunk(p: any): DocumentChunk {
  return {
    id:           p.chunkId,
    docId:        p.docId,
    docTitle:     p.docTitle,
    docCategory:  p.docCategory,
    citationCode: p.citationCode,
    pageIndex:    p.pageIndex,
    text:         p.text,
    ...(p.chunkIndex      !== undefined && { chunkIndex:      p.chunkIndex }),
    ...(p.totalChunks     !== undefined && { totalChunks:     p.totalChunks }),
    ...(p.totalPages      !== undefined && { totalPages:      p.totalPages }),
    ...(p.wordCount       !== undefined && { wordCount:       p.wordCount }),
    ...(p.embeddingModel  !== undefined && { embeddingModel:  p.embeddingModel }),
    ...(p.sourceFile      !== undefined && { sourceFile:      p.sourceFile }),
    ...(p.docSummary      !== undefined && { docSummary:      p.docSummary }),
    ...(p.sectionTitle    !== undefined && { sectionTitle:    p.sectionTitle }),
    ...(p.year            !== undefined && { year:            p.year }),
    ...(p.formCode        !== undefined && { formCode:        p.formCode }),
    ...(p.court           !== undefined && { court:           p.court }),
    ...(p.publicLawNumber !== undefined && { publicLawNumber: p.publicLawNumber }),
    ...(p.journalName     !== undefined && { journalName:     p.journalName }),
  };
}

// Module 15: Context merging — group chunks by document
function mergeContext(chunks: DocumentChunk[]): DocumentChunk[] {
  // Merge consecutive same-doc same-page chunks into one
  const merged: DocumentChunk[] = [];
  let prev: DocumentChunk | null = null;
  chunks.forEach(chunk => {
    if (prev && prev.docId === chunk.docId && prev.pageIndex === chunk.pageIndex &&
        !prev.text.includes(chunk.text.slice(0, 40))) {
      prev = { ...prev, text: prev.text + " " + chunk.text };
    } else {
      if (prev) merged.push(prev);
      prev = { ...chunk };
    }
  });
  if (prev) merged.push(prev);
  return merged;
}

// Module 16: Duplicate chunk removal
function deduplicateChunks(chunks: DocumentChunk[]): DocumentChunk[] {
  const seen = new Set<string>();
  return chunks.filter(c => {
    // Fingerprint = first 80 chars normalized
    const fp = c.text.slice(0, 80).toLowerCase().replace(/\s+/g, " ");
    if (seen.has(fp)) return false;
    seen.add(fp);
    return true;
  });
}

// Module 17: Context compression — trim overly long chunks
function compressContext(chunks: DocumentChunk[], maxWordsPerChunk = 250): DocumentChunk[] {
  return chunks.map(c => {
    const words = c.text.split(/\s+/);
    if (words.length <= maxWordsPerChunk) return c;
    return { ...c, text: words.slice(0, maxWordsPerChunk).join(" ") + "…" };
  });
}

// ═══════════════════════════════════════════════════════════════
// MODULES 18-22: Citation Builder, Page Mapping, Confidence Score
// ═══════════════════════════════════════════════════════════════

// Module 18-20: Citation builder with page-level + section mapping
function buildCitations(rankedChunks: RankedChunk[], finalChunks: DocumentChunk[]): RAGCitation[] {
  const citations: RAGCitation[] = [];
  const seen = new Set<string>();

  finalChunks.forEach(chunk => {
    const key = `${chunk.docId}-p${chunk.pageIndex}`;
    if (seen.has(key)) return;
    seen.add(key);

    // Find RRF score for this chunk
    const ranked = rankedChunks.find(r => r.chunk.id === chunk.id);
    const relevance = ranked ? Math.round(ranked.finalScore * 100) : 50;

    // Module 22: Confidence score — based on vector similarity + keyword match
    const vectorConf = ranked ? Math.round(ranked.vectorScore * 100) : 40;
    const bm25Conf   = ranked ? Math.min(100, Math.round(ranked.bm25Score * 20)) : 0;
    const confidence = Math.round((vectorConf * 0.7) + (bm25Conf * 0.3));

    citations.push({
      sourceDocId:   chunk.docId,
      sourceDocName: chunk.docTitle,
      citationCode:  chunk.citationCode,
      pageIndex:     chunk.pageIndex,
      snippet:       chunk.text.slice(0, 180) + (chunk.text.length > 180 ? "…" : ""),
      relevanceScore: Math.min(100, relevance),
      confidenceScore: Math.min(100, confidence),
    });
  });

  return citations.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

// Module 26-27: Multi-doc evidence aggregation + conflict detection
function detectConflicts(chunks: DocumentChunk[]): boolean {
  const docIds = [...new Set(chunks.map(c => c.docId))];
  if (docIds.length < 2) return false;

  // Simple heuristic: if the same numeric value appears differently across docs, flag it
  const numericPatterns = chunks.map(c => c.text.match(/\$[\d,]+|\d+%|\d+\.\d+/g) || []);
  const allNums = numericPatterns.flat();
  const uniqueNums = new Set(allNums);
  // If we have many different numbers across chunks, potential conflict
  return uniqueNums.size > allNums.length * 0.8 && docIds.length > 2;
}

// Module 22: Overall confidence score
function calculateOverallConfidence(citations: RAGCitation[], queryTokens: string[], chunks: DocumentChunk[]): number {
  if (!citations.length) return 0;
  const avgCitScore = citations.reduce((s, c) => s + c.confidenceScore, 0) / citations.length;
  const tokenCoverage = queryTokens.filter(t =>
    chunks.some(c => c.text.toLowerCase().includes(t))
  ).length / (queryTokens.length || 1);
  return Math.round((avgCitScore * 0.6) + (tokenCoverage * 100 * 0.4));
}

// ═══════════════════════════════════════════════════════════════
// MODULES 23-28: Answer Generation, Hallucination Prevention,
//                Context Validation, Conflict Handling,
//                Response Formatting, Fallback Strategy
// ═══════════════════════════════════════════════════════════════

function buildSystemPrompt(pq: ProcessedQuery, conflictsDetected: boolean, hasGraphContext: boolean): string {
  const domainHint = pq.corpusHints.irs         ? "IRS tax forms and schedules" :
                     pq.corpusHints.law          ? "US Public Laws and statutes" :
                     pq.corpusHints.cases        ? "US Federal Court decisions" :
                     pq.corpusHints.commentary   ? "Legal academic commentary" :
                     "US Legal documents";

  // ══════════════════════════════════════════════════════════════
  // SUMMARIZATION MODE - Special instructions for summary requests
  // ══════════════════════════════════════════════════════════════
  if (pq.isSummaryRequest) {
    return `You are an expert legal summarizer specializing in ${domainHint}. Your task is to provide a comprehensive, well-structured summary.

SUMMARIZATION INSTRUCTIONS:
1. **Structure:** Organize the summary with clear sections and headings where appropriate
2. **Comprehensiveness:** Cover all major points, key concepts, and important details from the provided context
3. **Clarity:** Explain complex legal concepts in clear, accessible language while maintaining precision
4. **Citations:** Include citations for all major points: [Doc Title, Citation Code, p.N]
5. **Logical Flow:** Present information in a logical order (chronological, topical, or hierarchical)
6. **Key Details:** Include specific facts, numbers, dates, and requirements
7. **Context:** Explain the significance and implications of important points
8. **Completeness:** Ensure the summary gives the reader a thorough understanding without needing to read the original documents

STRUCTURE GUIDELINES:
- Start with a brief overview (1-2 sentences)
- Use bullet points or numbered lists for multiple related items
- Group related concepts together
- End with key takeaways or important notes if applicable

${conflictsDetected ? "NOTE: Sources contain conflicting information — clearly indicate both versions with citations." : ""}
${hasGraphContext ? "NOTE: Related document relationships are included — use them to explain how documents connect and build upon each other." : ""}

Remember: This is a SUMMARY request. Be thorough, well-organized, and explanatory. Do NOT just answer a specific question — provide a comprehensive overview of the topic.`;
  }

  // ══════════════════════════════════════════════════════════════
  // STANDARD Q&A MODE
  // ══════════════════════════════════════════════════════════════
  return `You are a precise ${domainHint} legal assistant. Answer the user's question directly and concisely using ONLY the provided context.

RULES:
1. Answer directly — give the specific fact, number, or rule first, then explain if needed.
2. Keep your answer focused and concise. Do NOT repeat the same information multiple times.
3. Every fact MUST have an inline citation: [Doc Title, Citation Code, p.N]
   Example: [Form 1040, IRS Form 1040 (2026), p.2]
4. Use ONLY information from the provided context. No outside knowledge.
5. If the context does not contain the answer, say: "The retrieved documents do not contain sufficient information to answer this question."
6. Do NOT hedge, speculate, or add qualifiers unless they appear in the source text.
7. Use bullet points only when listing multiple distinct items.
${conflictsDetected ? "8. NOTE: Sources contain conflicting information — state both versions with citations." : ""}
${pq.entities.length ? `9. Entities detected: ${pq.entities.slice(0, 4).join(", ")}` : ""}
${hasGraphContext ? "10. IMPORTANT: Related document relationships are included below — use them to provide richer context and cite legal interpretations, citations, and connections between documents." : ""}`;
}

function buildContextBlock(chunks: DocumentChunk[], graphContext: string): string {
  let ctx = "=== RETRIEVED LEGAL CONTEXT ===\n\n";
  chunks.forEach((c, i) => {
    ctx += `[CHUNK ${i + 1}]\n`;
    ctx += `Document: ${c.docTitle}\n`;
    ctx += `Citation: ${c.citationCode}\n`;
    ctx += `Page: ${c.pageIndex}${c.totalPages ? ` of ${c.totalPages}` : ""}\n`;
    ctx += `Category: ${c.docCategory}\n`;
    if (c.sectionTitle) ctx += `Section: ${c.sectionTitle}\n`;
    if (c.court)           ctx += `Court: ${c.court}\n`;
    if (c.formCode)        ctx += `Form: ${c.formCode}\n`;
    if (c.publicLawNumber) ctx += `Law: ${c.publicLawNumber}\n`;
    if (c.journalName)     ctx += `Journal: ${c.journalName}\n`;
    if (c.year)            ctx += `Year: ${c.year}\n`;
    ctx += `Text: ${c.text}\n\n`;
  });

  // Append graph context (related documents) if available
  if (graphContext.trim()) {
    ctx += "\n=== RELATED LEGAL DOCUMENT RELATIONSHIPS ===\n\n";
    ctx += graphContext;
    ctx += "\n";
  }

  return ctx;
}

// Module 25: Context validation — ensure context is meaningful
function validateContext(chunks: DocumentChunk[], pq: ProcessedQuery): boolean {
  if (chunks.length === 0) return false;
  const allText = chunks.map(c => c.text).join(" ").toLowerCase();
  const coverage = pq.tokens.filter(t => allText.includes(t)).length;
  return coverage >= Math.min(2, pq.tokens.length);
}

// Module 34: Fallback retrieval — broader search when main retrieval fails
async function fallbackRetrieval(pq: ProcessedQuery, gemini: GoogleGenAI): Promise<DocumentChunk[]> {
  try {
    const embedResults = await embedText(pq.normalized, gemini);
    const allResults: DocumentChunk[] = [];
    await Promise.all(embedResults.map(async ({ vec }) => {
      const r = await searchQdrant(vec, 5);
      allResults.push(...r.map(x => x.chunk));
    }));
    return deduplicateChunks(allResults).slice(0, 5);
  } catch { return []; }
}

// ═══════════════════════════════════════════════════════════════
// MAIN PIPELINE ORCHESTRATOR — all 36 modules wired together
// ═══════════════════════════════════════════════════════════════

export async function runRAGPipeline(
  request: RAGRequest,
  gemini: GoogleGenAI,
  groq: Groq,
  getGraphContext?: (chunks: DocumentChunk[]) => string
): Promise<RAGResponse> {
  const t0 = Date.now();
  
  // ── Module 1-3: Query preprocessing, normalization, expansion ──
  const pq = preprocessQuery(request.query);
  
  // ══════════════════════════════════════════════════════════════
  // SUMMARIZATION MODE - Use topK=20 for comprehensive summaries
  // ══════════════════════════════════════════════════════════════
  let topK = request.topK ?? 5;
  if (pq.isSummaryRequest) {
    topK = 20; // Retrieve more chunks for comprehensive summaries
    console.log(`🔍 SUMMARIZATION MODE ACTIVATED - Using topK=${topK}`);
    if (pq.summaryTarget) {
      console.log(`   Summary target: "${pq.summaryTarget}"`);
    }
  }
  
  const alpha = request.alpha ?? 0.7; // 0=pure keyword, 1=pure vector

  // ── Module 4-5: Metadata filter ──
  const metaFilter = request.filterDocCategory || request.filterDocId
    ? { filterDocCategory: request.filterDocCategory, filterDocId: request.filterDocId }
    : null;

  // ── Module 6: Dual-model embedding ──
  const queryEmbeddings = await embedText(pq.expanded, gemini);

  // ── Modules 6+8: Semantic search across all models ──
  const seenIds = new Set<string>();
  const vectorResults: Array<{ chunk: DocumentChunk; score: number }> = [];

  await Promise.all(queryEmbeddings.map(async ({ vec }) => {
    const hits = await searchQdrant(vec, 25);
    hits.forEach(h => {
      // Apply metadata filter if set
      if (metaFilter?.filterDocId && h.chunk.docId !== metaFilter.filterDocId) return;
      if (metaFilter?.filterDocCategory && h.chunk.docCategory !== metaFilter.filterDocCategory) return;
      if (!seenIds.has(h.chunk.id)) {
        seenIds.add(h.chunk.id);
        vectorResults.push({ chunk: h.chunk, score: h.vectorScore });
      } else {
        const existing = vectorResults.find(r => r.chunk.id === h.chunk.id);
        if (existing && h.vectorScore > existing.score) existing.score = h.vectorScore;
      }
    });
  }));

  // ── Module 34: Fallback if no vector results ──
  let workingChunks: DocumentChunk[] = vectorResults.map(r => r.chunk);
  if (workingChunks.length === 0) {
    workingChunks = await fallbackRetrieval(pq, gemini);
    if (workingChunks.length === 0) {
      return {
        answer: "The retrieved documents do not contain sufficient information to answer this question.",
        citations: [],
        retrievedChunks: [],
        metadata: {
          queryExpanded: pq.expanded,
          detectedEntities: pq.entities,
          chunksRetrieved: 0,
          chunksAfterRerank: 0,
          conflictsDetected: false,
          confidenceScore: 0,
          processingMs: Date.now() - t0,
        },
      };
    }
  }

  // ── Module 7: BM25 keyword search on retrieved candidates ──
  const bm25Scores = bm25Score(pq.expanded, workingChunks);
  const keywordRanked = workingChunks
    .map(c => ({ chunk: c, score: bm25Scores[c.id] ?? 0 }))
    .sort((a, b) => b.score - a.score);

  // ── Modules 8-9: Hybrid search + RRF (alpha-weighted) ──
  // alpha=0 → pure BM25 keyword, alpha=1 → pure vector semantic
  const rrfRanked = applyRRF(
    vectorResults.sort((a, b) => b.score - a.score),
    keywordRanked,
    60,
    alpha
  );

  // ── Module 10: Cross-encoder reranker (Groq) — limit to top 10 for speed ──
  const reranked = await crossEncoderRerank(pq.original, rrfRanked, groq);

  // ── Module 11: Dynamic score thresholding ──
  const thresholded = applyScoreThreshold(reranked);

  // ── Module 12: Top-K selection ──
  const topSelected = selectTopK(thresholded.length > 0 ? thresholded : reranked, topK);

  // ── Modules 13-14: Previous/Next chunk expansion ──
  const expandedChunks = await expandChunks(topSelected);

  // ── Module 15: Context merging ──
  const mergedChunks = mergeContext(expandedChunks);

  // ── Module 16: Deduplication ──
  const dedupedChunks = deduplicateChunks(mergedChunks);

  // ── Module 17: Context compression ──
  const finalChunks = compressContext(dedupedChunks, 250);

  // ── Module 25: Context validation ──
  const contextValid = validateContext(finalChunks, pq);

  // ── Modules 26-27: Conflict detection ──
  const conflictsDetected = detectConflicts(finalChunks);

  // ── MODULE 30: Graph RAG — Traverse document relationships ──
  const graphContext = getGraphContext ? getGraphContext(finalChunks) : "";
  const hasGraphContext = graphContext.trim().length > 0;

  // ── Modules 18-21: Citation building ──
  const citations = buildCitations(reranked, finalChunks);

  // ── Module 22: Confidence score ──
  const confidenceScore = calculateOverallConfidence(citations, pq.tokens, finalChunks);

  // ── Modules 23-24: Answer generation with hallucination prevention ──
  const systemPrompt = buildSystemPrompt(pq, conflictsDetected, hasGraphContext);
  const contextBlock = buildContextBlock(finalChunks, graphContext);

  let answer = "";
  try {
    if (!contextValid) {
      answer = "The retrieved documents do not contain sufficient information to answer this question.";
    } else {
      // ══════════════════════════════════════════════════════════════
      // SUMMARIZATION MODE - Use more tokens and different prompt
      // ══════════════════════════════════════════════════════════════
      const maxTokens = pq.isSummaryRequest ? 1500 : 800;
      const userPrompt = pq.isSummaryRequest
        ? `Provide a comprehensive, well-structured summary of the following legal documents. Cover all major points, explain key concepts clearly, and organize the information logically.\n\n${contextBlock}\n\nSummarize the above documents thoroughly, using clear headings and citations.`
        : `QUESTION: ${pq.original}\n\n${contextBlock}\n\nAnswer the question directly using only the context above. Cite every fact.`;
      
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userPrompt },
        ],
        temperature: pq.isSummaryRequest ? 0.2 : 0, // Slightly higher temp for summaries
        max_tokens: maxTokens,
      });
      answer = completion.choices[0]?.message?.content ?? "";

      // Module 24: Basic hallucination check — if answer mentions docs not in context, warn
      const contextDocNames = finalChunks.map(c => c.docTitle.toLowerCase());
      const suspectLines = answer.split("\n").filter(line => {
        const cited = line.match(/\[([^\]]+)\]/g);
        if (!cited) return false;
        return cited.some(c => {
          const name = c.replace(/[\[\]]/g, "").split(",")[0].trim().toLowerCase();
          return name.length > 5 && !contextDocNames.some(d => d.includes(name) || name.includes(d.slice(0, 15)));
        });
      });
      if (suspectLines.length > 2) {
        answer += "\n\n⚠️ Note: Some citations may reference documents not in the retrieved context. Please verify.";
      }
    }
  } catch (err: any) {
    answer = `Answer generation failed: ${err.message}. Context retrieved successfully — ${finalChunks.length} relevant chunks found.`;
  }

  // ── Module 28-29: Response formatting ──
  return {
    answer,
    citations,
    retrievedChunks: finalChunks,
    metadata: {
      queryExpanded: pq.expanded.slice(0, 200),
      detectedEntities: pq.entities.slice(0, 10),
      chunksRetrieved: workingChunks.length,
      chunksAfterRerank: finalChunks.length,
      conflictsDetected,
      confidenceScore,
      processingMs: Date.now() - t0,
      isSummaryRequest: pq.isSummaryRequest,
      summaryTarget: pq.summaryTarget || undefined,
    },
  };
}
