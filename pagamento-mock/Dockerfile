FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY openapi.yaml ./

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "src/server.ts"]
