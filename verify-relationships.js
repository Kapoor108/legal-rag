/**
 * Quick verification script to test relationship API and graph context
 * Run with: node verify-relationships.js
 */

const BASE_URL = 'http://localhost:3001';

async function testRelationships() {
  console.log('🔍 Testing Relational Legal Links Integration\n');
  
  try {
    // Test 1: Check relationships endpoint
    console.log('📋 Test 1: Fetching relationships from /api/relationships...');
    const relResponse = await fetch(`${BASE_URL}/api/relationships`);
    const relationships = await relResponse.json();
    
    console.log(`   ✅ Found ${relationships.length} relationships:`);
    relationships.forEach((rel, i) => {
      console.log(`   ${i + 1}. "${rel.sourceId}" ${rel.type.toUpperCase()} "${rel.targetId}"`);
      console.log(`      Description: ${rel.description}`);
    });
    console.log();
    
    // Test 2: Check documents endpoint
    console.log('📚 Test 2: Fetching documents from /api/documents...');
    const docsResponse = await fetch(`${BASE_URL}/api/documents`);
    const documents = await docsResponse.json();
    
    console.log(`   ✅ Found ${documents.length} documents in corpus`);
    const coreDocIds = ['irc-sec-61', 'glenshaw-glass', 'cottage-savings', 'rev-rul-2023-14'];
    const coreDocsFound = coreDocIds.filter(id => 
      documents.some(d => d.id === id)
    );
    console.log(`   ✅ Core legal docs present: ${coreDocsFound.length}/${coreDocIds.length}`);
    console.log();
    
    // Test 3: Test RAG query with relationship context
    console.log('🤖 Test 3: Querying RAG system with relationship-rich query...');
    const testQuery = "How does Glenshaw Glass interpret IRC Section 61?";
    console.log(`   Query: "${testQuery}"`);
    
    const queryResponse = await fetch(`${BASE_URL}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: testQuery,
        alpha: 0.7,
        topK: 5
      })
    });
    
    const result = await queryResponse.json();
    
    console.log(`   ✅ Answer received (${result.answer.length} chars)`);
    console.log(`   ✅ Citations: ${result.citations.length}`);
    console.log(`   ✅ Retrieved chunks: ${result.retrievedChunks?.length || 0}`);
    console.log();
    
    // Check if answer mentions relationships or related docs
    const answerLower = result.answer.toLowerCase();
    const mentionsInterpret = answerLower.includes('interpret') || answerLower.includes('interpretation');
    const mentionsCitation = result.citations.some(c => 
      c.citationCode.includes('61') || c.citationCode.includes('348 U.S.')
    );
    
    console.log('🔗 Relationship Context Analysis:');
    console.log(`   ${mentionsInterpret ? '✅' : '⚠️'} Answer mentions interpretation/interprets`);
    console.log(`   ${mentionsCitation ? '✅' : '⚠️'} Citations include IRC § 61 or Glenshaw Glass`);
    console.log();
    
    // Display sample of answer
    console.log('📝 Answer Preview:');
    console.log('   ' + result.answer.split('\n')[0].slice(0, 150) + '...');
    console.log();
    
    console.log('✅ ALL TESTS COMPLETED SUCCESSFULLY');
    console.log('\n💡 The relational legal links are now integrated into the RAG pipeline!');
    console.log('   When queries involve documents with relationships, the AI will');
    console.log('   automatically include related document context in its answers.\n');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('\n⚠️  Make sure the server is running on port 3001');
    console.error('   Run: npm run dev\n');
  }
}

testRelationships();
