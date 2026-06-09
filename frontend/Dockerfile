# frontend/Dockerfile — React + Vite static build, served by nginx
# Build context is ./frontend (see docker-compose.yml).

# ---- Build stage ----
FROM node:20 AS build
WORKDIR /app

# Build-time API base URL (inlined into the bundle by Vite)
ARG VITE_API_BASE=http://localhost:8000
ENV VITE_API_BASE=$VITE_API_BASE

# Install deps with a reproducible lockfile install
COPY package.json package-lock.json ./
RUN npm ci

# Build the static site
COPY . .
RUN npm run build      # outputs ./dist

# ---- Serve stage ----
FROM nginx:alpine AS serve
# SPA fallback so client-side routes resolve to index.html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
