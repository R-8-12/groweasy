# ─────────────────────────────────────────────
# Stage 1: builder
# Installs all dependencies (including devDeps),
# compiles TypeScript to dist/
# ─────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests first for better layer caching
COPY package.json package-lock.json ./

# Install ALL dependencies (dev + prod) needed to compile TypeScript
RUN npm ci

# Copy source files and TypeScript config
COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript → dist/
RUN npm run build

# ─────────────────────────────────────────────
# Stage 2: production
# Copies only compiled output + production deps
# into a minimal image
# ─────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy compiled output from builder stage
COPY --from=builder /app/dist ./dist

# Drop to non-root user for security
USER node

EXPOSE 4000

CMD ["node", "dist/server.js"]
