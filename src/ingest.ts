/**
 * Optimized PDF Ingestion Script
 * Run with: npm run ingest
 *
 * Strategy:
 *  1. Parse all PDFs from raw_pdfs/
 *  2. Chunk with 180-word target + 25-word overlap
 *  3. Every 100 chunks: embed in parallel → upsert to Qdrant immediately
 *     → progress is saved after every 100 chunks, quota errors don't lose work
 *  4. Skip already-ingested docs on re-run
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
  qdrant,
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
const RAW_PDF_DIR        = path.resolve(process.cwd(), "raw_pdfs");
const EMBEDDING_MODEL    = "gemini-embedding-2";
const CHUNK_TARGET_WORDS = 180;   // ~512 tokens
const CHUNK_OVERLAP_WORDS = 25;   // ~50 token overlap
const UPSERT_EVERY       = 100;   // embed + upsert after every N chunks
const CONCURRENCY        = 8;     // parallel embed requests per batch
const RETRY_DELAY_MS     = 62000; // 62s wait on rate-limit (API says ~52s)
const MAX_RETRIES        = 5;
// ───────────────────────────────────────────────────────────────────────────

// ─── PDF Parsing ───────────────────────────────────────────────────────────
async function parsePDF(filePath: string): Promise<string[]> {
  const pdfParse = (await import("pdf-parse-fork")).default;
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  const raw = data.text || "";

  let pages: string[];
  if (raw.includes("\f")) {
    pages = raw.split("\f").map((p: string) => p.trim()).filter((p: string) => p.length > 20);
  } else {
    pages = [];
    for (let i = 0; i < raw.length; i += 1500) {
      const slice = raw.slice(i, i + 1500).trim();
      if (slice.length > 20) pages.push(slice);
    }
  }
  return pages;
}

// ─── Chunking with sliding window overlap ─────────────────────────────────
function chunkText(text: string): string[] {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + CHUNK_TARGET_WORDS, words.length);
    const chunk = words.slice(start, end).join(" ").trim();
    if (chunk.length > 30) chunks.push(chunk);
    if (end >= words.length) break;
    start += CHUNK_TARGET_WORDS - CHUNK_OVERLAP_WORDS;
  }
  return chunks;
}

// ─── Metadata from filename ────────────────────────────────────────────────
function metaFromFilename(filename: string) {
  const base = path.basename(filename, ".pdf");
  const num = base.split("_")[0];
  const rawTitle = base.replace(/^\d+_/, "").replace(/_/g, " ");
  const title = rawTitle.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  let category = "Court Judgment";
  let citationCode = `Case No. ${num}`;
  let court = "Federal Court";

  if (base.includes("ca1_circuit"))        { citationCode = `1st Cir. ${num}`; court = "1st Cir."; }
  else if (base.includes("ca9_circuit"))   { citationCode = `9th Cir. ${num}`; court = "9th Cir."; }
  else if (base.includes("ca11_circuit"))  { citationCode = `11th Cir. ${num}`; court = "11th Cir."; }
  else if (base.includes("south_dakota"))  { citationCode = `S.D. Sup. Ct. ${num}`; court = "S.D. Sup. Ct."; }
  else if (base.includes("west_virginia")) { citationCode = `W.Va. Sup. Ct. ${num}`; court = "W.Va. Sup. Ct."; }
  else if (base.includes("reference_manual")) {
    category = "POV/Commentary";
    citationCode = `Ref. Manual ${num}`;
    court = "";
  }

  const yearMatch = base.match(/(\d{4})$/);
  const year = yearMatch ? parseInt(yearMatch[1]) : 2026;

  const docSummary = `${title.slice(0, 80)} — a ${category.toLowerCase()} ${court ? `from ${court}` : ""} (${year}). Sourced from ${filename}.`;

  return {
    docId: `pdf-${num}`,
    title: title.slice(0, 120),
    category,
    citationCode,
    court: court || undefined,
    year,
    docSummary,
  };
}

// ─── Embedding with retry on rate-limit ───────────────────────────────────
async function embedWithRetry(client: GoogleGenAI, text: string): Promise<number[]> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: text,
      });
      if (response.embeddings?.[0]?.values) return response.embeddings[0].values;
      if ((response as any).embedding?.values) return (response as any).embedding.values;
      throw new Error("Empty embedding response");
    } catch (err: any) {
      const isRateLimit =
        err?.status === 429 ||
        err?.message?.includes("429") ||
        err?.message?.includes("quota") ||
        err?.message?.includes("RESOURCE_EXHAUSTED");

      if (isRateLimit && attempt < MAX_RETRIES) {
        // Extract retry delay from error if available
        const match = err?.message?.match(/retry in (\d+)/);
        const waitSec = match ? parseInt(match[1]) + 5 : RETRY_DELAY_MS / 1000;
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

// ─── Embed a batch in parallel ────────────────────────────────────────────
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

// ─── Check already ingested docIds ────────────────────────────────────────
async function getIngestedDocIds(): Promise<Set<string>> {
  const ingested = new Set<string>();
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
        if (p.payload?.docId) ingested.add(p.payload.docId);
      });
      offset = json?.result?.next_page_offset ?? null;
    } while (offset !== null);
  } catch { /* empty collection */ }
  return ingested;
}

// ─── Progress bar ─────────────────────────────────────────────────────────
function bar(current: number, total: number, label = "") {
  const pct = Math.round((current / total) * 100);
  const filled = Math.floor(pct / 5);
  const b = "█".repeat(filled) + "░".repeat(20 - filled);
  process.stdout.write(`\r   [${b}] ${String(pct).padStart(3)}% | ${label.slice(0, 50).padEnd(50)}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║   Antigravity Legal RAG — PDF Ingestion Pipeline     ║");
  console.log(`║   Model: ${EMBEDDING_MODEL.padEnd(44)}║`);
  console.log("╚══════════════════════════════════════════════════════╝\n");

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey || geminiKey === "MY_GEMINI_API_KEY") {
    console.error("❌ GEMINI_API_KEY not set"); process.exit(1);
  }
  const gemini = new GoogleGenAI({ apiKey: geminiKey });

  if (!fs.existsSync(RAW_PDF_DIR)) {
    console.error(`❌ raw_pdfs/ folder not found`); process.exit(1);
  }
  const pdfFiles = fs.readdirSync(RAW_PDF_DIR)
    .filter(f => f.toLowerCase().endsWith(".pdf"))
    .sort();

  console.log(`📁 ${pdfFiles.length} PDFs found in raw_pdfs/\n`);

  // ── 1. Qdrant setup ──
  console.log("1. Checking Qdrant collection...");
  await ensureCollection();
  const existingCount = await getCollectionCount();
  const ingestedDocIds = await getIngestedDocIds();
  console.log(`   ${existingCount} points already stored | ${ingestedDocIds.size} docs already ingested\n`);

  // ── 2. Parse PDFs (skip already ingested) ──
  console.log("2. Parsing PDFs...");
  const t0 = Date.now();
  const allChunks: DocumentChunk[] = [];

  for (let f = 0; f < pdfFiles.length; f++) {
    const filename = pdfFiles[f];
    const meta = metaFromFilename(filename);

    if (ingestedDocIds.has(meta.docId)) {
      process.stdout.write(`\r   [${f + 1}/${pdfFiles.length}] ⏭  Skipping (already ingested): ${filename.slice(0, 40).padEnd(40)}`);
      continue;
    }

    process.stdout.write(`\r   [${f + 1}/${pdfFiles.length}] Parsing: ${filename.slice(0, 50).padEnd(50)}`);

    try {
      const pages = await parsePDF(path.join(RAW_PDF_DIR, filename));
      // First pass: count total chunks for this doc
      const allPageChunks: string[][] = pages.map(p => chunkText(p));
      const docTotalChunks = allPageChunks.reduce((s, c) => s + c.length, 0);
      let chunkIdx = 0;
      for (let p = 0; p < pages.length; p++) {
        for (const text of allPageChunks[p]) {
          chunkIdx++;
          allChunks.push({
            id:             `${meta.docId}-p${p + 1}-c${chunkIdx}`,
            docId:          meta.docId,
            docTitle:       meta.title,
            docCategory:    meta.category,
            citationCode:   meta.citationCode,
            pageIndex:      p + 1,
            text,
            // ── Extended metadata ──
            chunkIndex:     chunkIdx,
            totalChunks:    docTotalChunks,
            totalPages:     pages.length,
            wordCount:      text.split(/\s+/).length,
            embeddingModel: EMBEDDING_MODEL,
            sourceFile:     filename,
            docSummary:     meta.docSummary,
            year:           meta.year,
            ...(meta.court ? { court: meta.court } : {}),
          });
        }
      }
    } catch (err: any) {
      console.error(`\n   ⚠  Failed: ${filename} — ${err.message}`);
    }
  }

  console.log(`\n   ✓ ${allChunks.length} new chunks to embed (${((Date.now() - t0) / 1000).toFixed(1)}s)\n`);

  if (allChunks.length === 0) {
    console.log("✅ Nothing new to ingest. All PDFs already in Qdrant.");
    return;
  }

  // ── 3. Embed every 100 chunks → upsert immediately ──
  console.log(`3. Embedding & upserting in batches of ${UPSERT_EVERY}...`);
  console.log(`   Concurrency: ${CONCURRENCY} | Model: ${EMBEDDING_MODEL}\n`);
  const t1 = Date.now();
  let totalDone = 0;

  for (let i = 0; i < allChunks.length; i += UPSERT_EVERY) {
    const batch = allChunks.slice(i, i + UPSERT_EVERY);
    bar(i, allChunks.length, `embedding ${i + 1}–${Math.min(i + UPSERT_EVERY, allChunks.length)} of ${allChunks.length}`);

    // Embed this batch in parallel
    const embeddings = await embedParallel(gemini, batch.map(c => c.text));

    // Upsert immediately — progress is saved even if script dies next batch
    await upsertChunks(batch, embeddings);
    totalDone += batch.length;

    bar(totalDone, allChunks.length, `✓ upserted ${totalDone}/${allChunks.length} chunks`);
  }

  const elapsed = ((Date.now() - t1) / 1000).toFixed(1);
  const finalCount = await getCollectionCount();

  console.log(`\n\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║  ✅ Done in ${elapsed}s`.padEnd(55) + "║");
  console.log(`║  📦 ${totalDone} new chunks embedded & stored`.padEnd(55) + "║");
  console.log(`║  🗄️  Qdrant total: ${finalCount} points`.padEnd(55) + "║");
  console.log(`║  🔗 ${QDRANT_URL}/dashboard`.padEnd(55) + "║");
  console.log(`╚══════════════════════════════════════════════════════╝`);
}

main().catch(err => {
  console.error("\n❌ Ingestion failed:", err.message || err);
  process.exit(1);
});
