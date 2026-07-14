import { QdrantClient } from "@qdrant/js-client-rest";
import { DocumentChunk } from "./types";

export const COLLECTION_NAME = "antigravity_legal";
const VECTOR_SIZE = 3072; // gemini-embedding-2 output dimension

// Lazy client — instantiated on first use so dotenv has time to run
// regardless of ES module import hoisting order.
let _qdrant: QdrantClient | null = null;

export function getQdrantClient(): QdrantClient {
  if (!_qdrant) {
    const url = process.env.QDRANT_URL || "http://localhost:6333";
    const apiKey = process.env.QDRANT_API_KEY;
    _qdrant = new QdrantClient({
      url,
      ...(apiKey ? { apiKey } : {}),
      checkCompatibility: false,
    });
    console.log(`[Qdrant] Client initialised → ${url.slice(0, 50)}`);
  }
  return _qdrant;
}

// Keep backward-compat export used by ingest scripts
export const qdrant = new Proxy({} as QdrantClient, {
  get(_t, prop) {
    return (getQdrantClient() as any)[prop];
  },
});

// Ensure the collection exists, create if not. Also creates payload indexes for fast filtering.
export async function ensureCollection(): Promise<void> {
  // Create collection if it doesn't exist
  try {
    await getQdrantClient().getCollection(COLLECTION_NAME);
    console.log(`[Qdrant] Collection "${COLLECTION_NAME}" already exists.`);
  } catch {
    try {
      await getQdrantClient().createCollection(COLLECTION_NAME, {
        vectors: { size: VECTOR_SIZE, distance: "Cosine" },
      });
      console.log(`[Qdrant] Collection "${COLLECTION_NAME}" created (${VECTOR_SIZE}-dim, Cosine).`);
      // Give the cluster a moment to initialize the collection before indexing
      await new Promise(r => setTimeout(r, 2000));
    } catch (createErr: any) {
      // If already exists (race condition), that's fine
      if (!String(createErr?.message).includes("already exists")) throw createErr;
    }
  }

  // Create payload indexes — idempotent, errors are suppressed
  const indexFields: Array<{ field: string; schema: "keyword" | "integer" }> = [
    { field: "docId",           schema: "keyword" },
    { field: "docCategory",     schema: "keyword" },
    { field: "citationCode",    schema: "keyword" },
    { field: "embeddingModel",  schema: "keyword" },
    { field: "formCode",        schema: "keyword" },
    { field: "court",           schema: "keyword" },
    { field: "publicLawNumber", schema: "keyword" },
    { field: "journalName",     schema: "keyword" },
    { field: "pageIndex",       schema: "integer" },
    { field: "chunkIndex",      schema: "integer" },
    { field: "year",            schema: "integer" },
    { field: "wordCount",       schema: "integer" },
  ];

  let indexed = 0;
  for (const { field, schema } of indexFields) {
    try {
      await getQdrantClient().createPayloadIndex(COLLECTION_NAME, {
        field_name: field,
        field_schema: schema,
      });
      indexed++;
    } catch { /* already exists or not supported — safe to ignore */ }
  }
  console.log(`[Qdrant] Payload indexes ready (${indexed} created/verified).`);
}

// Upsert chunks with their embeddings into Qdrant
export async function upsertChunks(
  chunks: DocumentChunk[],
  embeddings: number[][]
): Promise<void> {
  const points = chunks.map((chunk, i) => ({
    id: stringToUUID(chunk.id),
    vector: embeddings[i],
    payload: {
      // ── Core fields (always present) ────────────────────────────────
      chunkId:       chunk.id,
      docId:         chunk.docId,
      docTitle:      chunk.docTitle,
      docCategory:   chunk.docCategory,
      citationCode:  chunk.citationCode,
      pageIndex:     chunk.pageIndex,
      text:          chunk.text,
      // ── Extended metadata (populated when available) ─────────────────
      ...(chunk.chunkIndex     !== undefined && { chunkIndex:      chunk.chunkIndex }),
      ...(chunk.totalChunks    !== undefined && { totalChunks:     chunk.totalChunks }),
      ...(chunk.totalPages     !== undefined && { totalPages:      chunk.totalPages }),
      ...(chunk.wordCount      !== undefined && { wordCount:       chunk.wordCount }),
      ...(chunk.embeddingModel !== undefined && { embeddingModel:  chunk.embeddingModel }),
      ...(chunk.sourceFile     !== undefined && { sourceFile:      chunk.sourceFile }),
      ...(chunk.docSummary     !== undefined && { docSummary:      chunk.docSummary }),
      ...(chunk.sectionTitle   !== undefined && { sectionTitle:    chunk.sectionTitle }),
      ...(chunk.year           !== undefined && { year:            chunk.year }),
      ...(chunk.formCode       !== undefined && { formCode:        chunk.formCode }),
      ...(chunk.court          !== undefined && { court:           chunk.court }),
      ...(chunk.publicLawNumber!== undefined && { publicLawNumber: chunk.publicLawNumber }),
      ...(chunk.journalName    !== undefined && { journalName:     chunk.journalName }),
    },
  }));

  // Upsert in batches of 50
  const batchSize = 50;
  for (let i = 0; i < points.length; i += batchSize) {
    const batch = points.slice(i, i + batchSize);
    await getQdrantClient().upsert(COLLECTION_NAME, { points: batch, wait: true });
    console.log(`[Qdrant] Upserted batch ${Math.floor(i / batchSize) + 1} (${batch.length} points)`);
  }
}

// Search Qdrant by vector, return top-k chunks with scores
export async function searchQdrant(
  queryVector: number[],
  topK: number = 5
): Promise<Array<{ chunk: DocumentChunk; vectorScore: number }>> {
  const results = await getQdrantClient().search(COLLECTION_NAME, {
    vector: queryVector,
    limit: topK,
    with_payload: true,
  });

  return results.map((r) => ({
    chunk: {
      // ── Core fields ──────────────────────────────────────────────────
      id:           r.payload!.chunkId        as string,
      docId:        r.payload!.docId          as string,
      docTitle:     r.payload!.docTitle       as string,
      docCategory:  r.payload!.docCategory    as string,
      citationCode: r.payload!.citationCode   as string,
      pageIndex:    r.payload!.pageIndex      as number,
      text:         r.payload!.text           as string,
      // ── Extended metadata (present when stored) ───────────────────────
      ...(r.payload!.chunkIndex      !== undefined && { chunkIndex:      r.payload!.chunkIndex      as number }),
      ...(r.payload!.totalChunks     !== undefined && { totalChunks:     r.payload!.totalChunks     as number }),
      ...(r.payload!.totalPages      !== undefined && { totalPages:      r.payload!.totalPages      as number }),
      ...(r.payload!.wordCount       !== undefined && { wordCount:       r.payload!.wordCount       as number }),
      ...(r.payload!.embeddingModel  !== undefined && { embeddingModel:  r.payload!.embeddingModel  as string }),
      ...(r.payload!.sourceFile      !== undefined && { sourceFile:      r.payload!.sourceFile      as string }),
      ...(r.payload!.docSummary      !== undefined && { docSummary:      r.payload!.docSummary      as string }),
      ...(r.payload!.sectionTitle    !== undefined && { sectionTitle:    r.payload!.sectionTitle    as string }),
      ...(r.payload!.year            !== undefined && { year:            r.payload!.year            as number }),
      ...(r.payload!.formCode        !== undefined && { formCode:        r.payload!.formCode        as string }),
      ...(r.payload!.court           !== undefined && { court:           r.payload!.court           as string }),
      ...(r.payload!.publicLawNumber !== undefined && { publicLawNumber: r.payload!.publicLawNumber as string }),
      ...(r.payload!.journalName     !== undefined && { journalName:     r.payload!.journalName     as string }),
    },
    vectorScore: r.score,
  }));
}

// Count points via direct REST — bypasses any client-side caching
export async function getCollectionCount(): Promise<number> {
  try {
    const url = process.env.QDRANT_URL || "http://localhost:6333";
    const apiKey = process.env.QDRANT_API_KEY;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["api-key"] = apiKey;
    const res = await fetch(`${url}/collections/${COLLECTION_NAME}`, { headers });
    const json = await res.json() as any;
    return json?.result?.points_count ?? 0;
  } catch {
    return 0;
  }
}

// Deterministic UUID v4-like from a string (Qdrant requires UUID or uint64 IDs)
function stringToUUID(str: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = (4294967296 * (2097151 & h2) + (h1 >>> 0));
  const hex = Math.abs(n).toString(16).padStart(16, "0");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(12,15)}-a${hex.slice(13,16)}-${hex.padEnd(12,"0").slice(0,12)}`;
}
