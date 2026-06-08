FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./

FROM base AS development
RUN npm install
COPY . .
EXPOSE 3000 25 465 587

FROM base AS builder
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS production
RUN apk add --no-cache openssl openssl-dev
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
COPY tsconfig*.json ./
COPY package*.json ./
EXPOSE 3000 25 465 587
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
