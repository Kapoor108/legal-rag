/**
 * Ingest runner — loads .env.local from project root then spawns the compiled ingest scripts.
 * Workaround for dotenvx path resolution issue when running compiled bundles from dist/.
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';

const ROOT = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(ROOT, '.env.local'), override: true });
dotenv.config({ path: join(ROOT, '.env'), override: false });

const script = process.argv[2] ?? 'ingest';
const scriptMap = {
  'ingest':           'dist/ingest.js',
  'ingest:irs':       'dist/ingestIRS.js',
  'ingest:law':       'dist/ingestLaw.js',
  'ingest:commentary':'dist/ingestCommentary.js',
};

const file = scriptMap[script];
if (!file) { console.error('Unknown script:', script); process.exit(1); }

console.log(`\n🚀 Running ${script} → ${file}`);
console.log(`   QDRANT_URL: ${process.env.QDRANT_URL?.slice(0, 50)}...`);
console.log(`   QDRANT_API_KEY: ${process.env.QDRANT_API_KEY ? '✅ set' : '❌ missing'}`);
console.log(`   GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '✅ set' : '❌ missing'}\n`);

const child = spawn(process.execPath, [join(ROOT, file)], {
  env: { ...process.env },
  stdio: 'inherit',
  cwd: ROOT,
});

child.on('exit', code => process.exit(code ?? 0));
