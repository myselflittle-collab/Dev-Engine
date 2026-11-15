# Dev Engine backend with common toolchains (C, C++, Java, Go, Rust, Python, Node, Ruby, PHP)
FROM node:20-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential python3 python3-pip python3-venv default-jdk-headless golang-go rustc cargo ruby php-cli bsdutils git curl \
    && rm -rf /var/lib/apt/lists/*
RUN useradd -m runner
WORKDIR /app
COPY server/package.json server/
RUN cd server && npm install --omit=optional --no-audit --no-fund
COPY . .
ENV PORT=3001 DEVENGINE_WORKDIR=/home/runner/workspaces
USER runner
EXPOSE 3001
CMD ["node", "server/server.js"]
