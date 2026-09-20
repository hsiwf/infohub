FROM node:22-alpine

WORKDIR /app

COPY package.json server.js db.js test.js ./
COPY lib ./lib
COPY public ./public

ENV PORT=5757
# 容器默认 UTC 会让截止时间判定与北京时间差 8 小时，统一按国内时区运行
ENV TZ=Asia/Shanghai
EXPOSE 5757
VOLUME ["/app/data"]

CMD ["node", "server.js"]
