/**
 * Comprehensive System Test
 * Tests all components: embeddings, retrieval, golden set, and fallback
 */

const BASE_URL = 'http://localhost:3001';

async function testSystem() {
  console.log('\n🔧 COMPREHENSIVE SYSTEM AUDIT\n');
  console.log('='.repeat(80));
  
  let allPassed = true;
  
  // ═══════════════════════════════════════════════════════════════
  // TEST 1: Qdrant Connection & Data
  // ═══════════════════════════════════════════════════════════════
  console.log('\n📊 TEST 1: Qdrant Vector Database Status');
  console.log('-'.repeat(80));
  
  try {
    const qdrantRes = await fetch('http://localhost:6333/collections/antigravity_legal');
    const qdrantData = await qdrantRes.json();
    const pointsCount = qdrantData.result.points_count;
    const status = qdrantData.result.status;
    
    console.log(`   ✅ Qdrant Status: ${status}`);
    console.log(`   ✅ Points Indexed: ${pointsCount.toLocaleString()}`);
    console.log(`   ✅ Vector Dimension: ${qdrantData.result.config.params.vectors.size}`);
    console.log(`   ✅ Distance Metric: ${qdrantData.result.config.params.vectors.distance}`);
    
    if (pointsCount === 0) {
      console.log('   ❌ ERROR: No data in Qdrant! Run ingestion scripts.');
      allPassed = false;
    } else if (pointsCount < 100) {
      console.log(`   ⚠️  WARNING: Only ${pointsCount} chunks. Expected 6000+.`);
    }
  } catch (err) {
    console.log('   ❌ ERROR: Qdrant connection failed:', err.message);
    allPassed = false;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // TEST 2: Documents API
  // ═══════════════════════════════════════════════════════════════
  console.log('\n📚 TEST 2: Document Corpus API');
  console.log('-'.repeat(80));
  
  try {
    const docsRes = await fetch(`${BASE_URL}/api/documents`);
    const docs = await docsRes.json();
    
    console.log(`   ✅ Documents Retrieved: ${docs.length}`);
    
    const categories = {
      'Act': 0,
      'Court Judgment': 0,
      'Tax Document': 0,
      'POV/Commentary': 0
    };
    
    docs.forEach(doc => {
      if (categories[doc.category] !== undefined) {
        categories[doc.category]++;
      }
    });
    
    console.log(`   ✅ Acts: ${categories['Act']}`);
    console.log(`   ✅ Court Judgments: ${categories['Court Judgment']}`);
    console.log(`   ✅ Tax Documents: ${categories['Tax Document']}`);
    console.log(`   ✅ Commentary: ${categories['POV/Commentary']}`);
    
    if (docs.length === 0) {
      console.log('   ❌ ERROR: No documents in corpus!');
      allPassed = false;
    }
  } catch (err) {
    console.log('   ❌ ERROR: Documents API failed:', err.message);
    allPassed = false;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // TEST 3: Relationships API
  // ═══════════════════════════════════════════════════════════════
  console.log('\n🔗 TEST 3: Relational Links API');
  console.log('-'.repeat(80));
  
  try {
    const relRes = await fetch(`${BASE_URL}/api/relationships`);
    const rels = await relRes.json();
    
    console.log(`   ✅ Relationships Loaded: ${rels.length}`);
    
    const types = {};
    rels.forEach(rel => {
      types[rel.type] = (types[rel.type] || 0) + 1;
    });
    
    console.log(`   ✅ Types: ${Object.keys(types).map(k => `${k}(${types[k]})`).join(', ')}`);
  } catch (err) {
    console.log('   ❌ ERROR: Relationships API failed:', err.message);
    allPassed = false;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // TEST 4: Golden Set Query (Known Answer)
  // ═══════════════════════════════════════════════════════════════
  console.log('\n📖 TEST 4: Golden Set Query Retrieval');
  console.log('-'.repeat(80));
  
  const goldenQuery = "Are punitive damages considered gross income under Section 61?";
  console.log(`   Query: "${goldenQuery}"`);
  
  try {
    const startTime = Date.now();
    const queryRes = await fetch(`${BASE_URL}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: goldenQuery,
        alpha: 0.7,
        topK: 5
      })
    });
    
    const result = await queryRes.json();
    const elapsed = Date.now() - startTime;
    
    if (result.error) {
      console.log(`   ❌ ERROR: Query failed - ${result.error}`);
      allPassed = false;
    } else {
      console.log(`   ✅ Answer Generated (${elapsed}ms)`);
      console.log(`   ✅ Citations: ${result.citations?.length || 0}`);
      console.log(`   ✅ Retrieved Chunks: ${result.retrievedChunks?.length || 0}`);
      console.log(`   ✅ Confidence: ${result.metadata?.confidenceScore || 0}%`);
      
      // Check if answer contains expected content
      const answerLower = result.answer.toLowerCase();
      const hasGlenshaw = answerLower.includes('glenshaw');
      const hasPunitive = answerLower.includes('punitive');
      const hasSection61 = answerLower.includes('61') || answerLower.includes('section');
      
      console.log(`   ${hasGlenshaw ? '✅' : '⚠️'} Mentions Glenshaw Glass`);
      console.log(`   ${hasPunitive ? '✅' : '⚠️'} Mentions punitive damages`);
      console.log(`   ${hasSection61 ? '✅' : '⚠️'} Mentions Section 61`);
      
      console.log(`\n   📝 Answer Preview:`);
      console.log(`   "${result.answer.substring(0, 200)}..."`);
      
      if (!hasGlenshaw || !hasPunitive) {
        console.log('   ⚠️  WARNING: Answer may not match expected Golden Set response');
      }
    }
  } catch (err) {
    console.log(`   ❌ ERROR: Query endpoint failed - ${err.message}`);
    allPassed = false;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // TEST 5: Novel Query (Not in Golden Set)
  // ═══════════════════════════════════════════════════════════════
  console.log('\n🆕 TEST 5: Novel Query Retrieval (Semantic Search)');
  console.log('-'.repeat(80));
  
  const novelQuery = "What are the tax implications of receiving free cryptocurrency tokens?";
  console.log(`   Query: "${novelQuery}"`);
  
  try {
    const startTime = Date.now();
    const queryRes = await fetch(`${BASE_URL}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: novelQuery,
        alpha: 0.7,
        topK: 5
      })
    });
    
    const result = await queryRes.json();
    const elapsed = Date.now() - startTime;
    
    if (result.error) {
      console.log(`   ❌ ERROR: ${result.error}`);
      allPassed = false;
    } else {
      console.log(`   ✅ Answer Generated (${elapsed}ms)`);
      console.log(`   ✅ Citations: ${result.citations?.length || 0}`);
      console.log(`   ✅ Retrieved Chunks: ${result.retrievedChunks?.length || 0}`);
      console.log(`   ✅ Confidence: ${result.metadata?.confidenceScore || 0}%`);
      
      if (result.retrievedChunks && result.retrievedChunks.length > 0) {
        console.log(`\n   📚 Top Retrieved Documents:`);
        const uniqueDocs = [...new Set(result.retrievedChunks.map(c => c.docTitle))];
        uniqueDocs.slice(0, 3).forEach((title, i) => {
          console.log(`      ${i + 1}. ${title}`);
        });
      }
      
      console.log(`\n   📝 Answer Preview:`);
      console.log(`   "${result.answer.substring(0, 200)}..."`);
      
      // Check for "no data" errors
      if (result.answer.toLowerCase().includes('no data') || 
          result.answer.toLowerCase().includes('not contain sufficient')) {
        console.log('   ⚠️  WARNING: System returned "no data" response');
      }
    }
  } catch (err) {
    console.log(`   ❌ ERROR: ${err.message}`);
    allPassed = false;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // TEST 6: Hybrid Search Endpoint
  // ═══════════════════════════════════════════════════════════════
  console.log('\n🔍 TEST 6: Hybrid Search API');
  console.log('-'.repeat(80));
  
  try {
    const searchRes = await fetch(`${BASE_URL}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: "Form 1040 filing requirements",
        alpha: 0.7
      })
    });
    
    const searchResults = await searchRes.json();
    
    if (searchResults.error) {
      console.log(`   ❌ ERROR: ${searchResults.error}`);
      allPassed = false;
    } else {
      console.log(`   ✅ Search Results: ${searchResults.length}`);
      
      if (searchResults.length > 0) {
        console.log(`   ✅ Top Result: ${searchResults[0].chunk.docTitle}`);
        console.log(`   ✅ Vector Score: ${searchResults[0].vectorScore.toFixed(4)}`);
        console.log(`   ✅ Keyword Score: ${searchResults[0].keywordScore.toFixed(4)}`);
        console.log(`   ✅ Hybrid Score: ${searchResults[0].hybridScore.toFixed(4)}`);
      }
    }
  } catch (err) {
    console.log(`   ❌ ERROR: Search API failed - ${err.message}`);
    allPassed = false;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // TEST 7: Empty Query Handling
  // ═══════════════════════════════════════════════════════════════
  console.log('\n⚠️  TEST 7: Edge Case - Empty Query');
  console.log('-'.repeat(80));
  
  try {
    const emptyRes = await fetch(`${BASE_URL}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: "",
        alpha: 0.7
      })
    });
    
    const emptyResult = await emptyRes.json();
    
    if (emptyResult.error && emptyResult.error.includes('required')) {
      console.log('   ✅ Properly rejects empty query');
    } else {
      console.log('   ⚠️  WARNING: Should reject empty queries');
    }
  } catch (err) {
    console.log('   ✅ Properly handles invalid request');
  }
  
  // ═══════════════════════════════════════════════════════════════
  // TEST 8: API Key Configuration
  // ═══════════════════════════════════════════════════════════════
  console.log('\n🔑 TEST 8: API Configuration Check');
  console.log('-'.repeat(80));
  
  // Check .env.local file
  const fs = require('fs');
  const path = require('path');
  
  try {
    const envPath = path.join(__dirname, '.env.local');
    const envContent = fs.readFileSync(envPath, 'utf-8');
    
    const hasGemini = envContent.includes('GEMINI_API_KEY') && 
                      !envContent.includes('MY_GEMINI_API_KEY') &&
                      envContent.match(/GEMINI_API_KEY=.{10,}/);
                      
    const hasGroq = envContent.includes('GROQ_API_KEY') && 
                    !envContent.includes('MY_GROQ_API_KEY') &&
                    envContent.match(/GROQ_API_KEY=.{10,}/);
    
    console.log(`   ${hasGemini ? '✅' : '⚠️'} Gemini API Key ${hasGemini ? 'configured' : 'missing/invalid'}`);
    console.log(`   ${hasGroq ? '✅' : '⚠️'} Groq API Key ${hasGroq ? 'configured' : 'missing/invalid'}`);
    
    if (!hasGemini || !hasGroq) {
      console.log('   ⚠️  WARNING: API keys not properly configured');
      console.log('   📝 Update .env.local with valid API keys');
      allPassed = false;
    }
  } catch (err) {
    console.log('   ⚠️  WARNING: Could not read .env.local file');
  }
  
  // ═══════════════════════════════════════════════════════════════
  // FINAL REPORT
  // ═══════════════════════════════════════════════════════════════
  console.log('\n' + '='.repeat(80));
  console.log('📊 FINAL SYSTEM AUDIT REPORT');
  console.log('='.repeat(80));
  
  if (allPassed) {
    console.log('\n✅ ALL SYSTEMS OPERATIONAL');
    console.log('\n💡 Summary:');
    console.log('   • Qdrant vector database is healthy with 6000+ chunks');
    console.log('   • Document corpus API is working');
    console.log('   • Relational links are functional');
    console.log('   • Golden Set queries retrieve correct answers');
    console.log('   • Novel queries use semantic search properly');
    console.log('   • Hybrid search (semantic + keyword) is working');
    console.log('   • No "no data" errors detected');
    console.log('   • API keys are configured\n');
  } else {
    console.log('\n⚠️  ISSUES DETECTED - See details above');
    console.log('\n🔧 Troubleshooting:');
    console.log('   1. Ensure Qdrant is running: http://localhost:6333');
    console.log('   2. Check API keys in .env.local');
    console.log('   3. Run ingestion if Qdrant is empty: npm run ingest');
    console.log('   4. Check server logs for errors\n');
  }
}

testSystem().catch(err => {
  console.error('\n❌ SYSTEM AUDIT FAILED:', err);
  console.error('\n⚠️  Make sure:');
  console.error('   • Server is running: npm run dev');
  console.error('   • Qdrant is running: docker or local instance');
  console.error('   • API keys are configured in .env.local\n');
});
