// Quick test to verify search always returns results
const BASE_URL = 'http://localhost:3001';

async function testSearch() {
  console.log('\n🔍 Quick Search Test\n');
  
  const queries = [
    "What is Form 1040 used for?",
    "Are punitive damages taxable?",
    "Random query that might not match anything exactly xyz123",
    "cryptocurrency staking rewards tax treatment"
  ];
  
  for (const query of queries) {
    console.log(`Query: "${query}"`);
    
    try {
      const res = await fetch(`${BASE_URL}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, alpha: 0.7 })
      });
      
      const results = await res.json();
      
      if (results.error) {
        console.log(`  ❌ Error: ${results.error}\n`);
      } else if (results.length === 0) {
        console.log(`  ⚠️  WARNING: No results returned!\n`);
      } else {
        console.log(`  ✅ Retrieved ${results.length} chunks`);
        console.log(`  Top: ${results[0].chunk.docTitle}`);
        console.log(`  Score: ${results[0].hybridScore.toFixed(4)}\n`);
      }
    } catch (err) {
      console.log(`  ❌ Failed: ${err.message}\n`);
    }
  }
  
  console.log('✅ Test complete\n');
}

testSearch();
