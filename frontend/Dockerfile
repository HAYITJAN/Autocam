FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

ARG VITE_API_BASE_URL=/api/v1
ARG VITE_DISPLAY_TIMEZONE=Asia/Tashkent
ARG VITE_MAP_TILE_URL=
ARG VITE_MAP_ATTRIBUTION=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_DISPLAY_TIMEZONE=$VITE_DISPLAY_TIMEZONE \
    VITE_MAP_TILE_URL=$VITE_MAP_TILE_URL \
    VITE_MAP_ATTRIBUTION=$VITE_MAP_ATTRIBUTION

RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1/healthz || exit 1
