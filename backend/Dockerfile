FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY signaling.js server.js ./

# Plain http/ws only - the "does a cert exist at ../client/certs" check in
# server.js finds nothing here (that directory doesn't exist in this image
# at all) and falls back to plain http automatically. TLS is Caddy's job,
# terminated in front of this container, not something this image does.
EXPOSE 8080

CMD ["node", "server.js"]
