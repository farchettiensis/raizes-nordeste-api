FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN node ace build

FROM node:24-alpine

WORKDIR /app

COPY --from=build /app/build ./
RUN npm ci --omit=dev

ENV NODE_ENV=production
EXPOSE 3333

CMD ["sh", "-c", "node ace migration:run --force && node ace db:seed && node bin/server.js"]
