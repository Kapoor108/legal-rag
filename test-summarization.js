/**
 * Test Summarization Feature
 * Verifies that summary requests use topK=20 and generate comprehensive summaries
 */

const BASE_URL = 'http://localhost:3001';

async function testSummarization() {
  console.log('\n📝 SUMMARIZATION FEATURE TEST\n');
  console.log('='.repeat(80));
  
  const testCases = [
    {
      name: "Direct 'summarize' keyword",
      query: "Summarize Glenshaw Glass case",
      expectedTopK: 20,
      expectedMode: true
    },
    {
      name: "Alternative 'give me a summary'",
      query: "Give me a summary of IRC Section 61",
      expectedTopK: 20,
      expectedMode: true
    },
    {
      name: "Synonym 'overview'",
      query: "Provide an overview of Form 1040",
      expectedTopK: 20,
      expectedMode: true
    },
    {
      name: "Synonym 'recap'",
      query: "Can you recap the Cottage Savings decision?",
      expectedTopK: 20,
      expectedMode: true
    },
    {
      name: "Synonym 'brief'",
      query: "Give me a brief of Revenue Ruling 2023-14",
      expectedTopK: 20,
      expectedMode: true
    },
    {
      name: "Synonym 'main points'",
      query: "What are the main points of the Glenshaw Glass case?",
      expectedTopK: 20,
      expectedMode: true
    },
    {
      name: "Synonym 'TL;DR'",
      query: "TL;DR on cryptocurrency staking rewards taxation",
      expectedTopK: 20,
      expectedMode: true
    },
    {
      name: "Regular question (not summary)",
      query: "Are punitive damages taxable?",
      expectedTopK: 5,
      expectedMode: false
    }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of testCases) {
    console.log(`\n📋 Test: ${testCase.name}`);
    console.log(`   Query: "${testCase.query}"`);
    
    try {
      const startTime = Date.now();
      const response = await fetch(`${BASE_URL}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: testCase.query,
          alpha: 0.7
        })
      });
      
      const result = await response.json();
      const elapsed = Date.now() - startTime;
      
      if (result.error) {
        console.log(`   ❌ API Error: ${result.error}`);
        failed++;
        continue;
      }
      
      const isSummaryMode = result.metadata?.isSummaryRequest;
      const chunksRetrieved = result.metadata?.chunksAfterRerank || 0;
      
      console.log(`   📊 Metadata:`);
      console.log(`      Summary Mode: ${isSummaryMode ? '✅ YES' : '❌ NO'} (expected: ${testCase.expectedMode ? 'YES' : 'NO'})`);
      console.log(`      Chunks Retrieved: ${chunksRetrieved} (expected: ~${testCase.expectedTopK})`);
      console.log(`      Processing Time: ${elapsed}ms`);
      console.log(`      Citations: ${result.citations?.length || 0}`);
      
      if (result.metadata?.summaryTarget) {
        console.log(`      Summary Target: "${result.metadata.summaryTarget}"`);
      }
      
      // Verify expectations
      const modeMatches = isSummaryMode === testCase.expectedMode;
      const chunksInRange = testCase.expectedMode 
        ? chunksRetrieved >= 15 && chunksRetrieved <= 25  // Allow some variance
        : chunksRetrieved >= 3 && chunksRetrieved <= 10;
      
      if (modeMatches && chunksInRange) {
        console.log(`   ✅ PASS - Summary mode and chunk count correct`);
        passed++;
      } else {
        console.log(`   ❌ FAIL - ${!modeMatches ? 'Summary mode mismatch' : 'Chunk count out of range'}`);
        failed++;
      }
      
      // Show answer preview
      if (result.answer && !result.answer.includes('Answer generation failed')) {
        console.log(`\n   📄 Answer Preview (first 300 chars):`);
        console.log(`      "${result.answer.substring(0, 300)}..."`);
      }
      
    } catch (err) {
      console.log(`   ❌ Test Failed: ${err.message}`);
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 TEST RESULTS');
  console.log('='.repeat(80));
  console.log(`✅ Passed: ${passed}/${testCases.length}`);
  console.log(`❌ Failed: ${failed}/${testCases.length}`);
  
  if (failed === 0) {
    console.log('\n🎉 ALL SUMMARIZATION TESTS PASSED!\n');
    console.log('✅ Summary detection working');
    console.log('✅ TopK=20 for summaries');
    console.log('✅ TopK=5 for regular queries');
    console.log('✅ Multiple synonyms detected\n');
  } else {
    console.log('\n⚠️  Some tests failed. Review output above.\n');
  }
}

// Run specific summary query to see full output
async function demonstrateSummary() {
  console.log('\n' + '='.repeat(80));
  console.log('📝 SUMMARIZATION DEMONSTRATION');
  console.log('='.repeat(80));
  console.log('\nQuery: "Summarize the Glenshaw Glass case"\n');
  
  try {
    const response = await fetch(`${BASE_URL}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: "Summarize the Glenshaw Glass case",
        alpha: 0.7
      })
    });
    
    const result = await response.json();
    
    if (result.error) {
      console.log(`❌ Error: ${result.error}\n`);
      return;
    }
    
    console.log('📊 METADATA:');
    console.log(`   Summary Mode: ${result.metadata?.isSummaryRequest ? '✅ YES' : '❌ NO'}`);
    console.log(`   Chunks Retrieved: ${result.metadata?.chunksAfterRerank}`);
    console.log(`   Citations: ${result.citations?.length}`);
    console.log(`   Confidence: ${result.metadata?.confidenceScore}%`);
    console.log(`   Processing Time: ${result.metadata?.processingMs}ms`);
    
    if (result.citations && result.citations.length > 0) {
      console.log(`\n📚 TOP CITATIONS:`);
      result.citations.slice(0, 5).forEach((cite, i) => {
        console.log(`   ${i + 1}. ${cite.sourceDocName} [${cite.citationCode}] - Page ${cite.pageIndex}`);
      });
    }
    
    if (result.answer && !result.answer.includes('Answer generation failed')) {
      console.log(`\n📄 FULL SUMMARY:\n`);
      console.log(result.answer);
      console.log();
    } else {
      console.log(`\n⚠️  LLM Answer Generation: ${result.answer}\n`);
      console.log('Note: Retrieval worked correctly. LLM may be rate-limited.');
      console.log('Retrieved chunks are still available for manual review.\n');
    }
    
  } catch (err) {
    console.log(`❌ Failed: ${err.message}\n`);
  }
}

async function main() {
  await testSummarization();
  await demonstrateSummary();
}

main().catch(err => {
  console.error('\n❌ Test suite failed:', err);
  console.error('Make sure the server is running: npm run dev\n');
});
