/**
 * Law folder ingestion script
 * Run with: npm run ingest:law
 *
 * - Reads PDFs from law/
 * - Uses sentence-aware chunking with overlap
 * - Embeds with gemini-embedding-2 (3072-dim)
 * - Upserts to Qdrant every 100 chunks (progress saved incrementally)
 * - Never touches existing raw_pdfs embeddings
 * - Uses law-{num} docId namespace — zero collision with pdf-{num}
 */

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env.local") });
dotenv.config({ path: resolve(__dirname, "../.env") });

import fs from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import {
  ensureCollection,
  upsertChunks,
  getCollectionCount,
  COLLECTION_NAME,
} from "./qdrantService";
import { DocumentChunk } from "./types";

// Qdrant Cloud connection details (mirrors qdrantService.ts)
const QDRANT_URL = process.env.QDRANT_URL || "http://localhost:6333";
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;

function qdrantHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (QDRANT_API_KEY) h["api-key"] = QDRANT_API_KEY;
  return h;
}

// ─── Config ────────────────────────────────────────────────────────────────
const LAW_PDF_DIR        = path.resolve(process.cwd(), "law");
const EMBEDDING_MODEL    = "gemini-embedding-001"; // separate quota from gemini-embedding-2
const CHUNK_TARGET_WORDS  = 120;    // smaller chunks = more precise search hits
const CHUNK_OVERLAP_WORDS = 30;     // 25% overlap preserves sentence context
const UPSERT_EVERY       = 100;    // upsert to Qdrant after every N chunks
const CONCURRENCY        = 8;      // parallel embed requests
const MAX_RETRIES        = 5;
// ───────────────────────────────────────────────────────────────────────────

// ─── PDF Parsing — returns array of page strings ──────────────────────────
async function parsePDF(filePath: string): Promise<{ pages: string[]; totalText: string }> {
  const pdfParse = (await import("pdf-parse-fork")).default;
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  const raw = (data.text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  let pages: string[];
  if (raw.includes("\f")) {
    pages = raw.split("\f")
      .map((p: string) => p.trim())
      .filter((p: string) => p.length > 30);
  } else {
    // Fallback: split by double newline or every ~1500 chars
    const paragraphs = raw.split(/\n{2,}/);
    pages = [];
    let current = "";
    for (const para of paragraphs) {
      current += para + "\n\n";
      if (current.length > 1500) {
        if (current.trim().length > 30) pages.push(current.trim());
        current = "";
      }
    }
    if (current.trim().length > 30) pages.push(current.trim());
  }

  return { pages, totalText: raw };
}

// ─── Sentence-aware chunking with overlap ─────────────────────────────────
function chunkText(text: string): string[] {
  // Clean up common PDF artifacts
  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(/- \n/g, "")           // hyphenated line breaks
    .replace(/\u2014|\u2013/g, "-") // em/en dashes
    .trim();

  const words = cleaned.split(/\s+/).filter(w => w.length > 0);
  if (words.length < 10) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + CHUNK_TARGET_WORDS, words.length);
    let chunkWords = words.slice(start, end);

    // Try to end on a sentence boundary (. ! ?) for cleaner chunks
    if (end < words.length) {
      let sentenceEnd = -1;
      for (let i = chunkWords.length - 1; i >= Math.floor(chunkWords.length * 0.7); i--) {
        if (/[.!?]$/.test(chunkWords[i])) {
          sentenceEnd = i;
          break;
        }
      }
      if (sentenceEnd > 0) chunkWords = chunkWords.slice(0, sentenceEnd + 1);
    }

    const chunk = chunkWords.join(" ").trim();
    if (chunk.length > 50) chunks.push(chunk);

    if (end >= words.length) break;
    start += chunkWords.length - CHUNK_OVERLAP_WORDS;
  }

  return chunks;
}

// ─── Metadata from law/ filename ──────────────────────────────────────────
function metaFromLawFilename(filename: string): {
  docId: string;
  title: string;
  category: "Act";
  citationCode: string;
  publicLawNumber: string;
} {
  // e.g. "018_Public_Law_118-33_118_2026.pdf"
  const base = path.basename(filename, ".pdf");
  const parts = base.split("_");
  const num = parts[0]; // "018"

  // Extract Public Law number — pattern like "118-33"
  const plMatch = base.match(/(\d{3}-\d+)/);
  const publicLawNumber = plMatch ? `Pub. L. ${plMatch[1]}` : `Pub. L. ${num}`;

  // Extract year
  const yearMatch = base.match(/(\d{4})$/);
  const year = yearMatch ? yearMatch[1] : "2026";

  const title = `Public Law ${plMatch ? plMatch[1] : num} (${year})`;

  return {
    docId: `law-${num}`,          // "law-018" — distinct from "pdf-018"
    title,
    category: "Act",
    citationCode: publicLawNumber,
    publicLawNumber,
  };
}

// ─── Embed with retry ─────────────────────────────────────────────────────
async function embedWithRetry(client: GoogleGenAI, text: string): Promise<number[]> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: text,
      });
      if (response.embeddings?.[0]?.values) return response.embeddings[0].values;
      if ((response as any).embedding?.values)  return (response as any).embedding.values;
      throw new Error("Empty embedding response");
    } catch (err: any) {
      const isRateLimit =
        err?.status === 429 ||
        String(err?.message).includes("429") ||
        String(err?.message).includes("quota") ||
        String(err?.message).includes("RESOURCE_EXHAUSTED");

      if (isRateLimit && attempt < MAX_RETRIES) {
        const match = String(err?.message).match(/retry in (\d+)/);
        const waitSec = match ? parseInt(match[1]) + 5 : 65;
        process.stdout.write(
          `\n   ⏳ Rate limit — waiting ${waitSec}s (attempt ${attempt}/${MAX_RETRIES})...`
        );
        await new Promise(r => setTimeout(r, waitSec * 1000));
        process.stdout.write(" retrying\n");
      } else {
        throw err;
      }
    }
  }
  throw new Error("Max retries exceeded");
}

// ─── Parallel embedding ───────────────────────────────────────────────────
async function embedParallel(client: GoogleGenAI, texts: string[]): Promise<number[][]> {
  const results: number[][] = new Array(texts.length);
  let idx = 0;
  async function worker() {
    while (idx < texts.length) {
      const i = idx++;
      results[i] = await embedWithRetry(client, texts[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, texts.length) }, () => worker())
  );
  return results;
}

// ─── Get already-ingested docIds from Qdrant with chunk counts ───────────
// Returns Map<docId, chunkCount> — used to detect partial ingestion
async function getIngestedDocCounts(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  try {
    let offset: string | null = null;
    do {
      const body: any = { limit: 250, with_payload: ["docId"], with_vector: false };
      if (offset) body.offset = offset;
      const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/scroll`, {
        method: "POST",
        headers: qdrantHeaders(),
        body: JSON.stringify(body),
      });
      const json = await res.json() as any;
      const points: any[] = json?.result?.points ?? [];
      points.forEach((p: any) => {
        if (p.payload?.docId) {
          counts.set(p.payload.docId, (counts.get(p.payload.docId) ?? 0) + 1);
        }
      });
      offset = json?.result?.next_page_offset ?? null;
    } while (offset !== null);
  } catch { /* empty collection */ }
  return counts;
}

// ─── Progress bar ─────────────────────────────────────────────────────────
function bar(current: number, total: number, label = "") {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const filled = Math.floor(pct / 5);
  const b = "█".repeat(filled) + "░".repeat(20 - filled);
  process.stdout.write(`\r   [${b}] ${String(pct).padStart(3)}% | ${label.slice(0, 52).padEnd(52)}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║   Antigravity — Law Folder Ingestion Pipeline        ║");
  console.log(`║   Model : ${EMBEDDING_MODEL.padEnd(43)}║`);
  console.log(`║   Source: law/                                       ║`);
  console.log(`║   Target: Qdrant collection "${COLLECTION_NAME}"`.padEnd(55) + "║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  // Validate key
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey || geminiKey === "MY_GEMINI_API_KEY") {
    console.error("❌ GEMINI_API_KEY not set in .env.local"); process.exit(1);
  }
  const gemini = new GoogleGenAI({ apiKey: geminiKey });

  if (!fs.existsSync(LAW_PDF_DIR)) {
    console.error(`❌ law/ folder not found at ${LAW_PDF_DIR}`); process.exit(1);
  }

  const pdfFiles = fs.readdirSync(LAW_PDF_DIR)
    .filter(f => f.toLowerCase().endsWith(".pdf"))
    .sort();

  console.log(`📁 ${pdfFiles.length} PDFs found in law/\n`);

  // ── 1. Qdrant check ──
  console.log("1. Checking Qdrant...");
  await ensureCollection();
  const existingCount = await getCollectionCount();
  const ingestedCounts = await getIngestedDocCounts();

  // Docs with fewer chunks than this are likely partial — 
  // small PDFs (027/028/029) have 3-4 chunks naturally so threshold=10 catches only law-030
  const MIN_CHUNKS_COMPLETE = 10;
  const fullyIngestedIds = new Set(
    [...ingestedCounts.entries()]
      .filter(([, count]) => count >= MIN_CHUNKS_COMPLETE)
      .map(([id]) => id)
  );
  const partialIds = new Set(
    [...ingestedCounts.entries()]
      .filter(([id, count]) => id.startsWith("law-") && count < MIN_CHUNKS_COMPLETE)
      .map(([id]) => id)
  );

  const lawFull    = [...fullyIngestedIds].filter(id => id.startsWith("law-")).length;
  const pdfFull    = [...fullyIngestedIds].filter(id => id.startsWith("pdf-")).length;
  const hardFull   = [...fullyIngestedIds].filter(id => !id.startsWith("pdf-") && !id.startsWith("law-")).length;

  console.log(`   Total points in Qdrant : ${existingCount}`);
  console.log(`   raw_pdfs docs (pdf-*)  : ${pdfFull}  ← will NOT be touched`);
  console.log(`   hardcoded docs         : ${hardFull}  ← will NOT be touched`);
  console.log(`   law docs fully done    : ${lawFull}/30`);
  if (partialIds.size > 0) {
    console.log(`   law docs partial       : ${[...partialIds].join(", ")} ← will be re-ingested`);
  }
  console.log();

  // Delete partial law doc chunks from Qdrant before re-processing
  if (partialIds.size > 0) {
    console.log(`   🗑  Removing ${partialIds.size} partial docs from Qdrant for clean re-ingest...`);
    for (const docId of partialIds) {
      try {
        await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/delete`, {
          method: "POST",
          headers: qdrantHeaders(),
          body: JSON.stringify({ filter: { must: [{ key: "docId", match: { value: docId } }] } }),
        });
        console.log(`   ✓ Deleted partial chunks for ${docId}`);
      } catch (e: any) {
        console.warn(`   ⚠  Could not delete ${docId}: ${e.message}`);
      }
    }
    console.log();
  }

  // ── 2. Parse PDFs ──
  console.log("2. Parsing law PDFs...");
  const t0 = Date.now();
  const allChunks: DocumentChunk[] = [];
  let skipped = 0;
  let parsed = 0;

  for (let f = 0; f < pdfFiles.length; f++) {
    const filename = pdfFiles[f];
    const meta = metaFromLawFilename(filename);

    if (fullyIngestedIds.has(meta.docId)) {
      skipped++;
      process.stdout.write(`\r   [${f + 1}/${pdfFiles.length}] ⏭  Already done: ${meta.docId} — ${meta.title.slice(0,38).padEnd(38)}`);
      continue;
    }

    process.stdout.write(`\r   [${f + 1}/${pdfFiles.length}] Parsing: ${filename.slice(0, 52).padEnd(52)}`);

    try {
      const { pages } = await parsePDF(path.join(LAW_PDF_DIR, filename));
      const yearMatch = filename.match(/(\d{4})\.pdf$/i);
      const year = yearMatch ? parseInt(yearMatch[1]) : 2026;
      // Pre-compute all page chunks for total count
      const allPageChunks = pages.map(p => chunkText(p));
      const docTotalChunks = allPageChunks.reduce((s, c) => s + c.length, 0);
      let chunkIdx = 0;

      for (let p = 0; p < pages.length; p++) {
        for (const text of allPageChunks[p]) {
          chunkIdx++;
          allChunks.push({
            id:              `${meta.docId}-p${p + 1}-c${chunkIdx}`,
            docId:           meta.docId,
            docTitle:        meta.title,
            docCategory:     meta.category,
            citationCode:    meta.citationCode,
            pageIndex:       p + 1,
            text,
            // ── Extended metadata ──
            chunkIndex:      chunkIdx,
            totalChunks:     docTotalChunks,
            totalPages:      pages.length,
            wordCount:       text.split(/\s+/).length,
            embeddingModel:  EMBEDDING_MODEL,
            sourceFile:      filename,
            publicLawNumber: meta.publicLawNumber,
            docSummary:      `${meta.title} — a United States public law (${meta.publicLawNumber}), enacted in ${year}. Sourced from ${filename}.`,
            year,
          });
        }
      }
      parsed++;
    } catch (err: any) {
      console.error(`\n   ⚠  Failed to parse ${filename}: ${err.message}`);
    }
  }

  console.log(`\n`);
  console.log(`   ✓ Parsed  : ${parsed} new PDFs`);
  console.log(`   ⏭  Skipped : ${skipped} already ingested`);
  console.log(`   📄 Chunks  : ${allChunks.length} new chunks (${((Date.now() - t0) / 1000).toFixed(1)}s)\n`);

  if (allChunks.length === 0) {
    console.log("✅ Nothing new to ingest. All law PDFs already in Qdrant.");
    console.log(`   Current Qdrant total: ${existingCount} points`);
    return;
  }

  // ── 3. Embed every UPSERT_EVERY chunks → upsert immediately ──
  const estimatedMin = Math.ceil(allChunks.length / 95);
  console.log(`3. Embedding & upserting in batches of ${UPSERT_EVERY}...`);
  console.log(`   Concurrency: ${CONCURRENCY} | ~${estimatedMin} min estimated\n`);

  const t1 = Date.now();
  let totalDone = 0;

  for (let i = 0; i < allChunks.length; i += UPSERT_EVERY) {
    const batch = allChunks.slice(i, i + UPSERT_EVERY);
    bar(i, allChunks.length, `embedding ${i + 1}–${Math.min(i + UPSERT_EVERY, allChunks.length)} of ${allChunks.length}`);

    // Embed this batch in parallel
    const embeddings = await embedParallel(gemini, batch.map(c => c.text));

    // Upsert immediately — Qdrant is updated after every 100 chunks
    await upsertChunks(batch, embeddings);
    totalDone += batch.length;

    bar(totalDone, allChunks.length, `✓ saved ${totalDone}/${allChunks.length} chunks to Qdrant`);
  }

  const elapsed = ((Date.now() - t1) / 1000).toFixed(1);
  const finalCount = await getCollectionCount();

  console.log(`\n`);
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log(`║  ✅ Law ingestion complete in ${elapsed}s`.padEnd(55) + "║");
  console.log(`║  📦 ${totalDone} new chunks embedded & stored`.padEnd(55) + "║");
  console.log(`║  🗄️  Qdrant total now: ${finalCount} points`.padEnd(55) + "║");
  console.log(`║  📂 raw_pdfs chunks preserved: ${existingCount}`.padEnd(55) + "║");
  console.log(`║  🔗 ${QDRANT_URL}/dashboard`.padEnd(55) + "║");
  console.log("╚══════════════════════════════════════════════════════╝");
}

main().catch(err => {
  console.error("\n❌ Law ingestion failed:", err.message || err);
  process.exit(1);
});
