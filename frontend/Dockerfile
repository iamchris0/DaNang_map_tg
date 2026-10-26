# Development image: Vite dev server with hot reload.
# A production build stage (static files behind the HTTPS reverse proxy) arrives in Phase 6.
FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

EXPOSE 5173
CMD ["./docker-dev.sh"]
