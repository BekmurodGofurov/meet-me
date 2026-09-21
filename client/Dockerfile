# Build stage - produces the static bundle, nothing from this stage ships.
FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# No certs/ directory reaches this build context (see .dockerignore) - the
# https-detection in vite.config.js finds nothing and build proceeds as
# plain static output either way, since `vite build` never starts a server.
RUN npm run build

# Serve stage - just the built static files behind nginx.
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
