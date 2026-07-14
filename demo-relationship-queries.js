/**
 * Demo script showing relational legal links in action
 * Runs multiple test queries to demonstrate graph RAG capabilities
 */

const BASE_URL = 'http://localhost:3001';

async function queryRAG(query, description) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📋 ${description}`);
  console.log(`${'='.repeat(80)}`);
  console.log(`❓ QUERY: "${query}"\n`);
  
  try {
    const response = await fetch(`${BASE_URL}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: query,
        alpha: 0.7,
        topK: 5
      })
    });
    
    const result = await response.json();
    
    console.log(`✅ ANSWER:\n${result.answer}\n`);
    
    console.log(`📚 CITATIONS (${result.citations.length}):`);
    result.citations.slice(0, 5).forEach((cite, i) => {
      console.log(`   ${i + 1}. ${cite.sourceDocName} [${cite.citationCode}] - Page ${cite.pageIndex}`);
      console.log(`      Confidence: ${cite.confidenceScore}% | Relevance: ${cite.relevanceScore}%`);
    });
    
    if (result.metadata) {
      console.log(`\n📊 METADATA:`);
      console.log(`   - Query Expanded: ${result.metadata.queryExpanded.slice(0, 100)}...`);
      console.log(`   - Chunks Retrieved: ${result.metadata.chunksRetrieved}`);
      console.log(`   - Chunks After Rerank: ${result.metadata.chunksAfterRerank}`);
      console.log(`   - Confidence Score: ${result.metadata.confidenceScore}%`);
      console.log(`   - Processing Time: ${result.metadata.processingMs}ms`);
      console.log(`   - Conflicts Detected: ${result.metadata.conflictsDetected ? '⚠️ Yes' : '✅ No'}`);
      console.log(`   - Detected Entities: ${result.metadata.detectedEntities.join(', ') || 'None'}`);
    }
    
    return result;
    
  } catch (error) {
    console.error(`❌ Query failed: ${error.message}`);
    return null;
  }
}

async function runDemo() {
  console.log('\n🎯 RELATIONAL LEGAL LINKS DEMONSTRATION');
  console.log('Testing Graph RAG with Document Relationships\n');
  
  // Test 1: Direct interpretation relationship
  await queryRAG(
    "How does Glenshaw Glass interpret IRC Section 61?",
    "Test 1: Document Interpretation Relationship"
  );
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Test 2: Citation chain
  await queryRAG(
    "What is the three-part test from Glenshaw Glass and how does Revenue Ruling 2023-14 apply it?",
    "Test 2: Citation Chain Traversal (Glenshaw Glass → Rev Rul 2023-14)"
  );
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Test 3: Multi-document comparison
  await queryRAG(
    "Compare how Glenshaw Glass and Cottage Savings define realization under Section 61",
    "Test 3: Multi-Document Relationship Analysis"
  );
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Test 4: Commentary discussion
  await queryRAG(
    "What does the legal commentary say about the evolution of gross income doctrine?",
    "Test 4: Commentary Discussion Relationships"
  );
  
  console.log(`\n${'='.repeat(80)}`);
  console.log('✅ DEMONSTRATION COMPLETE');
  console.log(`${'='.repeat(80)}\n`);
  
  console.log('💡 KEY OBSERVATIONS:');
  console.log('   1. The AI automatically includes related documents in its answers');
  console.log('   2. Document relationships (interprets, cites, discusses) are preserved');
  console.log('   3. Graph context enriches answers with legal citation networks');
  console.log('   4. The system can traverse multi-hop relationships (e.g., A→B→C)');
  console.log('   5. Confidence scores reflect both semantic similarity and relationship strength\n');
}

runDemo().catch(error => {
  console.error('\n❌ Demo failed:', error);
  console.error('⚠️  Make sure the server is running: npm run dev\n');
});
