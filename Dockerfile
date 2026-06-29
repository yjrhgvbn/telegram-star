# Build stage
FROM node:22-alpine AS builder

# Native modules in the dependency tree require node-gyp during install.
RUN apk add --no-cache python3 make g++

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/server/package.json ./packages/server/
COPY packages/server/prisma.config.ts ./packages/server/
COPY packages/server/tsconfig.json ./packages/server/
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/web/package.json ./packages/web/

# Allow postinstall scripts (required by Prisma)
RUN pnpm config set ignore-scripts false

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/server/ ./packages/server/
COPY packages/shared/ ./packages/shared/
COPY packages/web/ ./packages/web/

# Build shared contracts
RUN pnpm --filter @telegram-star/shared build

# Build frontend
RUN pnpm --filter @telegram-star/web build

# Build server
RUN pnpm --filter @telegram-star/server build

# Production stage
FROM node:22-alpine

RUN apk add --no-cache python3 py3-pip make g++

RUN pip install apprise --break-system-packages

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/server/package.json ./packages/server/
COPY packages/server/prisma.config.ts ./packages/server/
COPY packages/server/tsconfig.json ./packages/server/
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/web/package.json ./packages/web/

# Allow postinstall scripts (required by Prisma)
RUN pnpm config set ignore-scripts false

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Copy built frontend
COPY --from=builder /app/packages/web/dist ./packages/web/dist

# Copy shared runtime package
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

# Copy built server and Prisma assets for runtime start
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/server/prisma ./packages/server/prisma

# Create data directory
RUN mkdir -p /app/data

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATABASE_URL=file:/app/data/telegram-star.db
ENV DB_PATH=/app/data/telegram-star.db
ENV SESSION_PATH=/app/data/session.txt
ENV CORS_ORIGIN=*

EXPOSE 3000

VOLUME ["/app/data"]

CMD ["sh", "-c", "pnpm --filter @telegram-star/server db:deploy && pnpm --filter @telegram-star/server start"]
