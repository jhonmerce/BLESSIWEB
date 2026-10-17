FROM node:22-bookworm-slim AS dependencies

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json

RUN npm ci

FROM dependencies AS server-build

COPY . .

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npx prisma generate --schema=server/prisma/schema.prisma \
    && npm run build -w server

FROM dependencies AS client-build

COPY . .
ARG TARGETARCH
# Le lockfile Windows peut omettre les modules natifs Linux optionnels utilises par Vite et Tailwind.
RUN case "$TARGETARCH" in \
      amd64) platform_arch=x64 ;; \
      arm64) platform_arch=arm64 ;; \
      *) echo "Architecture Docker non prise en charge pour les extensions natives : $TARGETARCH" >&2; exit 1 ;; \
    esac \
    && rollup_version=$(node -p "require('./node_modules/rollup/package.json').version") \
    && tailwind_version=$(node -p "require('./node_modules/@tailwindcss/oxide/package.json').version") \
    && lightningcss_version=$(node -p "require('./node_modules/lightningcss/package.json').version") \
    && npm install --prefix /tmp/native-dependencies --no-save --package-lock=false \
      "@rollup/rollup-linux-${platform_arch}-gnu@${rollup_version}" \
      "@tailwindcss/oxide-linux-${platform_arch}-gnu@${tailwind_version}" \
      "lightningcss-linux-${platform_arch}-gnu@${lightningcss_version}" \
    && cp -a "/tmp/native-dependencies/node_modules/@rollup/rollup-linux-${platform_arch}-gnu" node_modules/@rollup/ \
    && cp -a "/tmp/native-dependencies/node_modules/@tailwindcss/oxide-linux-${platform_arch}-gnu" node_modules/@tailwindcss/ \
    && cp -a "/tmp/native-dependencies/node_modules/lightningcss-linux-${platform_arch}-gnu" node_modules/ \
    && npm run build -w client

FROM server-build AS migration

CMD ["npm", "run", "db:migrate", "-w", "server"]

FROM node:22-bookworm-slim AS api

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci --omit=dev

COPY --from=server-build /app/node_modules/.prisma/client node_modules/.prisma/client
COPY --from=server-build /app/server/dist server/dist
COPY --from=client-build /app/client/dist client/dist
COPY server/prisma/schema.prisma server/prisma/schema.prisma
COPY server/prisma/migrations server/prisma/migrations

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server/dist/src/index.js"]

FROM nginxinc/nginx-unprivileged:alpine AS web

COPY deploy/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=client-build /app/client/dist /usr/share/nginx/html

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1

# Railway construit par defaut la derniere etape. Cette etape sert le frontend et l'API ensemble.
FROM api AS railway
