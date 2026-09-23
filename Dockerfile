# Actor image. Independent of the website in web/ (excluded by .dockerignore).
# Base images: https://docs.apify.com/sdk/js/docs/guides/docker-images
FROM apify/actor-node:24 AS builder

COPY --chown=myuser:myuser package*.json ./
RUN npm ci --include=dev --audit=false --fund=false

COPY --chown=myuser:myuser tsconfig.json tsconfig.build.json ./
COPY --chown=myuser:myuser src ./src
RUN npm run build

FROM apify/actor-node:24

COPY --chown=myuser:myuser package*.json ./
RUN npm ci --omit=dev --omit=optional --audit=false --fund=false \
    && echo "Node.js version:" && node --version \
    && rm -rf ~/.npm

COPY --from=builder --chown=myuser:myuser /usr/src/app/dist ./dist
COPY --chown=myuser:myuser .actor ./.actor

CMD ["node", "dist/main.js"]
