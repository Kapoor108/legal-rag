/**
 * Comprehensive Summarization Feature Demo
 * Shows all supported keywords and variations
 */

const BASE_URL = 'http://localhost:3001';

async function demoSummarization() {
  console.log('\n' + '='.repeat(80));
  console.log('📝 SUMMARIZATION FEATURE - COMPREHENSIVE DEMONSTRATION');
  console.log('='.repeat(80));
  
  const demos = [
    {
      category: "Direct Keywords",
      queries: [
        "Summarize Glenshaw Glass case",
        "Give me a summary of IRC Section 61",
        "Provide an overview of Form 1040"
      ]
    },
    {
      category: "Synonym Variations",
      queries: [
        "Can you recap the Cottage Savings decision?",
        "Give me a brief of Revenue Ruling 2023-14",
        "Outline the key points of the three-part test"
      ]
    },
    {
      category: "Question Format",
      queries: [
        "What are the main points of Glenshaw Glass?",
        "What are the key highlights of Form 1040?",
        "What is the main idea of IRC Section 61?"
      ]
    },
    {
      category: "Internet Slang",
      queries: [
        "TL;DR on cryptocurrency staking taxation",
        "tldr Form 1040",
        "tl dr Glenshaw Glass"
      ]
    },
    {
      category: "Regular Questions (Not Summaries)",
      queries: [
        "Are punitive damages taxable?",
        "What is gross income?",
        "How do I file Form 1040?"
      ]
    }
  ];
  
  for (const demo of demos) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`📂 ${demo.category}`);
    console.log('─'.repeat(80));
    
    for (const query of demo.queries) {
      try {
        const res = await fetch(`${BASE_URL}/api/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, alpha: 0.7 })
        });
        
        const result = await res.json();
        
        const isSummary = result.metadata?.isSummaryRequest;
        const chunks = result.metadata?.chunksAfterRerank || 0;
        const citations = result.citations?.length || 0;
        
        console.log(`\n  Query: "${query}"`);
        console.log(`  Mode: ${isSummary ? '📝 SUMMARY' : '❓ Q&A'}`);
        console.log(`  Chunks: ${chunks}`);
        console.log(`  Citations: ${citations}`);
        
        if (isSummary && result.metadata?.summaryTarget) {
          console.log(`  Target: "${result.metadata.summaryTarget}"`);
        }
        
        // Show status
        if (isSummary && chunks >= 20) {
          console.log(`  ✅ Summary mode working correctly`);
        } else if (!isSummary && chunks < 15) {
          console.log(`  ✅ Regular Q&A mode working correctly`);
        } else {
          console.log(`  ⚠️  Unexpected behavior`);
        }
        
      } catch (err) {
        console.log(`  ❌ Error: ${err.message}`);
      }
    }
  }
  
  console.log(`\n${'='.repeat(80)}`);
  console.log('📊 SUMMARY FEATURE STATISTICS');
  console.log('='.repeat(80));
  console.log('\n✅ Supported Features:');
  console.log('   • 30+ summarization keywords detected');
  console.log('   • TopK=20 chunks for summaries (vs. 5 for Q&A)');
  console.log('   • Context expansion (30-60 total chunks)');
  console.log('   • Specialized summarization prompts');
  console.log('   • 1500 token limit (vs. 800 for Q&A)');
  console.log('   • Enhanced citations (20-50 sources)');
  
  console.log('\n📝 Keyword Categories:');
  console.log('   • Direct: summarize, summary, overview, recap, brief');
  console.log('   • Phrases: "give me a summary", "main points", "key highlights"');
  console.log('   • Slang: TL;DR, tldr, tl dr, "in short", "in brief"');
  console.log('   • Analysis: outline, digest, abstract, highlights');
  
  console.log('\n🎯 Automatic Detection:');
  console.log('   • Users just ask naturally: "Summarize X"');
  console.log('   • System auto-detects and switches mode');
  console.log('   • No special parameters needed');
  console.log('   • Works with any synonym or variation\n');
}

demoSummarization().catch(err => {
  console.error('\n❌ Demo failed:', err);
  console.error('Make sure server is running: npm run dev\n');
});
