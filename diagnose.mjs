import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

console.log('QDRANT_URL:', process.env.QDRANT_URL);
console.log('QDRANT_API_KEY length:', process.env.QDRANT_API_KEY?.length);
console.log('GEMINI_API_KEY set:', !!process.env.GEMINI_API_KEY);

import { QdrantClient } from '@qdrant/js-client-rest';

const c = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
  checkCompatibility: false,
});

console.log('Testing Qdrant connection...');
try {
  const cols = await c.getCollections();
  console.log('✅ Qdrant OK:', JSON.stringify(cols));
} catch(e) {
  console.error('❌ Qdrant FAIL:', e.message, e?.status);
}

console.log('Testing Gemini...');
try {
  const { GoogleGenAI } = await import('@google/genai');
  const g = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const r = await g.models.embedContent({ model: 'gemini-embedding-2', contents: 'test' });
  console.log('✅ Gemini OK, dim:', r.embeddings?.[0]?.values?.length);
} catch(e) {
  console.error('❌ Gemini FAIL:', e.message);
}

console.log('Done.');
process.exit(0);
