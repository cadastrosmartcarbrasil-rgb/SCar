# ============================================================================
# SCar :: Dockerfile (Next.js 14 standalone, multi-stage)
# Imagem final enxuta rodando o servidor Node gerado pelo Next (output:standalone).
# ============================================================================

# ---- 1. Dependencias -------------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- 2. Build --------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

# As variaveis NEXT_PUBLIC_* sao embutidas no bundle no momento do build,
# por isso entram como build args (sao publicas, nao sao segredos).
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SUPABASE_BUCKET_SINISTROS
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_SUPABASE_BUCKET_SINISTROS=$NEXT_PUBLIC_SUPABASE_BUCKET_SINISTROS \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Garante que a pasta public exista mesmo que o repo nao a tenha (evita falha no COPY do runner).
RUN mkdir -p public && npm run build

# ---- 3. Runner (producao) --------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Usuario nao-root por seguranca
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
