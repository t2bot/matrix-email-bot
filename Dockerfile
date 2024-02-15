FROM node:21-bookworm AS builder
COPY . /tmp/src
WORKDIR /tmp/src
RUN yarn install
RUN yarn build

FROM node:21-bookworm

RUN mkdir /data
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /tmp/src/lib /app
COPY --from=builder /tmp/src/config /app/config
COPY --from=builder /tmp/src/package.json /app/package.json
COPY --from=builder /tmp/src/yarn.lock /app/yarn.lock
COPY --from=builder /tmp/src/views /app/views

RUN yarn install --production && chown -R node /app && chown -R node /data

USER node
VOLUME ["/app/config", "/data"]

CMD node index.js
