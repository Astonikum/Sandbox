# Build the engine from source; no checked-in WASM is used in this image.
FROM --platform=$BUILDPLATFORM emscripten/emsdk:6.0.9 AS build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY engine /app/engine
COPY examples /app/examples
COPY frontend /app/frontend
RUN npm test && npm run lint && npm run build

FROM nginx:1.28-alpine AS runtime
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
