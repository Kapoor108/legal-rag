/**
 * Test cases: Q&A + Summarization
 */
const BASE = 'http://localhost:3001';

async function query(q, label) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`🔍 [${label}]`);
  console.log(`   Query: "${q}"`);
  console.log('═'.repeat(70));
  const t0 = Date.now();
  try {
    const r = await fetch(`${BASE}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, alpha: 0.7, topK: 5 })
    });
    const data = await r.json();
    if (data.error) { console.log('❌ Error:', data.error); return; }
    console.log(`⏱  ${Date.now() - t0}ms | chunks: ${data.metadata?.chunksRetrieved} | confidence: ${data.metadata?.confidenceScore}%`);
    console.log(`\n📝 ANSWER:\n${data.answer}`);
    if (data.citations?.length) {
      console.log(`\n📚 CITATIONS (${data.citations.length}):`);
      data.citations.slice(0, 3).forEach((c, i) =>
        console.log(`   ${i+1}. ${c.citationCode} p.${c.pageIndex} — relevance: ${c.relevanceScore}%`)
      );
    }
    console.log(`\n   Summary mode: ${data.metadata?.isSummaryRequest ? '✅ YES' : '❌ NO'}`);
  } catch(e) {
    console.log('❌ Request failed:', e.message);
  }
}

console.log('🚀 Starting test suite against http://localhost:3001\n');

// ── TEST 1: Simple Q&A (IRS)
await query('What is Form W-4 used for?', 'Q&A — IRS Form');

// ── TEST 2: Simple Q&A (Case law)
await query('What did the court decide in the Combs v Netflix case?', 'Q&A — Court Case');

// ── TEST 3: Legal Q&A (Public Law)
await query('What does Public Law 118-2 cover?', 'Q&A — Public Law');

// ── TEST 4: Summarization request
await query('Summarize the Voting Rights Act commentary', 'SUMMARIZATION — Commentary');

// ── TEST 5: Summarization of IRS form
await query('Give me a summary of Schedule A Form 1040', 'SUMMARIZATION — IRS Schedule');

// ── TEST 6: Commentary Q&A
await query('What is the strategic mootness gap?', 'Q&A — Law Review Commentary');

console.log(`\n${'═'.repeat(70)}`);
console.log('✅ All tests complete');
process.exit(0);
