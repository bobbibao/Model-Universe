FROM node:21 AS build
WORKDIR /app
COPY . .
RUN yarn set version berry
RUN yarn install
RUN yarn build
RUN rm -rf node_modules

# Install production dependencies
RUN yarn workspaces focus --production

# Use a smaller base image for the runtime environment
FROM node:21-slim AS runtime

# Enable IPv6
RUN echo "ipv6" >> /etc/modules

# Define environment argument
ARG ENVIRONMENT
ENV ENVIRONMENT=$ENVIRONMENT

# Copy only the necessary files from the build stage
COPY --from=build /app/package*.json ./
COPY --from=build /app/yarn.lock ./ 
COPY --from=build /app/tsconfig*.json ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/next.config.* ./
COPY --from=build /app/.env.${ENVIRONMENT} ./.env.${ENVIRONMENT}
COPY ./public ./public

EXPOSE 6050
CMD ["yarn", "start"]