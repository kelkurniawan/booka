# syntax=docker/dockerfile:1

# ===========================================================================
# Base — Node 22 Alpine.
# ===========================================================================
FROM node:22-alpine AS base
# libc6-compat dibutuhkan binary native Next.js (SWC/Turbopack) di musl.
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1


# ===========================================================================
# Deps — install sekali, cache layer selama lockfile tidak berubah.
# ===========================================================================
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci


# ===========================================================================
# Dev — target untuk `docker compose up`. Kode di-mount dari host, jadi image
# ini hanya perlu membawa node_modules.
# ===========================================================================
FROM base AS dev
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]


# ===========================================================================
# Builder — build produksi.
#
# Variabel NEXT_PUBLIC_* di-inline ke bundle browser saat build, bukan dibaca
# saat container jalan. Karena itu ketiganya masuk sebagai build arg; kalau
# kosong, halaman yang butuh Supabase akan gagal di browser meski env runtime
# sudah benar.
# ===========================================================================
FROM base AS builder
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SUPABASE_URL
# Format baru (`sb_publishable_…`) dan anon key JWT lama, keduanya diterima.
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NODE_ENV=production

RUN if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] \
    || { [ -z "$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" ] && [ -z "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ]; }; then \
      echo "ERROR: NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY wajib diisi saat build." >&2; \
      echo "       Jalankan: docker compose --env-file .env.local --profile prod up --build" >&2; \
      exit 1; \
    fi

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build


# ===========================================================================
# Runner — image produksi. Hanya output standalone, tanpa node_modules penuh
# dan tanpa source code.
# ===========================================================================
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# Healthcheck memakai landing page, satu-satunya rute yang tidak butuh sesi
# maupun koneksi Supabase.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
