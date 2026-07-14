/**
 * Commentary folder ingestion script
 * Run with: npm run ingest:commentary
 *
 * - Reads PDFs from commentary/
 * - Uses commentary-{ num } docId namespace — no collision with pdf-* or law-*
 * - Chunks with 150-word target + 30-word overlap (dense academic text needs smaller chunks)
 * - Embeds with gemini-embedding-001 (3072-dim, separate quota)
 * - Upserts to Qdrant every 100 chunks
 * - Detects and re-processes partial ingestions automatically
 * - Never touches existing pdf-* or law-* embeddings
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
const COMMENTARY_DIR      = path.resolve(process.cwd(), "commentary");
const EMBEDDING_MODEL     = "gemini-embedding-2"; // fresh quota on this key
const CHUNK_TARGET_WORDS  = 150;   // smaller for dense academic prose
const CHUNK_OVERLAP_WORDS = 30;    // ~20% overlap preserves argument context
const UPSERT_EVERY        = 100;   // save to Qdrant every N chunks
const CONCURRENCY         = 8;     // parallel embed requests
const MAX_RETRIES         = 6;
// ───────────────────────────────────────────────────────────────────────────

// ─── PDF Parsing ───────────────────────────────────────────────────────────
async function parsePDF(filePath: string): Promise<string[]> {
  const pdfParse = (await import("pdf-parse-fork")).default;
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  const raw = (data.text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  let pages: string[];
  if (raw.includes("\f")) {
    pages = raw.split("\f")
      .map((p: string) => p.trim())
      .filter((p: string) => p.length > 30);
  } else {
    // Split on double newlines into paragraphs, group into ~1500 char pages
    const paragraphs = raw.split(/\n{2,}/);
    pages = [];
    let current = "";
    for (const para of paragraphs) {
      current += para.trim() + "\n\n";
      if (current.length >= 1500) {
        if (current.trim().length > 30) pages.push(current.trim());
        current = "";
      }
    }
    if (current.trim().length > 30) pages.push(current.trim());
  }
  return pages;
}

// ─── Sentence-aware chunking ───────────────────────────────────────────────
function chunkText(text: string): string[] {
  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(/- \n/g, "")
    .replace(/\u2014|\u2013/g, "-")
    .trim();

  const words = cleaned.split(/\s+/).filter(w => w.length > 0);
  if (words.length < 10) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + CHUNK_TARGET_WORDS, words.length);
    let chunkWords = words.slice(start, end);

    // Try to end on sentence boundary
    if (end < words.length) {
      for (let i = chunkWords.length - 1; i >= Math.floor(chunkWords.length * 0.7); i--) {
        if (/[.!?]"?$/.test(chunkWords[i])) {
          chunkWords = chunkWords.slice(0, i + 1);
          break;
        }
      }
    }

    const chunk = chunkWords.join(" ").trim();
    if (chunk.length > 40) chunks.push(chunk);
    if (end >= words.length) break;
    start += chunkWords.length - CHUNK_OVERLAP_WORDS;
  }
  return chunks;
}

// ─── Metadata from commentary filename ────────────────────────────────────
function metaFromCommentaryFilename(filename: string): {
  docId: string;
  title: string;
  category: "POV/Commentary";
  citationCode: string;
  journalName: string;
} {
  const base = path.basename(filename, ".pdf");
  const num = base.split("_")[0]; // "001", "014", etc.

  // Determine journal
  let journal = "Law Review";
  if (base.toLowerCase().includes("yale"))            journal = "Yale Law Journal Forum";
  else if (base.toLowerCase().includes("stanford"))   journal = "Stanford Law Review";
  else if (base.toLowerCase().includes("columbia"))   journal = "Columbia Law Review";

  // Extract year
  const yearMatch = base.match(/(\d{4})$/);
  const year = yearMatch ? yearMatch[1] : "2026";

  // Build human-readable title from filename
  // e.g. "015_THE_STRATEGIC_MOOTNESS_GAP_Columbia_Law_Review_2026"
  // → "The Strategic Mootness Gap"
  let titlePart = base
    .replace(/^\d+_/, "")                             // remove leading number
    .replace(/_(Yale|Stanford|Columbia)_Law.*$/i, "") // strip journal suffix
    .replace(/_/g, " ")
    .replace(/^Download the PDF\s*/i, "")
    .replace(/^em(.+)em$/i, "$1")                     // strip em markers
    .replace(/\s+/g, " ")
    .trim();

  // Title-case
  const title = titlePart
    .split(" ")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
    .slice(0, 120);

  const citationCode = `${journal} (${year}) No.${num}`;

  return {
    docId: `commentary-${num}`,
    title: title || `${journal} Article ${num}`,
    category: "POV/Commentary" as const,
    citationCode,
    journalName: journal,
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
        process.stdout.write(`\n   ⏳ Rate limit — waiting ${waitSec}s (attempt ${attempt}/${MAX_RETRIES})...`);
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

// ─── Get ingested doc counts via REST ─────────────────────────────────────
async function getIngestedDocCounts(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  try {
    let offset: string | null = null;
    do {
      const body: any = { limit: 250, with_payload: ["docId"], with_vector: false };
      if (offset) body.offset = offset;
      const res = await fetch(
        `${QDRANT_URL}/collections/${COLLECTION_NAME}/points/scroll`,
        { method: "POST", headers: qdrantHeaders(), body: JSON.stringify(body) }
      );
      const json = await res.json() as any;
      (json?.result?.points ?? []).forEach((p: any) => {
        if (p.payload?.docId) counts.set(p.payload.docId, (counts.get(p.payload.docId) ?? 0) + 1);
      });
      offset = json?.result?.next_page_offset ?? null;
    } while (offset !== null);
  } catch { /* empty */ }
  return counts;
}

// ─── Delete points for a docId ────────────────────────────────────────────
async function deleteDocPoints(docId: string): Promise<void> {
  await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/delete`, {
    method: "POST",
    headers: qdrantHeaders(),
    body: JSON.stringify({ filter: { must: [{ key: "docId", match: { value: docId } }] } }),
  });
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
  console.log("║   Antigravity — Commentary Ingestion Pipeline        ║");
  console.log(`║   Model : ${EMBEDDING_MODEL.padEnd(43)}║`);
  console.log(`║   Source: commentary/ (${CHUNK_TARGET_WORDS}-word chunks, ${CHUNK_OVERLAP_WORDS}-word overlap)`.padEnd(55) + "║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey || geminiKey === "MY_GEMINI_API_KEY") {
    console.error("❌ GEMINI_API_KEY not set"); process.exit(1);
  }
  const gemini = new GoogleGenAI({ apiKey: geminiKey });

  if (!fs.existsSync(COMMENTARY_DIR)) {
    console.error(`❌ commentary/ folder not found`); process.exit(1);
  }

  const pdfFiles = fs.readdirSync(COMMENTARY_DIR)
    .filter(f => f.toLowerCase().endsWith(".pdf"))
    .sort();
  console.log(`📁 ${pdfFiles.length} PDFs found in commentary/\n`);

  // ── 1. Qdrant state ──
  console.log("1. Checking Qdrant...");
  await ensureCollection();
  const existingCount = await getCollectionCount();
  const ingestedCounts = await getIngestedDocCounts();

  // Categorise existing docs
  const pdfDocs         = [...ingestedCounts.entries()].filter(([id]) => id.startsWith("pdf-"));
  const lawDocs         = [...ingestedCounts.entries()].filter(([id]) => id.startsWith("law-"));
  const commentaryDocs  = [...ingestedCounts.entries()].filter(([id]) => id.startsWith("commentary-"));

  // Partial detection: commentary docs with < 5 chunks are suspect
  const MIN_COMPLETE = 5;
  const partialIds = new Set(
    commentaryDocs.filter(([, c]) => c < MIN_COMPLETE).map(([id]) => id)
  );
  const fullyDoneIds = new Set(
    [...ingestedCounts.entries()]
      .filter(([id, c]) => !id.startsWith("commentary-") || c >= MIN_COMPLETE)
      .map(([id]) => id)
  );

  console.log(`   Total points      : ${existingCount}`);
  console.log(`   pdf-*  (untouched): ${pdfDocs.length} docs, ${pdfDocs.reduce((s,[,c])=>s+c,0)} chunks`);
  console.log(`   law-*  (untouched): ${lawDocs.length} docs, ${lawDocs.reduce((s,[,c])=>s+c,0)} chunks`);
  console.log(`   commentary-* done : ${commentaryDocs.length - partialIds.size} docs`);
  if (partialIds.size > 0) {
    console.log(`   commentary-* partial (will redo): ${[...partialIds].join(", ")}`);
  }
  console.log();

  // Delete partial commentary chunks
  if (partialIds.size > 0) {
    console.log(`   🗑  Cleaning ${partialIds.size} partial docs...`);
    for (const id of partialIds) {
      await deleteDocPoints(id);
      console.log(`   ✓ Removed partial: ${id}`);
    }
    console.log();
  }

  // ── 2. Parse PDFs ──
  console.log("2. Parsing commentary PDFs...");
  const t0 = Date.now();
  const allChunks: DocumentChunk[] = [];
  let skipped = 0, parsed = 0;

  for (let f = 0; f < pdfFiles.length; f++) {
    const filename = pdfFiles[f];
    const meta = metaFromCommentaryFilename(filename);

    if (fullyDoneIds.has(meta.docId)) {
      skipped++;
      process.stdout.write(
        `\r   [${f + 1}/${pdfFiles.length}] ⏭  Already done: ${meta.docId} — ${meta.title.slice(0, 35).padEnd(35)}`
      );
      continue;
    }

    process.stdout.write(
      `\r   [${f + 1}/${pdfFiles.length}] Parsing: ${filename.slice(0, 52).padEnd(52)}`
    );

    try {
      const pages = await parsePDF(path.join(COMMENTARY_DIR, filename));
      const yearMatch = filename.match(/(\d{4})\.pdf$/i);
      const year = yearMatch ? parseInt(yearMatch[1]) : 2026;
      const allPageChunks = pages.map(p => chunkText(p));
      const docTotalChunks = allPageChunks.reduce((s, c) => s + c.length, 0);
      let chunkIdx = 0;
      for (let p = 0; p < pages.length; p++) {
        for (const text of allPageChunks[p]) {
          chunkIdx++;
          allChunks.push({
            id:            `${meta.docId}-p${p + 1}-c${chunkIdx}`,
            docId:         meta.docId,
            docTitle:      meta.title,
            docCategory:   meta.category,
            citationCode:  meta.citationCode,
            pageIndex:     p + 1,
            text,
            // ── Extended metadata ──
            chunkIndex:    chunkIdx,
            totalChunks:   docTotalChunks,
            totalPages:    pages.length,
            wordCount:     text.split(/\s+/).length,
            embeddingModel: EMBEDDING_MODEL,
            sourceFile:    filename,
            journalName:   meta.journalName,
            docSummary:    `${meta.title} — academic legal commentary published in ${meta.journalName} (${year}). Citation: ${meta.citationCode}.`,
            year,
          });
        }
      }
      parsed++;
    } catch (err: any) {
      console.error(`\n   ⚠  Failed: ${filename} — ${err.message}`);
    }
  }

  console.log(`\n`);
  console.log(`   ✓ Parsed  : ${parsed} new PDFs`);
  console.log(`   ⏭  Skipped : ${skipped} already complete`);
  console.log(`   📄 Chunks  : ${allChunks.length} to embed (${((Date.now() - t0)/1000).toFixed(1)}s)\n`);

  if (allChunks.length === 0) {
    const final = await getCollectionCount();
    console.log(`✅ Nothing new to ingest. Qdrant total: ${final} points.`);
    return;
  }

  // ── 3. Embed every UPSERT_EVERY chunks → upsert immediately ──
  const estMin = Math.ceil(allChunks.length / 90);
  console.log(`3. Embedding & upserting every ${UPSERT_EVERY} chunks...`);
  console.log(`   Concurrency: ${CONCURRENCY} | ~${estMin} min estimated\n`);

  const t1 = Date.now();
  let totalDone = 0;

  for (let i = 0; i < allChunks.length; i += UPSERT_EVERY) {
    const batch = allChunks.slice(i, i + UPSERT_EVERY);
    bar(i, allChunks.length, `embedding ${i + 1}–${Math.min(i + UPSERT_EVERY, allChunks.length)} of ${allChunks.length}`);

    const embeddings = await embedParallel(gemini, batch.map(c => c.text));
    await upsertChunks(batch, embeddings);
    totalDone += batch.length;

    bar(totalDone, allChunks.length, `✓ saved ${totalDone}/${allChunks.length} to Qdrant`);
  }

  const elapsed = ((Date.now() - t1) / 1000).toFixed(1);
  const finalCount = await getCollectionCount();

  console.log(`\n`);
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log(`║  ✅ Commentary ingestion complete in ${elapsed}s`.padEnd(55) + "║");
  console.log(`║  📦 ${totalDone} new chunks embedded & stored`.padEnd(55) + "║");
  console.log(`║  🗄️  Qdrant total: ${finalCount} points`.padEnd(55) + "║");
  console.log(`║  🔗 ${QDRANT_URL}/dashboard`.padEnd(55) + "║");
  console.log("╚══════════════════════════════════════════════════════╝");
}

main().catch(err => {
  console.error("\n❌ Commentary ingestion failed:", err.message || err);
  process.exit(1);
});
