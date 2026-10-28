FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY signaling.js server.js ./

# Plain http/ws only - the "does a cert exist at ../client/certs" check in
# server.js finds nothing here (that directory doesn't exist in this image
# at all) and falls back to plain http automatically. TLS is terminated by
# nginx in front of this container (see deploy/meet-me.conf).
EXPOSE 8080

# The official image ships an unprivileged "node" user; a compromised
# process then can't write to the image or act as root in the container.
USER node

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1

CMD ["node", "server.js"]
