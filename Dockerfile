FROM node:22-alpine

WORKDIR /app

COPY package.json server.js db.js test.js ./
COPY lib ./lib
COPY public ./public

ENV PORT=5757
EXPOSE 5757
VOLUME ["/app/data"]

CMD ["node", "server.js"]
