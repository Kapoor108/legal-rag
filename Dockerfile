# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY package.json package-lock.json ./

# Install all deps (including devDeps needed for the build)
RUN npm ci

# Copy source
COPY . .

# Build: Vite (frontend → dist/assets) + esbuild (server → dist/server.cjs)
RUN npm run build

# ── Stage 2: Production image ────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Install only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built artefacts from builder
COPY --from=builder /app/dist ./dist

# Copy data directories (PDFs, law, commentary, irs) used by ingest scripts
COPY --from=builder /app/raw_pdfs ./raw_pdfs
COPY --from=builder /app/law ./law
COPY --from=builder /app/commentary ./commentary
COPY --from=builder /app/irs ./irs
COPY --from=builder /app/metadata.json ./metadata.json

# The server reads .env via dotenv — the real values come from docker-compose env_file
# so we only ship the example here to avoid baking secrets into the image
COPY .env.example .env.example

EXPOSE 3001

ENV NODE_ENV=production

CMD ["node", "dist/server.mjs"]
