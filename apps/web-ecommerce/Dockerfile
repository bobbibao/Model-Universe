# The web shop image. Configuration comes only from the environment (infra/docker-compose.yml); no .env file is baked
# in. The same image serves the shop (default command) and seeds a database (`node dist/.next/scripts/seed.js`).
FROM node:22 AS build
WORKDIR /app
RUN corepack enable
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable
COPY . .
# Tracking tag ids are public and inlined into the client bundle at build time (empty: the tag is off).
ARG NEXT_PUBLIC_META_PIXEL_ID= NEXT_PUBLIC_GOOGLE_TAG_ID= NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL= NEXT_PUBLIC_TIKTOK_PIXEL_ID=
ENV NEXT_PUBLIC_META_PIXEL_ID=$NEXT_PUBLIC_META_PIXEL_ID NEXT_PUBLIC_GOOGLE_TAG_ID=$NEXT_PUBLIC_GOOGLE_TAG_ID \
    NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL=$NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL \
    NEXT_PUBLIC_TIKTOK_PIXEL_ID=$NEXT_PUBLIC_TIKTOK_PIXEL_ID
RUN yarn build \
    && yarn workspaces focus --production

FROM node:22-slim AS runtime
ENV NODE_ENV=production PORT=6050
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/next.config.* ./
# The locale plugin validates its request source path when Next loads the runtime configuration.
COPY --from=build /app/src/i18n ./src/i18n
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY ./public ./public
RUN mkdir -p uploads .private-uploads && chown node uploads .private-uploads
USER node
EXPOSE 6050
CMD ["node", "dist/.next/server.js"]
