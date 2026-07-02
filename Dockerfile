FROM node:20-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json ./
RUN npm install --production
COPY . .
RUN mkdir -p uploads var
EXPOSE 3000
ENV PORT=3000
ENV DB_PATH=/app/var/waf.db
VOLUME ["/app/var"]
CMD ["node", "server.js"]
