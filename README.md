# Antigravity Legal RAG

> A production-grade **Retrieval-Augmented Generation** system for US legal research — semantic search across IRS tax forms, US Public Laws, Federal Court Judgments, and Law Review Commentary powered by Google Gemini embeddings and Groq LLM.

 **Live Demo:** [https://legal-rag-31pr.onrender.com](https://legal-rag-31pr.onrender.com)

---

## What Makes This Impressive

### 36-Module RAG Pipeline
Every query passes through a fully-engineered pipeline:
```
Query → Preprocessing → Normalization → Entity Extraction → Query Expansion
  → Dual-Model Embedding → Qdrant Vector Search → BM25 Keyword Search
  → Hybrid Fusion (RRF) → Cross-Encoder Reranking (Groq LLM)
  → Score Thresholding → Top-K Selection → Context Expansion
  → Merging → Deduplication → Compression → Citation Building
  → Graph RAG Context → Answer Generation → Hallucination Prevention
```

### Dual-Model Embedding
Every chunk is embedded with **two Gemini models simultaneously**:
- `gemini-embedding-001` — optimized for semantic similarity
- `gemini-embedding-2` — 3072-dimensional, state-of-the-art

Queries search with both models and merge results — no chunk is ever missed regardless of which model indexed it.

### Hybrid Search with Reciprocal Rank Fusion
Vector similarity search and BM25 keyword search run in parallel. Results are fused using **RRF with configurable alpha weighting** (0 = pure keyword, 1 = pure semantic).

### Graph RAG
Document relationships are traversed at query time — if you ask about a tax case, the system automatically surfaces related IRC sections, citing documents, and academic commentary that analyzes that case.

### Smart Summarization Mode
The system auto-detects summary requests and switches to a comprehensive mode:
- Retrieves `topK=20` chunks instead of 5
- Generates structured summaries with sections, bullet points, and key takeaways
- Includes full citation trail

### LLM-as-a-Judge Evaluation
A built-in **Golden Set evaluation pipeline** grades the system on faithfulness (0-5) and relevance (0-5) using Groq as an independent judge.

---

## Corpus

| Category | Documents | Examples |
|---|---|---|
| **IRS Tax Forms** | 20 | Form 1040, Schedule A/B/C/D/E/F, Form W-4 |
| **US Public Laws** | 30 | Pub. L. 118-2 through 118-47 (118th Congress) |
| **Federal Court Judgments** | 30 | 1st/9th/11th Circuit, SD/WV Supreme Courts |
| **Law Review Commentary** | 21 | Yale Law Journal, Stanford Law Review, Columbia Law Review |
| **Total** | **101 documents** | **6,437 chunks indexed** |

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│              React SPA (Vite + TypeScript)        │
│   Q&A Panel │ Corpus Manager │ Evaluation Panel  │
└──────────────────────┬──────────────────────────┘
                       │ /api/*
┌──────────────────────▼──────────────────────────┐
│            Express Server (Node.js)              │
│  ragPipeline.ts  │  server.ts  │  qdrantService  │
└──────┬───────────────────────────────┬───────────┘
       │                               │
┌──────▼──────┐               ┌────────▼────────┐
│  Gemini API  │               │  Qdrant Cloud   │
│ Embeddings  │               │  6,437 vectors  │
│ (3072-dim)  │               │  12 payload     │
└─────────────┘               │  indexes        │
                               └─────────────────┘
                                        │
                               ┌────────▼────────┐
                               │    Groq API      │
                               │ llama-3.3-70b   │
                               │ Answer gen +    │
                               │ Reranking       │
                               └─────────────────┘
```

---

##  Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4 |
| **Backend** | Node.js, Express 4, TypeScript |
| **Vector DB** | Qdrant Cloud (3072-dim cosine similarity) |
| **Embeddings** | Google Gemini (`gemini-embedding-001` + `gemini-embedding-2`) |
| **LLM** | Groq `llama-3.3-70b-versatile` |
| **PDF Parsing** | pdf-parse-fork |
| **Deployment** | Render (full-stack), Qdrant Cloud (AWS sa-east-1) |

---

##  Local Setup

### Prerequisites
- Node.js 20+
- A Qdrant Cloud account (free tier) — [cloud.qdrant.io](https://cloud.qdrant.io)
- A Gemini API key — [aistudio.google.com](https://aistudio.google.com/app/apikey)
- A Groq API key — [console.groq.com](https://console.groq.com)

### 1. Clone and install

```bash
git clone https://github.com/Kapoor108/US-RAG.git
cd US-RAG
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
GEMINI_API_KEY=your_gemini_api_key
GROQ_API_KEY=your_groq_api_key
QDRANT_URL=https://your-cluster.cloud.qdrant.io
QDRANT_API_KEY=your_qdrant_api_key
APP_URL=http://localhost:3000
```

### 3. Run ingestion (one-time)

This embeds all 101 PDFs into Qdrant. Each script can be resumed if interrupted — it skips already-ingested documents.

```bash
# Court judgments & reference manuals (~964 chunks)
npm run ingest

# IRS tax forms (~1,000 chunks)
npm run ingest:irs

# US Public Laws (~2,900 chunks)
npm run ingest:law

# Law Review commentary (~1,600 chunks)
npm run ingest:commentary
```

>  Gemini free tier has a 1,000 requests/day quota. Each script pauses and retries automatically on rate limits. Have 6-8 API keys ready if you want to run all ingestion in one session, or run one script per day.

### 4. Start development server

```bash
npm run dev
```

Open [http://localhost:3001](http://localhost:3001)

---
## Project Structure

```
antigravity/
├── server.ts              # Express server + all API routes
├── src/
│   ├── ragPipeline.ts     # 36-module RAG pipeline
│   ├── qdrantService.ts   # Qdrant Cloud client + vector ops
│   ├── ingest.ts          # Raw PDFs ingestion
│   ├── ingestIRS.ts       # IRS forms ingestion
│   ├── ingestLaw.ts       # Public Laws ingestion
│   ├── ingestCommentary.ts# Law Review ingestion
│   ├── types.ts           # TypeScript interfaces
│   ├── components/        # React UI components
│   └── data/
│       ├── legalCorpus.ts # Hardcoded seed documents
│       └── goldenSet.ts   # Evaluation Q&A pairs
├── raw_pdfs/              # Court judgment PDFs (30 docs)
├── irs/raw_pdfs/          # IRS form PDFs (20 docs)
├── law/                   # Public Law PDFs (30 docs)
├── commentary/            # Law Review PDFs (21 docs)
├── Dockerfile             # Production Docker image
└── RENDER_DEPLOYMENT.md   # Render deployment guide
```

---

## API Reference

### `POST /api/query`
Run the full 36-module RAG pipeline.

```json
{
  "query": "What is Form W-4 used for?",
  "alpha": 0.7,
  "topK": 5,
  "filterDocCategory": "Tax Document"
}
```

Response:
```json
{
  "answer": "Form W-4 is used so that your employer can withhold the correct federal income tax from your pay [IRS Form W-4 (2026), p.1].",
  "citations": [...],
  "metadata": {
    "chunksRetrieved": 50,
    "confidenceScore": 66,
    "isSummaryRequest": false,
    "processingMs": 4374
  }
}
```

### `GET /api/documents`
Returns all 101 documents with metadata.

### `POST /api/search`
Hybrid search without answer generation.

### `POST /api/evaluate`
Run the Golden Set evaluation suite.

---

##  Deploy to Render

See [RENDER_DEPLOYMENT.md](./RENDER_DEPLOYMENT.md) for the full step-by-step guide.

**Quick version:**
1. Push to GitHub
2. Create Web Service on Render
3. Build: `npm ci && npm run build`
4. Start: `node dist/server.mjs`
5. Set env vars: `GEMINI_API_KEY`, `GROQ_API_KEY`, `QDRANT_URL`, `QDRANT_API_KEY`, `NODE_ENV=production`

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | ✅ | Google Gemini API key for embeddings |
| `GROQ_API_KEY` | ✅ | Groq API key for answer generation |
| `QDRANT_URL` | ✅ | Qdrant Cloud cluster URL |
| `QDRANT_API_KEY` | ✅ | Qdrant Cloud API key |
| `APP_URL` | ✅ | Public URL of the deployed app |
| `NODE_ENV` | ✅ | `production` on Render, `development` locally |

---

## Performance

| Metric | Value |
|---|---|
| Total chunks indexed | 6,437 |
| Vector dimensions | 3,072 |
| Average Q&A response | 3-5 seconds |
| Average summarization | 15-30 seconds |
| Qdrant search latency | < 100ms |
| Payload indexes | 12 (keyword + integer) |

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](./LICENSE) file for details.

---

<p align="center">Built with ❤️ using Gemini, Groq, Qdrant, React &amp; Express</p>
