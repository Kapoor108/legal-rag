// Simple test to check if summarization detection is working
const BASE_URL = 'http://localhost:3001';

async function test() {
  console.log('\n🔍 Simple Summarization Test\n');
  
  const queries = [
    "Summarize the Glenshaw Glass case",
    "What is gross income?"  // regular query
  ];
  
  for (const query of queries) {
    console.log(`Query: "${query}"`);
    
    const res = await fetch(`${BASE_URL}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, alpha: 0.7 })
    });
    
    const result = await res.json();
    
    console.log(`  Summary Mode: ${result.metadata?.isSummaryRequest ? 'YES' : 'NO'}`);
    console.log(`  Chunks: ${result.metadata?.chunksAfterRerank}`);
    console.log(`  Target: ${result.metadata?.summaryTarget || 'N/A'}\n`);
  }
}

test();
