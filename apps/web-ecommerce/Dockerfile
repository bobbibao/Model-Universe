# The web shop image. Configuration comes only from the environment (infra/docker-compose.yml); no .env file is baked
# in. The same image serves the shop (default command) and seeds a database (`node dist/.next/scripts/seed.js`).
FROM node:22 AS build
WORKDIR /app
RUN corepack enable
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable
COPY . .
RUN yarn build \
    && yarn workspaces focus --production

FROM node:22-slim AS runtime
ENV NODE_ENV=production PORT=6050
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/next.config.* ./
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY ./public ./public
RUN mkdir -p uploads && chown node uploads
USER node
EXPOSE 6050
CMD ["node", "dist/.next/server.js"]
