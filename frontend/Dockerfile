FROM node:20-alpine AS build

ARG REACT_APP_API_BASE_URL=http://localhost:3001/api/v1
ENV REACT_APP_API_BASE_URL=$REACT_APP_API_BASE_URL

WORKDIR /app

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY public/ ./public/
COPY src/ ./src/
COPY tailwind.config.js postcss.config.js ./

RUN npm run build

# Production stage — serve with lightweight nginx
FROM nginx:alpine

COPY --from=build /app/build /usr/share/nginx/html

# SPA routing — send all paths to index.html
RUN echo 'server { \
  listen 3002; \
  root /usr/share/nginx/html; \
  index index.html; \
  location / { \
    try_files $uri $uri/ /index.html; \
  } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3002/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
