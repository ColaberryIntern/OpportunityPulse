FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY src/ ./src/

RUN mkdir -p logs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/v1/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

CMD ["node", "src/server.js"]
