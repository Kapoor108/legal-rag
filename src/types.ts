export interface Citation {
  sourceDocId: string;
  sourceDocName: string;
  pageIndex: number;
  snippet: string;
  relevanceScore?: number;
}

export interface LegalDocument {
  id: string;
  title: string;
  category: "Act" | "Court Judgment" | "POV/Commentary" | "Tax Document";
  citationCode: string; // e.g., "348 U.S. 426" or "IRC § 61"
  author: string;
  date: string;
  summary: string;
  pages: string[]; // Each index corresponds to page content (1-indexed representation)
}

export interface DocumentChunk {
  id: string;
  docId: string;
  docTitle: string;
  docCategory: string;
  citationCode: string;
  pageIndex: number;      // 1-based page number
  text: string;
  embedding?: number[];

  // ── Extended metadata (populated by ingest scripts) ──────────────────
  chunkIndex?: number;    // sequential position within the document (1-based)
  totalChunks?: number;   // total chunks in the document — enables relative position signals
  totalPages?: number;    // total pages in the source PDF
  wordCount?: number;     // pre-computed word count — used by BM25 to avoid runtime recompute
  embeddingModel?: string;// which Gemini model produced this chunk's vector
  sourceFile?: string;    // original PDF filename e.g. "007_Schedule_A_...pdf"
  docSummary?: string;    // 2-3 sentence document summary — powers Graph RAG for ingested docs
  sectionTitle?: string;  // nearest section heading (Part I, Schedule SE Line 4, etc.)
  year?: number;          // publication / decision year extracted from filename
  // category-specific
  formCode?: string;      // IRS only: "Form 1040", "Schedule A (Form 1040)"
  court?: string;         // cases only: "9th Cir.", "W.Va. Sup. Ct.", etc.
  publicLawNumber?: string; // law only: "Pub. L. 118-15"
  journalName?: string;   // commentary only: "Stanford Law Review"
}

export interface LegalRelationship {
  sourceId: string;
  targetId: string;
  type: "cites" | "interprets" | "supersedes" | "discusses";
  description: string;
}

export interface SearchResult {
  chunk: DocumentChunk;
  vectorScore: number;
  keywordScore: number;
  hybridScore: number;
}

export interface QueryResponse {
  answer: string;
  retrievedChunks: DocumentChunk[];
  citations: Citation[];
}

export interface GoldenSetItem {
  id: string;
  query: string;
  groundTruth: string;
  targetDocId: string;
  targetPage: number;
}

export interface EvaluationResult {
  itemId: string;
  query: string;
  groundTruth: string;
  generatedAnswer: string;
  retrievedDocIds: string[];
  retrievedPages: number[];
  retrievalSuccess: boolean; // Did it find the targetDocId in top retrieved?
  faithfulnessScore: number; // 0 to 5
  relevanceScore: number; // 0 to 5
  feedback: string;
}

export interface EvaluationReport {
  retrievalAccuracy: number; // percentage
  averageFaithfulness: number; // scale 0-5
  averageRelevance: number; // scale 0-5
  results: EvaluationResult[];
  evaluatedAt: string;
}
