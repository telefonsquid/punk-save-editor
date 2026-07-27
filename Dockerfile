# ==========================================
# Stage 1: Build
# ==========================================
FROM oven/bun:1.3.14-slim AS builder

WORKDIR /app

# Install dependencies (cached unless package.json / lockfile change)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source and build (adapter-static → ./build)
COPY . .
RUN bun run prepare
RUN bun run build

# ==========================================
# Stage 2: Production Runner
# ==========================================
# The build is plain files, so bun does not survive into the runtime image.
# nginx hands them out, nothing else runs. Tauri is not involved here either,
# the desktop app ships through the release workflow.
FROM nginx:1.30-alpine AS runner

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/build /usr/share/nginx/html

EXPOSE 80

# The base image already starts nginx in the foreground.
