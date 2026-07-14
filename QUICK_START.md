# Quick Start — Universal Legal RAG System

## 🚀 Start the System

```bash
# 1. Ensure Qdrant is running
docker ps | grep qdrant
# Should show: qdrant container running on ports 6333-6334

# 2. Install dependencies (if not already done)
npm install

# 3. Start the development server
npm run dev
```

Server will start on: **http://localhost:3001**

---

## 🧪 Test It Works (ANY Question)

### Option 1: Browser UI (Recommended)

1. Open: **http://localhost:3001**
2. Click: **"Advisory Terminal"** tab
3. Try these queries:

```
"How do I calculate quarterly estimated taxes?"
"What did the Ninth Circuit decide in the Netflix case?"
"Can I deduct my mortgage interest?"
"What is Public Law 118-15 about?"
"What does the law review say about climate change funding?"
```

4. Adjust **alpha slider** to test semantic vs. keyword balance

### Option 2: Direct API Call

```bash
curl -X POST http://localhost:3001/api/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "How do I report rental property income?",
    "alpha": 0.7,
    "topK": 5
  }'
```

### Option 3: Run Demo Script

```bash
node demo-universal-search.js
```

Tests 24 queries **NOT** in the Golden Set to prove the system is universal.

---

## 📊 Evaluate System Accuracy (Golden Set)

```bash
curl -X POST http://localhost:3001/api/evaluate \
  -H "Content-Type: application/json" \
  -d '{"alpha": 0.7}'
```

This runs the 100 Golden Set questions to measure:
- **Retrieval Accuracy**: % of queries where target page was found
- **Faithfulness Score**: How well answers match ground truth
- **Relevance Score**: How well answers address the query

---

## 🎯 Key Facts

### ✅ The System Answers ANY Question

**The Golden Set (100 Q&A pairs) is for evaluation benchmarking ONLY.**

**The RAG pipeline processes ANY natural language query about the corpus.**

### ✅ What You Can Ask

**IRS Forms & Tax:**
- "What is the standard deduction for married filing jointly?"
- "How do I calculate self-employment tax?"
- "Can farmers average their income?"
- "What's the threshold for household employment tax?"

**Legal Cases:**
- "What did the First Circuit decide in the National Parks case?"
- "Was there an arbitration case involving Netflix?"
- "What family law cases did West Virginia handle?"

**Public Laws:**
- "What is Public Law 118-15 about?"
- "Are there restrictions on Border Protection funding?"
- "What is a continuing resolution?"

**Legal Commentary:**
- "What does the law review say about climate change funding?"
- "What is the strategic mootness gap?"
- "What commentary exists on the Voting Rights Act?"

**Natural Language:**
- "Can I deduct my mortgage interest?"
- "Do I need to report rental property income?"
- "What happens if I sell my house?"
- "How do I report my side business income?"

### ✅ How It Works

1. **User asks ANY question** → Query preprocessed and expanded
2. **Dual-model embedding** → gemini-001 + gemini-2
3. **Qdrant search** → Retrieves from 6,738+ chunks
4. **Hybrid fusion** → Combines semantic + keyword (alpha-weighted)
5. **Cross-encoder rerank** → Groq LLM scores top candidates
6. **Context expansion** → Fetches neighboring pages
7. **Answer generation** → Groq LLM with strict citations
8. **Returns answer + citations** → Inline page-level citations

---

## 📁 Files to Review

| File | Purpose |
|------|---------|
| `IMPLEMENTATION_SUMMARY.md` | Complete system architecture and features |
| `UNIVERSAL_SEARCH_GUIDE.md` | Detailed explanation of universal search capabilities |
| `GoldenSet.md` | 100 benchmark Q&A pairs (for evaluation only) |
| `test-queries.md` | 35 sample queries NOT in Golden Set |
| `demo-universal-search.js` | Automated demo script |
| `server.ts` | Backend API with `/api/query` endpoint |
| `src/ragPipeline.ts` | Full 36-module RAG implementation |

---

## 🔧 Troubleshooting

### Qdrant Not Running
```bash
docker start qdrant
```

### Server Won't Start
```bash
# Check if port 3001 is already in use
netstat -ano | findstr :3001

# Kill the process if needed, then restart
npm run dev
```

### API Keys Not Configured
Check `.env.local`:
```bash
GEMINI_API_KEY=<your-key>
GROQ_API_KEY=<your-key>
```

---

## 📊 System Status

✅ **Qdrant**: 6,738+ chunks stored
✅ **Embeddings**: Dual-model (gemini-001 + gemini-2)
✅ **Corpus**: 90+ documents (IRS, Laws, Cases, Commentary)
✅ **Pipeline**: 36 modules fully operational
✅ **Golden Set**: 100 benchmark Q&A pairs
✅ **Universal Search**: Works with ANY question

---

**Start asking questions! The system is ready.** 🚀
