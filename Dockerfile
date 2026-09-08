# Driftle — single-image deploy (Railway, Fly, Render, plain Docker).
#
# Node 24 is required, not merely preferred: Driftle stores everything in the
# built-in `node:sqlite` module, which is only available unflagged from Node
# 23.4 onward. Pinning the image means there is no native module to compile and
# no database service to provision.

# ---------- build ----------
FROM node:24-alpine AS build
WORKDIR /app

# Install with the lockfile first so dependency layers cache across code edits.
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci

COPY . .
RUN npm run build

# ---------- runtime ----------
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Runtime dependencies only.
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci --omit=dev && npm cache clean --force

# Compiled server, built client, and the schema (inlined in the JS bundle).
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/scripts ./scripts
# The semantic space. Compiled JS alone is not enough to boot.
COPY --from=build /app/server/src/game/lexicon/data ./server/src/game/lexicon/data

# Fallback location when no volume is attached. Railway sets
# RAILWAY_VOLUME_MOUNT_PATH when one is, and the app moves the database there.
RUN mkdir -p /app/data

EXPOSE 3000

# Railway overrides PORT; the app reads it.
ENV PORT=3000
ENV SERVE_CLIENT=true

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
