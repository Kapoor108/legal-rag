/**
 * IRS Forms Ingestion Script
 * Run with: npm run ingest:irs
 *
 * IRS tax forms are structured documents (labels, line numbers, instructions).
 * Strategy:
 *  - Chunk at 60-word target with 15-word overlap → maximum granularity
 *  - Preserve line-number references (Line 1a, Line 12b, etc.) in every chunk
 *  - Store form name + section + page in every chunk payload
 *  - docId namespace: irs-{num} — zero collision with pdf-*, law-*, commentary-*
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
const IRS_PDF_DIR         = path.resolve(process.cwd(), "irs", "raw_pdfs");
const EMBEDDING_MODEL     = "gemini-embedding-001";  // finishing remaining chunks
const CHUNK_TARGET_WORDS  = 60;    // very small — IRS forms are label-heavy
const CHUNK_OVERLAP_WORDS = 15;    // preserve line-number context
const UPSERT_EVERY        = 100;
const CONCURRENCY         = 8;
const MAX_RETRIES         = 6;
// ───────────────────────────────────────────────────────────────────────────

// ─── PDF Parsing — extract text per page ──────────────────────────────────
async function parsePDFPages(filePath: string): Promise<{ pageNum: number; text: string }[]> {
  const pdfParse = (await import("pdf-parse-fork")).default;
  const buffer = fs.readFileSync(filePath);

  const pages: { pageNum: number; text: string }[] = [];
  let pageNumber = 0;

  // Use render_page callback to get per-page text
  await pdfParse(buffer, {
    pagerender: (pageData: any) => {
      pageNumber++;
      const currentPage = pageNumber;
      return pageData.getTextContent().then((tc: any) => {
        const text = tc.items.map((item: any) => item.str).join(" ").trim();
        if (text.length > 10) {
          pages.push({ pageNum: currentPage, text });
        }
        return "";
      });
    }
  });

  // Fallback: if pagerender didn't fire, use form-feed split
  if (pages.length === 0) {
    const data = await pdfParse(buffer);
    const raw = (data.text || "").replace(/\r\n/g, "\n");
    const splits = raw.includes("\f")
      ? raw.split("\f")
      : raw.split(/\n{3,}/);

    splits.forEach((t: string, i: number) => {
      const cleaned = t.trim();
      if (cleaned.length > 10) {
        pages.push({ pageNum: i + 1, text: cleaned });
      }
    });
  }

  return pages;
}

// ─── Fine-grained IRS chunking ────────────────────────────────────────────
// Splits on sentence/line boundaries, keeps line-number labels together
function chunkIRSText(text: string, formName: string): string[] {
  // Clean up common IRS form PDF artifacts
  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(/\f/g, " ")
    .replace(/([A-Za-z])-\s+([a-z])/g, "$1$2")  // fix hyphenated line breaks
    .trim();

  if (cleaned.length < 20) return [];

  // Split on natural IRS boundaries: line numbers, sentences, semicolons
  // Pattern: split after "Line X", ". ", "; " while keeping label with content
  const words = cleaned.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + CHUNK_TARGET_WORDS, words.length);
    let chunkWords = words.slice(start, end);

    // Try to break at sentence boundary within last 30% of chunk
    if (end < words.length) {
      const minBreak = Math.floor(chunkWords.length * 0.7);
      let breakAt = -1;
      for (let i = chunkWords.length - 1; i >= minBreak; i--) {
        const w = chunkWords[i];
        // Break after sentence-ending punctuation
        if (/[.!?;]$/.test(w)) { breakAt = i; break; }
        // Break before a new line number reference (e.g., "Line", "Schedule", "Form")
        if (i > 0 && /^(Line|Schedule|Form|Part|Section|Box|Item|Column)\b/i.test(chunkWords[i])) {
          breakAt = i - 1;
          break;
        }
      }
      if (breakAt > Math.floor(chunkWords.length * 0.5)) {
        chunkWords = chunkWords.slice(0, breakAt + 1);
      }
    }

    const chunk = chunkWords.join(" ").trim();
    if (chunk.length > 15) chunks.push(chunk);
    if (end >= words.length) break;
    start += chunkWords.length - CHUNK_OVERLAP_WORDS;
  }

  return chunks;
}

// ─── Metadata from IRS filename ───────────────────────────────────────────
function metaFromIRSFilename(filename: string): {
  docId: string;
  title: string;
  category: "Tax Document";
  citationCode: string;
  formCode: string;
} {
  const base = path.basename(filename, ".pdf");
  const num = base.split("_")[0]; // "001" etc

  // Extract form identifier — e.g. "f1040", "f1040sa", "fw4"
  const formCodeMatch = base.match(/_(f[a-z0-9]+)_\d{4}$/i);
  const formCode = formCodeMatch ? formCodeMatch[1].toUpperCase() : `FORM-${num}`;

  // Build readable title from filename
  const titlePart = base
    .replace(/^\d+_/, "")
    .replace(/_(f[a-z0-9]+)_\d{4}$/i, "")
    .replace(/_/g, " ")
    .trim();

  const yearMatch = base.match(/(\d{4})$/);
  const year = yearMatch ? yearMatch[1] : "2026";

  // Map form code to official IRS form number for citation
  const formNumberMap: Record<string, string> = {
    "F1040":   "Form 1040",
    "F1040SR": "Form 1040-SR",
    "F1040ES": "Form 1040-ES",
    "F1040V":  "Form 1040-V",
    "F1040X":  "Form 1040-X",
    "F1040NR": "Form 1040-NR",
    "F1040SA": "Schedule A (Form 1040)",
    "F1040SB": "Schedule B (Form 1040)",
    "F1040SC": "Schedule C (Form 1040)",
    "F1040SD": "Schedule D (Form 1040)",
    "F1040SE": "Schedule E (Form 1040)",
    "F1040SF": "Schedule F (Form 1040)",
    "F1040SH": "Schedule H (Form 1040)",
    "F1040SJ": "Schedule J (Form 1040)",
    "F1040SSE":"Schedule SE (Form 1040)",
    "F1040S1": "Schedule 1 (Form 1040)",
    "F1040S2": "Schedule 2 (Form 1040)",
    "F1040S3": "Schedule 3 (Form 1040)",
    "FW4":     "Form W-4",
    "FW4P":    "Form W-4P",
  };

  const officialForm = formNumberMap[formCode] ?? `IRS ${formCode}`;
  const citationCode = `IRS ${officialForm} (${year})`;

  return {
    docId: `irs-${num}`,
    title: titlePart.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ").slice(0, 120),
    category: "Tax Document",
    citationCode,
    formCode: officialForm,
  };
}

// ─── Embed with retry ─────────────────────────────────────────────────────
async function embedWithRetry(client: GoogleGenAI, text: string): Promise<number[]> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await client.models.embedContent({ model: EMBEDDING_MODEL, contents: text });
      if (res.embeddings?.[0]?.values) return res.embeddings[0].values;
      if ((res as any).embedding?.values) return (res as any).embedding.values;
      throw new Error("Empty embedding response");
    } catch (err: any) {
      const isRate = String(err?.message).includes("429") ||
                     String(err?.message).includes("quota") ||
                     String(err?.message).includes("RESOURCE_EXHAUSTED");
      if (isRate && attempt < MAX_RETRIES) {
        const m = String(err?.message).match(/retry in (\d+)/);
        const w = m ? parseInt(m[1]) + 5 : 65;
        process.stdout.write(`\n   ⏳ Rate limit — waiting ${w}s (attempt ${attempt}/${MAX_RETRIES})...`);
        await new Promise(r => setTimeout(r, w * 1000));
        process.stdout.write(" retrying\n");
      } else throw err;
    }
  }
  throw new Error("Max retries exceeded");
}

// ─── Parallel embedding ───────────────────────────────────────────────────
async function embedParallel(client: GoogleGenAI, texts: string[]): Promise<number[][]> {
  const results: number[][] = new Array(texts.length);
  let idx = 0;
  async function worker() {
    while (idx < texts.length) { const i = idx++; results[i] = await embedWithRetry(client, texts[i]); }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, texts.length) }, () => worker()));
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

async function deleteDocPoints(docId: string) {
  await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/delete`, {
    method: "POST", headers: qdrantHeaders(),
    body: JSON.stringify({ filter: { must: [{ key: "docId", match: { value: docId } }] } }),
  });
}

function bar(current: number, total: number, label = "") {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const b = "█".repeat(Math.floor(pct / 5)) + "░".repeat(20 - Math.floor(pct / 5));
  process.stdout.write(`\r   [${b}] ${String(pct).padStart(3)}% | ${label.slice(0, 52).padEnd(52)}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║   Antigravity — IRS Forms Ingestion Pipeline         ║");
  console.log(`║   Model  : ${EMBEDDING_MODEL.padEnd(42)}║`);
  console.log(`║   Chunks : ${CHUNK_TARGET_WORDS} words target, ${CHUNK_OVERLAP_WORDS} words overlap (max precision)`.padEnd(55) + "║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey || geminiKey === "MY_GEMINI_API_KEY") {
    console.error("❌ GEMINI_API_KEY not set"); process.exit(1);
  }
  const gemini = new GoogleGenAI({ apiKey: geminiKey });

  if (!fs.existsSync(IRS_PDF_DIR)) {
    console.error(`❌ irs/raw_pdfs/ not found at ${IRS_PDF_DIR}`); process.exit(1);
  }

  const pdfFiles = fs.readdirSync(IRS_PDF_DIR)
    .filter(f => f.toLowerCase().endsWith(".pdf"))
    .sort();
  console.log(`📁 ${pdfFiles.length} IRS PDFs found\n`);

  // ── 1. Qdrant ──
  console.log("1. Checking Qdrant...");
  await ensureCollection();
  const existingCount = await getCollectionCount();
  const ingestedCounts = await getIngestedDocCounts();

  const irsCounts = [...ingestedCounts.entries()].filter(([id]) => id.startsWith("irs-"));
  const partialIds = new Set(irsCounts.filter(([, c]) => c < 3).map(([id]) => id));
  const doneIds = new Set(
    [...ingestedCounts.entries()]
      .filter(([id, c]) => !id.startsWith("irs-") || c >= 3)
      .map(([id]) => id)
  );

  console.log(`   Total Qdrant points : ${existingCount}`);
  console.log(`   Other docs (safe)   : ${[...ingestedCounts.keys()].filter(id => !id.startsWith("irs-")).length} docs — will NOT be touched`);
  console.log(`   IRS docs done       : ${irsCounts.length - partialIds.size}`);
  if (partialIds.size > 0) {
    console.log(`   IRS partial (redo)  : ${[...partialIds].join(", ")}`);
    for (const id of partialIds) { await deleteDocPoints(id); }
  }
  console.log();

  // ── 2. Parse + chunk ──
  console.log("2. Parsing & chunking IRS PDFs...");
  const t0 = Date.now();
  const allChunks: DocumentChunk[] = [];
  let skipped = 0, parsed = 0;

  for (let f = 0; f < pdfFiles.length; f++) {
    const filename = pdfFiles[f];
    const meta = metaFromIRSFilename(filename);

    if (doneIds.has(meta.docId)) {
      skipped++;
      process.stdout.write(`\r   [${f+1}/${pdfFiles.length}] ⏭  ${meta.citationCode.padEnd(45)}`);
      continue;
    }

    process.stdout.write(`\r   [${f+1}/${pdfFiles.length}] Parsing: ${filename.slice(0,52).padEnd(52)}`);

    try {
      const allPageData = await parsePDFPages(path.join(IRS_PDF_DIR, filename));
      let chunkIdx = 0;
      const allPageChunks = allPageData.map(({ pageNum, text }) => ({
        pageNum,
        chunks: chunkIRSText(text, meta.formCode),
      }));
      const docTotalChunks = allPageChunks.reduce((s, p) => s + p.chunks.length, 0);
      const docTotalPages  = allPageData.length;

      for (const { pageNum, chunks: pageChunks } of allPageChunks) {
        for (const chunkTxt of pageChunks) {
          chunkIdx++;
          // Extract section heading from the chunk text (Part I/II, Section, Line labels)
          const sectionMatch = chunkTxt.match(/^(Part\s+[IVX]+|Section\s+\w+|Schedule\s+\w+|Line\s+\d+\w*)/i);
          const sectionTitle = sectionMatch ? sectionMatch[1] : undefined;

          allChunks.push({
            id:             `${meta.docId}-p${pageNum}-c${chunkIdx}`,
            docId:          meta.docId,
            docTitle:       meta.title,
            docCategory:    meta.category,
            citationCode:   meta.citationCode,
            pageIndex:      pageNum,
            text:           chunkTxt,
            // ── Extended metadata ──
            chunkIndex:     chunkIdx,
            totalChunks:    docTotalChunks,
            totalPages:     docTotalPages,
            wordCount:      chunkTxt.split(/\s+/).length,
            embeddingModel: EMBEDDING_MODEL,
            sourceFile:     filename,
            formCode:       meta.formCode,
            docSummary:     `${meta.formCode} — IRS tax form for ${meta.title.toLowerCase()}. Citation: ${meta.citationCode}.`,
            year:           parseInt(meta.citationCode.match(/\((\d{4})\)/)?.[1] ?? "2026"),
            ...(sectionTitle ? { sectionTitle } : {}),
          });
        }
      }
      parsed++;
    } catch (err: any) {
      console.error(`\n   ⚠  Failed: ${filename} — ${err.message}`);
    }
  }

  console.log(`\n`);
  console.log(`   ✓ Parsed  : ${parsed} new IRS PDFs`);
  console.log(`   ⏭  Skipped : ${skipped} already done`);
  console.log(`   📄 Chunks  : ${allChunks.length} (avg ${parsed > 0 ? Math.round(allChunks.length/parsed) : 0}/form)`);
  console.log(`   ⏱  Parse time: ${((Date.now()-t0)/1000).toFixed(1)}s\n`);

  if (allChunks.length === 0) {
    console.log(`✅ Nothing to ingest. Qdrant has ${existingCount} points.`);
    return;
  }

  // ── 3. Embed + upsert every 100 ──
  const estMin = Math.ceil(allChunks.length / 90);
  console.log(`3. Embedding & upserting every ${UPSERT_EVERY} chunks...`);
  console.log(`   Concurrency: ${CONCURRENCY} | ~${estMin} min estimated\n`);

  const t1 = Date.now();
  let done = 0;

  for (let i = 0; i < allChunks.length; i += UPSERT_EVERY) {
    const batch = allChunks.slice(i, i + UPSERT_EVERY);
    bar(i, allChunks.length, `embedding ${i+1}–${Math.min(i+UPSERT_EVERY, allChunks.length)} of ${allChunks.length}`);
    const embeddings = await embedParallel(gemini, batch.map(c => c.text));
    await upsertChunks(batch, embeddings);
    done += batch.length;
    bar(done, allChunks.length, `✓ saved ${done}/${allChunks.length} to Qdrant`);
  }

  const elapsed = ((Date.now()-t1)/1000).toFixed(1);
  const finalCount = await getCollectionCount();

  console.log(`\n`);
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log(`║  ✅ IRS ingestion complete in ${elapsed}s`.padEnd(55) + "║");
  console.log(`║  📦 ${done} chunks from ${parsed} IRS forms stored`.padEnd(55) + "║");
  console.log(`║  🗄️  Qdrant total: ${finalCount} points`.padEnd(55) + "║");
  console.log(`║  🔗 ${QDRANT_URL}/dashboard`.padEnd(55) + "║");
  console.log("╚══════════════════════════════════════════════════════╝");
}

main().catch(err => {
  console.error("\n❌ IRS ingestion failed:", err.message || err);
  process.exit(1);
});
