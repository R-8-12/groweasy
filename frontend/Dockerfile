# ──────────────────────────────────────────────
# Stage 1: builder — compile Next.js with standalone output
# ──────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (layer-cache friendly)
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the source
COPY . .

# Build — next.config.ts has output: 'standalone'
RUN npm run build

# ──────────────────────────────────────────────
# Stage 2: runner — minimal production image
# ──────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Standalone server bundle (includes all required node_modules)
COPY --from=builder /app/.next/standalone ./

# Static assets served by the standalone server
COPY --from=builder /app/.next/static ./.next/static

# Public directory (favicon, images, etc.)
COPY --from=builder /app/public ./public

EXPOSE 3000

# Next.js standalone entrypoint
CMD ["node", "server.js"]
