# Build stage
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml .npmrc ./
COPY packages/server/package.json ./packages/server/
COPY packages/web/package.json ./packages/web/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/server/ ./packages/server/
COPY packages/web/ ./packages/web/

# Build frontend
RUN pnpm --filter @telegram-star/web build

# Build server
RUN pnpm --filter @telegram-star/server build

# Production stage
FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml .npmrc ./
COPY packages/server/package.json ./packages/server/
COPY packages/web/package.json ./packages/web/

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Copy built frontend
COPY --from=builder /app/packages/web/dist ./packages/web/dist

# Copy built server
COPY --from=builder /app/packages/server/dist ./packages/server/dist

# Create data directory
RUN mkdir -p /app/data

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DB_PATH=/app/data/telegram-star.db
ENV SESSION_PATH=/app/data/session.txt
ENV CORS_ORIGIN=*

EXPOSE 3000

VOLUME ["/app/data"]

CMD ["node", "packages/server/dist/index.js"]
