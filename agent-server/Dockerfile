FROM m.daocloud.io/docker.io/library/node:22-alpine
WORKDIR /app
COPY package.json server.mjs quality.mjs ./
EXPOSE 8787
CMD ["node", "server.mjs"]
