// Load env
const { default: dotenv } = await import('dotenv');
dotenv.config({ path: '.env.local' });

const QDRANT_URL = process.env.QDRANT_URL;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const COLLECTION = 'antigravity_legal';

console.log('URL:', QDRANT_URL);
console.log('KEY set:', !!QDRANT_API_KEY);

const { QdrantClient } = await import('@qdrant/js-client-rest');
const qdrant = new QdrantClient({ url: QDRANT_URL, apiKey: QDRANT_API_KEY, checkCompatibility: false });

// Step 1: getCollections
console.log('\n[1] getCollections...');
const cols = await qdrant.getCollections();
console.log('OK:', JSON.stringify(cols));

// Step 2: getCollection (will throw if not exists)
console.log('\n[2] getCollection...');
try {
  const col = await qdrant.getCollection(COLLECTION);
  console.log('Exists, points:', col.points_count);
} catch(e) {
  console.log('Not found (expected), creating...');
  await qdrant.createCollection(COLLECTION, { vectors: { size: 3072, distance: 'Cosine' } });
  console.log('Created OK');
  await new Promise(r => setTimeout(r, 2000));
}

// Step 3: createPayloadIndex
console.log('\n[3] createPayloadIndex docId...');
try {
  await qdrant.createPayloadIndex(COLLECTION, { field_name: 'docId', field_schema: 'keyword' });
  console.log('Index OK');
} catch(e) {
  console.log('Index err (probably already exists):', e.message);
}

console.log('\n✅ All steps passed');
process.exit(0);
