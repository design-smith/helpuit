# Helpuit — single-image deploy.
#
# Runs the TypeScript server directly via tsx (no bundling) so native deps like
# @helpuit/db's libsql client work unchanged. A glibc base (bookworm-slim, NOT
# alpine/musl) is required for libsql's prebuilt binary.
#
# Note: the running server does not launch a browser yet (dynamic L3b
# reproduction isn't wired into the orchestrator). When it is, switch the base to
# `mcr.microsoft.com/playwright:VERSION-jammy` (or add `playwright install
# --with-deps chromium`) so Chromium is available.
FROM node:24-bookworm-slim AS runtime

# pnpm via corepack (pinned by packageManager / lockfile).
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
RUN corepack enable

WORKDIR /app

# Install against the committed lockfile. Copy manifests + sources first; pnpm
# needs every workspace package.json to resolve `workspace:*` links. Build scripts
# are gated by pnpm-workspace.yaml `allowBuilds` (esbuild only — Playwright's
# browser download stays skipped, keeping the image lean).
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile

# Build the operator-console SPA (apps/web → apps/web/dist) so the server serves
# it. Built INSIDE the image because .dockerignore strips dist/ — this keeps
# "same image runs everywhere" true (no host build to copy).
RUN pnpm --filter @helpuit/web build

# Runtime defaults — override via env/compose. (Set AFTER install so devDeps,
# incl. tsx, are present.)
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Liveness via node's global fetch — no curl/wget dependency in the image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["pnpm", "start"]
